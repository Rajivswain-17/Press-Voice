import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPressServer } from '../server.mjs'
import { createDictationSession } from '../dictation-session.mjs'
import { createNativeCapture } from '../native-capture.mjs'
import { encodeWav } from '../public/wav.mjs'

test('browser owns the session before capture, can upload once, and releases on disconnect', async t => {
  const dictation = createDictationSession()
  let calls = 0
  const server = createPressServer({ dictation, transcribe: async () => { calls++; return 'test' } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const origin = 'http://127.0.0.1:' + server.address().port
  const capture = (signal, sender = origin) => fetch(origin + '/api/capture', {
    method: 'POST', headers: { Origin: sender }, signal
  })
  assert.equal((await capture(undefined, 'https://example.com')).status, 403)
  const abort = new AbortController()
  const lease = await capture(abort.signal)
  assert.equal(lease.status, 200)
  const reader = lease.body.getReader()
  const token = new TextDecoder().decode((await reader.read()).value).trim()
  assert.ok(token)
  assert.equal(dictation.reserveManual(), null)
  assert.equal((await capture()).status, 409)
  const upload = (key = token) => fetch(origin + '/api/transcribe', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'audio/wav', 'X-Press-Capture': key },
    body: encodeWav(Float32Array.of(0.5))
  })
  assert.equal((await upload('wrong')).status, 409)
  assert.deepEqual(await (await upload()).json(), { text: 'test' })
  assert.equal((await upload()).status, 409)
  assert.equal(calls, 1)
  abort.abort()
  for (let tries = 0; dictation.isBusy() && tries < 30; tries++) {
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.equal(dictation.isBusy(), false)
})

test('Windows transport matches session IDs and cancels startup without returning audio', async () => {
  const written = []
  const transport = createNativeCapture(command => written.push(command), () => assert.fail('Unexpected timeout'))
  const abort = new AbortController()
  const startup = transport.start({ id: 1, signal: abort.signal })
  abort.abort()
  transport.receive('CANCELLED 1')
  await assert.rejects(startup, /cancelled/)
  assert.deepEqual(written, ['START 1\n', 'CANCEL 1\n'])

  const next = transport.start({ id: 2, signal: new AbortController().signal })
  transport.receive('MIC_ERROR 1')
  transport.receive('STARTED 2')
  const capture = await next
  const stop = capture.stop()
  const bytes = Buffer.from(await encodeWav(Float32Array.of(0.3)).arrayBuffer())
  transport.receive('WAV 2 ' + bytes.toString('base64'))
  assert.deepEqual(await stop, bytes)
  assert.deepEqual(written.slice(2), ['START 2\n', 'STOP 2\n'])
})

test('closing browser lease during inference retains the shared slot until it settles', async t => {
  const dictation = createDictationSession()
  let entered, finish
  const started = new Promise(resolve => { entered = resolve })
  const gate = new Promise(resolve => { finish = resolve })
  const server = createPressServer({ dictation, transcribe: async () => { entered(); await gate; return 'done' } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { finish(); server.closeAllConnections(); server.close() })
  const origin = 'http://127.0.0.1:' + server.address().port
  const abort = new AbortController()
  const lease = await fetch(origin + '/api/capture', {
    method: 'POST', headers: { Origin: origin }, signal: abort.signal
  })
  const token = Buffer.from((await lease.body.getReader().read()).value).toString().trim()
  const upload = fetch(origin + '/api/transcribe', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'audio/wav', 'X-Press-Capture': token },
    body: encodeWav(Float32Array.of(0.3))
  })
  await started
  abort.abort()
  assert.equal(dictation.reserveManual(), null)
  finish()
  assert.equal((await upload).status, 200)
  for (let tries = 0; dictation.isBusy() && tries < 30; tries++) {
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.equal(dictation.isBusy(), false)
})

test('native capture releasing a finished WAV on its own advances the hold controller', async () => {
  let received
  const controller = createDictationSession({
    startCapture: async () => ({
      finished: Promise.resolve('complete WAV'),
      stop: async () => 'complete WAV',
      cancel: async () => {}
    }),
    onRecording({ audio }) { received = audio }
  })
  controller.down('hold')
  await controller.settled()
  assert.equal(received, 'complete WAV')
  assert.equal(controller.isBusy(), false)
  controller.up()
})
