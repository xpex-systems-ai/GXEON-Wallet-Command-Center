import dns from 'node:dns/promises';
import { describe, it, expect, vi } from 'vitest';
import { isIpBlocked, validateTargetUrl } from '../../src/agent-economy/antiSsrf.js';

describe('GXEON Anti-SSRF Defense Suite', () => {
  describe('IP CIDR Blocking', () => {
    it('blocks IPv4 loopback (127.0.0.0/8)', () => {
      expect(isIpBlocked('127.0.0.1').blocked).toBe(true);
      expect(isIpBlocked('127.100.50.1').blocked).toBe(true);
    });

    it('blocks RFC1918 private IPv4 ranges (10/8, 172.16/12, 192.168/16)', () => {
      expect(isIpBlocked('10.0.0.1').blocked).toBe(true);
      expect(isIpBlocked('10.255.255.254').blocked).toBe(true);
      expect(isIpBlocked('172.16.0.1').blocked).toBe(true);
      expect(isIpBlocked('172.31.255.255').blocked).toBe(true);
      expect(isIpBlocked('192.168.1.1').blocked).toBe(true);
      expect(isIpBlocked('192.168.0.254').blocked).toBe(true);
    });

    it('blocks link-local and cloud metadata (169.254.0.0/16)', () => {
      expect(isIpBlocked('169.254.169.254').blocked).toBe(true);
      expect(isIpBlocked('169.254.1.1').blocked).toBe(true);
    });

    it('blocks carrier grade NAT and reserved IPv4 (100.64/10, 0/8, 240/4)', () => {
      expect(isIpBlocked('0.0.0.0').blocked).toBe(true);
      expect(isIpBlocked('100.64.0.1').blocked).toBe(true);
      expect(isIpBlocked('240.0.0.1').blocked).toBe(true);
    });

    it('blocks IPv6 loopback, unspecified, unique-local, and link-local', () => {
      expect(isIpBlocked('::1').blocked).toBe(true);
      expect(isIpBlocked('::').blocked).toBe(true);
      expect(isIpBlocked('fc00::1').blocked).toBe(true);
      expect(isIpBlocked('fd12:3456::1').blocked).toBe(true);
      expect(isIpBlocked('fe80::1').blocked).toBe(true);
    });

    it('blocks IPv4-mapped IPv6 pointing to private addresses', () => {
      expect(isIpBlocked('::ffff:127.0.0.1').blocked).toBe(true);
      expect(isIpBlocked('::ffff:192.168.1.1').blocked).toBe(true);
      expect(isIpBlocked('::ffff:169.254.169.254').blocked).toBe(true);
    });

    it('allows safe public IPv4 and IPv6 addresses', () => {
      expect(isIpBlocked('8.8.8.8').blocked).toBe(false);
      expect(isIpBlocked('1.1.1.1').blocked).toBe(false);
      expect(isIpBlocked('93.184.216.34').blocked).toBe(false); // example.com
      expect(isIpBlocked('2606:4700:4700::1111').blocked).toBe(false); // Cloudflare IPv6
    });
  });

  describe('URL Scheme and Host Validation', () => {
    it('rejects forbidden URI schemes (file, ftp, gopher, data, javascript)', async () => {
      const fileRes = await validateTargetUrl('file:///etc/passwd');
      expect(fileRes.safe).toBe(false);
      expect(fileRes.reason).toContain('DISALLOWED_SCHEME');

      const ftpRes = await validateTargetUrl('ftp://example.com/file');
      expect(ftpRes.safe).toBe(false);

      const gopherRes = await validateTargetUrl('gopher://example.com');
      expect(gopherRes.safe).toBe(false);

      const dataRes = await validateTargetUrl('data:text/html;base64,PHNjcmlwdD4=');
      expect(dataRes.safe).toBe(false);

      const jsRes = await validateTargetUrl('javascript:alert(1)');
      expect(jsRes.safe).toBe(false);
    });

    it('rejects metadata hosts and local suffixes', async () => {
      const gcpMeta = await validateTargetUrl('http://metadata.google.internal/computeMetadata/v1/');
      expect(gcpMeta.safe).toBe(false);

      const awsMeta = await validateTargetUrl('http://169.254.169.254/latest/meta-data/');
      expect(awsMeta.safe).toBe(false);

      const localHost = await validateTargetUrl('http://localhost:8080/admin');
      expect(localHost.safe).toBe(false);

      const internalDomain = await validateTargetUrl('http://db.service.internal:5432');
      expect(internalDomain.safe).toBe(false);

      const dotLocal = await validateTargetUrl('http://myhost.local/');
      expect(dotLocal.safe).toBe(false);
    });

    it('validates and accepts legitimate public HTTPS URLs', async () => {
      const lookup = vi.spyOn(dns, 'lookup').mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as any);
      const res = await validateTargetUrl('https://example.com');
      lookup.mockRestore();
      expect(res.safe).toBe(true);
      expect(res.urlObj?.hostname).toBe('example.com');
      expect(res.resolvedIps?.length).toBeGreaterThan(0);
    });
  });
});
