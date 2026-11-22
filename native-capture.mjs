import { maxWavBytes } from './public/wav.mjs'

export const maxNativeLine = 4 * Math.ceil(maxWavBytes / 3) + 40

const messages = {
  MIC_UNAVAILABLE: 'Could not open the Windows microphone. Check the default input and Windows microphone privacy settings.',
  MIC_FORMAT: 'The default microphone does not support the Press recording format.',
  MIC_ERROR: 'The Windows microphone stopped delivering audio. Check the device and retry.',
  MIC_EMPTY: 'No microphone audio was captured. Try speaking for longer.',
  MIC_BUSY: 'The Windows microphone is already in use by Press.',
  CANCELLED: 'Recording cancelled.'
}

const failure = message => Object.assign(new Error(message), { captureMessage: message })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  void promise.catch(() => {})
  return { promise, resolve, reject }
}

export function createNativeCapture(write, terminate) {
  let current

  function finish(error, wav) {
    if (!current) return
    const request = current
    current = undefined
    clearTimeout(request.timer)
    request.signal.removeEventListener('abort', request.abort)
    if (error) {
      request.started.reject(error)
      request.finished.reject(error)
    } else request.finished.resolve(wav)
  }

  async function start({ id, signal }) {
    if (signal.aborted) throw failure(messages.CANCELLED)
    if (current) throw failure(messages.MIC_BUSY)
    const request = current = { id, signal, started: deferred(), finished: deferred() }
    function arm(ms) {
      clearTimeout(request.timer)
      request.timer = setTimeout(terminate, ms)
      request.timer.unref()
    }
    function command(kind) {
      if (current !== request || request.command === 'CANCEL' || request.command === kind) return
      request.command = kind
      write(kind + ' ' + id + '\n')
      arm(5000)
    }
    request.abort = () => command('CANCEL')
    request.onStarted = () => {
      request.ready = true
      if (!request.command) arm(65000)
      request.started.resolve()
    }
    signal.addEventListener('abort', request.abort, { once: true })
    arm(5000)
    write('START ' + id + '\n')
    await request.started.promise
    return {
      finished: request.finished.promise,
      stop: () => { command('STOP'); return request.finished.promise },
      async cancel() { command('CANCEL'); await request.finished.promise.catch(() => {}) }
    }
  }

  function receive(line) {
    const [kind, id, data] = line.split(' ', 3)
    if (!current || String(current.id) !== id) return
    if (kind === 'STARTED') current.onStarted()
    else if (kind === 'WAV') {
      if (!current.ready || !data || data.length % 4 !== 0 || data.length > maxNativeLine || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
        return finish(failure('The Windows companion returned invalid microphone audio.'))
      }
      const wav = Buffer.from(data, 'base64')
      if (wav.length > maxWavBytes) return finish(failure('The recording exceeded the 60-second limit.'))
      finish(undefined, wav)
    } else if (Object.hasOwn(messages, kind)) finish(failure(messages[kind]))
  }

  return { start, receive, close: () => finish(failure('The Windows microphone connection closed.')) }
}
