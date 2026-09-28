"use strict";
/**
 * GXEON Payment & Checkout Input Validation
 * Hardened validation routines for user inputs and state machine invariants.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCheckoutInput = validateCheckoutInput;
exports.canTransitionPaymentState = canTransitionPaymentState;
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const REQUEST_ID_REGEX = /^[a-zA-Z0-9_\-:]{6,128}$/;
function validateCheckoutInput(input) {
    if (!input || typeof input !== 'object') {
        return { valid: false, error: 'Payload must be a non-null JSON object' };
    }
    const payload = input;
    // 1. requestId
    if (typeof payload.requestId !== 'string' || !REQUEST_ID_REGEX.test(payload.requestId.trim())) {
        return { valid: false, error: 'requestId must be an alphanumeric string between 6 and 128 chars' };
    }
    // 2. customerName
    if (typeof payload.customerName !== 'string' || payload.customerName.trim().length < 2 || payload.customerName.trim().length > 100) {
        return { valid: false, error: 'customerName must be between 2 and 100 characters' };
    }
    // 3. customerEmail
    if (typeof payload.customerEmail !== 'string' || !EMAIL_REGEX.test(payload.customerEmail.trim()) || payload.customerEmail.length > 254) {
        return { valid: false, error: 'customerEmail must be a valid email address' };
    }
    // 4. problemSummary
    if (typeof payload.problemSummary !== 'string' || payload.problemSummary.trim().length < 10 || payload.problemSummary.trim().length > 2000) {
        return { valid: false, error: 'problemSummary must be between 10 and 2000 characters' };
    }
    // 5. repoOrCodeUrl
    if (typeof payload.repoOrCodeUrl !== 'string' || payload.repoOrCodeUrl.trim().length < 5 || payload.repoOrCodeUrl.trim().length > 500) {
        return { valid: false, error: 'repoOrCodeUrl must be between 5 and 500 characters' };
    }
    const trimmedUrl = payload.repoOrCodeUrl.trim();
    try {
        const parsed = new URL(trimmedUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { valid: false, error: 'repoOrCodeUrl must use http: or https: scheme' };
        }
    }
    catch {
        return { valid: false, error: 'repoOrCodeUrl must be a valid RFC 3986 URL' };
    }
    return {
        valid: true,
        data: {
            requestId: payload.requestId.trim(),
            customerName: payload.customerName.trim(),
            customerEmail: payload.customerEmail.trim().toLowerCase(),
            problemSummary: payload.problemSummary.trim(),
            repoOrCodeUrl: trimmedUrl,
        },
    };
}
/**
 * Validates state transitions in accordance with Phase 6:
 * CUSTOMER_CREATED -> CHECKOUT_CREATED -> PAYMENT_PENDING -> PAYMENT_SUCCEEDED ->
 * JOB_CREATED -> EXECUTING -> QA_PASSED -> DELIVERED -> FUNDS_PENDING ->
 * FUNDS_AVAILABLE_STRIPE -> PAYOUT_PENDING -> PAYOUT_PAID_TO_BANK
 */
const VALID_TRANSITIONS = {
    CUSTOMER_CREATED: ['CHECKOUT_CREATED', 'FAILED'],
    CHECKOUT_CREATED: ['PAYMENT_PENDING', 'FAILED'],
    PAYMENT_PENDING: ['PAYMENT_SUCCEEDED', 'FAILED'],
    PAYMENT_SUCCEEDED: ['JOB_CREATED', 'REFUNDED'],
    JOB_CREATED: ['EXECUTING', 'FAILED', 'REFUNDED'],
    EXECUTING: ['QA_PASSED', 'FAILED', 'REFUNDED'],
    QA_PASSED: ['DELIVERED', 'FAILED', 'REFUNDED'],
    DELIVERED: ['FUNDS_PENDING', 'REFUNDED'],
    FUNDS_PENDING: ['FUNDS_AVAILABLE_STRIPE', 'REFUNDED'],
    FUNDS_AVAILABLE_STRIPE: ['PAYOUT_PENDING', 'REFUNDED'],
    PAYOUT_PENDING: ['PAYOUT_PAID_TO_BANK', 'FAILED'],
    PAYOUT_PAID_TO_BANK: [], // Terminal success
    FAILED: [], // Terminal failure
    REFUNDED: [], // Terminal refund
};
function canTransitionPaymentState(from, to) {
    if (from === to)
        return true;
    const allowed = VALID_TRANSITIONS[from];
    return Boolean(allowed && allowed.includes(to));
}
//# sourceMappingURL=paymentValidation.js.map