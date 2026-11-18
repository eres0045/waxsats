import { describe, expect, it, vi } from 'vitest'
import { groqParseIntent, groqTranscribe } from '../src/lib/groq.js'

describe('groqParseIntent (mocked fetch)', () => {
  it('parses the JSON the model returns', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"action":"send","amount_sats":500,"recipient":"Awa"}' } }],
      }),
    }))
    const r = await groqParseIntent('Envoie 500 sats à Awa', 'gsk_test', fetchImpl)
    expect(r.action).toBe('send')
    expect(r.amount_sats).toBe(500)
    expect(r.recipient).toBe('Awa')
    // The key is sent as a Bearer token.
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer gsk_test')
  })

  it('handles fenced JSON', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n{"action":"balance","amount_sats":null,"recipient":null}\n```' } }],
      }),
    }))
    const r = await groqParseIntent('Quel est mon solde ?', 'gsk_test', fetchImpl)
    expect(r.action).toBe('balance')
  })

  it('throws a clear error on a bad key (401)', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 }))
    await expect(groqParseIntent('test', 'gsk_bad', fetchImpl)).rejects.toThrow('401')
  })

  it('throws without a key', async () => {
    await expect(groqParseIntent('test', '')).rejects.toThrow('manquante')
  })
})

describe('groqTranscribe (mocked fetch)', () => {
  it('returns the transcript text', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'Envoie 500 sats à Awa' }),
    }))
    const text = await groqTranscribe(new Blob(['audio']), 'gsk_test', fetchImpl)
    expect(text).toBe('Envoie 500 sats à Awa')
    const body = fetchImpl.mock.calls[0][1].body
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('model')).toBe('whisper-large-v3-turbo')
    expect(body.get('language')).toBe('fr')
  })
})
