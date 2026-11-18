import { describe, expect, it } from 'vitest'
import { createDemoWallet, parseDemoInvoiceAmount } from '../src/lib/demoWallet.js'

describe('demo wallet', () => {
  it('starts with the seeded balance and history', async () => {
    const w = createDemoWallet()
    expect(await w.getBalance()).toBe(12500)
    const history = await w.getHistory()
    expect(history).toHaveLength(4)
    expect(history[0].counterparty).toBe('Awa')
  })

  it('pays and deducts the balance', async () => {
    const w = createDemoWallet()
    const res = await w.payInvoice('lntb1demo500p1x', { amount_sats: 500, counterparty: 'Awa' })
    expect(res.preimage).toMatch(/^demo-preimage-/)
    expect(await w.getBalance()).toBe(12000)
    const history = await w.getHistory()
    expect(history[0].type).toBe('send')
    expect(history[0].amount_sats).toBe(500)
    expect(history[0].counterparty).toBe('Awa')
  })

  it('parses the amount out of its own demo invoice string', async () => {
    const w = createDemoWallet()
    await w.payInvoice('lntb1demo1200p1x')
    expect(await w.getBalance()).toBe(12500 - 1200)
  })

  it('refuses to pay more than the balance', async () => {
    const w = createDemoWallet()
    await expect(w.payInvoice('lntb1demo999999p1x')).rejects.toThrow('insuffisant')
  })

  it('refuses an unreadable invoice', async () => {
    const w = createDemoWallet()
    await expect(w.payInvoice('not-an-invoice')).rejects.toThrow('illisible')
  })

  it('creates a demo invoice and can simulate receiving', async () => {
    const w = createDemoWallet()
    const inv = await w.makeInvoice(1000, 'Test')
    expect(inv.invoice).toContain('lntb1demo1000')
    expect(inv.paymentHash).toMatch(/^demo-hash-/)
    await w.simulateReceive(1000, 'Fatou')
    expect(await w.getBalance()).toBe(13500)
  })

  it('parseDemoInvoiceAmount returns null for non-demo invoices', () => {
    expect(parseDemoInvoiceAmount('lnbc500n1p...')).toBeNull()
    expect(parseDemoInvoiceAmount('')).toBeNull()
  })
})
