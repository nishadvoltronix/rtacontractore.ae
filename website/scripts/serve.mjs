import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const realRoot = await realpath(root);
const port = Number(process.env.PORT || 4173);
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.avif':'image/avif', '.webp':'image/webp', '.jpg':'image/jpeg', '.png':'image/png', '.mp4':'video/mp4', '.pdf':'application/pdf', '.woff2':'font/woff2', '.xml':'application/xml', '.txt':'text/plain; charset=utf-8', '.json':'application/json' };
const contained = (directory, file) => file === directory || file.startsWith(directory + path.sep);
const routeForDirectory = directory => {
  const segments = path.relative(root, directory).split(path.sep).filter(Boolean);
  return '/' + segments.map(encodeURIComponent).join('/') + (segments.length ? '/' : '');
};
const server = createServer(async (req,res) => {
  const head = req.method === 'HEAD';
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-cache', 'Content-Length':Buffer.byteLength(body), ...headers });
    res.end(head ? undefined : body);
  };
  if (req.method !== 'GET' && !head) {
    send(405, 'Method not allowed', { Allow:'GET, HEAD' });
    return;
  }
  let url, pathname;
  try {
    url = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0')) throw new URIError('Null byte in path');
  } catch {
    send(400, 'Invalid request path');
    return;
  }
  // Reject Windows separators and paths that would resolve outside the static root.
  const requestedFile = path.resolve(root, '.' + pathname);
  if (pathname.includes('\\') || !contained(root, requestedFile)) {
    send(403, 'Forbidden');
    return;
  }
  try {
    let file = requestedFile;
    let info = await stat(file);
    let canonicalPath;
    if (info.isDirectory()) {
      canonicalPath = routeForDirectory(file);
      file = path.join(file, 'index.html');
      info = await stat(file);
    } else if (path.basename(file).toLowerCase() === 'index.html') {
      canonicalPath = routeForDirectory(path.dirname(file));
    }
    if (!info.isFile()) {
      send(404, 'Page not found');
      return;
    }
    // A symlink inside dist must not expose files outside the published directory.
    if (!contained(realRoot, await realpath(file))) {
      send(403, 'Forbidden');
      return;
    }
    if (canonicalPath && url.pathname !== canonicalPath) {
      send(308, '', { Location:canonicalPath + url.search });
      return;
    }
    const extension = path.extname(file).toLowerCase();
    const body = head ? undefined : await readFile(file);
    res.writeHead(200, { 'Content-Type':types[extension] || 'application/octet-stream', 'Content-Length':info.size, 'Cache-Control':'no-cache', ...(extension === '.pdf' ? { 'Content-Disposition':'inline' } : {}) });
    res.end(body);
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code)) {
      send(500, 'Unable to read this page');
      return;
    }
    const body = await readFile(path.join(root,'404.html')).catch(() => 'Page not found');
    send(404, body, { 'Content-Type':'text/html; charset=utf-8' });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${server.address().port}`));
