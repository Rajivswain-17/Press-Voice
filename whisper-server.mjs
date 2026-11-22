import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

export const engineError = (code, message) => Object.assign(new Error(message), { code })
const unavailable = () => engineError('ENGINE_UNAVAILABLE', 'Whisper could not start or respond. Check the local engine and model, then try again.')
const timeout = () => engineError('ENGINE_TIMEOUT', 'Whisper took too long. Try a shorter recording.')
const loopback = '127.0.0.1'
const executable = fileURLToPath(new URL('./runtime/whisper-server-win32-x64-cpu.exe', import.meta.url))
const model = fileURLToPath(new URL('./models/ggml-tiny.en-q5_1.bin', import.meta.url))

async function findPort() {
  const reservation = createServer()
  await new Promise((resolve, reject) => {
    reservation.once('error', reject)
    reservation.listen(0, loopback, resolve)
  })
  const { port } = reservation.address()
  await new Promise(resolve => reservation.close(resolve))
  return port
}

async function launchWhisper() {
  try { await Promise.all([access(executable), access(model)]) } catch {
    throw engineError('ENGINE_UNAVAILABLE', 'The local Whisper server or English model is missing. See the Press setup instructions.')
  }
  const cwd = await mkdtemp(join(tmpdir(), 'press-whisper-'))
  let stop
  try {
    const port = await findPort()
    const prefix = '/press-' + randomBytes(16).toString('hex')
    const base = 'http://' + loopback + ':' + port + prefix
    const child = spawn(executable, [
      '--host', loopback, '--port', String(port), '--request-path', prefix,
      '--public', cwd, '--no-gpu', '--threads', '4', '--language', 'en', '--model', model
    ], { cwd, windowsHide: true, stdio: 'ignore' })
    let exited = false
    child.once('error', () => { exited = true })
    child.once('exit', () => { exited = true })
    const closed = new Promise(resolve => child.once('close', () => { exited = true; resolve() }))
    let stopping
    stop = () => stopping ??= (async () => {
      if (!exited) child.kill()
      await closed
      await rm(cwd, { recursive: true, force: true })
    })()

    const deadline = Date.now() + 15000
    let ready = false
    while (!exited && Date.now() < deadline) {
      try {
        const response = await fetch(base + '/health', { redirect: 'error', signal: AbortSignal.timeout(500) })
        if (response.ok && (await response.json()).status === 'ok' && !exited) {
          ready = true
          break
        }
      } catch { /* The native process may still be loading the model. */ }
      await delay(50)
    }
    if (!ready) throw unavailable()

    return {
      alive: () => !exited,
      stop,
      async infer(wav) {
        const data = new FormData()
        data.append('file', new Blob([wav], { type: 'audio/wav' }), 'recording.wav')
        data.append('language', 'en')
        data.append('response_format', 'json')
        try {
          const response = await fetch(base + '/inference', {
            method: 'POST', body: data, redirect: 'error', signal: AbortSignal.timeout(60000)
          })
          if (!response.ok) throw unavailable()
          const result = await response.json()
          if (typeof result.text !== 'string') throw unavailable()
          return result.text.trim()
        } catch (error) {
          if (error.name === 'TimeoutError') throw timeout()
          throw unavailable()
        }
      }
    }
  } catch (error) {
    if (stop) await stop()
    else await rm(cwd, { recursive: true, force: true })
    throw error.code === 'ENGINE_UNAVAILABLE' ? error : unavailable()
  }
}

export function createWhisperSession({
  launch = launchWhisper, schedule = setTimeout, unschedule = clearTimeout
} = {}) {
  let engine
  let timer
  let generation = 0
  let busy = false
  let closed = false
  let stopping = Promise.resolve()
  let startup

  function clearIdle() {
    generation++
    if (timer !== undefined) unschedule(timer)
    timer = undefined
  }

  function stopEngine() {
    const owned = engine
    engine = undefined
    if (owned) stopping = Promise.resolve().then(() => owned.stop())
    return stopping
  }

  async function transcribe(wav) {
    if (closed) throw unavailable()
    if (busy) throw engineError('BUSY', 'A recording is already being transcribed.')
    busy = true
    clearIdle()
    try {
      await stopping
      if (closed) throw unavailable()
      if (engine && !engine.alive()) await stopEngine()
      if (closed) throw unavailable()
      if (!engine) {
        startup = Promise.resolve().then(launch)
        try { engine = await startup } finally { startup = undefined }
      }
      if (closed) throw unavailable()
      return await engine.infer(wav)
    } catch (error) {
      await stopEngine()
      throw error
    } finally {
      busy = false
      if (engine && !closed) {
        const version = generation
        timer = schedule(() => {
          if (version === generation && !busy && !closed) {
            timer = undefined
            return stopEngine().catch(() => {})
          }
        }, 120000)
        timer?.unref?.()
      }
    }
  }

  async function close() {
    closed = true
    clearIdle()
    await startup?.catch(() => {})
    await stopEngine()
  }

  return { transcribe, close }
}
