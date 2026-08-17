import { NextResponse } from 'next/server';
import { listMockCrmContacts } from '@/server/services/crm-query-service';
import type { MockCrmContact } from '@/server/crm/mock-crm-types';
import { handleRouteError } from '../../_lib/http';

export async function GET() {
  try {
    return NextResponse.json<MockCrmContact[]>(listMockCrmContacts());
  } catch (error) {
    return handleRouteError(error);
  }
}
