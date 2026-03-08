import {spawn} from 'child_process';

function run(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[dev:${name}] exited with code ${code}`);
      process.exit(code);
    }
  });

  return child;
}

const api = run('api', 'npm', ['run', 'dev:api']);
const web = run('web', 'npm', ['run', 'dev:web']);

function shutdown() {
  api.kill('SIGTERM');
  web.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
