import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import OpenAI from 'openai';

export async function action(args: ActionFunctionArgs) {
  return researchInfoAction(args);
}

async function researchInfoAction({ context, request }: ActionFunctionArgs) {
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

    // initialize OpenAI client
    const openai = new OpenAI({
      apiKey: context.cloudflare.env.OPENAI_API_KEY,
    });

    const systemPrompt = `
You are talking to a user who is asking for a research task to be conducted. Your job is to gather more information from the user to successfully complete the task.

GUIDELINES:
- Be concise while gathering all necessary information
- Make sure to gather all the information needed to carry out the research task in a concise, well-structured manner.
- Use bullet points or numbered lists if appropriate for clarity.
- Don't ask for unnecessary information, or information that the user has already provided.

IMPORTANT: Do NOT conduct any research yourself, just gather information that will be given to a researcher to conduct the research task.
`;

    const defaultInput = "Research surfboards for me. I'm interested in ...";

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: input || defaultInput,
        },
      ],
      max_tokens: 1000,
      temperature: 0.7,
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
    console.error('Research Info API Error:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to process research info request',
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