import { generateObject, generateText, jsonSchema, type Schema } from 'ai';
import { getOpenRouterModel } from '~/lib/.server/llm/model';
import { getOpenRouterAPIKey } from '~/lib/.server/llm/api-key';
import crypto from 'crypto';
import type {
  ResearchTask,
  SubQuestion,
  Step,
  EvidenceCard,
  Claim,
  Draft,
  ResearchMode,
  StepStatus,
} from '~/types/research';

interface ResearchOrchestratorCallbacks {
  onStepUpdate: (step: Step) => void;
  onEvidenceUpdate: (evidence: EvidenceCard[]) => void;
  onClaimsUpdate: (claims: Claim[]) => void;
  onDraftUpdate: (draft: Draft) => void;
}

interface ResearchOrchestratorParams extends ResearchOrchestratorCallbacks {
  env: any; // Cloudflare env
  taskId: string;
  goal: string;
  mode: ResearchMode;
}

type StepExecutionResult<T> =
  | { step: Step; success: true; data: T }
  | { step: Step; success: false; error: Error };

interface ModelCandidate {
  name: string;
  model: any;
}

export async function orchestrateResearch({
  env,
  taskId,
  goal,
  mode,
  onStepUpdate,
  onEvidenceUpdate,
  onClaimsUpdate,
  onDraftUpdate,
}: ResearchOrchestratorParams): Promise<ResearchTask> {
  console.log('[Orchestrator] Starting research orchestration', { taskId, goal, mode });
  const apiKey = getOpenRouterAPIKey(env);

  if (!apiKey) {
    console.error('[Orchestrator] OpenRouter API key not found in env');
    return {
      id: taskId,
      goal,
      mode,
      createdAt: new Date().toISOString(),
      status: 'error',
      coverage: 0,
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
      errorMessage: 'OpenRouter API key not configured',
    };
  }

  console.log('[Orchestrator] API key found, initializing model');

  // Primary model: More reliable for structured JSON outputs
  // Fallback: Free but sometimes unreliable with JSON formatting
  const PRIMARY_MODEL_ID = 'alibaba/tongyi-deepresearch-30b-a3b:free';
  const FALLBACK_MODEL_ID = 'openai/gpt-4o-mini';
  const primaryModel = getOpenRouterModel(apiKey, PRIMARY_MODEL_ID);
  const fallbackModel = getOpenRouterModel(apiKey, FALLBACK_MODEL_ID);

  const availableModels: ModelCandidate[] = [
    { name: PRIMARY_MODEL_ID, model: primaryModel },
    { name: FALLBACK_MODEL_ID, model: fallbackModel },
  ].filter((candidate) => Boolean(candidate.model));

  if (!availableModels.length) {
    console.error('[Orchestrator] No models available for research orchestration');
    return {
      id: taskId,
      goal,
      mode,
      createdAt: new Date().toISOString(),
      status: 'error',
      coverage: 0,
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
      errorMessage: 'No language models available',
    };
  }

  const steps: Step[] = [];
  let evidence: EvidenceCard[] = [];
  let claims: Claim[] = [];
  let draft: Draft = {
    executiveSummary: '',
    sections: [],
    bibliography: [],
    limitations: [],
  };
  let plan: SubQuestion[] = [];
  let coverage = 0;

  const handleFailure = (error: Error): ResearchTask => {
    return {
      id: taskId,
      goal,
      mode,
      createdAt: new Date().toISOString(),
      status: 'error',
      coverage,
      plan,
      steps,
      evidence,
      claims,
      draft,
      errorMessage: error.message,
    };
  };

  // step 1: plan
  const planResult = await executePlanningStep(availableModels, goal, taskId, onStepUpdate);
  steps.push(planResult.step);
  if (!planResult.success) {
    return handleFailure(planResult.error);
  }
  const rawPlan = Array.isArray(planResult.data.plan) ? planResult.data.plan : [];
  coverage = planResult.data.coverage;

  // sanitize plan structure
  plan = rawPlan
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item, index) => {
      const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `sq-${index + 1}`;
      const rawText = item.text || (item as any).question;
      const text =
        typeof rawText === 'string' && rawText.trim().length > 0
          ? rawText.trim()
        : `Sub-question ${index + 1}`;
    const successCriteriaRaw =
      item.successCriteria || (item as any).criteria || (item as any).success || undefined;
    const successCriteria =
      typeof successCriteriaRaw === 'string' ? successCriteriaRaw : undefined;

    return {
      id,
      text,
      successCriteria,
      done: Boolean(item.done),
    } satisfies SubQuestion;
    });

  const normalizedCoverage =
    typeof coverage === 'string'
      ? (() => {
          const parsed = parseFloat(coverage);
          if (!Number.isFinite(parsed)) return undefined;
          return parsed > 1 ? parsed / 100 : parsed;
        })()
      : coverage;
  coverage =
    typeof normalizedCoverage === 'number' && Number.isFinite(normalizedCoverage)
      ? Math.min(Math.max(normalizedCoverage, 0), 1)
      : 0;

  // step 2: search and fetch for each sub-question
  for (const subQuestion of plan) {
    const searchResult = await executeSearchStep(availableModels, subQuestion, taskId, onStepUpdate);
    steps.push(searchResult.step);
    if (!searchResult.success) {
      return handleFailure(searchResult.error);
    }

    const fetchResult = await executeFetchStep(searchResult.data.queries, subQuestion, taskId, onStepUpdate);
    steps.push(fetchResult.step);
    if (!fetchResult.success) {
      return handleFailure(fetchResult.error);
    }

    const newEvidence = fetchResult.data.evidence.map((e) => {
      const id = e.id || `e${crypto.randomUUID().slice(0, 8)}`;
      return {
        ...e,
        id,
      } satisfies EvidenceCard;
    });
    evidence = [...evidence, ...newEvidence];
    onEvidenceUpdate(evidence);

    subQuestion.done = true;
  }

  // step 3: judge and score evidence
  const judgeResult = await executeJudgeStep(availableModels, evidence, taskId, onStepUpdate);
  steps.push(judgeResult.step);
  if (!judgeResult.success) {
    return handleFailure(judgeResult.error);
  }
  evidence = judgeResult.data.scoredEvidence.map((item, index) => {
    const id = item.id || `e${crypto.randomUUID().slice(0, 8)}`;
    return {
      ...item,
      id,
      factors: {
        recency: clampNumber(item.factors?.recency, 0, 1),
        authority: clampNumber(item.factors?.authority, 0, 1),
        independence: clampNumber(item.factors?.independence, 0, 1),
        relevance: clampNumber(item.factors?.relevance, 0, 1),
      },
      trust: clampNumber(item.trust, 0, 1),
    } satisfies EvidenceCard;
  });
  onEvidenceUpdate(evidence);

  // step 4: synthesize claims and draft
  const synthesizeResult = await executeSynthesizeStep(availableModels, goal, evidence, taskId, onStepUpdate);
  steps.push(synthesizeResult.step);
  if (!synthesizeResult.success) {
    return handleFailure(synthesizeResult.error);
  }
  claims = sanitizeClaims(synthesizeResult.data.claims);
  draft = sanitizeDraft(synthesizeResult.data.draft);
  onClaimsUpdate(claims);
  onDraftUpdate(draft);

  // step 5: reflect (heavy mode only)
  if (mode === 'heavy') {
    const reflectResult = await executeReflectStep(availableModels, goal, evidence, claims, taskId, onStepUpdate);
    steps.push(reflectResult.step);
    if (!reflectResult.success) {
      return handleFailure(reflectResult.error);
    }

    claims = sanitizeClaims(reflectResult.data.claims);
    draft = sanitizeDraft(reflectResult.data.draft);
    onClaimsUpdate(claims);
    onDraftUpdate(draft);
  }

  return {
    id: taskId,
    goal,
    mode,
    createdAt: new Date().toISOString(),
    status: 'done',
    coverage,
    plan,
    steps,
    evidence,
    claims,
    draft,
  };
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
};

