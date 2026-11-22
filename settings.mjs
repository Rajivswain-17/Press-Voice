import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { normalizeShortcut, shortcutError } from './shortcuts.mjs'

const defaults = { enabled: false, shortcut: null, mode: 'hold' }
const sameBinding = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const effective = settings => settings.enabled ? settings.shortcut : null

export function normalizeSettings(input) {
  if (!input || typeof input !== 'object' || Object.keys(input).length !== 3 ||
      typeof input.enabled !== 'boolean' || !['hold', 'toggle'].includes(input.mode)) {
    throw shortcutError('INVALID_SETTINGS', 'Choose a recording mode and valid shortcut settings.')
  }
  const shortcut = normalizeShortcut(input.shortcut)
  if (input.enabled && !shortcut) throw shortcutError('INVALID_SETTINGS', 'Choose a shortcut before enabling dictation.')
  return { enabled: input.enabled, shortcut, mode: input.mode }
}

async function writeSettings(file, settings) {
  await mkdir(dirname(file), { recursive: true })
  const temporary = file + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, settings }) + '\n', { flag: 'wx' })
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function openSettings({ file, listener, isBusy = () => false }) {
  let current = defaults
  let warning = ''
  let updating = false
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'))
    if (saved.version !== 1) throw Error('Unsupported settings version.')
    current = normalizeSettings(saved.settings)
  } catch (error) {
    if (error.code !== 'ENOENT') warning = 'Saved settings could not be read. Shortcut is disabled until you save new settings.'
  }
  if (current.enabled) {
    try { await listener.replace(current.shortcut) } catch {
      warning = 'The saved shortcut could not start. Choose a different shortcut or repair the Windows companion.'
    }
  }

  const get = () => ({ settings: current, status: warning || listener.status(), activations: listener.activations?.() ?? 0 })

  async function update(input) {
    const next = normalizeSettings(input)
    if (updating || (next.enabled && isBusy())) throw shortcutError('SETTINGS_BUSY', 'Finish the current recording and try again.')
    updating = true
    const previous = effective(current)
    const binding = effective(next)
    const needsReplacement = !sameBinding(previous, binding) || (binding && (warning || listener.isActive?.() === false))
    try {
      if (needsReplacement) await listener.replace(binding)
      await writeSettings(file, next)
      current = next
      warning = ''
      return get()
    } catch (error) {
      if (needsReplacement) {
        try { await listener.replace(previous) } catch {
          warning = 'The previous shortcut could not be restored. Global listening is inactive.'
        }
      }
      throw error
    } finally {
      updating = false
    }
  }

  function preview(enabled) {
    if (enabled && isBusy()) throw shortcutError('SETTINGS_BUSY', 'Finish the current recording and try again.')
    listener.preview?.(enabled)
  }

  return {
    get, update, preview,
    shortcutMode: () => !updating && current.enabled ? current.mode : undefined,
    close: () => listener.close?.()
  }
}
