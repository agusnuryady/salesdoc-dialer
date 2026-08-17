import { notFound } from 'next/navigation';
import { SessionScreen } from '@/app/components/session-screen';
import { NotFoundError } from '@/server/domain/errors';
import type { SessionView } from '@/server/dto/session-view';
import { getSessionView } from '@/server/services/session-service';

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let initialSession: SessionView;
  try {
    initialSession = getSessionView(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return <SessionScreen sessionId={id} initialSession={initialSession} />;
}
