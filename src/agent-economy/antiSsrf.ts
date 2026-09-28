import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * GXEON Strict Anti-SSRF Defense Engine
 *
 * Implements multi-tier SSRF protection:
 * 1. Protocol allowlist (http/https only)
 * 2. Hostname blocklist (cloud metadata, localhost, internal domains)
 * 3. Pre-flight DNS resolution (IPv4 + IPv6)
 * 4. Comprehensive IP CIDR blocklist (private, loopback, link-local, carrier NAT, metadata)
 * 5. Strict manual redirect validation on each hop
 * 6. Hard timeout & byte limits to prevent slowloris/exhaustion
 */

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.aws.internal',
  'instance-data',
  'vault',
  'consul',
]);

const BLOCKED_HOST_SUFFIXES = [
  '.local',
  '.internal',
  '.localhost',
  '.corp',
  '.lan',
  '.home',
  '.arpa',
];

function ipv4ToNumber(ip: string): number {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function isIpBlocked(ip: string): { blocked: boolean; reason?: string } {
  // Check for IPv4 mapped IPv6 (e.g., ::ffff:192.168.1.1)
  const lowerIp = ip.toLowerCase().trim();

  if (lowerIp.startsWith('::ffff:')) {
    const rawV4 = lowerIp.substring(7);
    if (net.isIPv4(rawV4)) {
      return isIpBlocked(rawV4);
    }
  }

  // IPv4 Checks
  if (net.isIPv4(ip)) {
    let num: number;
    try {
      num = ipv4ToNumber(ip);
    } catch {
      return { blocked: true, reason: 'MALFORMED_IP' };
    }

    // 0.0.0.0/8 (Current network)
    if ((num >>> 24) === 0) return { blocked: true, reason: 'RESERVED_CURRENT_NETWORK_0/8' };

    // 127.0.0.0/8 (Loopback)
    if ((num >>> 24) === 127) return { blocked: true, reason: 'LOOPBACK_127/8' };

    // 10.0.0.0/8 (RFC1918 Private)
    if ((num >>> 24) === 10) return { blocked: true, reason: 'PRIVATE_RFC1918_10/8' };

    // 172.16.0.0/12 (RFC1918 Private: 172.16.0.0 - 172.31.255.255)
    if ((num >>> 20) === (0xac100000 >>> 20)) {
      return { blocked: true, reason: 'PRIVATE_RFC1918_172.16/12' };
    }

    // 192.168.0.0/16 (RFC1918 Private)
    if ((num >>> 16) === (0xc0a80000 >>> 16)) {
      return { blocked: true, reason: 'PRIVATE_RFC1918_192.168/16' };
    }

    // 169.254.0.0/16 (Link Local & Cloud Metadata)
    if ((num >>> 16) === (0xa9fe0000 >>> 16)) {
      return { blocked: true, reason: 'LINK_LOCAL_METADATA_169.254/16' };
    }

    // 100.64.0.0/10 (Carrier Grade NAT)
    if ((num >>> 22) === (0x64400000 >>> 22)) {
      return { blocked: true, reason: 'CARRIER_GRADE_NAT_100.64/10' };
    }

    // 198.18.0.0/15 (Benchmarking)
    if ((num >>> 17) === (0xc6120000 >>> 17)) {
      return { blocked: true, reason: 'BENCHMARK_NETWORK_198.18/15' };
    }

    // 224.0.0.0/4 (Multicast)
    if ((num >>> 28) === 14) return { blocked: true, reason: 'MULTICAST_224/4' };

    // 240.0.0.0/4 (Reserved / Future use)
    if ((num >>> 28) === 15) return { blocked: true, reason: 'RESERVED_240/4' };

    return { blocked: false };
  }

  // IPv6 Checks
  if (net.isIPv6(ip)) {
    // ::1 loopback
    if (lowerIp === '::1' || lowerIp === '0:0:0:0:0:0:0:1') {
      return { blocked: true, reason: 'IPV6_LOOPBACK' };
    }

    // :: unspecified
    if (lowerIp === '::' || lowerIp === '0:0:0:0:0:0:0:0') {
      return { blocked: true, reason: 'IPV6_UNSPECIFIED' };
    }

    // Unique Local Addresses (fc00::/7 - starts with fc or fd)
    if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) {
      return { blocked: true, reason: 'IPV6_UNIQUE_LOCAL_FC00' };
    }

    // Link-local Unicast (fe80::/10 - fe80 through febf)
    if (
      lowerIp.startsWith('fe8') ||
      lowerIp.startsWith('fe9') ||
      lowerIp.startsWith('fea') ||
      lowerIp.startsWith('feb')
    ) {
      return { blocked: true, reason: 'IPV6_LINK_LOCAL_FE80' };
    }

    return { blocked: false };
  }

  return { blocked: true, reason: 'UNKNOWN_IP_FAMILY' };
}

