import { mkdir, open, readFile, rename, unlink, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { validatePrivateLocation } from './paths.mjs';

// One writer process per directory. A stale lock fails closed and requires an
// operator to establish that the former writer stopped before removing it.
export async function openEncryptedStore(directory, key) {
  if (!path.isAbsolute(directory) || !Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid server store configuration');
  directory = await validatePrivateLocation(directory);
  key = Buffer.from(key);
  // Create only this leaf. Never chmod an existing shared/general directory or
  // create a chain of unreviewed parent directories to make a config work.
  try { await mkdir(directory, { mode: 0o700 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('A dedicated private store directory is required');
  if (process.platform !== 'win32' && ((info.mode & 0o777) !== 0o700
    || typeof process.getuid === 'function' && info.uid !== process.getuid())) throw new Error('Existing store directory must already be private and owned by the service user');
  const contents = await readdir(directory, { withFileTypes: true });
  if (contents.some(entry => !entry.isFile() || !/^(?:writer\.lock|queue\.enc|queue-[a-f0-9]{24}\.tmp)$/.test(entry.name))) throw new Error('Existing directory is not dedicated to the RTA lead store');
  const lockPath = path.join(directory, 'writer.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  const filename = path.join(directory, 'queue.enc');
  let state = { schemaVersion: 1, entries: [], consumedChallenges: {} };
  let chain = Promise.resolve(); let closed = false; let poisoned = false;
  const decrypt = envelope => {
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    cipher.setAAD(Buffer.from('rta-lead-queue-v1'));
    cipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(envelope.data, 'base64')), cipher.final()]).toString('utf8'));
  };
  try {
    try { state = decrypt(JSON.parse(await readFile(filename, 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Encrypted queue is unreadable; reconciliation required'); }
    if (state.schemaVersion !== 1 || !Array.isArray(state.entries) || !state.consumedChallenges) throw new Error('Unknown queue schema');
  } catch (error) { await lock.close(); await unlink(lockPath); throw error; }
  async function persist(next) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('rta-lead-queue-v1'));
    const data = Buffer.concat([cipher.update(JSON.stringify(next), 'utf8'), cipher.final()]);
    const temporary = path.join(directory, `queue-${randomBytes(12).toString('hex')}.tmp`);
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') })); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, filename);
    if (process.platform !== 'win32') { const dir = await open(directory, 'r'); try { await dir.sync(); } finally { await dir.close(); } }
  }
  return {
    transaction(operation) {
      const run = chain.then(async () => {
        if (closed || poisoned) throw new Error('Store unavailable; reopen and reconcile');
        const next = structuredClone(state); const result = await operation(next);
        try { await persist(next); state = next; } catch { poisoned = true; throw new Error('Durable queue write failed; reopen and reconcile'); }
        return structuredClone(result);
      });
      chain = run.catch(() => {}); return run;
    },
    async snapshot() { await chain; if (closed || poisoned) throw new Error('Store unavailable'); return structuredClone(state); },
    async close() { await chain; closed = true; await lock.close(); await unlink(lockPath); },
  };
}
