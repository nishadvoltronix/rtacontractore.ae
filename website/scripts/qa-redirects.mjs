import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer, createConnection } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Real Nginx integration tests. No dependency installation, public requests,
// deployment, environment changes or changes to website/dist are performed.
const exec = promisify(execFile);
const project = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--nginx', '--openssl', '--output'].includes(process.argv[i]) || !process.argv[i + 1]) throw Error('Usage: node website/scripts/qa-redirects.mjs --nginx PATH --openssl PATH --output DIR');
  options[process.argv[i].slice(2)] = path.resolve(process.argv[i + 1]);
}
if (!options.nginx || !options.openssl || !options.output) throw Error('Provide --nginx, --openssl and --output. Nothing is installed automatically.');
const artifactRoot = path.join(project, 'artifacts') + path.sep;
if (!options.output.startsWith(artifactRoot)) throw Error('Output, including the temporary TLS key, must stay inside ignored project artifacts/.');
const runDirectory = path.join(options.output, `nginx-${Date.now()}-${process.pid}`);
await mkdir(path.join(runDirectory, 'logs'), { recursive: true });
await mkdir(path.join(runDirectory, 'temp'), { recursive: true });
const unix = value => value.replaceAll('\\', '/');
const quoted = value => `"${unix(value).replaceAll('"', '\\"')}"`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); });
});
const ports = {};
for (const name of ['http', 'https', 'baseline']) {
  do { ports[name] = await freePort(); } while (Object.entries(ports).some(([key, value]) => key !== name && value === ports[name]));
}
const report = { startedAt: new Date().toISOString(), engine: 'actual Nginx executable, not an application mock', scope: 'Only 127.0.0.1 listeners and 127.0.0.1/127.0.0.2 local socket peers. Public redirect destinations are mapped back to the isolated TLS listener. Self-signed key is ignored, never printed. Existing dist files are read only.', ports, snippets: [], tests: [], responses: [], limits: ['Local Nginx execution does not authenticate or validate the active production proxy configuration.', 'The loopback trust entry is test-only and must not be copied to production.', 'TLS uses an ephemeral self-signed certificate, not production certificate validation.'] };
let ownedProcess;
let nginxArguments;
let startupError = '';
const check = (condition, name, evidence = undefined) => report.tests.push({ status: condition ? 'PASS' : 'FAIL', name, ...(evidence === undefined ? {} : { evidence }) });
const request = ({ transport = 'https', method = 'GET', pathname = '/', host = 'rtacontractor.ae', headers = {}, localAddress = '127.0.0.2', port = ports[transport] }) => new Promise((resolve, reject) => {
  const req = (transport === 'https' ? https : http).request({ hostname: '127.0.0.1', port, localAddress, method, path: pathname, headers: { Host: host, ...headers }, rejectUnauthorized: false, agent: false }, response => {
    const chunks = []; let bytes = 0;
    response.on('data', chunk => { bytes += chunk.length; if (bytes > 16 * 1024 * 1024) req.destroy(Error('Response limit exceeded')); else chunks.push(chunk); });
    response.on('end', () => {
      const result = { transport, method, pathname, host, localAddress, status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) };
      report.responses.push({ transport, method, pathname, host, localAddress, requestHeaders: headers, status: result.status, location: response.headers.location || null, bytes: result.body.length });
      resolve(result);
    });
    response.on('error', reject);
  });
  req.on('error', reject);
  req.setTimeout(8000, () => req.destroy(Error(`Local request timed out: ${method} ${pathname}`)));
  req.end();
});
const terminal = async (response, target, label) => {
  check(response.status === 308 && response.headers.location === target, `${label}: one canonical redirect`, { status: response.status, actual: response.headers.location, expected: target });
  if (!response.headers.location) return;
  const url = new URL(response.headers.location, 'https://rtacontractor.ae');
  check(url.origin === 'https://rtacontractor.ae' && !url.port && !url.username && !url.password, `${label}: fixed HTTPS authority without service port`);
  if (url.origin !== 'https://rtacontractor.ae') return;
  const next = await request({ pathname: url.pathname + url.search, method: response.method });
  check(next.status === 200 && !next.headers.location, `${label}: terminal 200 after one hop`, next.status);
  if (response.method === 'HEAD') check(response.body.length === 0 && next.body.length === 0, `${label}: HEAD bodies empty`);
};

