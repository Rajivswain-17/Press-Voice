import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { shortcutError, virtualKeys } from './shortcuts.mjs'
import { createNativeCapture, maxNativeLine } from './native-capture.mjs'

const executable = fileURLToPath(new URL('./runtime/press-windows-companion.exe', import.meta.url))

export function createWindowsCompanion({ onShortcut = () => {}, launch = spawn } = {}) {
  let child
  let active = false
  let closing = false
  let count = 0
  let suppressedUntil = 0
  let status = 'Shortcut disabled.'

  async function stop() {
    if (!child) return
    const owned = child
    child = undefined
    active = false
    onShortcut('reset')
    owned.process.stdin.end()
    const deadline = setTimeout(() => owned.process.kill(), 1000)
    try { await owned.closed } finally { clearTimeout(deadline) }
  }

  async function replace(shortcut) {
    await stop()
    if (closing && shortcut) throw shortcutError('COMPANION_UNAVAILABLE', 'Press is shutting down.')
    status = 'Shortcut disabled.'
    if (!shortcut) return
    const process = launch(executable, virtualKeys(shortcut).map(String), {
      windowsHide: true, stdio: ['pipe', 'pipe', 'ignore']
    })
    process.stdin.on('error', () => {})
    const closed = new Promise(resolve => process.once('close', resolve))
    const capture = createNativeCapture(data => process.stdin.write(data), () => process.kill())
    const owned = child = { process, closed, capture }
    await new Promise((resolve, reject) => {
      let fragments = []
      let length = 0
      const unavailable = () => shortcutError('COMPANION_UNAVAILABLE',
        'The Windows companion could not start. Build it using the README instructions.')
      const deadline = setTimeout(() => reject(unavailable()), 2500)
      process.once('error', () => reject(unavailable()))
      closed.then(() => {
        clearTimeout(deadline)
        capture.close()
        if (child === owned) {
          child = undefined
          active = false
          status = 'Windows shortcut listener stopped.'
          onShortcut('reset')
        }
        reject(unavailable())
      })
      process.stdout.setEncoding('utf8')
      process.stdout.on('data', chunk => {
        const lines = chunk.split('\n')
        for (let index = 0; index < lines.length; index++) {
          const piece = lines[index]
          length += piece.length
          if (length > maxNativeLine) { process.kill(); return }
          fragments.push(piece)
          if (index === lines.length - 1) break
          const event = fragments.join('').trim()
          fragments = []
          length = 0
          if (child !== owned) continue
          if (event === 'READY 1') {
            clearTimeout(deadline)
            active = true
            status = 'Listening for your shortcut.'
            resolve()
          } else if (event === 'CONFLICT') {
            reject(shortcutError('SHORTCUT_CONFLICT', 'Windows could not register this combination. Choose a different shortcut.'))
          } else if (event === 'HELD') {
            reject(shortcutError('SHORTCUT_CONFLICT', 'Release your shortcut keys and try again.'))
          } else if (event === 'DOWN' && active && Date.now() >= suppressedUntil) {
            count++
            onShortcut('down')
          } else if (event === 'UP' && active) {
            onShortcut('up')
          } else if (event === 'CANCEL' && active) {
            onShortcut('cancel')
          } else if (active) capture.receive(event)
        }
      })
    }).catch(async error => {
      await stop()
      status = error.message
      throw error
    })
  }

  return {
    replace,
    close: () => { closing = true; return stop() },
    status: () => status,
    startCapture: context => {
      if (!active || !child) throw Object.assign(Error('The Windows companion is not ready.'), {
        captureMessage: 'The Windows companion is not ready. Check shortcut settings.'
      })
      return child.capture.start(context)
    },
    isActive: () => active,
    activations: () => count,
    preview: enabled => {
      suppressedUntil = enabled ? Date.now() + 15000 : 0
      if (enabled) onShortcut('reset')
    }
  }
}
