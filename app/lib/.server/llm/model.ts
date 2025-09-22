import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export function getAnthropicModel(apiKey: string): LanguageModel {
  const anthropic = createAnthropic({
    apiKey,
  });

  return anthropic('claude-3-5-sonnet-20240620') as unknown as LanguageModel;
}

export function getOpenRouterModel(apiKey: string, modelId?: string): LanguageModel {
  // Use OpenAI provider pointed at OpenRouter's OpenAI-compatible endpoint
  const openaiCompat = createOpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': 'https://bolt.new',
      'X-Title': 'Bolt AI',
    },
  });

  // Use specified model if provided; otherwise fall back to OpenRouter's auto model
  return openaiCompat(modelId || 'openrouter/auto') as unknown as LanguageModel;
}

export function getOpenAIModel(apiKey: string): LanguageModel {
  const openai = createOpenAI({
    apiKey,
  });

  // choose a cost-effective capable default
  return openai('gpt-4o-mini') as unknown as LanguageModel;
}

