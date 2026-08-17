import { NextResponse } from 'next/server';
import { listMockCrmActivities } from '@/server/services/crm-query-service';
import type { MockCrmActivity } from '@/server/crm/mock-crm-types';
import { handleRouteError } from '../../_lib/http';

export async function GET() {
  try {
    return NextResponse.json<MockCrmActivity[]>(listMockCrmActivities());
  } catch (error) {
    return handleRouteError(error);
  }
}
