import { NextResponse } from 'next/server';
import { listLeads } from '@/server/services/lead-service';
import type { Lead } from '@/server/domain/types';
import { handleRouteError } from '../_lib/http';

export async function GET() {
  try {
    return NextResponse.json<Lead[]>(listLeads());
  } catch (error) {
    return handleRouteError(error);
  }
}
