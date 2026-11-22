export const sampleRate = 16000
export const maxSeconds = 60
export const maxWavBytes = 44 + sampleRate * maxSeconds * 2

export function targetFrameCount(frames, sourceRate) {
  return Math.min(sampleRate * maxSeconds, Math.round(frames * sampleRate / sourceRate))
}

export function encodeWav(samples) {
  if (!samples.length) throw Object.assign(new Error('No audio was captured.'), { code: 'EMPTY_CAPTURE' })
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  for (const [offset, label] of [[0, 'RIFF'], [8, 'WAVEfmt '], [36, 'data']]) {
    for (let index = 0; index < label.length; index++) view.setUint8(offset + index, label.charCodeAt(index))
  }
  for (const [offset, value] of [[4, buffer.byteLength - 8], [16, 16], [24, sampleRate],
    [28, sampleRate * 2], [40, samples.length * 2]]) view.setUint32(offset, value, true)
  for (const [offset, value] of [[20, 1], [22, 1], [32, 2], [34, 16]]) view.setUint16(offset, value, true)
  for (let index = 0; index < samples.length; index++) {
    const value = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(44 + index * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export async function prepareWav(chunks, frames, sourceRate) {
  const targetFrames = targetFrameCount(frames, sourceRate)
  if (!targetFrames || frames > maxSeconds * sourceRate) return encodeWav(new Float32Array())
  const samples = new Float32Array(frames)
  let offset = 0
  for (const chunk of chunks) {
    samples.set(chunk, offset)
    offset += chunk.length
  }
  if (sourceRate === sampleRate) return encodeWav(samples)
  const context = new OfflineAudioContext(1, targetFrames, sampleRate)
  const source = context.createBufferSource()
  source.buffer = context.createBuffer(1, frames, sourceRate)
  source.buffer.copyToChannel(samples, 0)
  source.connect(context.destination)
  source.start()
  return encodeWav((await context.startRendering()).getChannelData(0))
}
