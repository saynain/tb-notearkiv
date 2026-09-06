import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { checkMobileRequest, mobileBody, mobileFailure, mobileJSON } from './mobile-http'

const url = 'https://intern.tertnesbrass.com/api/mobile/v1/snapshot'
describe('native API transport boundary', () => {
  it('requires explicit bearer auth and refuses ambient cookies even with a token', () => {
    const cases: Record<string, string>[] = [{}, { cookie: 'session=abc' }, { authorization: 'Bearer token', cookie: 'session=abc' }, { authorization: 'Basic token' }]
    for (const headers of cases) {
      expect(() => checkMobileRequest(new Request(url, { headers }))).toThrow()
    }
    expect(() => checkMobileRequest(new Request(url, { headers: { authorization: 'Bearer token' } }))).not.toThrow()
  })
  it('refuses cross-origin browser requests without weakening the web CSRF middleware', () => {
    expect(() => checkMobileRequest(new Request(url, { headers: { authorization: 'Bearer token', origin: 'https://evil.example' } }))).toThrow()
    expect(() => checkMobileRequest(new Request(url, { headers: { authorization: 'Bearer token', 'sec-fetch-site': 'cross-site' } }))).toThrow()
  })
  it('bounds actual payloads and validates JSON without accepting extra privileged fields', async () => {
    const schema = z.object({ body: z.string().min(1) }).strict()
    const request = (body: string) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    await expect(mobileBody(request('{"body":"hello"}'), schema)).resolves.toEqual({ body: 'hello' })
    await expect(mobileBody(request('{"body":"hello","official":true}'), schema)).rejects.toThrow()
    await expect(mobileBody(request('broken'), schema)).rejects.toThrow()
    await expect(mobileBody(request('x'.repeat(96_001)), schema)).rejects.toMatchObject({ status: 413 })
  })
  it('never caches private responses or returns internal errors', async () => {
    expect(mobileJSON({}).headers.get('cache-control')).toBe('private, no-store')
    const response = mobileFailure(new Error('database error with private content'))
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private content')
    expect(mobileFailure(new Error('Fant ikke beskjeden')).status).toBe(404)
  })
  it('classifies Standard Schema validation without returning submitted values', async () => {
    const response = mobileFailure(new Error(JSON.stringify([{ message: 'private submitted input', path: ['password'], code: 'too_small' }])))
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain('private submitted input')
    expect(mobileFailure(new Error('Du mangler tilgangen «board.manage»')).status).toBe(403)
  })
})
