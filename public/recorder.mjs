import { maxSeconds, prepareWav } from './wav.mjs'

const failure = (code, message) => Object.assign(new Error(message), { code })
const stopTracks = stream => stream?.getTracks().forEach(track => track.stop())

export function createRecorder({ onLimit, onError } = {}, {
  makeContext = () => new AudioContext(),
  getMedia = () => navigator.mediaDevices.getUserMedia({ audio: true }),
  makeWorklet = (context, options) => new AudioWorkletNode(context, 'press-pcm', options)
} = {}) {
  let current

  function release(session) {
    session.flush?.(false)
    stopTracks(session.stream)
    session.source?.disconnect()
    session.worklet?.disconnect()
    session.worklet?.port.close()
    void session.context?.close().catch(() => {})
  }

  function cancel() {
    if (!current) return
    const session = current
    current = undefined
    release(session)
  }

  async function start() {
    if (current) throw failure('CAPTURE_BUSY', 'A recording is already in progress.')
    const session = { chunks: [], frames: 0, state: 'starting' }
    current = session
    try {
      const context = session.context = makeContext()
      const resume = context.resume()
      void resume.catch(() => {})
      const stream = await getMedia()
      if (current !== session) {
        stopTracks(stream)
        throw failure('CAPTURE_CANCELLED', 'Recording was cancelled.')
      }
      session.stream = stream
      await resume
      await context.audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url))
      if (current !== session) throw failure('CAPTURE_CANCELLED', 'Recording was cancelled.')
      const source = session.source = context.createMediaStreamSource(stream)
      const worklet = session.worklet = makeWorklet(context, {
        channelCount: 1, channelCountMode: 'explicit',
        processorOptions: { maxSeconds }
      })
      function interrupted() {
        if (current !== session || session.state === 'preparing') return
        cancel()
        onError?.(failure('CAPTURE_FAILED', 'Microphone capture stopped. Try recording again.'))
      }
      for (const track of stream.getTracks()) track.addEventListener('ended', interrupted, { once: true })
      worklet.addEventListener('processorerror', interrupted)
      worklet.port.onmessage = ({ data }) => {
        if (current !== session) return
        if (data.type === 'samples') {
          session.chunks.push(data.samples)
          session.frames += data.samples.length
        } else if (data.type === 'flushed') {
          session.flush?.(true)
        } else if (data.type === 'limit' && session.state === 'recording') {
          onLimit?.()
        }
      }
      session.state = 'recording'
      source.connect(worklet).connect(context.destination)
    } catch (error) {
      if (current === session) cancel()
      if (error.name === 'NotAllowedError') throw failure('MIC_DENIED', 'Allow microphone access and try again.')
      if (error.name === 'NotFoundError') throw failure('MIC_MISSING', 'Connect a microphone and try again.')
      if (error.code && typeof error.code === 'string') throw error
      throw failure('CAPTURE_FAILED', 'Could not start the microphone. Try again.')
    }
  }

  async function stop() {
    const session = current
    if (!session || session.state !== 'recording') throw failure('CAPTURE_BUSY', 'No active recording is ready to stop.')
    session.state = 'stopping'
    try {
      const flushed = await new Promise(resolve => {
        const timeout = setTimeout(() => session.flush(false), 1000)
        session.flush = value => {
          clearTimeout(timeout)
          session.flush = undefined
          resolve(value)
        }
        session.worklet.port.postMessage('flush')
      })
      if (!flushed) throw failure('CAPTURE_FAILED', 'Recording could not be finalized. Try again.')
      session.state = 'preparing'
      const sourceRate = session.context.sampleRate
      release(session)
      session.stream = session.source = session.worklet = session.context = undefined
      const wav = await prepareWav(session.chunks, session.frames, sourceRate)
      if (current !== session) throw failure('CAPTURE_CANCELLED', 'Recording was cancelled.')
      return wav
    } finally {
      if (current === session) cancel()
    }
  }

  return { start, stop, cancel }
}
