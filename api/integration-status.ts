export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY);
  const webhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    stripeConfigured,
    webhookConfigured,
    firestoreConnected: true,
    liveMode: false
  }));
}
