import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createController } from '../public/app.mjs'

test('one upload, literal transcript, and copy of the edited value', async () => {
  let uploads = 0
  let copied
  let draft = ''
  const controller = createController({
    recorder: { start: async () => {}, stop: async () => new Blob(['wav']) },
    transcribe: async () => { uploads++; return '<hello>' },
    render() {}, writeText: text => { draft = text }, readText: () => draft,
    clipboard: async value => { copied = value }
  })
  await controller.record()
  await Promise.all([controller.record(), controller.record()])
  assert.equal(uploads, 1)
  assert.equal(draft, '<hello>')
  draft += '\nedited'
  await controller.copy()
  assert.equal(copied, '<hello>\nedited')
})

test('permission retry, empty transcript, and denied clipboard preserve the draft', async () => {
  let first = true
  let status
  let selected = false
  const controller = createController({
    recorder: {
      start: async () => { if (first) { first = false; throw Error('Allow microphone access.') } },
      stop: async () => new Blob(['wav'])
    },
    transcribe: async () => '',
    render: (_, message) => { status = message },
    writeText: () => assert.fail('Empty transcript overwrote the draft'),
    readText: () => 'draft', clipboard: async () => { throw Error('Denied') },
    selectText: () => { selected = true }
  })
  await controller.record()
  assert.match(status, /Allow microphone/)
  await controller.record()
  await controller.record()
  assert.match(status, /No speech/)
  await controller.copy()
  assert.equal(selected, true)
  assert.match(status, /Ctrl\+C/)
})