export interface UrlValidationResult {
  safe: boolean;
  reason?: string;
  urlObj?: URL;
  resolvedIps?: string[];
}

export async function validateTargetUrl(rawUrl: string): Promise<UrlValidationResult> {
  let urlObj: URL;
  try {
    urlObj = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'INVALID_URL_SYNTAX' };
  }

  // 1. Protocol validation
  if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
    return { safe: false, reason: `DISALLOWED_SCHEME_${urlObj.protocol.replace(':', '')}` };
  }

  const hostname = urlObj.hostname.toLowerCase().trim();

  // 2. Hostname blocklist
  if (BLOCKED_HOSTS.has(hostname)) {
    return { safe: false, reason: `BLOCKED_HOST_${hostname}` };
  }

  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return { safe: false, reason: `BLOCKED_DOMAIN_SUFFIX_${suffix}` };
    }
  }

  // If hostname is directly an IP literal
  if (net.isIP(hostname)) {
    const check = isIpBlocked(hostname);
    if (check.blocked) {
      return { safe: false, reason: `BLOCKED_IP_${check.reason}` };
    }
    return { safe: true, urlObj, resolvedIps: [hostname] };
  }

  // 3. DNS Pre-Resolution Validation
  try {
    const lookups = await dns.lookup(hostname, { all: true });
    if (!lookups || lookups.length === 0) {
      return { safe: false, reason: 'DNS_RESOLUTION_EMPTY' };
    }

    const resolvedIps = lookups.map((l) => l.address);
    for (const item of lookups) {
      const check = isIpBlocked(item.address);
      if (check.blocked) {
        return {
          safe: false,
          reason: `RESOLVED_BLOCKED_IP_${check.reason}_(${item.address})`,
          resolvedIps,
        };
      }
    }

    return { safe: true, urlObj, resolvedIps };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { safe: false, reason: `DNS_RESOLUTION_FAILED_${msg}` };
  }
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  finalUrl: string;
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  redirectCount: number;
  latencyMs: number;
  tlsValid: boolean;
  dnsResolved: boolean;
  resolvedIps: string[];
  bodySnippet: string;
}

/**
 * Execute an anti-SSRF safe HTTP request with manual hop-by-hop redirect verification.
 */
export async function safeHttpRequest(
  initialUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? 5;
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxBytes = options.maxBytes ?? 1_048_576; // 1MB limit

  let currentUrl = initialUrl;
  let redirectCount = 0;
  const startTime = Date.now();
  const allResolvedIps: string[] = [];

  while (redirectCount <= maxRedirects) {
    const val = await validateTargetUrl(currentUrl);
    if (!val.safe || !val.urlObj) {
      throw new Error(`SSRF Blocked on hop ${redirectCount} (${currentUrl}): ${val.reason}`);
    }

    if (val.resolvedIps) {
      allResolvedIps.push(...val.resolvedIps);
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual', // Strictly manual redirect handling
        signal: controller.signal,
        headers: {
          'User-Agent': 'GXEON-Capability-Worker/1.0 (+https://gxeon.com/agent)',
          Accept: '*/*',
          ...(options.headers || {}),
        },
      });

      clearTimeout(timeoutHandle);

      // Check if redirect
      const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
      if (isRedirect) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error(`Redirect HTTP ${response.status} missing Location header`);
        }

        // Resolve relative redirects against current URL
        const nextUrl = new URL(location, currentUrl).toString();
        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      // Normal response
      const latencyMs = Date.now() - startTime;
      const headersRecord: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        headersRecord[k.toLowerCase()] = v;
      });

      // Read bounded body
      let bodySnippet = '';
      if (response.body) {
        const reader = response.body.getReader();
        let received = 0;
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            received += value.length;
            if (received <= maxBytes) {
              chunks.push(value);
            } else {
              reader.cancel();
              break;
            }
          }
        }

        const totalBuf = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
        let offset = 0;
        for (const c of chunks) {
          totalBuf.set(c, offset);
          offset += c.length;
        }
        bodySnippet = new TextDecoder().decode(totalBuf).slice(0, 4096);
      }

      const tlsValid = val.urlObj.protocol === 'https:';

      return {
        finalUrl: currentUrl,
        statusCode: response.status,
        statusText: response.statusText,
        headers: headersRecord,
        redirectCount,
        latencyMs,
        tlsValid,
        dnsResolved: true,
        resolvedIps: Array.from(new Set(allResolvedIps)),
        bodySnippet,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutHandle);
      throw err;
    }
  }

  throw new Error(`Exceeded max redirects limit of ${maxRedirects}`);
}
