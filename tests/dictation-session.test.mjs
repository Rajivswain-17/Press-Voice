import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDictationSession } from '../dictation-session.mjs'

const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

function harness(startDelay) {
  const calls = []
  const controller = createDictationSession({
    async startCapture({ id, signal }) {
      calls.push(['start', id])
      await startDelay
      return {
        async stop() {
          calls.push(['stop', id])
          return { id, signal }
        },
        async cancel() { calls.push(['cancel', id]) }
      }
    },
    async onRecording({ id }) { calls.push(['result', id]) }
  })
  return { controller, calls }
}

test('hold starts once and a quick release stops the same capture once', async () => {
  const startup = deferred()
  const { controller, calls } = harness(startup.promise)
  controller.down('hold')
  controller.down('hold')
  controller.up()
  controller.up()
  assert.equal(controller.isBusy(), true)
  assert.equal(controller.reserveManual(), null)
  startup.resolve()
  await controller.settled()
  assert.deepEqual(calls, [['start', 1], ['stop', 1], ['result', 1]])
  assert.equal(controller.isBusy(), false)
})

test('toggle uses distinct presses and ignores mode changes and repeats mid-session', async () => {
  const { controller, calls } = harness()
  controller.up()
  controller.down('toggle')
  controller.down('toggle')
  await new Promise(setImmediate)
  assert.deepEqual(calls, [['start', 1]])
  controller.up()
  await new Promise(setImmediate)
  assert.equal(controller.isBusy(), true)
  controller.down('hold')
  controller.down('hold')
  await controller.settled()
  assert.deepEqual(calls, [['start', 1], ['stop', 1], ['result', 1]])
  controller.down('hold')
  assert.equal(controller.isBusy(), false)
  controller.up()
  controller.down('hold')
  controller.up()
  await controller.settled()
  assert.deepEqual(calls.at(-1), ['result', 2])
})

test('cancel during startup disposes late capture and keeps exclusive ownership until settled', async () => {
  const startup = deferred()
  const { controller, calls } = harness(startup.promise)
  controller.down('hold')
  controller.cancel()
  controller.up()
  controller.down('hold')
  assert.equal(controller.reserveManual(), null)
  startup.resolve()
  await controller.settled()
  assert.deepEqual(calls, [['start', 1], ['cancel', 1]])
  controller.down('hold')
  assert.equal(controller.isBusy(), false)
  controller.up()
  const release = controller.reserveManual()
  assert.equal(typeof release, 'function')
  controller.down('hold')
  assert.equal(calls.length, 2)
  assert.equal(controller.reserveManual(), null)
  release()
  controller.up()
})

test('reset cancels a capture in flight and ignores a late stopped result', async () => {
  const stopping = deferred()
  const stopped = deferred()
  let cancelled = 0
  let delivered = 0
  const controller = createDictationSession({
    startCapture: async () => ({
      stop() { stopped.resolve(); return stopping.promise },
      async cancel() { cancelled++ }
    }),
    async onRecording() { delivered++ }
  })
  controller.down('hold')
  controller.up()
  await stopped.promise
  controller.reset()
  controller.down('toggle')
  assert.equal(controller.isBusy(), true)
  stopping.resolve('late WAV')
  await controller.settled()
  assert.equal(cancelled, 1)
  assert.equal(delivered, 0)
})

test('keeps manual recording usable when the native recorder is unavailable', () => {
  const controller = createDictationSession()
  controller.down('hold')
  controller.up()
  assert.equal(controller.isBusy(), false)
  assert.match(controller.status(), /background microphone/i)
  const release = controller.reserveManual()
  release()
})

test('cancellation aborts result processing without releasing ownership early', async () => {
  const processing = deferred()
  const finish = deferred()
  let finishedAsCancelled = false
  const controller = createDictationSession({
    startCapture: async () => ({ stop: async () => 'WAV', cancel: async () => {} }),
    async onRecording({ signal }) {
      processing.resolve()
      await finish.promise
      finishedAsCancelled = signal.aborted
    }
  })
  controller.down('hold')
  controller.up()
  await processing.promise
  controller.cancel()
  assert.equal(controller.reserveManual(), null)
  finish.resolve()
  await controller.settled()
  assert.equal(finishedAsCancelled, true)
  assert.equal(controller.isBusy(), false)
  assert.equal(controller.status(), 'Recording cancelled.')
})
