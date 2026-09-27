/**
 * GXEON Firebase Functions Entry Point
 * Exposes Stripe Checkout and Webhook endpoints using the single authoritative payment service.
 */

import { stripeServerService } from './stripeServerService';

export { stripeServerService };

// Note: Deployment of live Cloud Functions requires Firebase Blaze plan.
// If Blaze is not enabled, BLAZE_REQUIRED = YES.
