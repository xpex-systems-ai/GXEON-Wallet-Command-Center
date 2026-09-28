import crypto from 'node:crypto';
import {
  DemandOpportunity,
  OpportunityStatus,
} from './types.js';
import { getAgentEconomyStore } from './store.js';
import { getService } from './services/registry.js';

export interface RawDemandSignal {
  source: string;
  sourceUrl: string;
  title: string;
  rawDescription: string;
  suggestedReward?: number;
}

export interface ScoreFactors {
  fitScore: number; // 0.0 - 1.0
  effortScore: number; // 0.0 - 1.0 (higher = harder)
  riskScore: number; // 0.0 - 1.0 (higher = riskier)
  confidence: number; // 0.0 - 1.0
  matchedCapability: string;
  status: OpportunityStatus;
  rejectionReason?: string;
}

const FORBIDDEN_KEYWORDS = [
  'hack',
  'bypass',
  'credential',
  'password',
  'ddos',
  'exploit',
  'impersonate',
  'botnet',
  'scam',
  'captcha bypass',
];

export function scoreDemandSignal(signal: RawDemandSignal): ScoreFactors {
  const text = `${signal.title} ${signal.rawDescription}`.toLowerCase();

  // 1. Strict Security Rejection Gate
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (text.includes(kw)) {
      return {
        fitScore: 0,
        effortScore: 1.0,
        riskScore: 1.0,
        confidence: 1.0,
        matchedCapability: 'NONE',
        status: 'REJECTED',
        rejectionReason: `Prohibited activity detected (${kw})`,
      };
    }
  }

  // 2. Capability Matching
  let matchedCapability = 'NONE';
  let fitScore = 0.0;
  let effortScore = 0.5;
  let riskScore = 0.1;
  let confidence = 0.5;

  if (
    text.includes('url') ||
    text.includes('link') ||
    text.includes('broken link') ||
    text.includes('http check') ||
    text.includes('dead link') ||
    text.includes('crawler')
  ) {
    matchedCapability = 'gxeon_url_verify_v1';
    fitScore = 0.95;
    effortScore = 0.2;
    riskScore = 0.15;
    confidence = 0.9;
  } else if (
    text.includes('json') ||
    text.includes('schema') ||
    text.includes('payload validation') ||
    text.includes('validate response')
  ) {
    matchedCapability = 'gxeon_json_validate_v1';
    fitScore = 0.98;
    effortScore = 0.1;
    riskScore = 0.05;
    confidence = 0.95;
  } else if (
    text.includes('api health') ||
    text.includes('uptime') ||
    text.includes('endpoint check') ||
    text.includes('ping api')
  ) {
    matchedCapability = 'gxeon_api_health_v1';
    fitScore = 0.9;
    effortScore = 0.3;
    riskScore = 0.2;
    confidence = 0.85;
  }

  if (matchedCapability === 'NONE') {
    return {
      fitScore: 0.1,
      effortScore: 0.8,
      riskScore: 0.3,
      confidence: 0.4,
      matchedCapability: 'NONE',
      status: 'REJECTED',
      rejectionReason: 'No matching GXEON automated capability found',
    };
  }

  const service = getService(matchedCapability);
  const status: OpportunityStatus =
    service?.status === 'AVAILABLE' && fitScore >= 0.8 && riskScore <= 0.3
      ? 'READY_FOR_OPERATOR'
      : 'QUALIFIED';

  return {
    fitScore,
    effortScore,
    riskScore,
    confidence,
    matchedCapability,
    status,
  };
}

export async function ingestDemandSignal(signal: RawDemandSignal): Promise<DemandOpportunity> {
  const scoring = scoreDemandSignal(signal);
  const opportunityId = `opp_${crypto.randomBytes(8).toString('hex')}`;

  const opportunity: DemandOpportunity = {
    opportunityId,
    source: signal.source,
    sourceUrl: signal.sourceUrl,
    title: signal.title,
    summary: signal.rawDescription.slice(0, 280),
    requiredCapability: scoring.matchedCapability,
    estimatedValue: signal.suggestedReward ?? 25.0,
    fitScore: scoring.fitScore,
    effortScore: scoring.effortScore,
    riskScore: scoring.riskScore,
    confidence: scoring.confidence,
    discoveredAt: new Date().toISOString(),
    status: scoring.status,
  };

  const store = getAgentEconomyStore();
  await store.saveOpportunity(opportunity);

  return opportunity;
}
