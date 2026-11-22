import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPressServer } from '../server.mjs'
import { encodeWav } from '../public/wav.mjs'

test('serves public files and validates the browser request before inference', async t => {
  let calls = 0
  const server = createPressServer({ transcribe: async () => { calls++; return 'Hello' } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const origin = 'http://127.0.0.1:' + server.address().port
  const send = (body, sender = origin, type = 'audio/wav') => fetch(origin + '/api/transcribe', {
    method: 'POST', headers: { Origin: sender, 'Content-Type': type }, body
  })
  assert.equal((await fetch(origin)).status, 200)
  assert.equal((await fetch(origin + '/AGENTS.md')).status, 404)
  assert.equal((await send('invalid', 'https://example.com')).status, 403)
  assert.equal((await send('invalid', origin, 'text/plain')).status, 415)
  assert.equal((await send('invalid')).status, 400)
  assert.equal((await send(new Uint8Array(1920045))).status, 413)
  const response = await send(encodeWav(Float32Array.of(0.3)))
  assert.deepEqual(await response.json(), { text: 'Hello' })
  assert.equal(calls, 1)
})

test('blocks concurrent recordings and recovers when inference times out', async t => {
  let release
  let entered
  let first = true
  const started = new Promise(resolve => { entered = resolve })
  const server = createPressServer({ transcribe: async () => {
    if (!first) return 'retry worked'
    first = false
    entered()
    await new Promise(resolve => { release = resolve })
    throw Object.assign(Error('Timed out'), { code: 'ENGINE_TIMEOUT' })
  } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { release?.(); server.close() })
  const origin = 'http://127.0.0.1:' + server.address().port
  const wav = encodeWav(Float32Array.of(0.3))
  const submit = () => fetch(origin + '/api/transcribe', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'audio/wav' }, body: wav
  })
  const inProgress = submit()
  await started
  assert.equal((await submit()).status, 409)
  release()
  assert.equal((await inProgress).status, 504)
  assert.deepEqual(await (await submit()).json(), { text: 'retry worked' })
})
