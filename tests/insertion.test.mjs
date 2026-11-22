import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createInsertion, insertionText } from '../insertion.mjs'

test('single-line Unicode preserves words and removes controls and bidi formatting', () => {
  assert.equal(insertionText('  café\r\nΩ\tworks\u2028here\u202e!  '), 'café Ω works here !')
  for (const invalid of ['\t\x00', '\ud800', 'x'.repeat(8193)]) assert.equal(insertionText(invalid), '')
})

test('a session and activation authorize one edit, stale replies cannot complete it', async () => {
  const lines = []
  const transport = createInsertion(line => lines.push(line))
  transport.arm(1, 5, new AbortController().signal)
  assert.match(await transport.deliver(2, 'wrong'), /Copy/)
  const result = transport.deliver(1, 'hello')
  assert.match(await transport.deliver(1, 'duplicate'), /Copy/)
  transport.receive('EDIT 2 DELIVERED')
  transport.receive('EDIT 1 REFUSED')
  assert.match(await result, /Copy/)
  assert.deepEqual(lines, ['ARM 1 5\n', 'INSERT 1 aGVsbG8=\n'])
})

test('cancel disarms native ticket and suppresses late inference', async () => {
  const lines = []
  const abort = new AbortController()
  const transport = createInsertion(line => lines.push(line))
  transport.arm(1, 1, abort.signal)
  abort.abort()
  assert.match(await transport.deliver(1, 'late'), /Copy/)
  assert.deepEqual(lines, ['ARM 1 1\n', 'DISARM 1\n'])
})

test('delivery timeout or closed pipe is ambiguous and never retried', async () => {
  for (const outcome of ['timeout', 'closed', 'UNKNOWN', 'DELIVERED']) {
    const lines = []
    const transport = createInsertion(line => lines.push(line), 10)
    transport.arm(1, 1, new AbortController().signal)
    const result = transport.deliver(1, 'hello')
    if (outcome === 'closed') transport.close()
    else if (outcome !== 'timeout') transport.receive('EDIT 1 ' + outcome)
    assert.match(await result, outcome === 'DELIVERED' ? /sent to Notepad/ : /unconfirmed/)
    assert.match(await transport.deliver(1, 'again'), /Copy/)
    assert.equal(lines.length, 2)
  }
})

test('marker-only and empty outputs never send an edit, but bracketed speech is preserved', async () => {
  for (const text of ['[BLANK_AUDIO]', '  [blank_audio]\n', '', ' \t ']) {
    const lines = []
    const transport = createInsertion(line => lines.push(line))
    transport.arm(1, 1, new AbortController().signal)
    assert.match(await transport.deliver(1, text), /Copy/)
    assert.deepEqual(lines, ['ARM 1 1\n'])
  }
  for (const text of ['The blue bicycle is ready.', 'Say [BLANK_AUDIO] aloud.', '[Hello]']) {
    assert.equal(insertionText(text), text)
  }
})

test('production background completion retains speech for explicit Copy', async () => {
  const { backgroundCompletion } = await import('../server.mjs')
  const { encodeWav } = await import('../public/wav.mjs')
  const audio = Buffer.from(await encodeWav(Float32Array.of(0.5)).arrayBuffer())
  let recovered
  const status = await backgroundCompletion(async () => 'fixture', text => { recovered = text })({
    id: 1, audio, signal: new AbortController().signal
  })
  assert.equal(status, 'Transcript ready. Use Copy in Settings.')
  assert.equal(recovered, 'fixture')
})
