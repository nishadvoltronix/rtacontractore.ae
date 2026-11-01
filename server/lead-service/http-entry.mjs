import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createLeadRuntime } from './runtime.mjs';
import { validatePrivateLocation } from './paths.mjs';
export { validatePrivateLocation } from './paths.mjs';

export function validateHttpBinding(options = {}) {
  if (options.enable !== true || !Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('Explicit enable and port are required');
  const host = options.host || '127.0.0.1';
  if (!['127.0.0.1', '::1'].includes(host)) throw new Error('Only literal loopback binding is supported');
  const workerIntervalMs = options.workerIntervalMs ?? 15000;
  if (!Number.isInteger(workerIntervalMs) || workerIntervalMs < 1000 || workerIntervalMs > 60000) throw new Error('Worker interval must be bounded');
  return { host, port: options.port, workerIntervalMs };
}
// Explicit preparation only. Nothing listens until the returned listen() is
// called; importing this file does not construct a runtime or read credentials.
export async function prepareLeadHttpService(options) {
  const binding = validateHttpBinding(options);
  if (options.config?.enabled !== true) throw new Error('Lead service configuration remains disabled');
  const privateStateDirectory = await validatePrivateLocation(options.runtimeOptions?.privateStateDirectory, options.publicRoot);
  const runtime = await createLeadRuntime(options.config, { ...options.runtimeOptions, privateStateDirectory, publicRoot: options.publicRoot });
  if (!runtime.ready) throw new Error('Lead runtime verification gates are incomplete');
  let timer; let workerHealthy = null; let listening = false;
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(workerHealthy ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ ready: true, workerHealthy })); return;
    }
    void runtime.handler(request, response).catch(() => response.destroy());
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 5000;
  server.maxConnections = 50; server.maxRequestsPerSocket = 50;
  server.on('clientError', (_, socket) => { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
  return {
    binding,
    async listen() {
      if (listening) return;
      try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(binding.port, binding.host, () => { server.removeListener('error', reject); listening = true; resolve(); }); }); }
      catch (error) { await runtime.close(); throw error; }
      timer = setInterval(() => { void runtime.tick().then(() => { workerHealthy = true; }, () => { workerHealthy = false; }); }, binding.workerIntervalMs);
      timer.unref();
    },
    health: runtime.health,
    async close() { clearInterval(timer); try { if (listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } finally { await runtime.close(); listening = false; } },
  };
}

async function main() {
  if (!process.argv.includes('--enable')) { console.log('Disabled: no listener started. Explicit --enable, --port and a private --runtime-config are required.'); return; }
  const option = name => process.argv.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
  const portText = option('port'); if (!/^\d{1,5}$/.test(portText || '')) throw new Error('Explicit port required');
  const configPath = await validatePrivateLocation(option('runtime-config'));
  const privateModule = await import(pathToFileURL(configPath).href);
  const service = await prepareLeadHttpService({ enable: true, port: Number(portText), host: option('host'), config: privateModule.leadConfig, runtimeOptions: privateModule.runtimeOptions });
  await service.listen(); console.log('Lead HTTP service started on its explicitly configured loopback binding.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void service.close().then(() => process.exit(0), () => process.exit(1)); });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Lead HTTP service not started: verify the private runtime configuration and explicit activation gates.'); process.exitCode = 1; });
