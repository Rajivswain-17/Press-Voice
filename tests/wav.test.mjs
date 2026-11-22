import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeWav, targetFrameCount } from '../public/wav.mjs'

test('encodes canonical mono PCM16 with saturation and little-endian samples', async () => {
  const wav = encodeWav(Float32Array.of(-2, -0.5, 0, 0.5, 2))
  const bytes = Buffer.from(await wav.arrayBuffer())
  assert.equal(wav.type, 'audio/wav')
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8)
  assert.equal(bytes.toString('ascii', 8, 16), 'WAVEfmt ')
  assert.equal(bytes.readUInt16LE(20), 1)
  assert.equal(bytes.readUInt16LE(22), 1)
  assert.equal(bytes.readUInt32LE(24), 16000)
  assert.equal(bytes.readUInt32LE(28), 32000)
  assert.equal(bytes.readUInt16LE(32), 2)
  assert.equal(bytes.readUInt16LE(34), 16)
  assert.equal(bytes.toString('ascii', 36, 40), 'data')
  assert.equal(bytes.readUInt32LE(40), 10)
  assert.deepEqual([44, 46, 48, 50, 52].map(offset => bytes.readInt16LE(offset)),
    [-32768, -16384, 0, 16384, 32767])
})

test('maps 48 kHz frame counts to 16 kHz and rejects empty audio', () => {
  assert.equal(targetFrameCount(48000, 48000), 16000)
  assert.equal(targetFrameCount(2880000, 48000), 960000)
  assert.throws(() => encodeWav(new Float32Array()), { code: 'EMPTY_CAPTURE' })
})