const extractJsonBlock = (text: string): string | null => {
  if (!text) return null;
  const trimmed = text.trim();

  // Strategy 1: Direct JSON parse (handles clean responses)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // Continue to other strategies
    }
  }

  // Strategy 2: Extract from markdown code blocks (handles ```json...```)
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/gi;
  const matches = Array.from(trimmed.matchAll(codeBlockRegex));
  
  for (const match of matches) {
    const content = match[1].trim();
    try {
      JSON.parse(content);
      return content;
    } catch {
      continue;
    }
  }

  // Strategy 3: Extract first complete JSON object/array
  // Find balanced braces/brackets
  let startIdx = -1;
  let endIdx = -1;
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  const startChar = trimmed.includes('{') ? '{' : '[';
  const endChar = startChar === '{' ? '}' : ']';

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === startChar) {
      if (depth === 0) startIdx = i;
      depth++;
    } else if (char === endChar) {
      depth--;
      if (depth === 0 && startIdx !== -1) {
        endIdx = i;
        break;
      }
    }
  }

  if (startIdx !== -1 && endIdx !== -1) {
    const content = trimmed.slice(startIdx, endIdx + 1);
    try {
      JSON.parse(content);
      return content;
    } catch {
      // Continue to fallback
    }
  }

  // Strategy 4: Regex fallback for simple objects
  const jsonObjectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      JSON.parse(jsonObjectMatch[0]);
      return jsonObjectMatch[0];
    } catch {
      // Failed all strategies
    }
  }

  return null;
};

