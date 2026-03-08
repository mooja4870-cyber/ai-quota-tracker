import 'dotenv/config';
import {spawn} from 'child_process';

function runCollector(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`collector failed (${code}): ${stderr || stdout}`));
    });
  });
}

function parseQuotas(output, provider) {
  const payload = JSON.parse(output);
  const quotas = Array.isArray(payload) ? payload : payload?.quotas;

  if (!Array.isArray(quotas)) {
    throw new Error(`${provider}: invalid payload`);
  }

  return quotas;
}

async function collectFromProvider({enabled, name, command}) {
  if (!enabled) {
    return [];
  }

  const output = await runCollector(command);
  return parseQuotas(output, name);
}

async function main() {
  const providers = [
    {
      name: 'gemini',
      enabled: process.env.ENABLE_GEMINI_COLLECTOR === 'true',
      command: process.env.GEMINI_COLLECTOR_CMD || 'node scripts/providers/collect-gemini.js',
    },
    {
      name: 'claude',
      enabled: process.env.ENABLE_CLAUDE_COLLECTOR === 'true',
      command: process.env.CLAUDE_COLLECTOR_CMD || 'node scripts/providers/collect-claude.js',
    },
    {
      name: 'openai',
      enabled: process.env.ENABLE_OPENAI_COLLECTOR === 'true',
      command: process.env.OPENAI_COLLECTOR_CMD || 'node scripts/providers/collect-openai.js',
    },
  ];

  const quotas = [];

  for (const provider of providers) {
    try {
      const rows = await collectFromProvider(provider);
      quotas.push(...rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown-error';
      console.error(`[collect-account-all] ${provider.name}: ${message}`);
    }
  }

  process.stdout.write(JSON.stringify({quotas}, null, 0));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'unknown-error';
  console.error(`[collect-account-all] fatal: ${message}`);
  process.exit(1);
});
