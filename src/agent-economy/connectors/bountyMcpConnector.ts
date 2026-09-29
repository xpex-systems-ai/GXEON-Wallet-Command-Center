const BOUNTY_MCP_URL = 'https://api.trybounty.ai/mcp';

type JsonRpcEnvelope = {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

const READ_TOOLS = new Set([
  'bounty_list_open',
  'bounty_get',
  'bounty_list_messages',
]);

const WRITE_TOOLS = new Set([
  'bounty_post_comment',
  'bounty_send_message',
  'bounty_claim',
  'bounty_submit',
  'bounty_create_attachment',
  'bounty_complete_attachment',
]);

function getBountyApiKey(): string {
  const key = process.env.BOUNTY_AGENT_API_KEY?.trim();
  if (!key) {
    throw new Error('BOUNTY_NOT_CONFIGURED: missing BOUNTY_AGENT_API_KEY');
  }
  return key;
}

export function getBountyIntegrationStatus() {
  return {
    provider: 'Bounty',
    baseUrl: 'https://api.trybounty.ai',
    mcpUrl: BOUNTY_MCP_URL,
    configured: Boolean(process.env.BOUNTY_AGENT_API_KEY?.trim()),
    writeEnabled: process.env.GXEON_BOUNTY_AUTONOMOUS_WRITES_ENABLED === 'true',
    payoutRail: 'Stripe Connect',
    payoutCountrySupport: 'Brazil supported by provider documentation',
    moneyTruth: 'Only provider-settled work counts as revenue.',
  };
}

async function rpc(request: JsonRpcEnvelope): Promise<JsonRpcResponse> {
  const apiKey = getBountyApiKey();
  const response = await fetch(BOUNTY_MCP_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(request),
  });

  const raw = await response.text();
  let body: JsonRpcResponse;
  try {
    body = JSON.parse(raw) as JsonRpcResponse;
  } catch {
    throw new Error(`BOUNTY_PROTOCOL_ERROR: HTTP ${response.status} returned non-JSON payload`);
  }

  if (!response.ok) {
    throw new Error(`BOUNTY_HTTP_${response.status}: ${body.error?.message || raw.slice(0, 300)}`);
  }
  if (body.error) {
    throw new Error(`BOUNTY_RPC_ERROR: ${body.error.message || 'unknown remote MCP error'}`);
  }
  return body;
}

export async function listBountyRemoteTools() {
  const request: JsonRpcEnvelope = {
    jsonrpc: '2.0',
    id: `gxeon_bounty_tools_${Date.now()}`,
    method: 'tools/list',
    params: {},
  };
  const response = await rpc(request);
  return response.result;
}

export async function callBountyTool(
  toolName: string,
  args: Record<string, unknown> = {}
) {
  const allowed = READ_TOOLS.has(toolName) || WRITE_TOOLS.has(toolName);
  if (!allowed) {
    throw new Error(`BOUNTY_TOOL_NOT_ALLOWED: ${toolName}`);
  }

  if (
    WRITE_TOOLS.has(toolName) &&
    process.env.GXEON_BOUNTY_AUTONOMOUS_WRITES_ENABLED !== 'true'
  ) {
    throw new Error(
      'BOUNTY_WRITE_DISABLED: set GXEON_BOUNTY_AUTONOMOUS_WRITES_ENABLED=true after Agent Card, payout setup, and policy review'
    );
  }

  const request: JsonRpcEnvelope = {
    jsonrpc: '2.0',
    id: `gxeon_bounty_call_${Date.now()}`,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  };

  const response = await rpc(request);
  return response.result;
}
