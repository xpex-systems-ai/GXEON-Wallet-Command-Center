import { TaskmarketConnector } from '../connectors/taskmarketConnector.js';
import { verifyAwardSettlement } from './chainEvidence.js';
import type { MarketplaceRepository } from './repository.js';

export class TaskmarketSettlementWatcher {
  constructor(private readonly connector: TaskmarketConnector, private readonly repository: MarketplaceRepository,
    private readonly verifier = verifyAwardSettlement) {}
  async reconcile(worker: string): Promise<number> {
    const missions = await this.repository.listMissions(); let recorded = 0;
    for (const mission of missions.filter(m => ['SUBMITTED', 'ACCEPTED', 'SETTLEMENT_PENDING', 'PAID'].includes(m.state))) {
      const task = await this.connector.getTask(mission.taskId);
      for (const award of task.awards) {
        const evidence = await this.verifier(task, award, worker);
        if (!evidence) continue;
        if (await this.repository.recordSettlement(evidence)) recorded++;
        await this.repository.saveMission({ ...mission, state: 'PAID', updatedAt: new Date().toISOString() });
      }
      // Provider acceptance is not proof of funds arriving at this worker.
      if (task.status === 'completed' && mission.state !== 'PAID' && !task.awards.some(a => a.workerAddress.toLowerCase() === worker.toLowerCase())) {
        await this.repository.saveMission({ ...mission, state: 'REJECTED', updatedAt: new Date().toISOString() });
      }
    }
    return recorded;
  }
}
