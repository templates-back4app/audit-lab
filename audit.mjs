// The questions nobody tells you to ask, asked against a running backend.
//
// Every check is performed, not inferred: the auditor holds nothing but the app
// id that ships inside every front-end bundle, and it reports what that was
// enough to do. Rows it creates to test with are cleaned up at the end.
import { anon, owner, where, waitUp } from './client.mjs';

const CANARY = 'auditCanary';   // Parse refuses __names__, which would fail the probe for the wrong reason
const findings = [];
const add = (severity, question, answer, fix) => findings.push({ severity, question, answer, fix });
const pass = [];

await waitUp();

// --- which classes exist (asked as the owner, so the audit knows what to probe)
const schemas = (await owner.get('/schemas')).json.results.filter((s) => !s.className.startsWith('_'));
const classNames = schemas.map((s) => s.className);

// --- 1. can a stranger read your schema?
const schemaAsStranger = await anon.get('/schemas');
if (schemaAsStranger.ok) add('high', 'Can a stranger list every class and field you have?',
  `yes — ${schemaAsStranger.json.results.length} classes returned`, 'Keep the master key off the client; never ship it in a bundle.');
else pass.push(`your schema is not readable without the master key (HTTP ${schemaAsStranger.status})`);

// --- 2. can a stranger read your rows?
const readable = [];
for (const c of classNames) {
  const r = await anon.get(`/classes/${c}?limit=1000`);
  if (r.ok && r.json.results.length) readable.push([c, r.json.results]);
}
if (readable.length) add('high', 'Can a stranger read your data?',
  readable.map(([c, rows]) => `${c}: ${rows.length} rows`).join(', '),
  'Set class-level permissions so public read is off, and give each row an ACL.');
else pass.push('no class returns rows to an anonymous reader');

// --- 3. can a stranger read your user list?
const users = await anon.get('/classes/_User?limit=1000');
const userCount = (await owner.get('/classes/_User?limit=0&count=1')).json?.count ?? 0;
if (users.ok && users.json.results.length) {
  const emails = users.json.results.filter((u) => u.email).length;
  add('high', 'Can a stranger download your user list?',
    `yes — ${users.json.results.length} accounts, ${emails} with the email address attached`,
    'Turn off public read on _User, and keep email out of what a client can select.');
} else {
  pass.push(users.ok
    ? `your ${userCount} user rows are hidden from an anonymous query (the query is allowed, the rows come back empty)`
    : `an anonymous query for users is refused outright (HTTP ${users.status})`);
}

// --- 4. can a stranger write to your classes?
const created = [];
for (const c of classNames) {
  const r = await anon.post(`/classes/${c}`, { [CANARY]: true });
  if (r.ok) created.push([c, r.json.objectId]);
}
if (created.length) add('critical', 'Can a stranger add rows to your classes?',
  `yes — created a row in ${created.map(([c]) => c).join(', ')}`,
  'Turn off public create. A form that writes should go through a server function.');
else pass.push('no class accepts a row from a stranger');

// --- 5. can a stranger delete?
const deleted = [];
for (const [c, id] of created) {
  const r = await anon.del(`/classes/${c}/${id}`);
  if (r.ok) deleted.push(c);
}
if (deleted.length) add('critical', 'Can a stranger delete your rows?',
  `yes — deleted from ${deleted.join(', ')}; the permission is per class, so your real rows are in the same position`,
  'Turn off public delete everywhere. Almost no app needs it.');
else pass.push('no class lets a stranger delete');

// --- 6. can a stranger change a row that is not theirs?
let edited = null;
for (const [c, rows] of readable) {
  const row = rows.find((r) => !r[CANARY]);
  if (!row) continue;
  const field = Object.keys(row).find((k) => typeof row[k] === 'string' && !['objectId', 'createdAt', 'updatedAt'].includes(k));
  if (!field) continue;
  // write the value it already has: proves the write is accepted, changes nothing
  const r = await anon.put(`/classes/${c}/${row.objectId}`, { [field]: row[field] });
  if (r.ok) { edited = `${c}.${field}`; break; }
}
if (edited) add('critical', "Can a stranger edit someone else's row?",
  `yes — the backend accepted a write to ${edited} from a client with no account`,
  'Public update is the one that turns a read-only leak into a defacement.');
