import { AutonomousCandidate, QualificationResult } from './types.js';

export class GxeonQualifier {
  /**
   * Evaluates machine candidate compatibility.
   * Only advances when fitScore >= 80.
   */
  qualifyCandidate(candidate: AutonomousCandidate): QualificationResult {
    let score = 0;

    const capabilityMatch = candidate.compatibleCapability !== 'NONE';
    if (capabilityMatch) score += 40;

    const machineCallable =
      Boolean(candidate.resourceUrl) &&
      (candidate.resourceUrl.startsWith('https://') || candidate.resourceUrl.startsWith('http://'));
    if (machineCallable) score += 20;

    const acceptedProtocol = ['x402', 'mcp', 'rest_api'].includes(candidate.machineContactMethod);
    if (acceptedProtocol) score += 15;

    const pricingCompatible =
      candidate.observedPrice === null ||
      candidate.observedPrice === undefined ||
      (candidate.observedPrice > 0 && candidate.observedPrice <= 10.0);
    if (pricingCompatible) score += 15;

    const recentUsageSignal = Boolean(candidate.calls30d && candidate.calls30d > 0);
    if (recentUsageSignal) score += 10;

    const fitScore = Math.min(100, score);
    const qualified = fitScore >= 80;

    return {
      fitScore,
      qualified,
      criteria: {
        capabilityMatch,
        machineCallable,
        publicEndpoint: machineCallable,
        acceptedProtocol,
        pricingCompatible,
        recentUsageSignal,
      },
      rejectionReason: qualified
        ? undefined
        : `Candidate fit score (${fitScore}) below threshold (80). Capability: ${candidate.compatibleCapability}`,
    };
  }

  processAndAdvance(candidate: AutonomousCandidate): AutonomousCandidate {
    const result = this.qualifyCandidate(candidate);
    return {
      ...candidate,
      fitScore: result.fitScore,
      status: result.qualified ? 'QUALIFIED' : 'REJECTED',
    };
  }
}
