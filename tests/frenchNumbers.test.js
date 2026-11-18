import { describe, expect, it } from 'vitest'
import { findNumberInText, numberToFrenchWords, parseFrenchNumber } from '../src/lib/frenchNumbers.js'

describe('parseFrenchNumber', () => {
  it.each([
    ['zéro', 0],
    ['un', 1],
    ['cinq', 5],
    ['dix', 10],
    ['seize', 16],
    ['vingt', 20],
    ['vingt-cinq', 25],
    ['trente-deux', 32],
    ['quarante et un', 41],
    ['cinquante', 50],
    ['soixante', 60],
    ['soixante-dix', 70],
    ['soixante-dix-sept', 77],
    ['quatre-vingts', 80],
    ['quatre-vingt-deux', 82],
    ['quatre-vingt-dix', 90],
    ['quatre-vingt-dix-neuf', 99],
    ['cent', 100],
    ['deux cents', 200],
    ['cinq cents', 500],
    ['mille', 1000],
    ['mille deux cents', 1200],
    ['deux mille', 2000],
    ['deux mille cinq cents', 2500],
    ['dix mille', 10000],
    ['cent mille', 100000],
  ])('parses "%s" as %d', (words, expected) => {
    expect(parseFrenchNumber(words)).toBe(expected)
  })

  it('returns null for non-number text', () => {
    expect(parseFrenchNumber('bonjour')).toBeNull()
    expect(parseFrenchNumber('')).toBeNull()
  })

  it('parses plain digits', () => {
    expect(parseFrenchNumber('500')).toBe(500)
  })
})

describe('findNumberInText', () => {
  it.each([
    ['Envoie 500 sats à Awa', 500],
    ['Envoie cinq cents sats à Moussa', 500],
    ['Je veux deux mille sats', 2000],
    ['Envoie mille deux cents sats', 1200],
    ['Quel est mon solde ?', null],
    ['Envoie 1 000 sats à Fatou', 1000],
    ['quatre-vingt-dix-neuf sats', 99],
  ])('finds %s in "%s"', (text, expected) => {
    expect(findNumberInText(text)).toBe(expected)
  })
})

describe('numberToFrenchWords', () => {
  it.each([
    [0, 'zéro'],
    [1, 'un'],
    [21, 'vingt et un'],
    [25, 'vingt-cinq'],
    [70, 'soixante-dix'],
    [77, 'soixante-dix-sept'],
    [80, 'quatre-vingts'],
    [82, 'quatre-vingt-deux'],
    [99, 'quatre-vingt-dix-neuf'],
    [100, 'cent'],
    [200, 'deux cents'],
    [500, 'cinq cents'],
    [1000, 'mille'],
    [2500, 'deux mille cinq cents'],
    [12500, 'douze mille cinq cents'],
  ])('writes %d as "%s"', (n, expected) => {
    expect(numberToFrenchWords(n)).toBe(expected)
  })
})
