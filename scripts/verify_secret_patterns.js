import { execSync } from 'child_process';

console.log('[SECURITY] Verifying secret patterns in repository...');

try {
  let skLiveResult = '';
  try {
    skLiveResult = execSync('git grep -n "sk_live_" -- ":(exclude)*.lock" ":(exclude)package-lock.json" ":(exclude)scripts/verify_secret_patterns.js"', { encoding: 'utf-8' }).trim();
  } catch {
    skLiveResult = '';
  }

  if (skLiveResult) {
    console.error('[SECURITY ERROR] sk_live_ found in repository:');
    console.error(skLiveResult);
    process.exit(1);
  }

  let skTestResult = '';
  try {
    skTestResult = execSync('git grep -n "sk_test_51" -- ":(exclude)*.lock" ":(exclude)package-lock.json" ":(exclude)scripts/verify_secret_patterns.js"', { encoding: 'utf-8' }).trim();
  } catch {
    skTestResult = '';
  }

  if (skTestResult) {
    console.error('[SECURITY ERROR] Real sk_test_ key pattern found in repository:');
    console.error(skTestResult);
    process.exit(1);
  }

  console.log('[SECURITY PASS] Zero real secret patterns found in repository code.');
  process.exit(0);
} catch (err) {
  console.error('[SECURITY CHECK FAILED]', err.message);
  process.exit(1);
}
