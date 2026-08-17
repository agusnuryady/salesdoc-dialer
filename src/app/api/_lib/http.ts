import { NextResponse } from 'next/server';
import { NotFoundError, PayloadTooLargeError, ValidationError } from '@/server/domain/errors';

/** The only place HTTP status codes get decided for domain errors — keeps every route.ts a few lines of glue. */
export function handleRouteError(error: unknown): NextResponse<{ error: string }> {
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof PayloadTooLargeError) {
    return NextResponse.json({ error: error.message }, { status: 413 });
  }
  console.error(error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

const DEFAULT_MAX_BODY_BYTES = 16 * 1024; // generous for a leadIds array of UUIDs; nothing this app sends is close to it

/**
 * Reads and JSON-parses a request body with a real enforced byte cap —
 * checking Content-Length alone isn't enough since a client can omit it
 * (chunked transfer) or lie about it, so this counts bytes as they stream in
 * and aborts as soon as the cap is crossed, before the whole body is ever
 * buffered in memory.
 *
 * Throws PayloadTooLargeError if the cap is exceeded. Returns null (not a
 * throw) for a missing/empty body or body that isn't valid JSON — those are
 * the caller's validation problem, not a transport-layer one.
 */
export async function readJsonBody(request: Request, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new PayloadTooLargeError(`Request body exceeds ${maxBytes} bytes`);
  }

  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        throw new PayloadTooLargeError(`Request body exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (received === 0) return null;

  try {
    const text = Buffer.concat(chunks).toString('utf-8');
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
