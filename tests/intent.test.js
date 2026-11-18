import { describe, expect, it } from 'vitest'
import { extractRecipient, intentHint, parseIntent } from '../src/lib/intent.js'

describe('parseIntent — send', () => {
  it('parses digits + name', () => {
    const r = parseIntent('Envoie 500 sats à Awa')
    expect(r.action).toBe('send')
    expect(r.amount_sats).toBe(500)
    expect(r.recipient).toBe('Awa')
    expect(r.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('parses French number words + name', () => {
    const r = parseIntent('Envoie cinq cents sats à Moussa')
    expect(r.action).toBe('send')
    expect(r.amount_sats).toBe(500)
    expect(r.recipient).toBe('Moussa')
  })

  it('parses "transfère" and "mille"', () => {
    const r = parseIntent('Transfère mille sats à Fatou')
    expect(r.action).toBe('send')
    expect(r.amount_sats).toBe(1000)
    expect(r.recipient).toBe('Fatou')
  })

  it('parses two thousand five hundred', () => {
    const r = parseIntent('Envoie deux mille cinq cents sats à Ibrahima')
    expect(r.amount_sats).toBe(2500)
    expect(r.recipient).toBe('Ibrahima')
  })

  it('send without amount still knows it is a send', () => {
    const r = parseIntent('Envoie des sats à Awa')
    expect(r.action).toBe('send')
    expect(r.amount_sats).toBeNull()
    expect(r.recipient).toBe('Awa')
  })

  it('send without recipient asks for one', () => {
    const r = parseIntent('Envoie 500 sats')
    expect(r.action).toBe('send')
    expect(r.amount_sats).toBe(500)
    expect(r.recipient).toBeNull()
    expect(intentHint(r)).toMatch(/À qui/)
  })

  it('handles "pour" as recipient marker', () => {
    const r = parseIntent('Envoie 100 sats pour Awa')
    expect(r.recipient).toBe('Awa')
  })
})

describe('parseIntent — balance', () => {
  it.each([
    'Quel est mon solde ?',
    'Combien j’ai ?',
    'Montre-moi mon solde',
    'Combien il me reste ?',
  ])('parses "%s" as balance', (text) => {
    expect(parseIntent(text).action).toBe('balance')
  })
})

describe('parseIntent — receive', () => {
  it('parses a receive request with amount', () => {
    const r = parseIntent('Je veux recevoir 1000 sats')
    expect(r.action).toBe('receive')
    expect(r.amount_sats).toBe(1000)
  })

  it('parses "crée une facture"', () => {
    const r = parseIntent('Crée une facture de 250 sats')
    expect(r.action).toBe('receive')
    expect(r.amount_sats).toBe(250)
  })

  it('receive without amount is still a receive', () => {
    const r = parseIntent('Je veux recevoir des sats')
    expect(r.action).toBe('receive')
    expect(r.amount_sats).toBeNull()
  })
})

describe('parseIntent — unknown', () => {
  it('does not invent an intent', () => {
    const r = parseIntent('Bonjour, comment ça va ?')
    expect(r.action).toBe('unknown')
    expect(r.amount_sats).toBeNull()
    expect(r.recipient).toBeNull()
  })

  it('empty input is unknown', () => {
    expect(parseIntent('').action).toBe('unknown')
    expect(parseIntent('   ').action).toBe('unknown')
  })
})

describe('extractRecipient', () => {
  it('returns null when the "à" is followed by an amount', () => {
    expect(extractRecipient('Envoie à cinq cents sats')).toBeNull()
  })

  it('keeps multi-word names', () => {
    expect(extractRecipient('Envoie 50 sats à Awa Diallo')).toBe('Awa Diallo')
  })
})
