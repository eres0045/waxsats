// Groq client — optional enhancement, never required.
// The app works fully offline with the local parser; when the user pastes
// their own Groq key (stored only in their browser localStorage), two
// extra paths open up:
//  1. LLM intent parsing (llama-3.3-70b-versatile) for free-form French.
//  2. Whisper transcription (whisper-large-v3-turbo) when the browser's
//     built-in speech recognition is unavailable.

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_AUDIO_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
export const GROQ_INTENT_MODEL = 'llama-3.3-70b-versatile'
export const GROQ_WHISPER_MODEL = 'whisper-large-v3-turbo'

const INTENT_SYSTEM = `Tu es un parseur d'intentions pour un portefeuille Lightning vocal.
L'utilisateur parle français. Réponds UNIQUEMENT avec un objet JSON, sans texte autour :
{"action": "send" | "receive" | "balance" | "unknown", "amount_sats": <nombre ou null>, "recipient": "<nom ou null>"}
Exemples :
"Envoie 500 sats à Awa" -> {"action":"send","amount_sats":500,"recipient":"Awa"}
"Quel est mon solde ?" -> {"action":"balance","amount_sats":null,"recipient":null}
"Je veux recevoir mille sats" -> {"action":"receive","amount_sats":1000,"recipient":null}
"Envoie cinq cents sats à Moussa" -> {"action":"send","amount_sats":500,"recipient":"Moussa"}`

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const obj = body.match(/\{[\s\S]*\}/)
  if (!obj) throw new Error('Groq a renvoyé une réponse illisible.')
  return JSON.parse(obj[0])
}

/** Parse a French command with Groq LLM. Returns the same shape as the local parser. */
export async function groqParseIntent(text, apiKey, fetchImpl = fetch) {
  if (!apiKey) throw new Error('Clé Groq manquante.')
  const res = await fetchImpl(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_INTENT_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: INTENT_SYSTEM },
        { role: 'user', content: text },
      ],
    }),
  })
  if (!res.ok) {
    throw new Error(`Groq a répondu ${res.status}. Vérifie ta clé.`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || ''
  const parsed = extractJson(content)
  return {
    action: ['send', 'receive', 'balance'].includes(parsed.action) ? parsed.action : 'unknown',
    amount_sats: Number.isFinite(parsed.amount_sats) ? Math.floor(parsed.amount_sats) : null,
    recipient: typeof parsed.recipient === 'string' && parsed.recipient ? parsed.recipient : null,
    confidence: 0.9,
    raw: text,
    source: 'groq',
  }
}

/** Transcribe an audio blob (webm/wav) to French text with Groq Whisper. */
export async function groqTranscribe(audioBlob, apiKey, fetchImpl = fetch) {
  if (!apiKey) throw new Error('Clé Groq manquante.')
  const form = new FormData()
  form.append('file', audioBlob, 'voix.webm')
  form.append('model', GROQ_WHISPER_MODEL)
  form.append('language', 'fr')
  const res = await fetchImpl(GROQ_AUDIO_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) {
    throw new Error(`Groq Whisper a répondu ${res.status}. Vérifie ta clé.`)
  }
  const data = await res.json()
  return (data?.text || '').trim()
}
