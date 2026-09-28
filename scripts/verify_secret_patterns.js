import { execFileSync } from 'child_process';
import fs from 'fs';

console.log('[SECURITY] Scanning tracked files for credential-shaped Stripe secrets...');

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8' })
  .split('\0')
  .filter(Boolean)
  .filter((path) => !path.endsWith('.lock'));

const secretKeyPattern = new RegExp('(?:s' + 'k|r' + 'k)_(?:test|live)_[A-Za-z0-9]{16,}', 'g');
const webhookPattern = new RegExp('w' + 'hsec_[A-Za-z0-9]{16,}', 'g');

const findings = [];

for (const path of files) {
  let text;
  try {
    text = fs.readFileSync(path, 'utf8');
  } catch {
    continue;
  }

  if (secretKeyPattern.test(text) || webhookPattern.test(text)) {
    findings.push(path);
  }
  secretKeyPattern.lastIndex = 0;
  webhookPattern.lastIndex = 0;
}

if (findings.length) {
  console.error('[SECURITY ERROR] Credential-shaped Stripe secret detected in tracked files:');
  for (const path of findings) console.error(`- ${path}`);
  process.exit(1);
}

console.log('[SECURITY PASS] No credential-shaped Stripe secrets found in tracked files.');
