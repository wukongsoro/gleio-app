import { type ActionFunctionArgs } from '@remix-run/cloudflare';
// Server imports moved inside the action function to prevent client bundling

export async function action(args: ActionFunctionArgs) {
  return enhancerAction(args);
}

async function enhancerAction({ context, request }: ActionFunctionArgs) {
  // Dynamic imports for server-only modules to prevent client bundling
  const { streamText } = await import('~/lib/.server/llm/stream-text');
  const { stripIndents } = await import('~/utils/stripIndent');

  try {
    // load .env.local in dev to populate process.env when running `pnpm dev`
    if (import.meta.env.DEV) {
      try {
        const dotenv = await import('dotenv');
        (dotenv as any).config({ path: ['.env.local', '.env'] });
      } catch {}
    }

    // validate environment variables: allow any supported provider
    const openrouter = process.env.OPENROUTER_API_KEY || context.cloudflare.env?.OPENROUTER_API_KEY;
    const openai = process.env.OPENAI_API_KEY || context.cloudflare.env?.OPENAI_API_KEY;
    const anthropic = process.env.ANTHROPIC_API_KEY || context.cloudflare.env?.ANTHROPIC_API_KEY;

    if (!openrouter && !openai && !anthropic) {
      return new Response(
        JSON.stringify({
          error:
            'No API keys configured. Please set at least one: OPENROUTER_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const { message } = await request.json<{ message: string }>();

    const result = await streamText(
      [
        {
          role: 'user',
          content: stripIndents`
          I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.

          IMPORTANT: Only respond with the improved prompt and nothing else!

          <original_prompt>
            ${message}
          </original_prompt>
        `,
        },
      ],
      context.cloudflare.env,
    );

    return result.toTextStreamResponse({
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Error in enhancer action:', error);

    const message = error instanceof Error ? error.message : 'Failed to enhance prompt';
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }
}
