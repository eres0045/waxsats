// French number words <-> integers.
// Handles the forms people actually say: "cinq cents", "deux mille",
// "quatre-vingt-dix-neuf", "mille deux cents", "soixante-dix".
// Also handles plain digits ("500", "1 000").

const ONES = {
  'zéro': 0, 'zero': 0, 'un': 1, 'une': 1, 'deux': 2, 'trois': 3,
  'quatre': 4, 'cinq': 5, 'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9,
  'dix': 10, 'onze': 11, 'douze': 12, 'treize': 13, 'quatorze': 14,
  'quinze': 15, 'seize': 16, 'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19,
}

const TENS = {
  'vingt': 20, 'trente': 30, 'quarante': 40, 'cinquante': 50, 'soixante': 60,
}

const NUMBER_WORDS = new Set([
  ...Object.keys(ONES), ...Object.keys(TENS),
  'vingts', 'cents', 'cent', 'mille', 'et',
])

/** Normalize French text for number parsing: lowercase, strip accents, hyphens -> spaces. */
export function normalizeFrench(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Is this token part of a French number expression? */
export function isNumberWord(token) {
  return NUMBER_WORDS.has(token) || /^\d+$/.test(token)
}

/**
 * Parse a run of French number words (already normalized, space-separated)
 * into an integer. Returns null if the run contains no number.
 * Examples: "cinq cents" -> 500, "deux mille cinq cents" -> 2500,
 * "quatre vingt dix neuf" -> 99, "soixante dix" -> 70, "mille" -> 1000.
 */
export function parseFrenchNumber(phrase) {
  const norm = normalizeFrench(phrase)
  if (!norm) return null
  const tokens = norm.split(' ').filter(Boolean)
  if (tokens.length === 0) return null
  // A lone digit token.
  if (tokens.length === 1 && /^\d+$/.test(tokens[0])) {
    return parseInt(tokens[0], 10)
  }

  let total = 0
  let current = 0
  let seen = false
  let i = 0

  while (i < tokens.length) {
    const t = tokens[i]

    if (/^\d+$/.test(t)) {
      current = current * 1000 + parseInt(t, 10)
      seen = true
      i += 1
      continue
    }

    // "quatre vingt dix ..." -> 90 + rest ("quatre vingt dix neuf" = 99)
    if (t === 'quatre' && (tokens[i + 1] === 'vingt' || tokens[i + 1] === 'vingts') && tokens[i + 2] === 'dix') {
      current += 90
      seen = true
      i += 3
      continue
    }
    // "quatre vingt ..." -> 80 (+ ones: "quatre vingt deux" = 82)
    if (t === 'quatre' && (tokens[i + 1] === 'vingt' || tokens[i + 1] === 'vingts')) {
      current += 80
      seen = true
      i += 2
      continue
    }
    // "soixante dix ..." -> 70 + rest ("soixante dix sept" = 77)
    if (t === 'soixante' && tokens[i + 1] === 'dix') {
      current += 70
      seen = true
      i += 2
      continue
    }

    if (t === 'mille') {
      total += (current || 1) * 1000
      current = 0
      seen = true
      i += 1
      continue
    }
    if (t === 'cent' || t === 'cents') {
      current = (current || 1) * 100
      seen = true
      i += 1
      continue
    }
    if (t === 'et') {
      i += 1
      continue
    }
    if (t in TENS) {
      current += TENS[t]
      seen = true
      i += 1
      continue
    }
    if (t in ONES) {
      current += ONES[t]
      seen = true
      i += 1
      continue
    }
    if (t === 'vingts') {
      current += 20
      seen = true
      i += 1
      continue
    }
    // Unknown token: stop — the run ended.
    break
  }

  if (!seen) return null
  return total + current
}

/**
 * Find the first number in a normalized French sentence and parse it.
 * Prefers an explicit digit run; otherwise the longest run of number words.
 * Returns null when no number is present.
 */
export function findNumberInText(text) {
  const norm = normalizeFrench(text)
  if (!norm) return null

  // Digits first: "500", "1 000" (space as thousands separator).
  const digitMatch = norm.match(/\d[\d ]*\d|\d/)
  if (digitMatch) {
    const value = parseInt(digitMatch[0].replace(/ /g, ''), 10)
    if (!Number.isNaN(value)) return value
  }

  const tokens = norm.split(' ').filter(Boolean)
  let best = null
  let run = []
  const flush = () => {
    if (run.length > 0) {
      const value = parseFrenchNumber(run.join(' '))
      if (value !== null && (best === null || run.length > best.length)) {
        best = { value, length: run.length }
      }
      run = []
    }
  }
  for (const token of tokens) {
    if (isNumberWord(token)) run.push(token)
    else flush()
  }
  flush()
  return best ? best.value : null
}

// ---- number -> French words (for the confirmation screen, "cinq cents sats") ----

const ONES_WORDS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit',
  'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
]

function underHundred(n) {
  if (n < 20) return ONES_WORDS[n]
  if (n < 70) {
    const tens = Math.floor(n / 10) * 10
    const rest = n % 10
    const tensWord = { 20: 'vingt', 30: 'trente', 40: 'quarante', 50: 'cinquante', 60: 'soixante' }[tens]
    if (rest === 0) return tensWord
    if (rest === 1 && tens !== 80) return `${tensWord} et un`
    return `${tensWord}-${ONES_WORDS[rest]}`
  }
  if (n < 80) return `soixante-${ONES_WORDS[n - 60]}` // 70..79
  if (n < 90) return n === 80 ? 'quatre-vingts' : `quatre-vingt-${ONES_WORDS[n - 80]}`
  return `quatre-vingt-${ONES_WORDS[n - 80]}` // 90..99
}

function underThousand(n) {
  if (n < 100) return underHundred(n)
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const head = hundreds === 1 ? 'cent' : `${ONES_WORDS[hundreds]} cent${rest === 0 ? 's' : ''}`
  return rest === 0 ? head : `${head} ${underHundred(rest)}`
}

/** Integer -> French words. Supports 0..999999. */
export function numberToFrenchWords(n) {
  if (!Number.isFinite(n) || n < 0) return ''
  const value = Math.floor(n)
  if (value < 1000) return underThousand(value)
  const thousands = Math.floor(value / 1000)
  const rest = value % 1000
  const head = thousands === 1 ? 'mille' : `${underThousand(thousands)} mille`
  return rest === 0 ? head : `${head} ${underThousand(rest)}`
}
