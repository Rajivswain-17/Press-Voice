import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { shortcutError, virtualKeys } from './shortcuts.mjs'

const executable = fileURLToPath(new URL('./runtime/press-windows-companion.exe', import.meta.url))

export function createWindowsCompanion() {
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
    owned.process.stdin.end()
    const deadline = setTimeout(() => owned.process.kill(), 1000)
    try { await owned.closed } finally { clearTimeout(deadline) }
  }

  async function replace(shortcut) {
    await stop()
    if (closing && shortcut) throw shortcutError('COMPANION_UNAVAILABLE', 'Press is shutting down.')
    status = 'Shortcut disabled.'
    if (!shortcut) return
    const process = spawn(executable, virtualKeys(shortcut).map(String), {
      windowsHide: true, stdio: ['pipe', 'pipe', 'ignore']
    })
    process.stdin.on('error', () => {})
    const closed = new Promise(resolve => process.once('close', resolve))
    const owned = child = { process, closed }
    await new Promise((resolve, reject) => {
      let buffer = ''
      const unavailable = () => shortcutError('COMPANION_UNAVAILABLE',
        'The Windows companion could not start. Build it using the README instructions.')
      const deadline = setTimeout(() => reject(unavailable()), 2500)
      process.once('error', () => reject(unavailable()))
      closed.then(() => {
        clearTimeout(deadline)
        if (child === owned) {
          child = undefined
          active = false
          status = 'Windows shortcut listener stopped.'
        }
        reject(unavailable())
      })
      process.stdout.setEncoding('utf8')
      process.stdout.on('data', chunk => {
        buffer += chunk
        if (buffer.length > 256) {
          process.kill()
          return
        }
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          const event = line.trim()
          if (child !== owned) continue
          if (event === 'READY 1') {
            clearTimeout(deadline)
            active = true
            status = 'Listening for your shortcut. Recording from the shortcut comes in a later task.'
            resolve()
          } else if (event === 'CONFLICT') {
            reject(shortcutError('SHORTCUT_CONFLICT', 'Windows could not register this combination. Choose a different shortcut.'))
          } else if (event === 'HELD') {
            reject(shortcutError('SHORTCUT_CONFLICT', 'Release your shortcut keys and try again.'))
          } else if (event === 'DOWN' && active && Date.now() >= suppressedUntil) {
            count++
          }
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
    isActive: () => active,
    activations: () => count,
    preview: enabled => { suppressedUntil = enabled ? Date.now() + 15000 : 0 }
  }
}
