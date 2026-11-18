// Browser speech: recognition (voice in) + synthesis (voice out), French.
// Everything is guarded — in browsers without the Web Speech API these
// return false / reject cleanly and the app falls back to typed input
// (or Groq Whisper when the user has pasted a Groq key).

export function isSpeechRecognitionSupported() {
  if (typeof window === 'undefined') return false
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function isSpeechSynthesisSupported() {
  if (typeof window === 'undefined') return false
  return Boolean(window.speechSynthesis)
}

/**
 * Listen once, in French, and resolve with the transcript.
 * Rejects on error or after `timeoutMs` of silence.
 */
export function listenOnce({ lang = 'fr-FR', timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!isSpeechRecognitionSupported()) {
      reject(new Error('Reconnaissance vocale non disponible sur ce navigateur.'))
      return
    }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new Ctor()
    rec.lang = lang
    rec.interimResults = false
    rec.maxAlternatives = 1
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        try { rec.stop() } catch { /* ignore */ }
        reject(new Error('Je n’ai rien entendu. Essaie encore.'))
      }
    }, timeoutMs)
    rec.onresult = (event) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const text = event.results?.[0]?.[0]?.transcript || ''
      resolve(text.trim())
    }
    rec.onerror = (event) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(event.error === 'not-allowed'
        ? 'Micro bloqué. Autorise le micro dans le navigateur.'
        : 'La reconnaissance vocale a échoué. Essaie encore.'))
    }
    rec.onend = () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error('Je n’ai rien entendu. Essaie encore.'))
      }
    }
    try {
      rec.start()
    } catch (err) {
      settled = true
      clearTimeout(timer)
      reject(err)
    }
  })
}

/** Speak French text out loud. Resolves when finished. */
export function speak(text, { lang = 'fr-FR', rate = 0.95 } = {}) {
  return new Promise((resolve) => {
    if (!isSpeechSynthesisSupported() || !text) {
      resolve()
      return
    }
    try {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = lang
      utter.rate = rate
      const voices = window.speechSynthesis.getVoices()
      const frVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('fr'))
      if (frVoice) utter.voice = frVoice
      utter.onend = () => resolve()
      utter.onerror = () => resolve()
      window.speechSynthesis.speak(utter)
      // Safety: never hang forever.
      setTimeout(resolve, 15000)
    } catch {
      resolve()
    }
  })
}
