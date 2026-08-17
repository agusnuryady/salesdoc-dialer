import { NextResponse } from 'next/server';
import { createSession } from '@/server/services/session-service';
import { ValidationError } from '@/server/domain/errors';
import type { DialerSession } from '@/server/domain/types';
import { handleRouteError } from '../_lib/http';

interface CreateSessionBody {
  agentId?: unknown;
  leadIds?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as CreateSessionBody | null;

    if (
      !body ||
      !Array.isArray(body.leadIds) ||
      body.leadIds.length === 0 ||
      !body.leadIds.every((value): value is string => typeof value === 'string' && value.length > 0)
    ) {
      throw new ValidationError('leadIds must be a non-empty array of lead id strings');
    }

    const agentId = typeof body.agentId === 'string' && body.agentId.trim() ? body.agentId : 'agent_1';
    const session = createSession(agentId, body.leadIds);
    return NextResponse.json<DialerSession>(session, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
