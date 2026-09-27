#!/usr/bin/env node

/**
 * GXEON Secret Pattern Guard
 * Verifies that zero live or test secrets are checked into source code.
 */

import fs from 'fs';
import path from 'path';

const FORBIDDEN_PATTERNS = [
  /sk_live_[0-9a-zA-Z]{24,}/,
  /sk_test_[0-9a-zA-Z]{24,}/,
  /whsec_[0-9a-zA-Z]{24,}/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /ghp_[0-9a-zA-Z]{36}/,
  /AIzaSy[0-9a-zA-Z\\-_]{33}/, // Google API keys in source (except .env.example)
];

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'lib',
  '.firebase',
]);

const IGNORE_FILES = new Set([
  '.env.example',
  'package-lock.json',
  'verify_secret_patterns.js',
]);

let violations = 0;

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        scanDir(fullPath);
      }
    } else if (entry.isFile()) {
      if (IGNORE_FILES.has(entry.name)) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          console.error(`[SECURITY VIOLATION] Prohibited secret pattern found in: ${fullPath}`);
          violations++;
        }
      }
    }
  }
}

console.log('[GXEON GUARD] Scanning codebase for prohibited secret patterns...');
scanDir(process.cwd());

if (violations > 0) {
  console.error(`[GXEON GUARD] FAILED: ${violations} secret pattern violation(s) detected.`);
  process.exit(1);
} else {
  console.log('[GXEON GUARD] PASSED: 0 secret pattern violations found.');
  process.exit(0);
}
