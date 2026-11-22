const copy = 'Transcript ready. Use Copy in Settings.'
const unknown = 'Insertion unconfirmed. Check the document before using Copy in Settings.'

export function insertionText(text) {
  if (typeof text !== 'string' || text.length > 8192 || !text.isWellFormed()) return ''
  const cleaned = text.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ').trim()
  return cleaned.toUpperCase() === '[BLANK_AUDIO]' ? '' : cleaned
}

export function createInsertion(write, timeout = 2500) {
  let ticket
  let detach
  let pending
  function finish(message) {
    if (!pending) return
    clearTimeout(pending.timer)
    pending.resolve(message)
    pending = undefined
  }
  function close() {
    detach?.()
    detach = undefined
    ticket = undefined
    finish(unknown)
  }
  return {
    arm(id, edge, signal) {
      close()
      if (!edge || signal.aborted) return
      ticket = { id, signal }
      const disarm = () => write('DISARM ' + id + '\n')
      signal.addEventListener('abort', disarm, { once: true })
      detach = () => signal.removeEventListener('abort', disarm)
      write('ARM ' + id + ' ' + edge + '\n')
    },
    deliver(id, transcript) {
      if (ticket?.id !== id) return Promise.resolve(copy)
      const { signal } = ticket
      ticket = undefined
      const text = insertionText(transcript)
      if (signal.aborted || !text) return Promise.resolve(copy)
      return new Promise(resolve => {
        pending = { id, resolve, timer: setTimeout(() => finish(unknown), timeout) }
        try { write('INSERT ' + id + ' ' + Buffer.from(text).toString('base64') + '\n') }
        catch { finish(unknown) }
      })
    },
    receive(line) {
      const match = /^EDIT (\d+) (DELIVERED|REFUSED|UNKNOWN)$/.exec(line)
      if (!match) return false
      if (pending?.id === Number(match[1])) finish({
        DELIVERED: 'Text sent to Notepad.', REFUSED: copy, UNKNOWN: unknown
      }[match[2]])
      return true
    },
    close
  }
}
