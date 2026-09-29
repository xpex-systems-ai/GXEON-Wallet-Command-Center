const BOUNTY_API_BASE = 'https://api.trybounty.ai';
const BOUNTY_MCP_URL = `${BOUNTY_API_BASE}/mcp`;

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
    baseUrl: BOUNTY_API_BASE,
    mcpUrl: BOUNTY_MCP_URL,
    configured: Boolean(process.env.BOUNTY_AGENT_API_KEY?.trim()),
    writeEnabled: process.env.GXEON_BOUNTY_AUTONOMOUS_WRITES_ENABLED === 'true',
    payoutRail: 'Stripe Connect',
    payoutCountrySupport: 'Brazil supported by provider documentation',
    moneyTruth: 'Only provider-settled work counts as revenue.',
  };
}

async function bountyFetchJson(
  path: string,
  init: RequestInit = {}
): Promise<any> {
  const apiKey = getBountyApiKey();
  const response = await fetch(`${BOUNTY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  const raw = await response.text();
  let body: any = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Error(
        `BOUNTY_PROTOCOL_ERROR: HTTP ${response.status} returned non-JSON payload`
      );
    }
  }

  if (!response.ok) {
    const message =
      body?.error?.message ||
      body?.message ||
      raw.slice(0, 300) ||
      response.statusText;
    throw new Error(`BOUNTY_HTTP_${response.status}: ${message}`);
  }

  return body;
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
    const ssePayloads = raw
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter((value) => value && value !== '[DONE]');

    let parsed: JsonRpcResponse | null = null;
    for (let index = ssePayloads.length - 1; index >= 0; index -= 1) {
      try {
        parsed = JSON.parse(ssePayloads[index]) as JsonRpcResponse;
        break;
      } catch {
        // Continue until a valid JSON event is found.
      }
    }

    if (!parsed) {
      throw new Error(
        `BOUNTY_PROTOCOL_ERROR: HTTP ${response.status} returned unsupported MCP payload`
      );
    }
    body = parsed;
  }

  if (!response.ok) {
    throw new Error(
      `BOUNTY_HTTP_${response.status}: ${body.error?.message || raw.slice(0, 300)}`
    );
  }
  if (body.error) {
    throw new Error(
      `BOUNTY_RPC_ERROR: ${body.error.message || 'unknown remote MCP error'}`
    );
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

async function callBountyReadTool(
  toolName: string,
  args: Record<string, unknown>
) {
  if (toolName === 'bounty_list_open') {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined && value !== null && value !== '') {
        search.set(key, String(value));
      }
    }
    const suffix = search.size ? `?${search.toString()}` : '';
    return bountyFetchJson(`/v1/agent/bounties${suffix}`);
  }

  const bountyId = String(args.bounty_id || args.bountyId || '').trim();
  if (!bountyId) {
    throw new Error(`BOUNTY_INVALID_INPUT: ${toolName} requires bounty_id`);
  }

  if (toolName === 'bounty_get') {
    return bountyFetchJson(
      `/v1/agent/bounties/${encodeURIComponent(bountyId)}`
    );
  }

  if (toolName === 'bounty_list_messages') {
    return bountyFetchJson(
      `/v1/agent/bounties/${encodeURIComponent(bountyId)}/messages`
    );
  }

  throw new Error(`BOUNTY_TOOL_NOT_ALLOWED: ${toolName}`);
}

export async function callBountyTool(
  toolName: string,
  args: Record<string, unknown> = {}
) {
  const allowed = READ_TOOLS.has(toolName) || WRITE_TOOLS.has(toolName);
  if (!allowed) {
    throw new Error(`BOUNTY_TOOL_NOT_ALLOWED: ${toolName}`);
  }

  if (READ_TOOLS.has(toolName)) {
    return callBountyReadTool(toolName, args);
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
