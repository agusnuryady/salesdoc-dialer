import type { Lead } from '../domain/types';

export function seedLeads(): Lead[] {
  return [
    {
      id: 'lead_1',
      name: 'Maria Santoso',
      company: 'Kirana Retail Group',
      phone: '+62-812-3456-7890',
      email: 'maria.santoso@kiranaretail.co.id',
    },
    {
      id: 'lead_2',
      name: 'David Chen',
      company: 'Northwind Logistics',
      phone: '+1-415-555-0142',
      email: 'david.chen@northwindlogistics.com',
    },
    {
      id: 'lead_3',
      name: 'Priya Ramachandran',
      company: 'Solvane Analytics',
      phone: '+91-98765-43210',
      email: 'priya.r@solvane.io',
    },
    {
      id: 'lead_4',
      name: 'Ahmad Fauzan',
      company: 'Nusantara Freight',
      phone: '+62-813-9988-7766',
      email: 'ahmad.fauzan@nusantarafreight.com',
    },
    {
      id: 'lead_5',
      name: 'Sophie Laurent',
      company: 'Vireo Consulting',
      phone: '+33-6-12-34-56-78',
      email: 'sophie.laurent@vireoconsulting.fr',
    },
    {
      id: 'lead_6',
      name: 'James Okafor',
      company: 'Brightline Manufacturing',
      phone: '+1-312-555-0199',
      email: 'james.okafor@brightlinemfg.com',
    },
  ];
}
