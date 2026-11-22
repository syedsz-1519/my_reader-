import { describe, expect, it } from 'vitest';
import { assertSafePublicUrl, isPrivateOrReservedIp, SsrfError } from '../../../server/ssrfGuard';

describe('SSRF Guard', () => {
  it('blocks private, loopback, link-local, and metadata IP addresses', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('100.64.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('0.0.0.0')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
    expect(isPrivateOrReservedIp('fd12::1')).toBe(true);
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:169.254.169.254')).toBe(true);
  });

  it('allows public IP addresses', () => {
    expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false);
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
  });

  it('blocks localhost, internal hostnames, file/ftp protocols, and credential URLs', async () => {
    const fakePublicDns = async () => [{ address: '93.184.216.34' }];
    await expect(assertSafePublicUrl('http://localhost:3000', fakePublicDns)).rejects.toThrow(SsrfError);
    await expect(assertSafePublicUrl('http://metadata.google.internal/computeMetadata/v1', fakePublicDns)).rejects.toThrow(SsrfError);
    await expect(assertSafePublicUrl('http://service.internal/secret', fakePublicDns)).rejects.toThrow(SsrfError);
    await expect(assertSafePublicUrl('file:///etc/passwd', fakePublicDns)).rejects.toThrow(SsrfError);
    await expect(assertSafePublicUrl('https://user:pass@example.com/page', fakePublicDns)).rejects.toThrow(SsrfError);
    await expect(assertSafePublicUrl('http://127.0.0.1:8880', fakePublicDns)).rejects.toThrow(SsrfError);
  });

  it('blocks DNS hostnames resolving to private IPs', async () => {
    const privateDns = async () => [{ address: '10.2.3.4' }];
    await expect(assertSafePublicUrl('https://rebind.example.com/article', privateDns)).rejects.toThrow(SsrfError);
  });

  it('permits public URLs resolving to public IPs', async () => {
    const publicDns = async () => [{ address: '93.184.216.34' }];
    const parsed = await assertSafePublicUrl('https://example.com/article', publicDns);
    expect(parsed.hostname).toBe('example.com');
  });
});
