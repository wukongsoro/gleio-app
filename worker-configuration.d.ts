interface Env {
  ANTHROPIC_API_KEY: string;
  OPENROUTER_API_KEY: string;
  OPENAI_API_KEY: string;
  // Optional model selection for OpenRouter (used by stream-text)
  OPENROUTER_MODEL?: string;
  LLM_MODEL?: string;
}
