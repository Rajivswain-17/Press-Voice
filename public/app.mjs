import { createRecorder } from './recorder.mjs'

export function createController({
  recorder, transcribe, render, writeText, readText, clipboard,
  selectText, renderCopy
}) {
  let state = 'ready'
  const showCopy = renderCopy ?? (message => render(state, message))

  function show(next, message) {
    state = next
    render(next, message)
  }

  function captureError(error) {
    show('ready', error.message || 'Recording failed. Try again.')
  }

  async function stop() {
    if (state !== 'recording') return
    show('transcribing', 'Transcribing…')
    try {
      const text = (await transcribe(await recorder.stop())).trim()
      if (text) writeText(text)
      show('ready', text ? 'Transcript ready.' : 'No speech detected. Try again.')
    } catch (error) {
      captureError(error)
    }
  }

  async function record() {
    if (state === 'recording') return stop()
    if (state !== 'ready') return
    showCopy('')
    show('starting', 'Requesting microphone…')
    try {
      await recorder.start()
      show('recording', 'Recording…')
    } catch (error) {
      captureError(error)
    }
  }

  async function copy() {
    const text = readText()
    if (!text.trim()) return
    try {
      await clipboard(text)
      showCopy('Copied.')
    } catch {
      selectText?.()
      showCopy('Press Ctrl+C to copy the selected text.')
    }
  }

  return { record, stop, copy, captureError }
}

async function transcribe(wav) {
  let response
  try {
    response = await fetch('/api/transcribe', {
      method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav
    })
  } catch {
    throw Error('Could not reach Press. Check that it is running and try again.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok || typeof result.text !== 'string') {
    throw Error(result.error?.message || 'Transcription failed. Try again.')
  }
  return result.text
}

if (typeof document !== 'undefined') {
  const button = document.querySelector('#record')
  const copy = document.querySelector('#copy')
  const status = document.querySelector('#status')
  const copyStatus = document.querySelector('#copy-status')
  const transcript = document.querySelector('#transcript')
  const recorder = createRecorder({
    onLimit: () => void controller.stop(),
    onError: error => controller.captureError(error)
  })
  const refreshCopy = () => { copy.disabled = !transcript.value.trim() }
  const controller = createController({
    recorder, transcribe,
    render(state, message) {
      button.textContent = state === 'recording' ? 'Stop' : 'Record'
      button.dataset.state = state
      button.disabled = state === 'starting' || state === 'transcribing'
      status.textContent = message
    },
    writeText(text) { transcript.value = text; refreshCopy() },
    readText: () => transcript.value,
    clipboard: text => navigator.clipboard.writeText(text),
    selectText() { transcript.focus(); transcript.select() },
    renderCopy: message => { copyStatus.textContent = message }
  })
  button.addEventListener('click', controller.record)
  copy.addEventListener('click', controller.copy)
  transcript.addEventListener('input', () => { copyStatus.textContent = ''; refreshCopy() })
  window.addEventListener('pagehide', recorder.cancel)
}
