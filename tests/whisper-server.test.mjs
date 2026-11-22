import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWhisperSession } from '../whisper-server.mjs'

test('holds one engine while active, stops after idle, and restarts', async () => {
  let launches = 0
  let stops = 0
  let idle
  let finish
  const session = createWhisperSession({
    launch: async () => {
      launches++
      return {
        alive: () => true,
        stop: async () => { stops++ },
        infer: () => new Promise(resolve => { finish = resolve })
      }
    },
    schedule: callback => { idle = callback; return callback },
    unschedule: () => { idle = undefined }
  })
  const first = session.transcribe('wav')
  await new Promise(setImmediate)
  assert.equal(idle, undefined)
  await assert.rejects(session.transcribe('wav'), { code: 'BUSY' })
  finish('first')
  assert.equal(await first, 'first')
  const staleTimer = idle
  const second = session.transcribe('wav')
  await new Promise(setImmediate)
  await staleTimer()
  assert.equal(stops, 0)
  finish('second')
  assert.equal(await second, 'second')
  assert.equal(launches, 1)
  await idle()
  assert.equal(stops, 1)
  const third = session.transcribe('wav')
  await new Promise(setImmediate)
  finish('third')
  assert.equal(await third, 'third')
  assert.equal(launches, 2)
  await session.close()
  assert.equal(stops, 2)
})

test('disposes a child after a failed request and uses a fresh one on retry', async () => {
  let launches = 0
  let stops = 0
  const session = createWhisperSession({ launch: async () => {
    const generation = ++launches
    return {
      alive: () => true,
      stop: async () => { stops++ },
      infer: async () => {
        if (generation === 1) throw Error('Native process exited')
        return 'retry worked'
      }
    }
  } })
  await assert.rejects(session.transcribe('wav'), /exited/)
  assert.equal(stops, 1)
  assert.equal(await session.transcribe('wav'), 'retry worked')
  await session.close()
  assert.equal(launches, 2)
  assert.equal(stops, 2)
})
