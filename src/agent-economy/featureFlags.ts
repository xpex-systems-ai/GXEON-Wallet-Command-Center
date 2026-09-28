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
  return {
    marketEnabled: process.env.GXEON_AGENT_MARKET_ENABLED !== undefined
      ? process.env.GXEON_AGENT_MARKET_ENABLED === 'true'
      : true,
    demandRadarEnabled: process.env.GXEON_DEMAND_RADAR_ENABLED !== undefined
      ? process.env.GXEON_DEMAND_RADAR_ENABLED === 'true'
      : true,
    urlVerifyEnabled: process.env.GXEON_URL_VERIFY_ENABLED !== undefined
      ? process.env.GXEON_URL_VERIFY_ENABLED === 'true'
      : true,
    apiHealthEnabled: process.env.GXEON_API_HEALTH_ENABLED !== undefined
      ? process.env.GXEON_API_HEALTH_ENABLED === 'true'
      : false, // Draft by default
    jsonValidateEnabled: process.env.GXEON_JSON_VALIDATE_ENABLED !== undefined
      ? process.env.GXEON_JSON_VALIDATE_ENABLED === 'true'
      : true,
    meteredBillingEnabled: process.env.GXEON_METERED_BILLING_ENABLED !== undefined
      ? process.env.GXEON_METERED_BILLING_ENABLED === 'true'
      : false,
  };
}
