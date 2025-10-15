// Content sanitization utilities for LLM outputs

const BOLT_TAG_REGEX = /<\/?bolt(?:Action|Artifact|Attachment|File|Message|Prompt|Output|Response|System|User)?[^>]*>/gi;
const BOLT_COMMENT_REGEX = /<!--\s*bolt:[\s\S]*?-->/gi;

export function extractCode(content: string, langHint?: string): string {
  // Prefer fenced code blocks
  const re = new RegExp("```" + (langHint ?? "[a-zA-Z]*") + "\\s*\\n([\\s\\S]*?)```", "m");
  const match = content.match(re);
  const body = match ? match[1] : content;

  // Strip Bolt-specific wrappers while leaving legitimate HTML/JSX intact
  return body.replace(BOLT_TAG_REGEX, "").replace(BOLT_COMMENT_REGEX, "").trim();
}

export function safeJsonParse(s: string, fallback: any = null): any {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}
