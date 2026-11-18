# ⚡ WaxSats — Portefeuille Lightning vocal

**Voice-first Lightning wallet for low-literacy users in West Africa.**
Built for the [Dakar Bitcoin Hack 2026](https://dakar-bitcoin-hack-2026.devpost.com/).

**Live demo:** https://eres0045.github.io/waxsats/

A user speaks or types in French — *« Envoie 500 sats à Awa »* — the app
understands the intent and executes a real Lightning payment on **Bitcoin
testnet**, then confirms back by voice and in large plain text. No reading
required: big tap targets, huge numbers, French throughout, with a few Wolof
touches (*Salaam maalekum*, *Jërejëf*).

## Why this, why now

The hackathon gallery is full of tontines and merchant-pay apps. Nobody has
built a **voice-first wallet for people who can't read**. In West Africa,
where French is the lingua franca and literacy is a real barrier to using
Bitcoin, voice is the interface.

## Two modes

| Mode | What happens |
| --- | --- |
| 🟡 **Démo** (default) | Fully simulated wallet (12 500 sats seeded). Try the whole voice loop with no wallet and no keys. Clearly labelled — **no real sats move**. |
| 🟢 **Réel (testnet)** | Your own testnet wallet via **Nostr Wallet Connect** (NIP-47). Real balance, real invoices, real testnet payments. **Never mainnet.** |

The mode badge is always visible at the top of the screen, so demo payments
are never mistaken for real ones.

## How it works

1. **Voice in** — Web Speech API (`fr-FR`) in the browser. If the browser
   has no speech recognition and you pasted a Groq key, Whisper
   (`whisper-large-v3-turbo`) takes over.
2. **Intent** — a local rule-based French parser handles the loop with **no
   key at all**: French number words (*cinq cents*, *deux mille*, *quatre-vingt-dix-neuf*),
   *« envoie X sats à Y »*, *« quel est mon solde ? »*, *« je veux recevoir X sats »*.
   With a Groq key, `llama-3.3-70b-versatile` parses free-form French as a
   second opinion when the local parse is unsure.
3. **Lightning** — Nostr Wallet Connect (`@getalby/sdk`, NIP-47) talks to
   your own wallet over its relay: balance, invoices, payments. Sending to a
   name resolves via **LNURL-pay** (`nom@alby.com`) or a pasted BOLT11 invoice.
4. **Voice out** — speech synthesis reads the balance and confirms payments
   in French.

## Try it (no keys needed)

1. Open the [live demo](https://eres0045.github.io/waxsats/).
2. Tap the big 🎤 button and say: *« Envoie 500 sats à Awa »*
   (or type it in the box below — works on any browser).
3. Check the confirmation screen — amount in digits **and** in French words —
   tap **Confirmer**, hear *« Envoyé, 500 sats à Awa »*.
4. Try *« Quel est mon solde ? »* and *« Je veux recevoir 1000 sats »* (invoice + QR).

## Connect your own wallet (real testnet)

1. In the app, open **⚙️ Réglages** → switch to **Réel (testnet)**.
2. Paste your `nwc://…` connection string from Alby, Mutiny, Zeus, etc.
   It is stored **only in your browser's localStorage** and used only to talk
   to your own wallet. Nothing is ever sent to any server of ours — there is
   no backend at all.
3. Tap **Tester la connexion** to see your testnet balance.
4. Optional: paste a Groq API key for LLM intent parsing + Whisper fallback.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest — 105 tests
npm run build    # production bundle in dist/
```

## Tech

Vite + React 19 + Tailwind CSS v4 · Vitest + Testing Library ·
`@getalby/sdk` (NIP-47) · Groq (Llama 3.3 70B + Whisper large-v3-turbo) ·
Web Speech API · `qrcode`

## Security notes

- **Testnet only.** No mainnet code path exists.
- No secret, API key, or wallet string is ever committed — `.env` and keys
  are gitignored; keys live only in the user's browser.
- Enabling real mode requires the user's own NWC string; nothing is
  hardcoded.
- Demo mode is clearly labelled everywhere it appears, including on invoices.

## License

MIT — see [LICENSE](LICENSE).
