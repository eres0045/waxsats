// Demo wallet — clearly labelled simulation for trying the whole voice loop
// with NO wallet and NO keys. No real sats move here, ever.
// Deterministic: same seed every load, so tests and judges see stable data.

const SEED_HISTORY = [
  { id: 'demo-1', type: 'receive', amount_sats: 5000, counterparty: 'Awa', memo: 'Tontine du mardi', at: '2026-11-17T09:12:00Z', status: 'confirmé' },
  { id: 'demo-2', type: 'send', amount_sats: 1200, counterparty: 'Moussa', memo: 'Marché Sandaga', at: '2026-11-16T18:40:00Z', status: 'confirmé' },
  { id: 'demo-3', type: 'receive', amount_sats: 2500, counterparty: 'Fatou', memo: 'Remboursement', at: '2026-11-15T11:05:00Z', status: 'confirmé' },
  { id: 'demo-4', type: 'send', amount_sats: 500, counterparty: 'Ibrahima', memo: 'Café Touba', at: '2026-11-14T08:22:00Z', status: 'confirmé' },
]

export function createDemoWallet({ seedBalance = 12500 } = {}) {
  let balance = seedBalance
  let history = SEED_HISTORY.map((h) => ({ ...h }))
  let counter = 100

  return {
    kind: 'demo',
    async getBalance() {
      return balance
    },
    /** Fake invoice — clearly marked, never payable on a real network. */
    async makeInvoice(amountSats, memo = 'WaxSats') {
      const id = `demo-inv-${counter}`
      const invoice = `lntb1demo${amountSats}p1${id}`
      const paymentHash = `demo-hash-${counter}`
      counter += 1
      return { invoice, paymentHash, amount_sats: amountSats, memo }
    },
    /** Simulated payment: deducts from the demo balance, records history. */
    async payInvoice(invoice, { amount_sats = null, counterparty = 'Inconnu', memo = '' } = {}) {
      const amount = amount_sats ?? parseDemoInvoiceAmount(invoice)
      if (amount === null || amount <= 0) {
        throw new Error('Facture démo illisible.')
      }
      if (amount > balance) {
        throw new Error('Solde démo insuffisant.')
      }
      balance -= amount
      const entry = {
        id: `demo-${counter}`,
        type: 'send',
        amount_sats: amount,
        counterparty,
        memo,
        at: new Date().toISOString(),
        status: 'confirmé',
      }
      counter += 1
      history = [entry, ...history]
      return { preimage: `demo-preimage-${counter}` }
    },
    /** Simulate receiving sats (demo invoice paid by someone else). */
    async simulateReceive(amountSats, counterparty = 'Awa') {
      balance += amountSats
      const entry = {
        id: `demo-${counter}`,
        type: 'receive',
        amount_sats: amountSats,
        counterparty,
        memo: 'Paiement reçu (démo)',
        at: new Date().toISOString(),
        status: 'confirmé',
      }
      counter += 1
      history = [entry, ...history]
      return entry
    },
    async getHistory() {
      return history.map((h) => ({ ...h }))
    },
  }
}

/** Extract the amount from a demo invoice string like "lntb1demo500p1...". */
export function parseDemoInvoiceAmount(invoice) {
  const m = /^lntb1demo(\d+)p/.exec(invoice || '')
  return m ? parseInt(m[1], 10) : null
}
