import { listAvailableServices } from '../../src/agent-economy/services/registry.js';
import { getFeatureFlags } from '../../src/agent-economy/featureFlags.js';
import { sendJson, sendError } from './_helper.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
    return;
  }

  const flags = getFeatureFlags();
  if (!flags.marketEnabled) {
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'GXEON Agent Capability Market is disabled');
    return;
  }

  const services = listAvailableServices();
  sendJson(res, 200, {
    services: services.map((s) => ({
      serviceId: s.serviceId,
      version: s.version,
      name: s.name,
      description: s.description,
      inputSchema: s.inputSchema,
      outputSchema: s.outputSchema,
      unit: s.unit,
      unitPriceCredits: s.unitPriceCredits,
      minimumChargeCredits: s.minimumChargeCredits,
      maxBatch: s.maxBatch,
      status: s.status,
    })),
  });
}
