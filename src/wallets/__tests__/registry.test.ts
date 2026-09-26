import { describe, it, expect } from 'vitest';
import { walletRegistry } from '../registry';

describe('WalletRegistry & Adapters', () => {
  it('registers all required adapters', () => {
    const adapters = walletRegistry.getAllAdapters();
    const ids = adapters.map((a) => a.id);
    expect(ids).toContain('rustchain');
    expect(ids).toContain('evm-metamask');
    expect(ids).toContain('coinbase-wallet');
    expect(ids).toContain('solana');
  });

  it('declares proper capabilities for RustChain adapter', () => {
    const rtc = walletRegistry.getAdapter('rustchain');
    expect(rtc).toBeDefined();
    expect(rtc?.status).toBe('ACTIVE');
    expect(rtc?.hasCapability('READ_BALANCE')).toBe(true);
    expect(rtc?.hasCapability('READ_TRANSACTIONS')).toBe(true);
    expect(rtc?.hasCapability('WATCH_ONLY')).toBe(true);
    expect(rtc?.hasCapability('SEND')).toBe(false);
  });

  it('marks Solana adapter strictly as COMING_SOON without fake connection', () => {
    const solana = walletRegistry.getAdapter('solana');
    expect(solana).toBeDefined();
    expect(solana?.status).toBe('COMING_SOON');
    expect(solana?.hasCapability('CONNECT')).toBe(false);
  });

  it('formats addresses safely with proper truncation', () => {
    const rtcAddr = 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269';
    const formattedRtc = walletRegistry.formatAddress('rustchain', rtcAddr);
    expect(formattedRtc).toBe('RTC82c21...127269');

    const evmAddr = '0x1234567890abcdef1234567890abcdef12345678';
    const formattedEvm = walletRegistry.formatAddress('evm', evmAddr);
    expect(formattedEvm).toBe('0x1234...5678');
  });

  it('returns adapter info objects with descriptions and status', () => {
    const infos = walletRegistry.getAdapterInfos();
    expect(infos.length).toBeGreaterThanOrEqual(4);
    const evmInfo = infos.find((i) => i.id === 'evm-metamask');
    expect(evmInfo?.supportedChains).toContain('Ethereum Mainnet');
    expect(evmInfo?.supportedChains).toContain('Base');
  });
});
