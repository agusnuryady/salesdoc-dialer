import { listLeads } from '@/server/services/lead-service';
import { LeadsSessionForm } from './components/leads-session-form';

export default function HomePage() {
  const leads = listLeads();

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Leads</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Select leads, create a dialer session, then start it.
        </p>
      </header>
      <LeadsSessionForm leads={leads} />
    </main>
  );
}
