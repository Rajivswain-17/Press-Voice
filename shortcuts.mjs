const modifiers = new Map([
  ['ControlLeft', 162], ['ControlRight', 163], ['ShiftLeft', 160], ['ShiftRight', 161],
  ['AltLeft', 164], ['AltRight', 165]
])
const functionKey = /^F([1-9]|1[013-9]|2[0-4])$/

export const shortcutError = (code, message) => Object.assign(new Error(message), { code })

export function normalizeShortcut(keys) {
  if (keys === null) return null
  const invalid = () => shortcutError('INVALID_SETTINGS',
    'Choose Left Ctrl, Right Ctrl, or F1–F24 except F12, optionally with left/right Ctrl, Shift or Alt.')
  if (!Array.isArray(keys) || !keys.length || keys.length > 4 || new Set(keys).size !== keys.length ||
      keys.some(key => typeof key !== 'string' || !(modifiers.has(key) || functionKey.test(key)))) throw invalid()
  if (keys.length === 1 && /^Control(Left|Right)$/.test(keys[0])) return [...keys]
  const main = keys.filter(key => functionKey.test(key))
  const held = keys.filter(key => modifiers.has(key))
  if (main.length !== 1 || new Set(held.map(key => key.replace(/Left|Right/, ''))).size !== held.length) throw invalid()
  if (main[0] === 'F4' && held.some(key => /^(Alt|Control)/.test(key))) throw invalid()
  return [...modifiers.keys()].filter(key => held.includes(key)).concat(main)
}

export function virtualKeys(shortcut) {
  return normalizeShortcut(shortcut).map(key => modifiers.get(key) ?? (111 + Number(key.slice(1))))
}
