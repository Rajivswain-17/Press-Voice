// Windows integration check. Captures brief audio in memory only and prints
// format and duration. Use --physical for a temporary Left Ctrl binding.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { createWindowsCompanion } from '../windows-companion.mjs'
import { createDictationSession } from '../dictation-session.mjs'
import { createWhisperSession } from '../whisper-server.mjs'

const physical = process.argv.includes('--physical')
const engine = process.argv.includes('--infer') ? createWhisperSession() : undefined
const runFile = promisify(execFile)
let mode
let wav
let presses
let releases
let foreground

async function sampleForeground() {
  const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', [
    'Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices; public static class PressFocusSample { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process); }\'',
    '[uint32]$ownerId=0',
    '[void][PressFocusSample]::GetWindowThreadProcessId([PressFocusSample]::GetForegroundWindow(),[ref]$ownerId)',
    '(Get-Process -Id $ownerId).ProcessName'
  ].join('; ')], { windowsHide: true, timeout: 5000 })
  return stdout.trim().toLowerCase()
}
const controller = createDictationSession({
  startCapture: context => companion.startCapture(context),
  async onRecording({ audio }) {
    if (engine) assert.equal(typeof await engine.transcribe(audio), 'string')
    wav = audio
  }
})
const companion = createWindowsCompanion({ onShortcut(event) {
  if (event === 'down') {
    controller.down(mode)
    if (physical && ++presses === 1) foreground = sampleForeground().catch(() => '')
  }
  if (event === 'up') {
    releases++
    controller.up()
  }
  if (event === 'cancel') controller.cancel()
  if (event === 'reset') controller.reset()
} })

async function waitFor(predicate, seconds, description) {
  const deadline = Date.now() + seconds * 1000
  while (!predicate() && Date.now() < deadline) await delay(25)
  assert.ok(predicate(), description + ': ' + controller.status())
}

try {
  await companion.replace([physical ? 'ControlLeft' : 'F8'])
  for (mode of ['hold', 'toggle']) {
    wav = undefined
    presses = releases = 0
    foreground = undefined
    if (physical) {
      console.log(mode === 'hold'
        ? 'READY: Hold Left Ctrl in Notepad, speak for 2–3 seconds, then release.'
        : 'READY: Tap Left Ctrl in Notepad, speak for 2–3 seconds, then tap Left Ctrl again.')
      await waitFor(() => controller.isBusy(), 60, 'Expected a physical activation')
    } else {
      controller.down(mode)
      if (mode === 'toggle') controller.up()
      await waitFor(() => controller.status() === 'Recording.', 5, 'Expected live microphone')
      await delay(1200)
      if (mode === 'hold') controller.up()
      else { controller.down(mode); controller.up() }
    }
    await waitFor(() => !controller.isBusy(), 65, 'Expected recording to settle')
    assert.ok(wav, controller.status())
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
    assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ')
    assert.equal(wav.readUInt32LE(4), wav.length - 8)
    assert.equal(wav.readUInt16LE(20), 1)
    assert.equal(wav.readUInt16LE(22), 1)
    assert.equal(wav.readUInt32LE(24), 16000)
    assert.equal(wav.readUInt16LE(34), 16)
    assert.equal(wav.toString('ascii', 36, 40), 'data')
    assert.equal(wav.readUInt32LE(40), wav.length - 44)
    const seconds = (wav.length - 44) / 32000
    assert.ok(seconds > 0 && seconds <= 60)
    if (!physical) assert.ok(seconds >= 0.9 && seconds < 1.8, 'Duration ' + seconds)
    if (physical) {
      const expected = mode === 'hold' ? 1 : 2
      await waitFor(() => releases >= expected, 3, 'Expected the physical key release')
      assert.equal(presses, expected)
      assert.equal(releases, expected)
      assert.ok(seconds >= 0.5 && seconds < 30, 'Unexpected physical recording duration')
      assert.ok(wav.subarray(44).some(byte => byte !== 0), 'The WAV contained only digital silence')
      assert.equal(await foreground, 'notepad', 'Notepad was not foreground near activation')
      assert.equal(await sampleForeground(), 'notepad', 'Notepad was not foreground after capture')
    }
    console.log(mode + ': ' + seconds.toFixed(3) + ' s, ' + wav.length + ' bytes, 16 kHz mono PCM16')
  }

  if (!physical) {
    wav = undefined
    controller.down('hold')
    await waitFor(() => controller.status() === 'Recording.', 5, 'Expected microphone after two stops')
    controller.cancel()
    controller.up()
    await controller.settled()
    assert.equal(wav, undefined)
    assert.equal(controller.isBusy(), false)
    controller.down('hold')
    await waitFor(() => controller.status() === 'Recording.', 5, 'Expected microphone after cancellation')
    controller.cancel()
    controller.up()
    await controller.settled()
    console.log('Microphone reopened after stop and cancellation. Cancelled audio stayed unpublished.')
  }
  if (engine) console.log('Both microphone WAVs were accepted by local Whisper.')
} finally {
  controller.reset()
  await companion.close()
  await engine?.close()
  await controller.settled()
}
