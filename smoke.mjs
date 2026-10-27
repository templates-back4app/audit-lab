// Closing permissions is easy; closing them without breaking the app is the part
// worth checking. This does what the app does, as a signed-in person.
import { anon, call, waitUp } from './client.mjs';

await waitUp();
const login = await call('GET', '/login?username=ana&password=pw-ana');
if (!login.ok) { console.log(`  ana cannot log in: ${login.json?.error ?? login.status}`); process.exit(1); }
const session = login.json.sessionToken;

const asUser = await anon.get('/classes/Patient?limit=1000', { session });
const asStranger = await anon.get('/classes/Patient?limit=1000');
const writeAsUser = await anon.post('/classes/Appointment', { patientName: 'Ada Lovelace', notes: 'from the app' }, { session });

console.log(`  ana logs in:                        yes`);
console.log(`  ana reads patients:                 ${asUser.ok ? `${asUser.json.results.length} rows` : `NO (${asUser.json?.error ?? asUser.status})`}`);
console.log(`  a stranger reads patients:          ${asStranger.json?.results?.length ?? 'refused'} rows`);
console.log(`  ana writes an appointment directly: ${writeAsUser.ok ? 'yes' : `no (${writeAsUser.json?.error ?? writeAsUser.status})`} — writes belong in a server function`);
