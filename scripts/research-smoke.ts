import dotenv from 'dotenv';
import { orchestrateResearch } from '../app/lib/.server/research/orchestrator';
import type { Step, EvidenceCard, Claim, Draft } from '../app/types/research';

dotenv.config({ path: '.env' });

type Callbacks = {
  onStepUpdate: (step: Step) => void;
  onEvidenceUpdate: (evidence: EvidenceCard[]) => void;
  onClaimsUpdate: (claims: Claim[]) => void;
  onDraftUpdate: (draft: Draft) => void;
};

const callbacks: Callbacks = {
  onStepUpdate: (step) => {
    console.log('[smoke] step', step.kind, step.status, step.errorMessage || '');
  },
  onEvidenceUpdate: (evidence) => {
    console.log('[smoke] evidence count', evidence.length);
  },
  onClaimsUpdate: (claims) => {
    console.log('[smoke] claims count', claims.length);
  },
  onDraftUpdate: (draft) => {
    console.log('[smoke] draft summary length', draft.executiveSummary.length);
  },
};

async function run() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENROUTER_API_KEY in environment');
  }

  const taskId = `smoke-${Date.now()}`;
  console.log('[smoke] starting orchestration for task', taskId);

  const result = await orchestrateResearch({
    env: { OPENROUTER_API_KEY: apiKey },
    taskId,
    goal: 'What are the latest AI trends in 2024?',
    mode: 'heavy',
    ...callbacks,
  });

  console.log('[smoke] final status', result.status, result.errorMessage || 'ok');
  console.log('[smoke] coverage', result.coverage);
  console.log('[smoke] plan size', result.plan.length);
  console.log('[smoke] evidence size', result.evidence.length);
  console.log('[smoke] claims size', result.claims.length);
  console.log('[smoke] summary snippet', result.draft.executiveSummary.slice(0, 160));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[smoke] failed', error);
    process.exit(1);
  });
