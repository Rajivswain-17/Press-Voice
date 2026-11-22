export function createDictationSession({ startCapture, onRecording = async () => {} } = {}) {
  let held = false
  let manual
  let job
  let message = startCapture ? 'Ready for a shortcut.' : 'Background microphone recording becomes available in Task 2D.'

  const isBusy = () => Boolean(job || manual)

  function reserveManual() {
    if (isBusy()) return null
    const token = manual = Symbol()
    return () => { if (manual === token) manual = undefined }
  }

  function dispose(session) {
    if (session.capture && !session.disposal) {
      session.disposal = Promise.resolve().then(() => session.capture.cancel()).catch(() => {
        message = 'Could not cleanly cancel the recording.'
      })
    }
    return session.disposal
  }

  async function run(session) {
    const { id, abort, stopRequested } = session
    const context = { id, signal: abort.signal }
    try {
      session.capture = await startCapture(context)
      if (abort.signal.aborted) return
      message = 'Recording.'
      await stopRequested
      if (abort.signal.aborted) return
      message = 'Finishing recording.'
      const audio = await session.capture.stop()
      if (abort.signal.aborted) return
      message = 'Processing recording.'
      await onRecording({ ...context, audio })
      if (!abort.signal.aborted) message = 'Recording completed.'
    } catch {
      if (!abort.signal.aborted) {
        abort.abort()
        message = 'Recording failed. Try again.'
      }
    } finally {
      if (abort.signal.aborted) await dispose(session)
      if (job === session) job = undefined
    }
  }

  let lastId = 0
  function down(mode) {
    if (held) return
    held = true
    if (job) {
      if (job.mode === 'toggle' && !job.abort.signal.aborted) job.requestStop()
      return
    }
    if (!startCapture || manual || !['hold', 'toggle'].includes(mode)) return
    const session = job = { id: ++lastId, mode, abort: new AbortController() }
    session.stopRequested = new Promise(resolve => { session.requestStop = resolve })
    message = 'Starting microphone.'
    session.done = run(session)
  }

  function up() {
    if (!held) return
    held = false
    if (job?.mode === 'hold') job.requestStop()
  }

  function cancel() {
    if (!job || job.abort.signal.aborted) return
    message = 'Recording cancelled.'
    job.abort.abort()
    job.requestStop()
    void dispose(job)
  }

  function reset() {
    held = false
    cancel()
  }

  return { down, up, cancel, reset, isBusy, reserveManual, settled: () => job?.done, status: () => message }
}
