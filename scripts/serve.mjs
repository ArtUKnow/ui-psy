import { startBackend } from './backend.mjs';
const api = await startBackend(['--serve-dist', '--port', process.env.PORT || '5178', ...process.argv.slice(2)]);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => api.kill(signal));
api.on('error', error => { console.error(error.message); process.exitCode = 1; });
api.on('exit', code => { process.exitCode = code ?? 1; });
