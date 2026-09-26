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

  it('declares truthful status and capabilities for RustChain adapter', () => {
    const rtc = walletRegistry.getAdapter('rustchain');
    expect(rtc).toBeDefined();
    expect(rtc?.status).toBe('PARTIAL');
    expect(rtc?.hasCapability('WATCH_ONLY')).toBe(true);
    expect(rtc?.isCapabilityAvailable('WATCH_ONLY')).toBe(true);
    expect(rtc?.isCapabilityAvailable('READ_BALANCE')).toBe(false);
    expect(rtc?.isCapabilityAvailable('READ_TRANSACTIONS')).toBe(false);
    expect(rtc?.hasCapability('SEND')).toBe(false);
  });

  it('marks Solana adapter strictly as COMING_SOON without simulated connection', () => {
    const solana = walletRegistry.getAdapter('solana');
    expect(solana).toBeDefined();
    expect(solana?.status).toBe('COMING_SOON');
    expect(solana?.isCapabilityAvailable('CONNECT')).toBe(false);
  });

  it('computes dynamic network counts without hardcoding', () => {
    const counts = walletRegistry.getNetworkCounts();
    expect(counts.total).toBe(4);
    expect(counts.active).toBe(1); // EVM
    expect(counts.partial).toBe(2); // RustChain, Coinbase
    expect(counts.comingSoon).toBe(1); // Solana
  });

  it('formats addresses safely with proper truncation', () => {
    const rtcAddr = 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269';
    const formattedRtc = walletRegistry.formatAddress('rustchain', rtcAddr);
    expect(formattedRtc).toBe('RTC82c21...127269');

    const evmAddr = '0x1234567890abcdef1234567890abcdef12345678';
    const formattedEvm = walletRegistry.formatAddress('evm', evmAddr);
    expect(formattedEvm).toBe('0x1234...5678');
  });

  it('returns adapter info objects with sourceStatus and capability details', () => {
    const infos = walletRegistry.getAdapterInfos();
    expect(infos.length).toBe(4);
    const rtcInfo = infos.find((i) => i.id === 'rustchain');
    expect(rtcInfo?.sourceStatus).toContain('NOT CONFIGURED');
    const evmInfo = infos.find((i) => i.id === 'evm-metamask');
    expect(evmInfo?.supportedChains).toContain('Ethereum Mainnet');
  });
});
