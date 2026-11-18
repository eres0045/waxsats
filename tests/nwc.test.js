import { describe, expect, it, vi } from 'vitest'
import { createNwcWallet, describeNwcUrl, isValidNwcUrl } from '../src/lib/nwc.js'

const VALID_NWC =
  'nwc://' + 'ab'.repeat(32) +
  '?relay=wss%3A%2F%2Frelay.test&secret=' + 'cd'.repeat(32) + '&lud16=test%40example.com'

function mockClient(overrides = {}) {
  return {
    getBalance: vi.fn().mockResolvedValue({ balance: 42000 }),
    makeInvoice: vi.fn().mockResolvedValue({ invoice: 'lntb1000n1p...', payment_hash: 'hash123' }),
    payInvoice: vi.fn().mockResolvedValue({ preimage: 'preimage123', fees_paid: 1 }),
    lookupInvoice: vi.fn().mockResolvedValue({ state: 'settled' }),
    listTransactions: vi.fn().mockResolvedValue({
      transactions: [
        { type: 'incoming', state: 'settled', invoice: 'lntb1', description: 'De Awa', payment_hash: 'h1', amount: 5000000, settled_at: 1763400000, created_at: 1763400000 },
        { type: 'outgoing', state: 'settled', invoice: 'lntb2', description: 'À Moussa', payment_hash: 'h2', amount: 1200000, settled_at: 1763300000, created_at: 1763300000 },
      ],
    }),
    ...overrides,
  }
}

describe('isValidNwcUrl', () => {
  it('accepts a well-formed nwc:// URL', () => {
    expect(isValidNwcUrl(VALID_NWC)).toBe(true)
  })

  it('rejects non-nwc URLs and malformed ones', () => {
    expect(isValidNwcUrl('https://example.com')).toBe(false)
    expect(isValidNwcUrl('nwc://tooshort?relay=wss://x')).toBe(false)
    expect(isValidNwcUrl('nwc://' + 'ab'.repeat(32))).toBe(false) // no relay/secret
    expect(isValidNwcUrl(null)).toBe(false)
    expect(isValidNwcUrl('')).toBe(false)
  })
})

describe('describeNwcUrl', () => {
  it('exposes relay host and lud16 but never the secret', () => {
    const d = describeNwcUrl(VALID_NWC)
    expect(d.relayHost).toBe('relay.test')
    expect(d.lud16).toBe('test@example.com')
    expect(JSON.stringify(d)).not.toContain('cd'.repeat(8))
  })
})

describe('createNwcWallet (mocked relay)', () => {
  it('throws on an invalid URL before touching the network', () => {
    expect(() => createNwcWallet('nonsense')).toThrow('invalide')
  })

  it('reads balance through the client', async () => {
    const client = mockClient()
    const w = createNwcWallet(VALID_NWC, { clientFactory: async () => client })
    expect(await w.getBalance()).toBe(42000)
    expect(client.getBalance).toHaveBeenCalledTimes(1)
  })

  it('creates an invoice', async () => {
    const client = mockClient()
    const w = createNwcWallet(VALID_NWC, { clientFactory: async () => client })
    const inv = await w.makeInvoice(1000, 'WaxSats')
    expect(inv.invoice).toBe('lntb1000n1p...')
    expect(inv.paymentHash).toBe('hash123')
    expect(client.makeInvoice).toHaveBeenCalledWith({ amount: 1000, description: 'WaxSats' })
  })

  it('pays an invoice and returns the preimage', async () => {
    const client = mockClient()
    const w = createNwcWallet(VALID_NWC, { clientFactory: async () => client })
    const res = await w.payInvoice('lntb1000n1p...')
    expect(res.preimage).toBe('preimage123')
    expect(client.payInvoice).toHaveBeenCalledWith({ invoice: 'lntb1000n1p...' })
  })

  it('normalizes history from millisats to sats', async () => {
    const client = mockClient()
    const w = createNwcWallet(VALID_NWC, { clientFactory: async () => client })
    const history = await w.getHistory()
    expect(history).toHaveLength(2)
    expect(history[0].type).toBe('receive')
    expect(history[0].amount_sats).toBe(5000) // 5,000,000 msats
    expect(history[1].type).toBe('send')
    expect(history[1].amount_sats).toBe(1200)
  })

  it('propagates relay errors instead of swallowing them', async () => {
    const client = mockClient({ getBalance: vi.fn().mockRejectedValue(new Error('relay timeout')) })
    const w = createNwcWallet(VALID_NWC, { clientFactory: async () => client })
    await expect(w.getBalance()).rejects.toThrow('relay timeout')
  })
})
