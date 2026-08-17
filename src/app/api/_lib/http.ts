import { NextResponse } from 'next/server';
import { NotFoundError, ValidationError } from '@/server/domain/errors';

/** The only place HTTP status codes get decided for domain errors — keeps every route.ts a few lines of glue. */
export function handleRouteError(error: unknown): NextResponse<{ error: string }> {
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
