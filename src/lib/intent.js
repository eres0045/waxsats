// Local rule-based French intent parser — works with NO key at all.
// Turns a spoken/typed French command into:
//   { action: 'send' | 'receive' | 'balance' | 'unknown',
//     amount_sats: number | null, recipient: string | null,
//     confidence: 0..1, raw: string }
//
// Examples:
//   "Envoie 500 sats à Awa"            -> send 500 to Awa
//   "Envoie cinq cents sats à Moussa"  -> send 500 to Moussa
//   "Quel est mon solde ?"             -> balance
//   "Je veux recevoir 1000 sats"      -> receive 1000
//   "Montre-moi l'historique"          -> history (handled as unknown+hint by the app)

import { findNumberInText, normalizeFrench } from './frenchNumbers.js'

const SEND_WORDS = [
  'envoie', 'envoyer', 'envois', 'transfere', 'transferer', 'transfert',
  'donne', 'donner', 'paye', 'payer', 'paie', 'verse', 'verser',
]
const RECEIVE_WORDS = [
  'recois', 'recevoir', 'recuperer', 'recupere', 'demande', 'demander',
  'facture', 'creer une facture', 'genere', 'generer', 'montre le qr',
]
const BALANCE_WORDS = [
  'solde', 'combien', 'balance', 'argent', 'reste', 'combien j ai',
  'mon compte', 'combien il me reste',
]

function containsWord(norm, words) {
  return words.some((w) => norm.includes(w))
}

/** Extract the recipient name after "à" / "pour" / "a". Returns null if none. */
export function extractRecipient(raw) {
  const text = (raw || '').trim()
  // "… à Awa", "… pour Moussa", "… a Fatou" — name is the last word group.
  // NOTE: \b does not match "à" (non-ASCII), so match on whitespace/start.
  const match = text.match(/(?:^|\s)(?:à|pour|a)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]*?)\s*[?.!,;]*$/i)
  if (!match) return null
  let name = match[1].trim()
  // Drop trailing filler words that are not a name.
  name = name.replace(/\s+(sats?|bitcoin|btc|svp|s\'il te pla[iî]t|merci)\s*$/i, '').trim()
  if (!name) return null
  // A "name" that is only a number word is not a name.
  if (/^(cinq|dix|vingt|trente|cent|mille|\d+).*/i.test(name) && !/ [A-Z]/.test(name)) {
    // e.g. "à cinq cents sats" — the amount, not a person.
    if (/^\d|^(cinq|dix|vingt|trente|quarante|cinquante|soixante|cent|mille)/i.test(name)) return null
  }
  // Capitalize first letter, keep the rest as typed.
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export function parseIntent(rawText) {
  const raw = (rawText || '').trim()
  const norm = normalizeFrench(raw)
  const result = {
    action: 'unknown',
    amount_sats: null,
    recipient: null,
    confidence: 0,
    raw,
  }
  if (!norm) return result

  const amount = findNumberInText(raw)

  if (containsWord(norm, BALANCE_WORDS) && !containsWord(norm, SEND_WORDS)) {
    result.action = 'balance'
    result.confidence = 0.95
    return result
  }

  if (containsWord(norm, RECEIVE_WORDS)) {
    result.action = 'receive'
    result.amount_sats = amount
    result.confidence = amount !== null ? 0.95 : 0.8
    return result
  }

  if (containsWord(norm, SEND_WORDS)) {
    result.action = 'send'
    result.amount_sats = amount
    result.recipient = extractRecipient(raw)
    // Confidence: amount + recipient = very sure; amount only = sure;
    // neither = we know it's a send but need details.
    if (amount !== null && result.recipient) result.confidence = 0.95
    else if (amount !== null) result.confidence = 0.85
    else if (result.recipient) result.confidence = 0.8
    else result.confidence = 0.6
    return result
  }

  // No verb matched, but a bare amount + name looks like a send.
  const recipient = extractRecipient(raw)
  if (amount !== null && recipient) {
    result.action = 'send'
    result.amount_sats = amount
    result.recipient = recipient
    result.confidence = 0.7
    return result
  }

  // Bare amount alone — probably a receive amount on the receive screen.
  if (amount !== null) {
    result.action = 'receive'
    result.amount_sats = amount
    result.confidence = 0.5
    return result
  }

  return result
}

/** Short French hint for the UI when the parser could not understand. */
export function intentHint(intent) {
  if (intent.action === 'send' && intent.amount_sats === null && !intent.recipient) {
    return 'Dis par exemple : « Envoie 500 sats à Awa »'
  }
  if (intent.action === 'send' && intent.amount_sats === null) {
    return 'Combien de sats ? Dis par exemple : « Envoie 500 sats »'
  }
  if (intent.action === 'send' && !intent.recipient) {
    return 'À qui ? Dis par exemple : « À Awa »'
  }
  return 'Essaie : « Envoie 500 sats à Awa », « Quel est mon solde ? » ou « Je veux recevoir 1000 sats »'
}
