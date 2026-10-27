// The other half: the four changes the audit asks for, applied. Nothing clever --
// this is the screen you would have clicked through if you had known it existed.
import { owner, waitUp } from './client.mjs';

await waitUp();

const schemas = (await owner.get('/schemas')).json.results.filter((s) => !s.className.startsWith('_'));

// 1-3. close the class permissions. Reading is for signed-in people; writing goes
//      through a server function holding the master key, so it is closed to clients.
for (const s of schemas) {
  const open = { find: {}, get: {}, count: {}, create: {}, update: {}, delete: {}, addField: {},
    protectedFields: { '*': [] } };
  const readable = s.className !== 'Settings';
  const clp = {
    ...open,
    find:  readable ? { requiresAuthentication: true } : {},
    get:   readable ? { requiresAuthentication: true } : {},
    count: readable ? { requiresAuthentication: true } : {},
  };
  const r = await owner.put(`/schemas/${s.className}`, { className: s.className, classLevelPermissions: clp });
  if (!r.ok) throw new Error(`${s.className}: ${r.text}`);
}

// 4. take the provider keys out of the database entirely. In a real move they go
//    into the server's environment, where no client query can reach them.
const settings = await owner.get('/classes/Settings?limit=1000');
let removed = 0;
for (const row of settings.json?.results ?? []) {
  if (!/secret|key|token/i.test(row.key ?? '')) continue;
  await owner.del(`/classes/Settings/${row.objectId}`);
  removed++;
}

console.log(`  permissions closed on ${schemas.length} classes; ${removed} credential row(s) removed from the database`);
console.log('  (client class creation is a server setting, switched off when the backend restarts)');
