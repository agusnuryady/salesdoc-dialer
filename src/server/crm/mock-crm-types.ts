/**
 * These types deliberately do NOT reuse the app's Lead/CRMActivity shapes.
 * The mock CRM is a stand-in for a real external system: it has its own
 * "contact" concept (not "lead") with its own id namespace, and its own
 * activity records that key off the external contact id, not the app's
 * leadId. The only thing the two systems share is the callId used to
 * correlate a dialer call to the activity it produced on each side.
 */
export interface MockCrmContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
}

export interface MockCrmActivity {
  id: string;
  contactId: string;
  type: 'CALL';
  callId: string;
  disposition: string;
  notes: string;
  createdAt: string;
}
