import { describe, expect, it, vi } from 'vitest'
import { isLightningAddress, looksLikeInvoice, parseLightningAddress, resolveLightningAddress } from '../src/lib/lnurl.js'

describe('parseLightningAddress', () => {
  it('parses a valid address', () => {
    expect(parseLightningAddress('awa@alby.com')).toEqual({ name: 'awa', domain: 'alby.com' })
  })

  it('rejects bad addresses', () => {
    expect(parseLightningAddress('awa')).toBeNull()
    expect(parseLightningAddress('awa@')).toBeNull()
    expect(parseLightningAddress('@alby.com')).toBeNull()
    expect(parseLightningAddress('')).toBeNull()
  })

  it('isLightningAddress is the boolean form', () => {
    expect(isLightningAddress('moussa@walletofsatoshi.com')).toBe(true)
    expect(isLightningAddress('Moussa')).toBe(false)
  })
})

describe('looksLikeInvoice', () => {
  it('accepts testnet/mainnet/regtest BOLT11 prefixes', () => {
    expect(looksLikeInvoice('lntb1000n1pabcdef')).toBe(true)
    expect(looksLikeInvoice('lnbc1000n1pabcdef')).toBe(true)
    expect(looksLikeInvoice('lnbcrt1000n1pabcdef')).toBe(true)
  })

  it('rejects plain names and garbage', () => {
    expect(looksLikeInvoice('Awa')).toBe(false)
    expect(looksLikeInvoice('')).toBe(false)
    expect(looksLikeInvoice('lntb')).toBe(false)
  })
})

describe('resolveLightningAddress (mocked fetch)', () => {
  function mockFetch() {
    return vi.fn(async (url) => {
      if (url === 'https://alby.com/.well-known/lnurlp/awa') {
        return {
          ok: true,
          json: async () => ({
            tag: 'payRequest',
            callback: 'https://alby.com/lnurlp/awa/callback',
            minSendable: 1000,
            maxSendable: 100000000,
          }),
        }
      }
      if (url.startsWith('https://alby.com/lnurlp/awa/callback')) {
        const amount = new URL(url).searchParams.get('amount')
        expect(amount).toBe('500000') // 500 sats in millisats
        return { ok: true, json: async () => ({ pr: 'lntb500n1pMockInvoice' }) }
      }
      return { ok: false, json: async () => ({}) }
    })
  }

  it('resolves an address to a BOLT11 invoice', async () => {
    const invoice = await resolveLightningAddress('awa@alby.com', 500, mockFetch())
    expect(invoice).toBe('lntb500n1pMockInvoice')
  })

  it('rejects below the provider minimum', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ tag: 'payRequest', callback: 'https://x.test/cb', minSendable: 100000, maxSendable: 100000000 }),
    }))
    await expect(resolveLightningAddress('awa@alby.com', 50, fetchImpl)).rejects.toThrow('trop petit')
  })

  it('rejects an invalid address without fetching', async () => {
    const fetchImpl = vi.fn()
    await expect(resolveLightningAddress('not-an-address', 500, fetchImpl)).rejects.toThrow('invalide')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a non-payRequest provider', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ tag: 'other', callback: 'https://x.test/cb' }),
    }))
    await expect(resolveLightningAddress('awa@alby.com', 500, fetchImpl)).rejects.toThrow('ne supporte pas')
  })
})
