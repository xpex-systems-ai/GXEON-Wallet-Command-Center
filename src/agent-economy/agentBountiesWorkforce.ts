/** Agent Bounties work preparation; never claims, posts, signs or transfers. */
export type WorkGate = 'DISCOVERED'|'REVIEW_REQUIRED'|'READY_FOR_HUMAN_REVIEW';
export type AgentRole = 'DISCOVERY'|'RISK'|'ENGINEERING'|'QA'|'EVIDENCE'|'SETTLEMENT_AUDIT';
export const GXEON_WORKFORCE: ReadonlyArray<{role:AgentRole; mission:string; canWriteToProvider:false}> = [
  {role:'DISCOVERY',mission:'Find canonical public tasks and deduplicate',canWriteToProvider:false},
  {role:'RISK',mission:'Verify chain, escrow, eligibility, bond, competition, expiry and payout',canWriteToProvider:false},
  {role:'ENGINEERING',mission:'Prepare implementation plan in isolated GitHub branches',canWriteToProvider:false},
  {role:'QA',mission:'Reproduce acceptance criteria and produce test evidence',canWriteToProvider:false},
  {role:'EVIDENCE',mission:'Prepare timestamped evidence for human-approved submission',canWriteToProvider:false},
  {role:'SETTLEMENT_AUDIT',mission:'Reconcile canonical settlement event and recipient, never projected income',canWriteToProvider:false},
];
export type Candidate = {id:string;title?:string;sourceUrl?:string;network?:string;rewardUsdc?:number;escrowVerified?:boolean;claimable?:boolean;expiry?:string;bondUsdc?:number;verifiedBy?:string;competingClaims?:number;};
export function triageCandidate(c:Candidate):{gate:WorkGate;reasons:string[];score:number}{
  const reasons:string[]=[];
  if(!c.id || c.id.startsWith('unidentified_')) reasons.push('MISSING_CANONICAL_ID');
  if(c.network!=='base-mainnet') reasons.push('NETWORK_UNVERIFIED');
  if(c.escrowVerified!==true) reasons.push('ESCROW_UNVERIFIED');
  if(c.claimable!==true) reasons.push('CLAIMABILITY_UNVERIFIED');
  if(!Number.isFinite(c.rewardUsdc) || (c.rewardUsdc||0)<=0) reasons.push('REWARD_UNVERIFIED');
  if(!c.expiry || !Number.isFinite(Date.parse(c.expiry)) || Date.parse(c.expiry)<=Date.now()) reasons.push('EXPIRY_UNVERIFIED');
  if(c.bondUsdc===undefined || !Number.isFinite(c.bondUsdc)) reasons.push('BOND_UNKNOWN');
  if(!c.sourceUrl?.startsWith('https://')) reasons.push('SOURCE_UNVERIFIED');
  const score=Math.max(0,Math.min(100,Math.round((c.rewardUsdc||0)*0.1)-Math.round((c.bondUsdc||0)*10)-(c.competingClaims||0)*10));
  return {gate:reasons.length?'REVIEW_REQUIRED':'READY_FOR_HUMAN_REVIEW',reasons,score};
}
