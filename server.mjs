import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { maxWavBytes, sampleRate } from './public/wav.mjs'
import { createWhisperSession, engineError } from './whisper-server.mjs'

const loopback = '127.0.0.1'
const staticPages = new Map([
  ['/', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ...['app.mjs', 'recorder.mjs', 'wav.mjs', 'pcm-worklet.js']
    .map(file => ['/' + file, [file, 'text/javascript']])
])
const errors = new Map([
  ['BAD_WAV', 400], ['BAD_ORIGIN', 403], ['NOT_FOUND', 404], ['METHOD', 405],
  ['BUSY', 409], ['TOO_LARGE', 413], ['MEDIA_TYPE', 415],
  ['ENGINE_UNAVAILABLE', 503], ['ENGINE_TIMEOUT', 504]
])
const tooLarge = () => engineError('TOO_LARGE', 'Recording exceeds the 60-second limit.')
const badWav = () => engineError('BAD_WAV', 'Press needs nonempty 16 kHz mono PCM WAV audio.')

function readWav(request) {
  if (Number(request.headers['content-length']) > maxWavBytes) throw tooLarge()
  return new Promise((done, reject) => {
    let size = 0
    const chunks = []
    request.on('data', chunk => {
      size += chunk.length
      if (size > maxWavBytes) {
        chunks.length = 0
        reject(tooLarge())
      } else chunks.push(chunk)
    })
    request.once('error', () => reject(badWav()))
    request.once('end', () => {
      if (size <= maxWavBytes) done(Buffer.concat(chunks, size))
    })
  })
}

function validateWav(wav) {
  if (wav.length < 46 || wav.length % 2 ||
      wav.toString('ascii', 0, 4) !== 'RIFF' || wav.readUInt32LE(4) !== wav.length - 8 ||
      wav.toString('ascii', 8, 16) !== 'WAVEfmt ' || wav.readUInt32LE(16) !== 16 ||
      wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 ||
      wav.readUInt32LE(24) !== sampleRate || wav.readUInt32LE(28) !== sampleRate * 2 ||
      wav.readUInt16LE(32) !== 2 || wav.readUInt16LE(34) !== 16 ||
      wav.toString('ascii', 36, 40) !== 'data' || wav.readUInt32LE(40) !== wav.length - 44) throw badWav()
}

export function createPressServer({ transcribe }) {
  let busy = false
  return createServer({ requestTimeout: 15000 }, async (request, response) => {
    const expectedHost = loopback + ':' + request.socket.localPort
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'")
    const json = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(body))
    }

    try {
      if (request.headers.host !== expectedHost) throw engineError('BAD_ORIGIN', 'Open Press using the displayed local address.')
      if (request.url !== '/api/transcribe') {
        const asset = staticPages.get(request.url)
        if (!asset || request.method !== 'GET') throw engineError('NOT_FOUND', 'This Press page does not exist.')
        const [file, type] = asset
        const bytes = await readFile(new URL('./public/' + file, import.meta.url))
        response.writeHead(200, { 'Content-Type': type + '; charset=utf-8' })
        response.end(bytes)
        return
      }
      if (request.method !== 'POST') throw engineError('METHOD', 'Use POST to transcribe a recording.')
      if (request.headers.origin !== 'http://' + expectedHost) throw engineError('BAD_ORIGIN', 'Send recordings from the Press page.')
      if (request.headers['content-type'] !== 'audio/wav') throw engineError('MEDIA_TYPE', 'Send WAV audio.')
      if (busy) throw engineError('BUSY', 'A recording is already being transcribed.')
      busy = true
      try {
        const wav = await readWav(request)
        validateWav(wav)
        const text = wav.subarray(44).some(byte => byte !== 0) ? await transcribe(wav) : ''
        json(200, { text })
      } finally {
        busy = false
      }
    } catch (error) {
      request.resume()
      const status = errors.get(error.code) ?? 500
      json(status, { error: {
        code: status === 500 ? 'INTERNAL' : error.code,
        message: status === 500 ? 'Press could not complete this request.' : error.message
      } })
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const engine = createWhisperSession()
  const server = createPressServer(engine)
  server.listen(0, loopback, () => {
    const url = 'http://' + loopback + ':' + server.address().port
    console.log('Open Press at ' + url)
    if (process.platform === 'win32' && process.argv.includes('--open')) {
      execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true }, error => {
        if (error) console.error('Open the local Press address in your browser.')
      })
    }
  })
  let stopping = false
  function shutdown() {
    if (stopping) return
    stopping = true
    server.close()
    server.closeAllConnections()
    void engine.close().catch(() => { process.exitCode = 1 })
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
