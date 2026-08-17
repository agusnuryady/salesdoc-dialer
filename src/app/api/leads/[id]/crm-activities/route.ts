import { NextResponse } from 'next/server';
import { getLeadCrmActivities } from '@/server/services/lead-service';
import type { CRMActivity } from '@/server/domain/types';
import { handleRouteError } from '../../../_lib/http';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json<CRMActivity[]>(getLeadCrmActivities(id));
  } catch (error) {
    return handleRouteError(error);
  }
}