const parseModelJson = <T>(raw: string, description: string): T => {
  const candidate = extractJsonBlock(raw);
  if (!candidate) {
    const preview = raw.substring(0, 300).replace(/\n/g, ' ');
    throw new Error(
      `Unable to locate valid JSON block for ${description}. ` +
      `Response preview: "${preview}..."${raw.length > 300 ? ` (${raw.length} chars total)` : ''}`
    );
  }

  try {
    return JSON.parse(candidate) as T;
  } catch (error) {
    const preview = candidate.substring(0, 200);
    throw new Error(
      `Failed to parse JSON for ${description}: ${getErrorMessage(error)}. ` +
      `JSON preview: "${preview}..."${candidate.length > 200 ? ` (${candidate.length} chars total)` : ''}`
    );
  }
};

const MAX_ATTEMPTS_PER_MODEL = 2;

const planSchema = jsonSchema({
  type: 'object',
  required: ['plan', 'coverage'],
  additionalProperties: true,
  properties: {
    plan: {
      type: 'array',
      minItems: 3,
      maxItems: 7,
      items: {
        type: 'object',
        required: ['text'],
        additionalProperties: true,
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          done: { type: 'boolean' },
          successCriteria: { type: 'string' },
          question: { type: 'string' },
          criteria: { type: 'string' },
          success: { type: 'string' },
        },
      },
    },
    coverage: {
      anyOf: [{ type: 'number' }, { type: 'string' }],
    },
  },
}) as Schema;

interface StructuredJsonOptions {
  prompt: string;
  temperature: number;
  description: string;
  schema?: Schema;
}

async function generateStructuredJson<T>(
  models: ModelCandidate[],
  { prompt, temperature, description, schema }: StructuredJsonOptions,
): Promise<{ data: T; rawText: string; modelName: string }> {
  if (!models.length) {
    throw new Error(`No models available for ${description}`);
  }

  let lastError: Error | null = null;
  const attemptErrors: string[] = [];

  for (const { model, name } of models) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      const useSchemaAttempt = Boolean(schema) && attempt === 1;
      const adjustedPrompt =
        attempt === 1 || useSchemaAttempt
          ? prompt
          : `${prompt}\n\nRemember: Only output a valid JSON response that exactly matches the schema above. Do not include any explanation or commentary.`;

      try {
        console.log(
          `[Orchestrator] Generating ${description} with ${name} (attempt ${attempt}/${MAX_ATTEMPTS_PER_MODEL})` +
            (useSchemaAttempt ? ' [schema]' : ''),
        );

        if (useSchemaAttempt && schema) {
          const response = await generateObject({
            model,
            prompt: adjustedPrompt,
            temperature,
            schema,
            mode: 'json',
          });
          const rawText =
            typeof response.response.body === 'string'
              ? response.response.body
              : JSON.stringify(response.object);

          return {
            data: response.object as T,
            rawText,
            modelName: name,
          };
        }

        const response = await generateText({
          model,
          prompt: adjustedPrompt,
          temperature,
        });
        const rawText = response.text;
        const data = parseModelJson<T>(rawText, description);

        if (attempt > 1) {
          console.log(
            `[Orchestrator] ${description} succeeded with ${name} after retry`,
          );
        }

        return { data, rawText, modelName: name };
      } catch (error) {
        const message = getErrorMessage(error);
        lastError = error instanceof Error ? error : new Error(message);
        attemptErrors.push(`${name} attempt ${attempt}: ${message}`);
        console.warn(
          `[Orchestrator] ${description} failed with ${name} (attempt ${attempt}): ${message}`,
        );
        const response = (error as any)?.response;
        if (response) {
          try {
            let bodyPreview: string | undefined;
            if (typeof response.text === 'function') {
              bodyPreview = await response.text();
            } else if (typeof response.json === 'function') {
              const jsonBody = await response.json();
              bodyPreview = JSON.stringify(jsonBody);
            } else if (typeof response.body === 'string') {
              bodyPreview = response.body;
            }
            if (bodyPreview) {
              console.warn(
                `[Orchestrator] ${description} response body (${name} attempt ${attempt}):`,
                bodyPreview.slice(0, 500),
              );
            }
          } catch (responseError) {
            console.warn(
              `[Orchestrator] ${description} failed reading response body (${name} attempt ${attempt}):`,
              getErrorMessage(responseError),
            );
          }
        }
      }
    }
  }

  const aggregate = attemptErrors.length ? attemptErrors.join(' | ') : undefined;
  const fallbackMessage = lastError ? getErrorMessage(lastError) : 'Unknown error';
  throw new Error(
    `All model attempts failed for ${description}. ${aggregate || fallbackMessage}`,
  );
}

