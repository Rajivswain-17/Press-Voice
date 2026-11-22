import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { backgroundCompletion } from '../server.mjs'
import { createInsertion } from '../insertion.mjs'
import { createWhisperSession } from '../whisper-server.mjs'

const fixture = await readFile(new URL('../tests/fixtures/jfk.wav', import.meta.url))
// Remove the pinned fixture's optional RIFF metadata in memory. Preserve PCM bytes.
assert.equal(fixture.toString('ascii', 36, 40), 'LIST')
const listBytes = fixture.readUInt32LE(40)
const audio = Buffer.concat([fixture.subarray(0, 36), fixture.subarray(44 + listBytes + listBytes % 2)])
audio.writeUInt32LE(audio.length - 8, 4)
const engine = createWhisperSession()
try {
  for (const scenario of ['speech', 'unicode', 'marker', 'empty', 'cancel', 'lost acknowledgement']) {
    const abort = new AbortController()
    let recovered, fixtureRun, edits = 0
    const transport = createInsertion(line => {
      if (!line.startsWith('INSERT ')) return
      edits++
      fixtureRun = spawnSync(process.argv[2], [], {
        input: line.trim().split(' ')[2] + '\n', encoding: 'utf8', timeout: 30000
      })


      if (scenario === 'lost acknowledgement') transport.close()
      else transport.receive('EDIT 1 DELIVERED')
    })
    transport.arm(1, 1, abort.signal)
    const transcribe = scenario === 'speech' ? engine.transcribe : async () => {
      if (scenario === 'cancel') abort.abort()
      return ({ marker: '[BLANK_AUDIO]', empty: '', unicode: 'caf\u00e9 \u03a9' })[scenario] ?? 'fixture'
    }
    const complete = backgroundCompletion(transcribe, text => { recovered = text }, transport.deliver)
    const status = await complete({ id: 1, audio, signal: abort.signal })
    if (fixtureRun) {
      assert.equal(fixtureRun.status, 0, fixtureRun.stderr)
      assert.equal(fixtureRun.stdout.match(/PASS /g)?.length, 5)
    }
    if (scenario === 'speech' || scenario === 'unicode') {
      assert.equal(status, 'Text sent to Notepad.')
      if (scenario === 'speech') assert.match(recovered, /country/i)
    } else if (scenario === 'lost acknowledgement') {
      assert.match(status, /unconfirmed/)
      assert.equal(recovered, 'fixture')
      await transport.deliver(1, recovered)
    } else if (scenario === 'marker') {
      assert.equal(recovered, '[BLANK_AUDIO]')
      assert.match(status, /Copy/)
    } else assert.equal(recovered, undefined)
    assert.equal(edits, ['speech','unicode','lost acknowledgement'].includes(scenario) ? 1 : 0)
    console.log('PASS pipeline ' + scenario)
  }
} finally { await engine.close() }
