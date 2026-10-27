// An app of the shape these tools produce: a few classes, real-looking data, a
// third-party key kept in a settings row, and nobody having touched permissions.
import { owner, waitUp } from './client.mjs';

await waitUp();

const define = async (className, fields) => {
  const r = await owner.post(`/schemas/${className}`, { className, fields });
  if (!r.ok && r.json?.code !== 103) throw new Error(`${className}: ${r.text}`);
};
await define('Patient', { name: { type: 'String' }, email: { type: 'String' },
  diagnosis: { type: 'String' }, phone: { type: 'String' } });
await define('Appointment', { patientName: { type: 'String' }, notes: { type: 'String' },
  startsAt: { type: 'Date' } });
await define('Settings', { key: { type: 'String' }, value: { type: 'String' } });

const NAMES = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson', 'Edsger Dijkstra'];
for (const [i, name] of NAMES.entries()) {
  await owner.post('/classes/Patient', { name, email: `${name.split(' ')[0].toLowerCase()}@example.com`,
    diagnosis: ['migraine', 'fracture', 'asthma'][i % 3], phone: `+1555000${i}` });
  await owner.post('/classes/Appointment', { patientName: name, notes: 'follow-up', startsAt: { __type: 'Date', iso: new Date().toISOString() } });
}
// the kind of row an assistant writes when you ask it to "store the API key"
await owner.post('/classes/Settings', { key: 'STRIPE_SECRET_KEY', value: 'sk_live_51H8xQe2eZvKYlo2C9k3RjQ' });
await owner.post('/classes/Settings', { key: 'SENDGRID_API_KEY', value: 'SG.7Xb2bPQrT1qK9fLmN0wZyA' });

for (const u of [['ana', 'pw-ana'], ['bruno', 'pw-bruno']]) {
  const r = await owner.post('/users', { username: u[0], password: u[1], email: `${u[0]}@example.com` });
  if (!r.ok && r.json?.code !== 202) throw new Error(r.text);
}
console.log('  seeded: 5 patients, 5 appointments, 2 settings rows, 2 users');
