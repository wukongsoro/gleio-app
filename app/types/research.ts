export type ResearchMode = 'quick' | 'heavy';
export type ResearchStatus = 'running' | 'done' | 'error';
export type StepKind = 'plan' | 'search' | 'fetch' | 'extract' | 'judge' | 'synthesize' | 'reflect';
export type StepStatus = 'pending' | 'success' | 'error';
export type EvidenceType = 'news' | 'paper' | 'blog' | 'docs' | 'regulatory' | 'pdf';
export type ClaimStatus = 'supported' | 'contested' | 'needs_verification';

export interface SubQuestion {
  id: string;
  text: string;
  done: boolean;
  successCriteria?: string;
}

export interface Step {
  id: string;
  subQuestionId?: string;
  kind: StepKind;
  input: any;
  output: any;
  startedAt: string;
  finishedAt: string;
  elapsedMs?: number;
  status: StepStatus;
  errorMessage?: string;
  rawOutput?: string;
}

export interface TrustFactors {
  recency: number;
  authority: number;
  independence: number;
  relevance: number;
}

export interface Quote {
  text: string;
  start?: number;
  end?: number;
}

export interface EvidenceCard {
  id: string;
  url: string;
  title: string;
  publisher?: string;
  author?: string;
  published?: string;
  snippet?: string;
  type?: EvidenceType;
  trust: number;
  factors: TrustFactors;
  hash: string;
  quotes?: Quote[];
}

export interface Claim {
  id: string;
  text: string;
  supporting: string[];
  contestedBy?: string[];
  status: ClaimStatus;
}

export interface Draft {
  executiveSummary: string;
  sections: Array<{ heading: string; body: string }>;
  faq?: Array<{ q: string; a: string }>;
  bibliography: string[];
  limitations: string[];
}

export interface ResearchTask {
  id: string;
  goal: string;
  mode: ResearchMode;
  createdAt: string;
  status: ResearchStatus;
  coverage?: number;
  plan: SubQuestion[];
  steps: Step[];
  evidence: EvidenceCard[];
  claims: Claim[];
  draft: Draft;
  errorMessage?: string;
}

export interface ResearchSSEEvent {
  type: 'status' | 'step-start' | 'step-end' | 'evidence-add' | 'claims-updated' | 'draft-updated';
  data: any;
  taskId: string;
  timestamp: string;
}

