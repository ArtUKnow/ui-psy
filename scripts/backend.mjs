import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env', '.env.local']) {
  const file = path.join(root, name);
  if (existsSync(file)) process.loadEnvFile(file);
}

export async function startBackend(args, environment = process.env) {
  if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required; see .env.example');
  await new Promise((resolve, reject) => {
    const build = spawn('go', ['build', '-o', 'bin/ui-psy', '.'], { cwd: path.join(root, 'server-go'), stdio: 'inherit' });
    build.on('error', reject);
    build.on('exit', code => code === 0 ? resolve() : reject(new Error(`Go build failed: ${code}`)));
  });
  return spawn(path.join(root, 'server-go/bin/ui-psy'), ['--root', root, ...args], { cwd: root, stdio: 'inherit', env: environment });
}
