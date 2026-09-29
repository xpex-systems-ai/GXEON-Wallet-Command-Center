/**
 * GXEON Agent Economy Feature Flags
 * Fail closed in production.
 */

export interface AgentMarketFeatureFlags {
  marketEnabled: boolean;
  demandRadarEnabled: boolean;
  urlVerifyEnabled: boolean;
  apiHealthEnabled: boolean;
  jsonValidateEnabled: boolean;
  meteredBillingEnabled: boolean;
}

export function getFeatureFlags(): AgentMarketFeatureFlags {
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

  return {
    marketEnabled: process.env.GXEON_AGENT_MARKET_ENABLED !== undefined
      ? process.env.GXEON_AGENT_MARKET_ENABLED === 'true'
      : isTest,
    demandRadarEnabled: process.env.GXEON_DEMAND_RADAR_ENABLED !== undefined
      ? process.env.GXEON_DEMAND_RADAR_ENABLED === 'true'
      : isTest,
    urlVerifyEnabled: process.env.GXEON_URL_VERIFY_ENABLED !== undefined
      ? process.env.GXEON_URL_VERIFY_ENABLED === 'true'
      : isTest,
    apiHealthEnabled: process.env.GXEON_API_HEALTH_ENABLED !== undefined
      ? process.env.GXEON_API_HEALTH_ENABLED === 'true'
      : false, // Draft by default
    jsonValidateEnabled: process.env.GXEON_JSON_VALIDATE_ENABLED !== undefined
      ? process.env.GXEON_JSON_VALIDATE_ENABLED === 'true'
      : isTest,
    meteredBillingEnabled: process.env.GXEON_METERED_BILLING_ENABLED !== undefined
      ? process.env.GXEON_METERED_BILLING_ENABLED === 'true'
      : false,
  };
}


export function isServiceFeatureEnabled(serviceId: string): boolean {
  const flags = getFeatureFlags();
  if (serviceId === 'gxeon_url_verify_v1') return flags.urlVerifyEnabled;
  if (serviceId === 'gxeon_json_validate_v1') return flags.jsonValidateEnabled;
  if (serviceId === 'gxeon_api_health_v1') return flags.apiHealthEnabled;
  return false;
}
