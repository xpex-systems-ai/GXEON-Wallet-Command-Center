"use strict";
/**
 * GXEON Dual Revenue Engine — Authoritative Payment Types & State Machine
 * Security Invariant: Client never defines amount, currency, or transitions payment states directly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GXEON_SERVICES = void 0;
exports.GXEON_SERVICES = {
    gxeon_quick_fix_v1: {
        id: 'gxeon_quick_fix_v1',
        name: 'GXEON Quick Fix V1',
        description: 'Autonomous rapid bug triage, environment configuration, and codebase diagnosis.',
        unitAmountCents: 4900, // Fixed R$ 49.00
        currency: 'brl',
        active: true,
    },
};
//# sourceMappingURL=paymentTypes.js.map