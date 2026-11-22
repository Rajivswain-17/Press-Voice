import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { normalizeSettings, openSettings } from '../settings.mjs'
import { createPressServer } from '../server.mjs'

const hold = { enabled: true, shortcut: ['ControlRight'], mode: 'hold' }
const toggle = { enabled: true, shortcut: ['F8', 'ShiftLeft', 'ControlLeft'], mode: 'toggle' }

test('canonicalizes supported bindings and rejects unsafe or malformed options', () => {
  assert.deepEqual(normalizeSettings(toggle).shortcut, ['ControlLeft', 'ShiftLeft', 'F8'])
  assert.deepEqual(normalizeSettings(hold), hold)
  for (const shortcut of [['MetaLeft', 'F8'], ['AltLeft', 'Space'], ['KeyA'],
    ['ControlRight', 'CapsLock'], ['ControlLeft', 'KeyV'], ['F12'], ['F8', 'F8'], ['Escape']]) {
    assert.throws(() => normalizeSettings({ ...hold, shortcut }), { code: 'INVALID_SETTINGS' })
  }
  assert.throws(() => normalizeSettings({ ...hold, mode: 'unknown' }), { code: 'INVALID_SETTINGS' })
})

test('saves settings atomically and reinstates the prior binding on conflict', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'press-settings-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = join(directory, 'settings.json')
  let active
  const listener = {
    status: () => active ? 'Listening for the shortcut.' : 'Shortcut disabled.',
    async replace(shortcut) {
      active = null
      if (shortcut?.includes('F9')) throw Object.assign(Error('Conflict'), { code: 'SHORTCUT_CONFLICT' })
      active = shortcut
    }
  }
  const service = await openSettings({ file, listener })
  assert.equal(service.get().settings.enabled, false)
  await service.update(hold)
  await assert.rejects(service.update({ ...toggle, shortcut: ['F9'] }), { code: 'SHORTCUT_CONFLICT' })
  assert.deepEqual(active, hold.shortcut)
  assert.deepEqual(service.get().settings, hold)
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).settings, hold)
  await service.update(toggle)
  assert.deepEqual((await openSettings({ file, listener })).get().settings.shortcut,
    ['ControlLeft', 'ShiftLeft', 'F8'])
  await writeFile(file, '{')
  const repaired = await openSettings({ file, listener })
  assert.equal(repaired.get().settings.enabled, false)
  assert.match(repaired.get().status, /could not be read/)
})

test('serves the settings page and limits mutation to same-origin JSON', async t => {
  let received
  let preview
  const server = createPressServer({
    settings: {
      get: () => ({ settings: hold }),
      update: async data => { received = data; return { settings: data } },
      preview: enabled => { preview = enabled }
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const origin = 'http://127.0.0.1:' + server.address().port
  const post = (path, body, sender = origin) => fetch(origin + path, {
    method: 'POST', headers: { Origin: sender, 'Content-Type': 'application/json' }, body
  })
  assert.match(await (await fetch(origin + '/settings')).text(), /Hold to talk/)
  assert.equal((await post('/api/settings', JSON.stringify(toggle), 'https://example.com')).status, 403)
  assert.equal((await post('/api/settings', '{')).status, 400)
  assert.equal((await post('/api/settings', ' '.repeat(2050))).status, 400)
  assert.equal((await post('/api/settings/preview', '{}')).status, 400)
  assert.equal(received, undefined)
  assert.equal((await post('/api/settings/preview', 'true')).status, 200)
  assert.equal(preview, true)
  assert.equal((await post('/api/settings', JSON.stringify(toggle))).status, 200)
  assert.deepEqual(received, toggle)
})
