import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const checkoutRoot = fileURLToPath(new URL('../../', import.meta.url));
const defaultPublicRoot = path.join(checkoutRoot, 'website/dist');
async function resolveCandidate(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error('Absolute private path required');
  const tail = []; let current = path.resolve(value);
  for (;;) {
    try { return path.join(await realpath(current), ...tail.reverse()); }
    catch (error) { if (error.code !== 'ENOENT') throw error; const parent = path.dirname(current); if (parent === current) throw error; tail.push(path.basename(current)); current = parent; }
  }
}
const within = (parent, child) => { const relative = path.relative(parent, child); return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
export async function validatePrivateLocation(value, publicRoot = defaultPublicRoot) {
  const resolved = await resolveCandidate(value);
  const checkout = await realpath(checkoutRoot);
  const published = await resolveCandidate(publicRoot);
  if (within(checkout, resolved) || within(resolved, checkout)
    || within(published, resolved) || within(resolved, published)
    || resolved === path.parse(resolved).root) throw new Error('Private state/config must stay separate from the checkout and public root, including their ancestors');
  return resolved;
}
