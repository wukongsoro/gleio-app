import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import OpenAI from 'openai';

export async function action(args: ActionFunctionArgs) {
  return researchAction(args);
}

async function researchAction({ context, request }: ActionFunctionArgs) {
  try {
    // validate environment variables
    if (!context.cloudflare.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY.' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const { input } = await request.json<{ input: string }>();

    // initialize OpenAI client with timeout
    const openai = new OpenAI({
      timeout: 3600 * 1000,
      apiKey: context.cloudflare.env.OPENAI_API_KEY,
    });

    const defaultInput = `
Research the economic impact of semaglutide on global healthcare systems.
Do:
- Include specific figures, trends, statistics, and measurable outcomes.
- Prioritize reliable, up-to-date sources: peer-reviewed research, health
  organizations (e.g., WHO, CDC), regulatory agencies, or pharmaceutical
  earnings reports.
- Include inline citations and return all source metadata.

Be analytical, avoid generalities, and ensure that each section supports
data-backed reasoning that could inform healthcare policy or financial modeling.
`;

    // use the standard chat completions API instead of the deprecated responses API
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content:
            'You are a research assistant. Provide detailed, well-sourced research on the given topic.',
        },
        {
          role: 'user',
          content: input || defaultInput,
        },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    });

    return new Response(
      JSON.stringify({
        output_text: response.choices[0]?.message?.content || '',
        response,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error('Research API Error:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to process research request',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }
}