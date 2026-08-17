import { NextResponse } from 'next/server';
import { startSession } from '@/server/services/session-service';
import type { SessionView } from '@/server/dto/session-view';
import { handleRouteError } from '../../../_lib/http';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json<SessionView>(startSession(id));
  } catch (error) {
    return handleRouteError(error);
  }
}