else pass.push('a stranger cannot edit an existing row');

// --- 7. can a stranger invent new classes?
const made = await anon.post('/classes/AuditProbeClass', { hello: 'world' });
if (made.ok) {
  add('medium', 'Can a stranger create brand-new classes in your database?',
    'yes — a class that was never in your app now exists',
    'Turn off client class creation. It is on by default and almost never wanted in production.');
  // the schema will not drop while it still holds the probe row
  await owner.del(`/classes/AuditProbeClass/${made.json.objectId}`);
  const left = await owner.get('/classes/AuditProbeClass?limit=1000');
  for (const r of left.json?.results ?? []) await owner.del(`/classes/AuditProbeClass/${r.objectId}`);
  const dropped = await owner.del('/schemas/AuditProbeClass');
  if (!dropped.ok) console.error(`  (note: could not drop AuditProbeClass: ${dropped.text})`);
} else pass.push('a stranger cannot create new classes');

// --- 8. are there credentials sitting in rows?
const SECRETY = /(secret|api[_-]?key|token|password|private[_-]?key|credential)/i;
const VALUEY = /^(sk_live|sk_test|SG\.|xox[baprs]-|ghp_|AKIA|eyJ)/;
const exposed = [];
const SYSTEM = new Set(['objectId', 'createdAt', 'updatedAt', 'ACL']);
for (const [c, rows] of readable) {
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (typeof v !== 'string' || SYSTEM.has(k)) continue;
      // the field name looks like a credential, or the value does. A row whose
      // NAME field says "STRIPE_SECRET_KEY" is flagged on its value, not on
      // every other column it happens to sit beside.
      const named = SECRETY.test(k);
      const valued = VALUEY.test(v) || (SECRETY.test(String(row.key ?? '')) && k === 'value');
      if (named || valued) exposed.push(`${c}.${k}${row.key ? ` (${row.key})` : ''}`);
    }
  }
}
if (exposed.length) add('critical', 'Are any of your third-party keys readable by a stranger?',
  `yes — ${[...new Set(exposed)].length} value(s) that look like credentials: ${[...new Set(exposed)].slice(0, 3).join(', ')}`,
  'Provider keys belong in server-side config, never in a row a client can query.');
else pass.push('no credential-shaped value is readable by a stranger');

// --- 9. what do the permissions actually say? (the thing you would never think to open)
const open = [];
for (const s of schemas) {
  const clp = s.classLevelPermissions ?? {};
  for (const op of ['find', 'get', 'create', 'update', 'delete', 'addField']) {
    if (clp[op]?.['*']) open.push(`${s.className}.${op}`);
  }
}
if (open.length) add('high', 'What do your class permissions actually say?',
  `${open.length} of ${schemas.length * 6} operations are open to everyone`,
  'Open the permissions screen once per class. Defaults are permissive so the first tutorial works.');

// --- clean up anything the audit created
for (const [c, id] of created) await owner.del(`/classes/${c}/${id}`);
const strays = await owner.get(`/classes/Patient?where=${where({ [CANARY]: true })}`);
for (const r of strays.json?.results ?? []) await owner.del(`/classes/Patient/${r.objectId}`);

// --- the report
const order = { critical: 0, high: 1, medium: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity]);
console.log('');
console.log(`  ${findings.length} thing(s) nobody asked about`);
console.log('');
for (const [i, f] of findings.entries()) {
  console.log(`  ${String(i + 1).padStart(2)}. [${f.severity.toUpperCase()}] ${f.question}`);
  console.log(`      ${f.answer}`);
  console.log(`      fix: ${f.fix}`);
  console.log('');
}
if (pass.length) {
  console.log(`  already fine (${pass.length}):`);
  for (const p of pass) console.log(`      - ${p}`);
  console.log('');
}
process.exitCode = 0;
