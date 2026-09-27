/**
 * GXEON Machine-to-Machine (M2M) Agent Economy Service Contracts
 * Prepares service descriptors and routing types for autonomous agent consumption.
 */

export interface M2MServiceDescriptor {
  id: string;
  name: string;
  description: string;
  machineCallable: boolean;
  inputType: string;
  outputType: string;
  pricingModel: 'per_item' | 'fixed' | 'usage';
  status: 'preview' | 'active' | 'deprecated';
}

export const M2M_SERVICES: M2MServiceDescriptor[] = [
  {
    id: 'url_verify',
    name: 'GXEON URL Verify',
    description: 'Cryptographic accessibility, canonical metadata, and security verification of remote Web3 endpoints.',
    machineCallable: true,
    inputType: 'url[]',
    outputType: 'verification[]',
    pricingModel: 'per_item',
    status: 'preview',
  },
  {
    id: 'contract_audit_fast',
    name: 'GXEON Quick Audit',
    description: 'Static heuristic analysis of EVM / Solana smart contract bytecode against vulnerability matrices.',
    machineCallable: true,
    inputType: 'address_or_code',
    outputType: 'audit_summary',
    pricingModel: 'fixed',
    status: 'preview',
  },
];

export interface M2MQuoteRequest {
  serviceId: string;
  itemsCount: number;
  metadata?: Record<string, unknown>;
}

export interface M2MJobSubmission {
  serviceId: string;
  input: unknown;
  callbackUrl?: string;
}

export interface M2MJobStatus {
  id: string;
  serviceId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  submittedAt: string;
  completedAt?: string;
  result?: unknown;
}
