import { SwarmExecutionAgent } from '../autonomous/quantumSwarm.js';
import { sha256, sourceHash, TaskmarketConnector } from '../connectors/taskmarketConnector.js';
import { verifyTaskFunding } from './chainEvidence.js';
import { qualifyTask } from './qualification.js';
import type { MarketplaceRepository } from './repository.js';
import type { ArtifactManifest, QualificationAssessment, TaskmarketTask } from './types.js';

export function assertNoSecretMaterial(value: unknown): void {
  const text = JSON.stringify(value);
  if (/(?:private[_ -]?key|seed[_ -]?phrase|mnemonic|recovery[_ -]?phrase|BEGIN [A-Z ]*PRIVATE KEY|PAYMENT-SIGNATURE)/i.test(text)) throw new Error('SECRET_MATERIAL_FORBIDDEN');
}

export function buildArtifactManifest(params: {
  task: TaskmarketTask; startedAt: string; completedAt: string;
  files: Array<{ name: string; mimeType: string; content: Uint8Array }>;
  commandsRun: string[]; testResults: Array<{ name: string; passed: boolean }>;
}): ArtifactManifest {
  if (!params.files.length || params.files.length > 20 || !params.testResults.length || params.testResults.some(t => !t.passed)) throw new Error('DELIVERY_EVIDENCE_REQUIRED');
  const names = new Set<string>();
  const files = params.files.map(f => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/.test(f.name) || names.has(f.name) || !f.content.length) throw new Error('INVALID_ARTIFACT');
    names.add(f.name); assertNoSecretMaterial(new TextDecoder().decode(f.content));
    return { name: f.name, mimeType: f.mimeType, sizeBytes: f.content.byteLength, sha256: sha256(f.content) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const base = { missionId: `taskmarket:${params.task.id}`, provider: 'taskmarket' as const, taskId: params.task.id,
    sourceHash: sourceHash(params.task), startedAt: params.startedAt, completedAt: params.completedAt, files,
    commandsRun: params.commandsRun, tests: params.testResults.map(t => t.name), testResults: params.testResults,
    outputHash: sha256(JSON.stringify(files)) };
  const evidenceHash = sha256(JSON.stringify(base));
  return { ...base, evidenceHash, submissionHash: sha256(JSON.stringify({ ...base, evidenceHash })) };
}

export class TaskmarketExecutionAdapter {
  constructor(private readonly connector: TaskmarketConnector, private readonly repository: MarketplaceRepository,
    private readonly executor = new SwarmExecutionAgent(), private readonly fundingVerifier = verifyTaskFunding) {}

  async execute(taskId: string): Promise<{ manifest: ArtifactManifest; artifactContent: string }> {
    const task = await this.connector.getTask(taskId);
    const assessment = await this.repository.getAssessment(taskId);
    if (!assessment || assessment.sourceHash !== sourceHash(task)) throw new Error('TASK_SCOPE_REVIEW_REQUIRED');
    assertNoSecretMaterial(assessment.input);
    const [network, legal, requester, identity, funding] = await Promise.all([
      this.connector.getTaskmarketNetwork(), this.connector.getTaskmarketLegalCurrent(), this.connector.getRequesterStats(task.requester),
      this.connector.getWorkerStatus(process.env.GXEON_TASKMARKET_WORKER_ADDRESS), this.fundingVerifier(task),
    ]);
    if (!network.verified) throw new Error('NETWORK_NOT_VERIFIED');
    const opportunity = qualifyTask(task, { funding, legal, requester, identity, assessment });
    if (opportunity.state !== 'CLAIM_READY') throw new Error('EXECUTION_BLOCKED_BY_QUALIFICATION');
    // Phase A has no claim writer. Only unreserved bounty work is eligible here; reserved modes require confirmed ownership.
    if (task.mode !== 'bounty') throw new Error('CONFIRMED_CLAIM_OR_SELECTION_REQUIRED');
    const startedAt = new Date().toISOString();
    const mission = { missionId: `taskmarket:${taskId}`, provider: 'taskmarket' as const, taskId, sourceHash: sourceHash(task), state: 'EXECUTING' as const, updatedAt: startedAt };
    if (!await this.repository.createMission(mission)) throw new Error('MISSION_ALREADY_EXISTS');
    const output = await this.executor.executeMarketplaceService({ capability: assessment.capability, input: assessment.input, funding });
    const artifactContent = JSON.stringify(output, null, 2);
    const bytes = new TextEncoder().encode(artifactContent);
    validateArtifactRequirements('result.json', bytes.length, assessment);
    const manifest = buildArtifactManifest({ task, startedAt, completedAt: new Date().toISOString(),
      files: [{ name: 'result.json', mimeType: 'application/json', content: bytes }], commandsRun: [`GXEON_EXECUTION_AGENT:${assessment.capability}`],
      testResults: [{ name: 'runner completed and produced serializable JSON', passed: output.status === 'COMPLETED' },
        { name: 'artifact matches reviewed extension and size', passed: true }] });
    await this.repository.saveMission({ ...mission, state: 'DELIVERY_READY', manifest, updatedAt: manifest.completedAt });
    return { manifest, artifactContent };
  }

  async submitPreview(taskId: string) {
    const [task, mission, assessment] = await Promise.all([this.connector.getTask(taskId), this.repository.getMission(taskId), this.repository.getAssessment(taskId)]);
    const worker = process.env.GXEON_TASKMARKET_WORKER_ADDRESS?.toLowerCase();
    if (!worker || !mission?.manifest || !assessment || mission.state !== 'DELIVERY_READY') throw new Error('DELIVERY_NOT_READY');
    if (task.status !== 'open' || !task.submissionWindowOpen || Date.parse(task.expiryTime) <= Date.now()) throw new Error('SUBMISSION_WINDOW_CLOSED');
    if (task.claimedBy && task.claimedBy.toLowerCase() !== worker) throw new Error('CLAIM_OWNERSHIP_MISMATCH');
    if (mission.sourceHash !== sourceHash(task) || assessment.sourceHash !== mission.sourceHash) throw new Error('TASK_CHANGED_REVIEW_REQUIRED');
    for (const f of mission.manifest.files) validateArtifactRequirements(f.name, f.sizeBytes, assessment);
    return { taskId, submissionState: 'READY_TO_SUBMIT', manifest: mission.manifest, approvalRequired: true,
      submitted: false, reason: 'Official local CLI must rehash actual artifact bytes and obtain operator signature approval.' };
  }
}

function validateArtifactRequirements(name: string, size: number, a: QualificationAssessment) {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (!a.submissionRequirements.extensions.includes(ext) || size > a.submissionRequirements.maxBytes || a.submissionRequirements.maxBytes <= 0) throw new Error('ARTIFACT_REQUIREMENTS_NOT_MET');
}
