import { MachineCustomerProfile } from './types.js';

export class GxeonRetentionAgent {
  private profiles = new Map<string, MachineCustomerProfile>();

  recordJobCompletion(params: {
    machineCustomerId: string;
    serviceId: string;
    revenueCredits?: number;
    revenueUsdc?: number;
  }): MachineCustomerProfile {
    const { machineCustomerId, serviceId, revenueCredits = 0, revenueUsdc = 0 } = params;
    const now = new Date().toISOString();

    const existing = this.profiles.get(machineCustomerId) || {
      machineCustomerId,
      firstSeen: now,
      lastSeen: now,
      jobsPurchased: 0,
      lifetimeRevenueCredits: 0,
      lifetimeRevenueUsdc: 0,
      preferredCapability: serviceId,
      retentionTier: 'NEW' as const,
    };

    existing.jobsPurchased += 1;
    existing.lifetimeRevenueCredits += revenueCredits;
    existing.lifetimeRevenueUsdc += revenueUsdc;
    existing.lastSeen = now;
    existing.preferredCapability = serviceId;

    if (existing.jobsPurchased >= 100 || existing.lifetimeRevenueUsdc >= 50) {
      existing.retentionTier = 'ENTERPRISE';
    } else if (existing.jobsPurchased >= 20 || existing.lifetimeRevenueUsdc >= 10) {
      existing.retentionTier = 'HIGH_VOLUME';
    } else if (existing.jobsPurchased >= 2) {
      existing.retentionTier = 'ACTIVE';
    }

    this.profiles.set(machineCustomerId, existing);
    return existing;
  }

  getProfile(machineCustomerId: string): MachineCustomerProfile | null {
    return this.profiles.get(machineCustomerId) || null;
  }

  listProfiles(): MachineCustomerProfile[] {
    return Array.from(this.profiles.values());
  }
}
