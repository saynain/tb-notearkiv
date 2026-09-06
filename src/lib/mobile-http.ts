import { z } from 'zod'

export class MobileError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

export function mobileJSON(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', vary: 'Authorization' },
  })
}

/** This API never authenticates via ambient browser cookies. No CORS grants. */
export function checkMobileRequest(request: Request): void {
  if (request.headers.has('cookie')) throw new MobileError(401, 'session_required', 'Logg inn på nytt.')
  if (!/^Bearer \S+$/i.test(request.headers.get('authorization') ?? '')) {
    throw new MobileError(401, 'session_required', 'Logg inn for å fortsette.')
  }
  const origin = request.headers.get('origin')
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new MobileError(403, 'forbidden', 'Forespørselen er ikke tillatt.')
  }
}

export async function mobileBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new MobileError(415, 'invalid_content_type', 'Forventet JSON.')
  }
  // Bound the actual stream, including requests without Content-Length.
  const reader = request.body?.getReader()
  if (!reader) throw new MobileError(400, 'invalid_input', 'Forespørselen mangler innhold.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 96_000) {
        await reader.cancel()
        throw new MobileError(413, 'too_large', 'Innholdet er for stort.')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  let json: unknown
  try { json = JSON.parse(new TextDecoder().decode(bytes)) }
  catch { throw new MobileError(400, 'invalid_input', 'Ugyldig JSON.') }
  const parsed = schema.safeParse(json)
  if (!parsed.success) throw new MobileError(400, 'invalid_input', 'Kontroller feltene og prøv igjen.')
  return parsed.data
}

export function mobileFailure(error: unknown): Response {
  if (error instanceof MobileError) {
    return mobileJSON({ error: { code: error.code, message: error.message } }, error.status)
  }
  // Existing domain functions deliberately use the same not-found error for
  // missing and inaccessible content. Preserve that non-disclosure property.
  if (error instanceof Error && error.message === 'Fant ikke beskjeden') {
    return mobileJSON({ error: { code: 'not_found', message: 'Innholdet er ikke tilgjengelig.' } }, 404)
  }
  if (error instanceof z.ZodError) {
    return mobileJSON({ error: { code: 'invalid_input', message: 'Kontroller feltene og prøv igjen.' } }, 400)
  }
  if (error instanceof Error) {
    // TanStack wraps Standard Schema issues in a plain Error. Classify the
    // shape, but never return its contents (which can contain input values).
    try {
      const issues: unknown = JSON.parse(error.message)
      if (Array.isArray(issues) && issues.length > 0 && issues.every(issue =>
        issue && typeof issue === 'object' && typeof issue.message === 'string' && Array.isArray(issue.path))) {
        return mobileJSON({ error: { code: 'invalid_input', message: 'Kontroller feltene og prøv igjen.' } }, 400)
      }
    } catch { /* Not a validation error. */ }
    if (/^(Du mangler tilgangen|Du har ikke tilgang|Gruppelederområdet er)/.test(error.message)) {
      return mobileJSON({ error: { code: 'forbidden', message: 'Du har ikke tilgang til denne handlingen.' } }, 403)
    }
  }
  // Never return stack traces, database errors or token-bearing request data.
  console.error('[mobile-api] request failed', error instanceof Error ? error.name : 'UnknownError')
  return mobileJSON({ error: { code: 'server_error', message: 'Kunne ikke fullføre. Prøv igjen.' } }, 500)
}
