import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import crypto from 'crypto';
import { orchestrateResearch } from '~/lib/.server/research/orchestrator';
import { saveResearchTask, getResearchTask, updateResearchTask } from '~/lib/.server/research/storage';
import type { ResearchTask, ResearchMode, Step, EvidenceCard, Claim, Draft } from '~/types/research';

export async function action({ context, request }: ActionFunctionArgs) {
  try {
    const { goal, mode } = await request.json<{ goal: string; mode: ResearchMode }>();

    if (!goal) {
      return new Response(JSON.stringify({ error: 'Goal is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('[API] Starting research with goal:', goal, 'mode:', mode);
    const taskId = crypto.randomUUID();

  // create initial task
  const initialTask: ResearchTask = {
    id: taskId,
    goal,
    mode: mode || 'quick',
    createdAt: new Date().toISOString(),
    status: 'running',
    plan: [],
    steps: [],
    evidence: [],
    claims: [],
    draft: {
      executiveSummary: '',
      sections: [],
      bibliography: [],
      limitations: [],
    },
  };

    saveResearchTask(initialTask);
    console.log('[API] Initial task saved with ID:', taskId);

    // start orchestration in background
    orchestrateResearch({
      env: context.cloudflare.env,
      taskId,
      goal,
      mode: mode || 'quick',
      onStepUpdate: (step: Step) => {
        const task = getResearchTask(taskId);

        if (task) {
          updateResearchTask(taskId, {
            steps: [...task.steps.filter((s) => s.id !== step.id), step],
          });
          console.log('[API] Step updated:', step.kind, step.id);
        }
      },
      onEvidenceUpdate: (evidence: EvidenceCard[]) => {
        updateResearchTask(taskId, { evidence });
        console.log('[API] Evidence updated, count:', evidence.length);
      },
      onClaimsUpdate: (claims: Claim[]) => {
        updateResearchTask(taskId, { claims });
        console.log('[API] Claims updated, count:', claims.length);
      },
      onDraftUpdate: (draft: Draft) => {
        updateResearchTask(taskId, { draft });
        console.log('[API] Draft updated');
      },
    })
      .then((finalTask) => {
        console.log('[API] Research orchestration complete', {
          status: finalTask.status,
          errorMessage: finalTask.errorMessage,
          stepsCount: finalTask.steps.length,
          evidenceCount: finalTask.evidence.length,
        });
        updateResearchTask(taskId, finalTask);
      })
      .catch((error) => {
        console.error('[API] Research orchestration error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        updateResearchTask(taskId, { status: 'error', errorMessage });
      });

    return new Response(JSON.stringify({ taskId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[API] Failed to process research request:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to process research request',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

