import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWindowsCompanion } from '../windows-companion.mjs'

test('routes native edges, suspends activation in preview, and discards stale listener output', async () => {
  const events = []
  const children = []
  const companion = createWindowsCompanion({
    onShortcut: event => events.push(event),
    launch() {
      const process = new EventEmitter()
      process.stdin = new PassThrough()
      process.stdout = new PassThrough()
      process.stdin.once('finish', () => process.emit('close', 0))
      process.kill = () => process.emit('close', 0)
      children.push(process)
      queueMicrotask(() => process.stdout.write('READY 1\r\n'))
      return process
    }
  })
  try {
    await companion.replace(['F8'])
    const first = children[0]
    first.stdout.write('DO')
    first.stdout.write('WN\r\nUP\r\nCANCEL\r\n')
    assert.deepEqual(events, ['down', 'up', 'cancel'])
    companion.preview(true)
    first.stdout.write('DOWN\r\nUP\r\n')
    assert.deepEqual(events.slice(3), ['reset', 'up'])
    companion.preview(false)
    await companion.replace(['F9'])
    first.stdout.write('DOWN\r\nCANCEL\r\n')
    assert.deepEqual(events.slice(5), ['reset'])
    children[1].stdout.write('DOWN\r\n')
    assert.equal(companion.activations(), 2)
    children[1].emit('close', 1)
    await Promise.resolve()
    assert.equal(events.at(-1), 'reset')
    assert.equal(companion.isActive(), false)
  } finally {
    await companion.close()
  }
})
