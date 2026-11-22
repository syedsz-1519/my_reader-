import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  '169.254.169.254',
]);

export function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();

  // Handle IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (net.isIPv4(mapped)) {
      return isPrivateIpv4(mapped);
    }
  }

  if (net.isIPv4(normalized)) {
    return isPrivateIpv4(normalized);
  }

  if (net.isIPv6(normalized)) {
    return isPrivateIpv6(normalized);
  }

  return true;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8 ("this" network)
  if (a === 10) return true; // 10.0.0.0/8 (RFC1918)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local + cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // Benchmarking
  if (a >= 224) return true; // Multicast & reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const clean = ip.split('%')[0].toLowerCase();
  if (clean === '::1' || clean === '::') return true;
  // fc00::/7 (Unique Local Addresses: fc00..fdff)
  if (clean.startsWith('fc') || clean.startsWith('fd')) return true;
  // fe80::/10 (Link-local)
  if (/^fe[89ab][0-9a-f]:/i.test(clean)) return true;
  // Multicast ff00::/8
  if (clean.startsWith('ff')) return true;
  return false;
}

export async function assertSafePublicUrl(
  rawUrl: string,
  lookupFn: (hostname: string) => Promise<Array<{ address: string }>> = (h) =>
    dns.lookup(h, { all: true }),
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError('Invalid URL format.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfError('Only http and https URLs are allowed.');
  }

  if (parsed.username || parsed.password) {
    throw new SsrfError('URLs with embedded credentials are not allowed.');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    throw new SsrfError('Access to local or internal hostnames is blocked.');
  }

  // Direct IP literal check
  if (net.isIP(hostname) !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new SsrfError('Access to private, loopback, or metadata IP addresses is blocked.');
    }
    return parsed;
  }

  // Resolve DNS and verify all A/AAAA records
  let records: Array<{ address: string }>;
  try {
    records = await lookupFn(hostname);
  } catch {
    throw new SsrfError('Could not resolve hostname.');
  }

  if (!records || records.length === 0) {
    throw new SsrfError('Hostname did not resolve to any IP address.');
  }

  for (const rec of records) {
    if (isPrivateOrReservedIp(rec.address)) {
      throw new SsrfError('Target resolves to a blocked private or loopback IP address.');
    }
  }

  return parsed;
}

export class SsrfError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}
