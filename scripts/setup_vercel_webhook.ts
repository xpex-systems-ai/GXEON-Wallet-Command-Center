import Stripe from 'stripe';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('[SETUP] Initializing Vercel Webhook Endpoint...');

  // Extract STRIPE_SECRET_KEY safely from .env.local without logging
  let stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey && fs.existsSync('.env.local')) {
    const lines = fs.readFileSync('.env.local', 'utf-8').split('\n');
    for (const line of lines) {
      if (line.startsWith('STRIPE_SECRET_KEY=')) {
        stripeKey = line.split('=')[1]?.trim().replace(/^["']|["']$/g, '');
        break;
      }
    }
  }

  if (!stripeKey) {
    console.error('[ERROR] STRIPE_SECRET_KEY not found in environment or .env.local');
    process.exit(1);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2025-02-24.acacia' as any });
  const webhookUrl = 'https://gxeon-wallet-command-center.vercel.app/api/stripe/webhook';

  console.log(`[SETUP] Registering official webhook URL: ${webhookUrl}`);
  
  // Check if already registered
  const existingEndpoints = await stripe.webhookEndpoints.list({ limit: 10 });
  let endpoint = existingEndpoints.data.find(ep => ep.url === webhookUrl && ep.status === 'enabled');

  if (!endpoint || !endpoint.secret) {
    // If exists without secret returned, delete and re-create to get fresh signing secret
    if (endpoint) {
      console.log(`[SETUP] Refreshing webhook endpoint ${endpoint.id}...`);
      await stripe.webhookEndpoints.del(endpoint.id);
    }
    console.log('[SETUP] Creating fresh Stripe webhook endpoint...');
    endpoint = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: ['checkout.session.completed', 'charge.refunded'],
      description: 'GXEON Production Vercel Webhook'
    });
  }

  console.log(`[SETUP] Webhook endpoint active (ID: ${endpoint.id})`);

  if (!endpoint.secret) {
    console.error('[ERROR] Stripe did not return a webhook signing secret');
    process.exit(1);
  }

  console.log('[SETUP] Securely provisioning STRIPE_WEBHOOK_SECRET into Vercel...');
  // Pipe secret directly to Vercel CLI via stdin without echoing
  try {
    execSync('npx.cmd vercel env add STRIPE_WEBHOOK_SECRET production,preview,development --sensitive --yes --force', {
      input: endpoint.secret,
      stdio: ['pipe', 'inherit', 'inherit']
    });
    console.log('[SETUP] STRIPE_WEBHOOK_SECRET successfully saved to Vercel!');
  } catch (err: any) {
    console.error('[ERROR] Failed to save secret to Vercel:', err.message);
    process.exit(1);
  }

  console.log('[SETUP] Redeploying Vercel production to apply webhook secret...');
  execSync('npx.cmd vercel deploy --prod --yes', {
    stdio: 'inherit'
  });

  console.log('[SETUP] Vercel deployment complete with active webhook secret!');
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
