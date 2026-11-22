import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRecorder } from '../public/recorder.mjs'

test('a microphone permission result arriving after cancel releases its track', async () => {
  let resolvePermission
  let stopped = 0
  const track = { stop: () => { stopped++ } }
  const recorder = createRecorder({}, {
    makeContext: () => ({ resume: async () => {}, close: async () => {} }),
    getMedia: () => new Promise(resolve => { resolvePermission = resolve })
  })
  const started = recorder.start()
  await assert.rejects(recorder.start(), { code: 'CAPTURE_BUSY' })
  recorder.cancel()
  resolvePermission({ getTracks: () => [track] })
  await assert.rejects(started, { code: 'CAPTURE_CANCELLED' })
  assert.equal(stopped, 1)
})

test('Stop includes flushed samples exactly once and releases the microphone', async () => {
  let stopped = 0
  const track = { stop: () => { stopped++ }, addEventListener() {} }
  const port = {
    close() {},
    postMessage() {
      this.onmessage({ data: { type: 'samples', samples: Float32Array.of(0.5) } })
      this.onmessage({ data: { type: 'flushed' } })
    }
  }
  const recorder = createRecorder({}, {
    getMedia: async () => ({ getTracks: () => [track] }),
    makeContext: () => ({
      sampleRate: 16000, resume: async () => {}, close: async () => {},
      audioWorklet: { addModule: async () => {} },
      createMediaStreamSource: () => ({ connect: target => target, disconnect() {} })
    }),
    makeWorklet: () => ({ port, addEventListener() {}, connect() {}, disconnect() {} })
  })
  await recorder.start()
  port.onmessage({ data: { type: 'samples', samples: Float32Array.of(-0.5) } })
  const result = await recorder.stop()
  assert.equal(result.size, 48)
  assert.equal(stopped, 1)
  await assert.rejects(recorder.stop(), { code: 'CAPTURE_BUSY' })
})
