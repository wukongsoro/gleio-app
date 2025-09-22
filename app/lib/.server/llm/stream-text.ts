import { streamText as _streamText, type CoreMessage } from 'ai';
import { getAPIKey, getOpenRouterAPIKey, getOpenAIAPIKey } from '~/lib/.server/llm/api-key';
import { getAnthropicModel, getOpenRouterModel, getOpenAIModel } from '~/lib/.server/llm/model';
import { MAX_TOKENS } from './constants';
import { getSystemPrompt } from './prompts';

export type Messages = CoreMessage[];

export interface StreamingOptions {
  toolChoice?: 'none' | 'auto';
  onFinish?: (result: { text: string; finishReason: string }) => void | Promise<void>;
  /** Optional per-request model override for OpenRouter */
  modelId?: string;
}

const DEFAULT_OPENROUTER_MODELS = [
  'microsoft/wizardlm-2-8x22b',
  'meta-llama/llama-3.1-8b-instruct:free',
  'qwen/qwen2.5-vl-3b-instruct:free',
];

function parseModelList(value?: string) {
  if (!value) {
    return [] as string[];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function streamText(messages: Messages, env?: Env, options?: StreamingOptions) {
  try {
    const openRouterApiKey = getOpenRouterAPIKey(env);
    const openaiApiKey = getOpenAIAPIKey(env);
    const { modelId: overrideModelId, ...optionOverrides } = options ?? {};

    const envModelSetting =
      env?.OPENROUTER_MODEL ||
      env?.LLM_MODEL ||
      process.env.OPENROUTER_MODEL ||
      process.env.LLM_MODEL;

    const envModelIds = parseModelList(envModelSetting);
    const requestedModelIds = overrideModelId ? [overrideModelId] : [];
    const openRouterModelCandidates = Array.from(
      new Set([...requestedModelIds, ...envModelIds, ...DEFAULT_OPENROUTER_MODELS]),
    );

    if (openRouterApiKey) {
      let lastError: unknown;

      for (const modelId of openRouterModelCandidates) {
        try {
          console.info(`[llm] Attempting OpenRouter model: ${modelId}`);

          return _streamText({
            ...optionOverrides,
            model: getOpenRouterModel(openRouterApiKey, modelId),
            system: getSystemPrompt(),
            messages,
          });
        } catch (error) {
          console.warn(`[llm] OpenRouter model failed: ${modelId}`, error);
          lastError = error;
        }
      }

      if (lastError instanceof Error) {
        throw lastError;
      }

      throw new Error('All configured OpenRouter models failed.');
    }

    if (openaiApiKey) {
      return _streamText({
        ...optionOverrides,
        model: getOpenAIModel(openaiApiKey),
        system: getSystemPrompt(),
        messages,
      });
    }

    const anthropicKey = getAPIKey(env);
    if (!anthropicKey) {
      throw new Error(
        'No API keys configured. Please set at least one: OPENROUTER_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.',
      );
    }

    return _streamText({
      ...optionOverrides,
      model: getAnthropicModel(anthropicKey),
      system: getSystemPrompt(),
      messages,
    });
  } catch (error) {
    console.error('Error in streamText:', error);
    throw error;
  }
}

