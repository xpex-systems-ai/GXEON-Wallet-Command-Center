"use strict";
/**
 * GXEON Firebase Functions Entry Point
 * Exposes Stripe Checkout and Webhook endpoints using the single authoritative payment service.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeServerService = void 0;
const stripeServerService_1 = require("./stripeServerService");
Object.defineProperty(exports, "stripeServerService", { enumerable: true, get: function () { return stripeServerService_1.stripeServerService; } });
// Note: Deployment of live Cloud Functions requires Firebase Blaze plan.
// If Blaze is not enabled, BLAZE_REQUIRED = YES.
//# sourceMappingURL=index.js.map