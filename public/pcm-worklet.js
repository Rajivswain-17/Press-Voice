class PressPcmProcessor extends AudioWorkletProcessor {
  constructor({ processorOptions }) {
    super()
    this.remaining = Math.round(sampleRate * processorOptions.maxSeconds)
    this.batch = new Float32Array(4096)
    this.length = 0
    this.finished = false
    this.port.onmessage = () => {
      this.finish()
      this.port.postMessage({ type: 'flushed' })
    }
  }

  flush() {
    if (!this.length) return
    const samples = this.batch.slice(0, this.length)
    this.port.postMessage({ type: 'samples', samples }, [samples.buffer])
    this.length = 0
  }

  finish() {
    this.finished = true
    this.flush()
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (this.finished || !channel) return true
    const count = Math.min(this.remaining, channel.length)
    for (let index = 0; index < count; index++) {
      this.batch[this.length++] = channel[index]
      if (this.length === this.batch.length) this.flush()
    }
    this.remaining -= count
    if (!this.remaining) {
      this.finish()
      this.port.postMessage({ type: 'limit' })
    }
    return true
  }
}

registerProcessor('press-pcm', PressPcmProcessor)