const finalizeStep = (
  step: Step,
  status: StepStatus,
  onStepUpdate: (step: Step) => void,
  extra?: Partial<Step>,
) => {
  const finishedAt = new Date().toISOString();
  const startedAtMs = new Date(step.startedAt).getTime();
  const finishedAtMs = new Date(finishedAt).getTime();

  step.status = status;
  step.finishedAt = finishedAt;
  step.elapsedMs = Math.max(finishedAtMs - startedAtMs, 0);

  if (extra) {
    Object.assign(step, extra);
  }

  onStepUpdate(step);
};

const clampNumber = (value: unknown, min: number, max: number): number => {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(Math.max(num, min), max);
};

const sanitizeClaims = (claims: Claim[]): Claim[] => {
  return claims.map((claim, index) => ({
    id: claim.id || `c${index + 1}`,
    text: claim.text || `Claim ${index + 1}`,
    supporting: Array.isArray(claim.supporting) ? claim.supporting : [],
    contestedBy: Array.isArray(claim.contestedBy) ? claim.contestedBy : undefined,
    status: claim.status || 'needs_verification',
  }));
};

const sanitizeDraft = (draft: Draft): Draft => {
  return {
    executiveSummary: draft?.executiveSummary || '',
    sections: Array.isArray(draft?.sections)
      ? draft.sections.map((section, index) => ({
          heading: section.heading || `Section ${index + 1}`,
          body: section.body || '',
        }))
      : [],
    faq: Array.isArray(draft?.faq)
      ? draft.faq.map((item) => ({
          q: item.q || 'Question',
          a: item.a || 'Answer pending.',
        }))
      : [],
    bibliography: Array.isArray(draft?.bibliography) ? draft.bibliography : [],
    limitations: Array.isArray(draft?.limitations) ? draft.limitations : [],
  };
};

async function executePlanningStep(
  models: ModelCandidate[],
  goal: string,
  taskId: string,
  onStepUpdate: (step: Step) => void,
): Promise<StepExecutionResult<{ plan: SubQuestion[]; coverage: number }>> {
  const stepId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const step: Step = {
    id: stepId,
    kind: 'plan',
    input: { goal },
    output: {},
    startedAt,
    finishedAt: '',
    status: 'pending',
  };

  onStepUpdate(step);

  const prompt = `Break down this research goal into 4-7 sub-questions. For each sub-question, provide success criteria. Also estimate a coverage score (0-1) representing how comprehensively these questions cover the topic.

Research Goal: ${goal}

Respond with JSON:
{
  "plan": [
    { "id": "sq1", "text": "question text", "done": false, "successCriteria": "what would make this answered" }
  ],
  "coverage": 0.85
}`;

  try {
    console.log('[Orchestrator] Calling planner with prompt length:', prompt.length);
    const { data: output, rawText, modelName } = await generateStructuredJson<{
      plan: SubQuestion[];
      coverage: number;
    }>(models, {
      prompt,
      temperature: 0.3,
      description: 'planner output',
      schema: planSchema,
    });
    console.log('[Orchestrator] Planner parsed output:', JSON.stringify(output, null, 2).slice(0, 500));

    finalizeStep(step, 'success', onStepUpdate, {
      output: { ...output, modelUsed: modelName },
      rawOutput: rawText,
    });

    return { step, success: true, data: output };
  } catch (error) {
    const message = getErrorMessage(error);
    console.error('[Orchestrator] Planning step error:', message, error);
    finalizeStep(step, 'error', onStepUpdate, {
      errorMessage: message,
    });

    return { step, success: false, error: new Error(message) };
  }
}

