const form = document.querySelector('#settings')
const controls = document.querySelector('#options')
const enable = document.querySelector('#enabled')
const capture = document.querySelector('#capture')
const shortcut = document.querySelector('#shortcut')
const message = document.querySelector('#message')
const status = document.querySelector('#listener-status')
const activations = document.querySelector('#activations')
const save = document.querySelector('#save')
const backgroundStatus = document.querySelector('#background-status')
const backgroundText = document.querySelector('#background-text')
const backgroundCopy = document.querySelector('#background-copy')
const backgroundCopyStatus = document.querySelector('#background-copy-status')
let candidate = null
let captureState

const format = code => code.replace('Control', 'Ctrl').replace(/(Left|Right)$/, ' ($1)')
const showCandidate = () => { shortcut.textContent = candidate?.map(format).join(' + ') || 'None' }

async function request(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
  const data = await response.json()
  if (!response.ok) throw Error(data.error?.message ?? 'Could not load shortcut settings.')
  return data
}

function showStatus(data) {
  status.textContent = data.status
  activations.textContent = data.activations
}

function showSettings(data) {
  candidate = data.settings.shortcut
  enable.checked = data.settings.enabled
  form.elements.mode.value = data.settings.mode
  showCandidate()
  showStatus(data)
}

async function showBackground() {
  const result = await request('/api/background')
  if (backgroundStatus.textContent !== result.status) backgroundStatus.textContent = result.status
  if (backgroundText.value !== result.text) {
    backgroundText.value = result.text
    backgroundCopy.disabled = !result.text
    backgroundCopyStatus.textContent = ''
  }
}

backgroundCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(backgroundText.value)
    backgroundCopyStatus.textContent = 'Copied.'
  } catch {
    backgroundText.select()
    backgroundCopyStatus.textContent = 'Press Ctrl+C to copy.'
  }
})

function endCapture(keys) {
  if (!captureState) return
  clearTimeout(captureState.timer)
  captureState = undefined
  capture.textContent = 'Change shortcut'
  save.disabled = false
  if (keys) {
    candidate = keys
    showCandidate()
    message.textContent = 'Shortcut captured. Save settings to apply it.'
  } else message.textContent = 'Shortcut capture cancelled.'
  void request('/api/settings/preview', false).catch(() => {})
}

capture.addEventListener('click', async () => {
  if (captureState) return endCapture()
  save.disabled = true
  const session = { keys: new Set(), pressed: new Set(), ready: false }
  captureState = session
  capture.textContent = 'Press your shortcut'
  session.timer = setTimeout(() => endCapture(), 14000)
  try {
    await request('/api/settings/preview', true)
    if (captureState === session && document.activeElement === capture) {
      session.ready = true
      message.textContent = 'Press and release your shortcut. Escape cancels.'
    } else await request('/api/settings/preview', false)
  } catch (error) {
    endCapture()
    message.textContent = error.message
  }
})

capture.addEventListener('keydown', event => {
  if (!captureState) return
  if (event.code === 'Tab') return endCapture()
  event.preventDefault()
  if (event.code === 'Escape') return endCapture()
  if (!captureState.ready || event.repeat) return
  captureState.keys.add(event.code)
  captureState.pressed.add(event.code)
})
capture.addEventListener('keyup', event => {
  if (!captureState?.pressed.has(event.code)) return
  event.preventDefault()
  captureState.pressed.delete(event.code)
  if (!captureState.pressed.size) endCapture([...captureState.keys])
})
capture.addEventListener('blur', () => endCapture())
window.addEventListener('blur', () => endCapture())

form.addEventListener('submit', async event => {
  event.preventDefault()
  controls.disabled = true
  try {
    showSettings(await request('/api/settings', { enabled: enable.checked, shortcut: candidate, mode: form.elements.mode.value }))
    message.textContent = 'Settings saved.'
  } catch (error) {
    message.textContent = error.message
  } finally {
    controls.disabled = false
  }
})

try {
  showSettings(await request('/api/settings'))
  void showBackground().catch(() => {})
  controls.disabled = false
  setInterval(() => {
    if (!document.hidden) {
      void request('/api/settings').then(showStatus).catch(() => {
        status.textContent = 'Could not reach Press.'
      })
      void showBackground().catch(() => {})
    }
  }, 1000)
} catch (error) {
  status.textContent = error.message
}
