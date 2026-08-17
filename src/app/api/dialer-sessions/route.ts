import { NextResponse } from 'next/server';
import { createSession } from '@/server/services/session-service';
import { ValidationError } from '@/server/domain/errors';
import type { DialerSession } from '@/server/domain/types';
import { handleRouteError, readJsonBody } from '../_lib/http';

interface CreateSessionBody {
  agentId?: unknown;
  leadIds?: unknown;
}

// The brief seeds 4-8 leads; this leaves headroom without accepting an
// unbounded array that would otherwise flow straight into a giant
// "Unknown lead id(s): ..." error message built from user input.
const MAX_LEAD_IDS = 20;
const MAX_ID_LENGTH = 128;
const MAX_AGENT_ID_LENGTH = 128;

export async function POST(request: Request) {
  try {
    const body = (await readJsonBody(request)) as CreateSessionBody | null;

    if (
      !body ||
      !Array.isArray(body.leadIds) ||
      body.leadIds.length === 0 ||
      body.leadIds.length > MAX_LEAD_IDS ||
      !body.leadIds.every(
        (value): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH,
      )
    ) {
      throw new ValidationError(
        `leadIds must be a non-empty array of up to ${MAX_LEAD_IDS} lead id strings, each at most ${MAX_ID_LENGTH} characters`,
      );
    }

    if (typeof body.agentId === 'string' && body.agentId.length > MAX_AGENT_ID_LENGTH) {
      throw new ValidationError(`agentId must be at most ${MAX_AGENT_ID_LENGTH} characters`);
    }

    const agentId = typeof body.agentId === 'string' && body.agentId.trim() ? body.agentId : 'agent_1';
    const session = createSession(agentId, body.leadIds);
    return NextResponse.json<DialerSession>(session, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