async function executeSearchStep(
  models: ModelCandidate[],
  subQuestion: SubQuestion,
  taskId: string,
  onStepUpdate: (step: Step) => void,
): Promise<StepExecutionResult<{ queries: any[] }>> {
  const stepId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const step: Step = {
    id: stepId,
    subQuestionId: subQuestion.id,
    kind: 'search',
    input: { subQuestion: subQuestion.text },
    output: {},
    startedAt,
    finishedAt: '',
    status: 'pending',
  };

  onStepUpdate(step);

  const prompt = `Generate 3-5 diverse search queries to answer this question. Include date range preferences and domain hints where relevant.

Question: ${subQuestion.text}

Respond with JSON:
{
  "queries": [
    { "text": "query", "dateRange": "2023-2024", "domainHints": ["domain.com"] }
  ]
}`;

  try {
    const { data: output, rawText, modelName } = await generateStructuredJson<{
      queries: any[];
    }>(models, {
      prompt,
      temperature: 0.5,
      description: 'search output',
    });

    finalizeStep(step, 'success', onStepUpdate, {
      output: { ...output, modelUsed: modelName },
      rawOutput: rawText,
    });

    return { step, success: true, data: output };
  } catch (error) {
    const message = getErrorMessage(error);
    finalizeStep(step, 'error', onStepUpdate, {
      errorMessage: message,
    });

    return { step, success: false, error: new Error(message) };
  }
}

async function executeFetchStep(
  queries: any[],
  subQuestion: SubQuestion,
  taskId: string,
  onStepUpdate: (step: Step) => void,
): Promise<StepExecutionResult<{ evidence: EvidenceCard[] }>> {
  const stepId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const step: Step = {
    id: stepId,
    subQuestionId: subQuestion.id,
    kind: 'fetch',
    input: { queries },
    output: {},
    startedAt,
    finishedAt: '',
    status: 'pending',
  };

  onStepUpdate(step);

  try {
    // simulated fetch - replace with actual search integrations
    const mockEvidence: EvidenceCard[] = queries.slice(0, 3).map((query, idx) => ({
      id: `e${crypto.randomUUID().slice(0, 8)}`,
      url: `https://example.com/article-${idx}`,
      title: `Research Article ${idx + 1}: ${query.text}`,
      publisher: 'Research Journal',
      published: '2024-01-15',
      snippet: `This article discusses ${query.text} in detail...`,
      type: 'paper' as const,
      trust: 0,
      factors: { recency: 0, authority: 0, independence: 0, relevance: 0 },
      hash: crypto.createHash('md5').update(`${query.text}-${idx}`).digest('hex'),
      quotes: [
        {
          text: `Key finding related to ${query.text}`,
          start: 100,
          end: 200,
        },
      ],
    }));

    finalizeStep(step, 'success', onStepUpdate, {
      output: { evidence: mockEvidence },
    });

    return { step, success: true, data: { evidence: mockEvidence } };
  } catch (error) {
    const message = getErrorMessage(error);
    finalizeStep(step, 'error', onStepUpdate, {
      errorMessage: message,
    });

    return { step, success: false, error: new Error(message) };
  }
}

async function executeJudgeStep(
  models: ModelCandidate[],
  evidence: EvidenceCard[],
  taskId: string,
  onStepUpdate: (step: Step) => void,
): Promise<StepExecutionResult<{ scoredEvidence: EvidenceCard[] }>> {
  const stepId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const step: Step = {
    id: stepId,
    kind: 'judge',
    input: { evidenceCount: evidence.length },
    output: {},
    startedAt,
    finishedAt: '',
    status: 'pending',
  };

  onStepUpdate(step);

  const prompt = `Score these sources on authority (0-1), recency (0-1), independence (0-1), and relevance (0-1). Calculate overall trust score. Identify duplicates.

Sources:
${evidence.map((e) => `- ${e.id}: ${e.title} (${e.publisher}, ${e.published})`).join('\n')}

Respond with JSON array of scored sources:
[
  {
    "id": "e123",
    "trust": 0.85,
    "factors": { "recency": 0.9, "authority": 0.8, "independence": 0.85, "relevance": 0.9 }
  }
]`;

  try {
    const {
      data: scores,
      rawText,
      modelName,
    } = await generateStructuredJson<
      Array<{ id: string; trust: number; factors: EvidenceCard['factors'] }>
    >(models, {
      prompt,
      temperature: 0.1,
      description: 'judge output',
    });
    const scoredEvidence = evidence.map((e) => {
      const score = scores.find((s) => s.id === e.id);
      return score ? { ...e, trust: score.trust, factors: score.factors } : e;
    });

    finalizeStep(step, 'success', onStepUpdate, {
      output: { scoredEvidence, modelUsed: modelName },
      rawOutput: rawText,
    });

    return { step, success: true, data: { scoredEvidence } };
  } catch (error) {
    const message = getErrorMessage(error);
    finalizeStep(step, 'error', onStepUpdate, {
      errorMessage: message,
    });

    return { step, success: false, error: new Error(message) };
  }
}

