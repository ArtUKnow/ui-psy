import { spawn } from 'node:child_process';
import { startBackend } from './backend.mjs';

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const portArgument = args.find(value => value.startsWith('--port='));
const frontPort = Number(portArgument?.split('=')[1] ?? (portIndex >= 0 ? args[portIndex + 1] : 5173));
if (!Number.isInteger(frontPort) || frontPort < 1024 || frontPort > 62535) throw new Error('Invalid frontend port');
const apiPort = Number(process.env.UI_PSY_API_PORT ?? frontPort + 3000);
const environment = { ...process.env, UI_PSY_API_PORT: String(apiPort) };
const api = await startBackend(['--port', String(apiPort)], environment);
let vite;

function stop() {
  if (vite && !vite.killed) vite.kill('SIGTERM');
  if (!api.killed) api.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
api.on('exit', code => {
  if (vite) vite.kill('SIGTERM');
  process.exitCode = code || 1;
});

for (let attempt = 0; attempt < 50; attempt++) {
  if (api.exitCode !== null) throw new Error('UI-PSY API did not start');
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/health`);
    if (response.ok) break;
  } catch { /* Backend is still starting. */ }
  if (attempt === 49) throw new Error('UI-PSY API health check timed out');
  await new Promise(resolve => setTimeout(resolve, 100));
}

vite = spawn('node_modules/.bin/vite', args, { stdio: 'inherit', env: environment });
vite.on('exit', code => {
  if (!api.killed) api.kill('SIGTERM');
  process.exitCode = code || 0;
});