try {
  const version = await exec(options.nginx, ['-V'], { windowsHide: true });
  report.nginxVersion = (version.stdout + version.stderr).trim();
  await writeFile(path.join(runDirectory, 'nginx-version.log'), report.nginxVersion);
  check(report.nginxVersion.includes('--with-http_realip_module'), 'Nginx supports the original peer address variable');
  for (const name of ['rtacontractor-http.conf', 'rtacontractor-server.conf', 'rtacontractor-trusted-proxies.conf']) {
    const source = await readFile(path.join(project, 'website', 'hosting', 'nginx', name));
    await writeFile(path.join(runDirectory, name), source);
    report.snippets.push({ file: `website/hosting/nginx/${name}`, sha256: createHash('sha256').update(source).digest('hex'), exactCopy: true });
  }
  // Append a single test socket-peer entry to the copied intentionally-empty
  // production trust file. The repository candidate is never changed here.
  await writeFile(path.join(runDirectory, 'rtacontractor-trusted-proxies.conf'), Buffer.concat([await readFile(path.join(runDirectory, 'rtacontractor-trusted-proxies.conf')), Buffer.from('\n127.0.0.1 1; # ISOLATED TEST ONLY\n')]));
  const testTrust = report.snippets.find(item => item.file.endsWith('trusted-proxies.conf'));
  testTrust.exactCopy = false;
  testTrust.testOnlyAppend = '127.0.0.1 1;';
  testTrust.executedSha256 = createHash('sha256').update(await readFile(path.join(runDirectory, 'rtacontractor-trusted-proxies.conf'))).digest('hex');
  await exec(options.openssl, ['req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-days', '1', '-subj', '/CN=localhost', '-keyout', path.join(runDirectory, 'localhost.key'), '-out', path.join(runDirectory, 'localhost.crt')], { windowsHide: true, maxBuffer: 1024 * 1024 });
  const dist = quoted(path.join(project, 'website', 'dist'));
  const tls = `ssl_certificate ${quoted(path.join(runDirectory, 'localhost.crt'))};\nssl_certificate_key ${quoted(path.join(runDirectory, 'localhost.key'))};`;
  const site = `server_name rtacontractor.ae www.rtacontractor.ae;\nroot ${dist};\nindex index.html;\ninclude rtacontractor-server.conf;\nlocation ~ \\.pdf$ { add_header Content-Disposition inline; try_files $uri =404; }\nlocation / { try_files $uri $uri/ =404; }`;
  const config = `worker_processes 1;\npid logs/nginx.pid;\nerror_log logs/error.log notice;\nevents { worker_connections 128; }\nhttp {\nset_real_ip_from 127.0.0.1;\nreal_ip_header X-Real-IP;\nadd_header X-Runner-Client $remote_addr always;\nadd_header X-Runner-Peer $realip_remote_addr always;\naccess_log off;\ninclude ${quoted(path.join(path.dirname(options.nginx), 'conf', 'mime.types'))};\ndefault_type application/octet-stream;\ninclude rtacontractor-http.conf;\nserver { listen 127.0.0.1:${ports.http} default_server; ${site} }\nserver { listen 127.0.0.1:${ports.https} ssl default_server; ${tls} ${site} }\nserver { listen 127.0.0.1:${ports.baseline}; server_name rtacontractor.ae; root ${dist}; index index.html; location / { try_files $uri $uri/ =404; } }\nserver { listen 127.0.0.1:${ports.http}; listen 127.0.0.1:${ports.https} ssl; ${tls} server_name unrelated.invalid; return 200 'unrelated-vhost-unchanged'; }\n}\n`;
  await writeFile(path.join(runDirectory, 'nginx.conf'), config);
  nginxArguments = ['-p', unix(runDirectory) + '/', '-c', 'nginx.conf'];
  const syntax = await exec(options.nginx, [...nginxArguments, '-t'], { windowsHide: true });
  await writeFile(path.join(runDirectory, 'nginx-test.log'), syntax.stdout + syntax.stderr);
  check(true, 'nginx -t accepts copied candidate snippets and isolated TLS configuration');
  ownedProcess = spawn(options.nginx, nginxArguments, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: runDirectory });
  ownedProcess.stderr.on('data', chunk => { startupError = (startupError + chunk.toString()).slice(-4000); });
  ownedProcess.stdout.on('data', () => {});
  await new Promise((resolve, reject) => {
    ownedProcess.once('error', reject);
    const deadline = Date.now() + 8000;
    const ready = async () => {
      try { const text = await readFile(path.join(runDirectory, 'logs', 'nginx.pid'), 'utf8'); if (Number(text.trim()) === ownedProcess.pid) return resolve(); } catch {}
      if (Date.now() >= deadline) return reject(Error(`Nginx did not create its owned PID file: ${startupError}`));
      setTimeout(ready, 50);
    }; ready();
  });
  // Windows master writes its PID before its worker has bound every listener.
  for (const port of Object.values(ports)) {
    const deadline = Date.now() + 8000;
    while (true) {
      const connected = await new Promise(resolve => {
        const socket = createConnection({ host: '127.0.0.1', port });
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('error', () => { socket.destroy(); resolve(false); });
      });
      if (connected) break;
      if (Date.now() >= deadline) throw Error(`Nginx listener did not start: ${port}. ${startupError}`);
      await delay(50);
    }
  }
  for (const method of ['GET', 'HEAD']) {
    const baseline = await request({ transport: 'http', port: ports.baseline, method, pathname: '/services/street-lighting', localAddress: '127.0.0.2' });
    check(baseline.status === 301 && baseline.headers.location === `http://rtacontractor.ae:${ports.baseline}/services/street-lighting/`, `Bare Nginx ${method}: reproduces internal listener port and HTTP redirect`, { status: baseline.status, location: baseline.headers.location });
    if (method === 'GET') check(baseline.body.toString().includes('nginx/1.24.0'), 'Baseline redirect has observed Nginx version/body signature');
  }
  const originals = [['/index.html', '/'], ['/services/street-lighting', '/services/street-lighting/'], ['/services/street-lighting?audit=discovery', '/services/street-lighting/?audit=discovery'], ['/services/street-lighting/index.html', '/services/street-lighting/'], ['/services/underground-cabling', '/services/underground-cabling/'], ['/', '/', 'www.rtacontractor.ae']];
  for (const [from, to, host] of originals) for (const method of ['HEAD', 'GET']) {
    const response = await request({ transport: 'http', localAddress: '127.0.0.1', headers: { 'X-Forwarded-Proto': 'https' }, host: host || 'rtacontractor.ae', pathname: from, method });
    await terminal(response, `https://rtacontractor.ae${to}`, `Original failure ${host || ''}${from} ${method}`);
  }
  const routes = ['/', '/privacy/', '/photography/', ...['street-lighting', 'underground-cabling', 'electrical-infrastructure', 'high-mast-area-lighting', 'led-solar-lighting', 'lighting-maintenance'].map(slug => `/services/${slug}/`)];
  const contexts = [
    { name: 'untrusted HTTP', transport: 'http', localAddress: '127.0.0.2', publicScheme: 'http' },
    { name: 'untrusted TLS', transport: 'https', localAddress: '127.0.0.2', publicScheme: 'https' },
    { name: 'trusted HTTPS ingress over HTTP', transport: 'http', localAddress: '127.0.0.1', publicScheme: 'https', headers: { 'X-Forwarded-Proto': 'https' } },
    { name: 'trusted HTTP ingress over HTTP', transport: 'http', localAddress: '127.0.0.1', publicScheme: 'http', headers: { 'X-Forwarded-Proto': 'http' } },
    { name: 'trusted HTTPS ingress over TLS', transport: 'https', localAddress: '127.0.0.1', publicScheme: 'https', headers: { 'X-Forwarded-Proto': 'https' } },
    { name: 'trusted HTTP ingress over TLS', transport: 'https', localAddress: '127.0.0.1', publicScheme: 'http', headers: { 'X-Forwarded-Proto': 'http' } },
  ];
  for (const route of routes) for (const pathname of route === '/' ? ['/', '/index.html'] : [route, route.slice(0, -1), `${route}index.html`]) {
    for (const context of contexts) for (const host of ['rtacontractor.ae', 'www.rtacontractor.ae']) for (const method of ['HEAD', 'GET']) {
      const label = `${context.name} ${host}${pathname} ${method}`;
      const response = await request({ ...context, pathname, host, method });
      if (context.publicScheme !== 'https' || host.startsWith('www.') || pathname !== route) await terminal(response, `https://rtacontractor.ae${route}`, label);
      else check(response.status === 200 && !response.headers.location, `${label}: canonical path has no loop`, response.status);
    }
  }
  for (const host of ['rtacontractor.ae:3100', 'www.rtacontractor.ae:3100', 'rtacontractor.ae.attacker.invalid', 'attacker.invalid', 'localhost', 'rtacontractor.ae.', 'user@rtacontractor.ae']) {
    const response = await request({ host, pathname: '/services/street-lighting' });
    check([400, 421].includes(response.status) && !response.headers.location, `Reject unrelated/malformed authority ${host}`, response.status);
  }
  for (const host of ['rtacontractor.ae:443', 'RTACONTRACTOR.AE']) {
    const response = await request({ host });
    check(response.status === 200 && !response.headers.location, `Canonical HTTPS host accepted: ${host}`, response.status);
  }
  for (const host of ['rtacontractor.ae:80', 'www.rtacontractor.ae:80', 'www.rtacontractor.ae:443']) await terminal(await request({ host }), 'https://rtacontractor.ae/', `Canonicalize explicit public host ${host}`);
  for (const value of [undefined, '', 'https,http', 'https, http', 'ftp', 'https://attacker.invalid', ['https', 'http'], ['https', 'https'], ',https']) {
    for (const transport of ['http', 'https']) for (const method of ['GET', 'HEAD']) for (const pathname of ['/', '/services/street-lighting', '/assets/style.css']) {
      const response = await request({ transport, method, pathname, localAddress: '127.0.0.1', headers: value === undefined ? {} : { 'X-Forwarded-Proto': value } });
      check(response.status === 400 && !response.headers.location, `Trusted peer ${transport} ${method} ${pathname} invalid/missing/duplicate protocol ${JSON.stringify(value)} fails closed`, response.status);
      if (method === 'HEAD') check(response.body.length === 0, `Trusted peer invalid protocol HEAD ${transport} ${pathname}: no response body`);
    }
  }
  const spoof = { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'attacker.invalid:3100', Forwarded: 'for=127.0.0.1;host=attacker.invalid;proto=https', 'X-Forwarded-Port': '3100', 'X-Real-IP': '127.0.0.1' };
  await terminal(await request({ transport: 'http', headers: spoof }), 'https://rtacontractor.ae/', 'Untrusted forwarded headers cannot suppress HTTPS canonicalization');
  const tlsSpoof = await request({ headers: { ...spoof, 'X-Forwarded-Proto': 'http' } });
  check(tlsSpoof.status === 200 && !tlsSpoof.headers.location, 'Untrusted forwarded HTTP cannot create TLS redirect loop', tlsSpoof.status);
  check(tlsSpoof.headers['x-runner-client'] === '127.0.0.2' && tlsSpoof.headers['x-runner-peer'] === '127.0.0.2', 'Untrusted X-Real-IP cannot impersonate the trusted socket peer');
  const rewrittenPeer = await request({ transport: 'http', localAddress: '127.0.0.1', headers: { 'X-Forwarded-Proto': 'https', 'X-Real-IP': '192.0.2.10' } });
  check(rewrittenPeer.headers['x-runner-client'] === '192.0.2.10' && rewrittenPeer.headers['x-runner-peer'] === '127.0.0.1', 'Actual real_ip rewriting retains original trusted socket peer');
  check(rewrittenPeer.status === 200 && !rewrittenPeer.headers.location, 'Redirect trust uses original peer after real_ip rewrites visitor address', rewrittenPeer.status);
  await terminal(await request({ transport: 'http', localAddress: '127.0.0.1', pathname: '/services/street-lighting', headers: { ...spoof, 'X-Forwarded-Proto': 'https' } }), 'https://rtacontractor.ae/services/street-lighting/', 'Trusted ingress forwarded Host/Port/Forwarded never chooses destination');
  for (const query of ['?a=1&a=2&empty=', '?next=https%3A%2F%2Fattacker.invalid%2F&service=street-lighting', '?q=%0d%0aLocation%3Ahttps%3A%2F%2Fattacker.invalid', '?a=%2F%3F%23%26%25&plus=a+b']) {
    await terminal(await request({ pathname: `/services/street-lighting${query}` }), `https://rtacontractor.ae/services/street-lighting/${query}`, `Raw query preserved ${query}`);
  }
  // Preserve raw HTTP targets instead of normalizing them through URL first.
  // Known aliases above require an explicit absolute 308. Incidental directory
  // normalization here may use Nginx's relative 301, which must still resolve
  // against the visitor's public HTTPS URL without changing its authority.
  for (const pathname of ['//attacker.invalid/', '//services/street-lighting', '/%2fservices/street-lighting', '/%2f%2fattacker.invalid/', 'http://attacker.invalid/services/street-lighting']) {
    for (const context of [
      { transport: 'https', localAddress: '127.0.0.2', headers: { ...spoof, 'X-Forwarded-Proto': 'http' } },
      { transport: 'http', localAddress: '127.0.0.1', headers: { ...spoof, 'X-Forwarded-Proto': 'https' } },
    ]) for (const method of ['GET', 'HEAD']) {
      const response = await request({ ...context, pathname, method });
      const label = `Raw target ${method} ${context.transport} ${pathname}`;
      const location = response.headers.location;
      if (location) {
        const destination = new URL(location, 'https://rtacontractor.ae/');
        check([301, 308].includes(response.status) && destination.origin === 'https://rtacontractor.ae' && !destination.port && !destination.username && !destination.password, `${label}: safe ${location.startsWith('https://') ? 'explicit absolute' : 'incidental relative'} redirect`, { status: response.status, location, destination: destination.href });
        check(destination.href === 'https://rtacontractor.ae/services/street-lighting/', `${label}: exact normalized destination`, destination.href);
        if (destination.origin === 'https://rtacontractor.ae') {
          const next = await request({ method, pathname: destination.pathname + destination.search });
          check(next.status === 200 && !next.headers.location, `${label}: terminal 200 without loop`, next.status);
        }
      } else {
        check([200, 400, 403, 404, 421].includes(response.status), `${label}: handled without redirect`, response.status);
        check(response.status === 404, `${label}: unknown raw path is genuinely missing`, response.status);
      }
      if (method === 'HEAD') check(response.body.length === 0, `${label}: HEAD body empty`);
    }
  }
  for (const pathname of ['/not-a-real-release-page', '/not-a-real-release-page/', '/not-a-real-release-page/index.html', '/services/nonexistent', '/services/nonexistent/index.html']) {
    const response = await request({ pathname });
    check(response.status === 404 && !response.headers.location, `Unknown path remains real 404: ${pathname}`, response.status);
  }
  for (const pathname of ['/assets/style.css?version=readiness', '/assets/documents/rta-approval-pq.pdf?review=readiness', '/assets/documents/voltronix-prequalification.pdf?review=readiness']) for (const method of ['HEAD', 'GET']) {
    const response = await request({ pathname, method });
    check(response.status === 200 && !response.headers.location, `Asset/query not redirected: ${method} ${pathname}`, response.status);
    if (pathname.includes('.pdf')) check(response.headers['content-type'] === 'application/pdf' && response.headers['content-disposition'] === 'inline', `PDF remains inline: ${method} ${pathname}`);
  }
  for (const transport of ['http', 'https']) {
    const response = await request({ transport, host: 'unrelated.invalid', pathname: '/index.html', headers: spoof });
    check(response.status === 200 && response.body.toString() === 'unrelated-vhost-unchanged' && !response.headers.location, `Unrelated ${transport} virtual host remains unchanged`);
  }
  // Query data and irrelevant forwarded headers must not turn an already
  // canonical page or asset into a new redirect or a different response body.
  for (const pathname of ['/', '/services/street-lighting/', '/assets/style.css']) {
    const clean = await request({ pathname });
    for (const query of ['?next=https%3A%2F%2Fattacker.invalid&service=street-lighting', '?utm_source=chatgpt.com&a=1&a=2&empty=']) {
      for (const context of [
        { transport: 'https', localAddress: '127.0.0.2', headers: { ...spoof, 'X-Forwarded-Proto': 'http' } },
        { transport: 'http', localAddress: '127.0.0.1', headers: { ...spoof, 'X-Forwarded-Proto': 'https' } },
      ]) {
        const response = await request({ ...context, pathname: pathname + query });
        check(response.status === 200 && !response.headers.location, `Canonical ${context.transport} ${pathname}${query}: no unnecessary redirect`, response.status);
        check(response.body.equals(clean.body), `Canonical ${pathname}${query}: query and forwarded host do not change served content`);
      }
    }
  }
  for (const requestScheme of ['http', 'https']) for (const pathname of ['/', '/services/street-lighting/', '/assets/style.css']) {
    for (const method of ['GET', 'HEAD']) {
      const absolute = `${requestScheme}://rtacontractor.ae${pathname}`;
      const response = await request({ pathname: absolute, method, headers: spoof });
      check(response.status === 200 && !response.headers.location, `Canonical absolute-form ${method} ${absolute}: transport controls scheme, no redirect`, response.status);
    }
  }
} catch (error) {
  report.error = error.stack;
  check(false, 'Runner completes without execution errors', error.message);
} finally {
  if (ownedProcess) {
    try {
      const pid = Number((await readFile(path.join(runDirectory, 'logs', 'nginx.pid'), 'utf8')).trim());
      if (pid !== ownedProcess.pid) throw Error('Refusing to signal a PID not owned by this runner.');
      await exec(options.nginx, [...nginxArguments, '-s', 'quit'], { windowsHide: true });
      for (let attempt = 0; attempt < 100 && ownedProcess.exitCode === null; attempt++) await delay(50);
      check(ownedProcess.exitCode !== null, 'Owned Nginx master and graceful workers stopped', { exitCode: ownedProcess.exitCode });
    } catch (error) { check(false, 'Owned Nginx cleanup', error.message); }
  }
  report.finishedAt = new Date().toISOString();
  report.counts = report.tests.reduce((counts, item) => { counts[item.status]++; return counts; }, { PASS: 0, FAIL: 0 });
  report.runDirectory = path.relative(project, runDirectory).replaceAll('\\', '/');
  await writeFile(path.join(runDirectory, 'results.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(options.output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ counts: report.counts, report: path.relative(project, path.join(options.output, 'results.json')), ...(report.error ? { error: report.error } : {}) }, null, 2));
  if (report.counts.FAIL) process.exitCode = 1;
}