async function executeSynthesizeStep(
  models: ModelCandidate[],
  goal: string,
  evidence: EvidenceCard[],
  taskId: string,
  onStepUpdate: (step: Step) => void,
): Promise<StepExecutionResult<{ claims: Claim[]; draft: Draft }>> {
  const stepId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const step: Step = {
    id: stepId,
    kind: 'synthesize',
    input: { goal, evidenceCount: evidence.length },
    output: {},
    startedAt,
    finishedAt: '',
    status: 'pending',
  };

  onStepUpdate(step);

  const prompt = `Synthesize this research into claims and a structured draft. Every claim must cite evidence IDs.

Research Goal: ${goal}

Evidence:
${evidence.map((e) => `${e.id}: ${e.title} - ${e.snippet}`).join('\n\n')}

Respond with JSON:
{
  "claims": [
    { "id": "c1", "text": "claim text", "supporting": ["e1", "e2"], "status": "supported" }
  ],
  "draft": {
    "executiveSummary": "summary with [e1][e2] citations",
    "sections": [
      { "heading": "Section Title", "body": "content with [e3] citations" }
    ],
    "bibliography": ["[e1] Full citation format"],
    "limitations": ["limitation 1"]
  }
}`;

  try {
    const { data: output, rawText, modelName } = await generateStructuredJson<{
      claims: Claim[];
      draft: Draft;
    }>(models, {
      prompt,
      temperature: 0.3,
      description: 'synthesis output',
    });

    finalizeStep(step, 'success', onStepUpdate, {
      output: { ...output, modelUsed: modelName },
      rawOutput: rawText,
    });

    return { step, success: true, data: output };
  } catch (error) {
    const message = getErrorMessage(error);
    finalizeStep(step, 'error', onStepUpdate, {
      errorMessage: message,
    });

    return { step, success: false, error: new Error(message) };
  }
}

async function executeReflectStep(
  models: ModelCandidate[],
  goal: string,
  evidence: EvidenceCard[],
  claims: Claim[],
  taskId: string,
  onStepUpdate: (step: Step) => void,
): Promise<StepExecutionResult<{ claims: Claim[]; draft: Draft }>> {
  const stepId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const step: Step = {
    id: stepId,
    kind: 'reflect',
    input: { goal, claimsCount: claims.length },
    output: {},
    startedAt,
    finishedAt: '',
    status: 'pending',
  };

  onStepUpdate(step);

  const prompt = `Review these claims for counter-evidence and conflicts. Mark contested claims and reconcile.

Claims:
${claims.map((c) => `${c.id}: ${c.text} (supported by ${c.supporting.join(', ')})`).join('\n')}

Evidence Pool:
${evidence.map((e) => `${e.id}: ${e.title}`).join('\n')}

Respond with JSON:
{
  "claims": [
    { "id": "c1", "text": "updated claim", "supporting": ["e1"], "contestedBy": ["e5"], "status": "contested" }
  ],
  "draft": { "executiveSummary": "updated summary", "sections": [...], "bibliography": [...], "limitations": [...] }
}`;

  try {
    const { data: output, rawText, modelName } = await generateStructuredJson<{
      claims: Claim[];
      draft: Draft;
    }>(models, {
      prompt,
      temperature: 0.2,
      description: 'reflect output',
    });

    finalizeStep(step, 'success', onStepUpdate, {
      output: { ...output, modelUsed: modelName },
      rawOutput: rawText,
    });

    return { step, success: true, data: output };
  } catch (error) {
    const message = getErrorMessage(error);
    finalizeStep(step, 'error', onStepUpdate, {
      errorMessage: message,
    });

    return { step, success: false, error: new Error(message) };
  }
}
