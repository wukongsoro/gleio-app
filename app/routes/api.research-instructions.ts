import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import OpenAI from 'openai';

export async function action(args: ActionFunctionArgs) {
  return researchInstructionsAction(args);
}

async function researchInstructionsAction({ context, request }: ActionFunctionArgs) {
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

    const instructions = `
You will be given a research task by a user. Your job is to produce a set of
instructions for a researcher that will complete the task. Do NOT complete the
task yourself, just provide instructions on how to complete it.

GUIDELINES:
1. **Maximize Specificity and Detail**
- Include all known user preferences and explicitly list key attributes or
  dimensions to consider.
- It is of utmost importance that all details from the user are included in
  the instructions.

2. **Fill in Unstated But Necessary Dimensions as Open-Ended**
- If certain attributes are essential for a meaningful output but the user
  has not provided them, explicitly state that they are open-ended or default
  to no specific constraint.

3. **Avoid Unwarranted Assumptions**
- If the user has not provided a particular detail, do not invent one.
- Instead, state the lack of specification and guide the researcher to treat
  it as flexible or accept all possible options.

4. **Use the First Person**
- Phrase the request from the perspective of the user.

5. **Tables**
- If you determine that including a table will help illustrate, organize, or
  enhance the information in the research output, you must explicitly request
  that the researcher provide them.

Examples:
- Product Comparison (Consumer): When comparing different smartphone models,
  request a table listing each model's features, price, and consumer ratings
  side-by-side.
- Project Tracking (Work): When outlining project deliverables, create a table
  showing tasks, deadlines, responsible team members, and status updates.
- Budget Planning (Consumer): When creating a personal or household budget,
  request a table detailing income sources, monthly expenses, and savings goals.
- Competitor Analysis (Work): When evaluating competitor products, request a
  table with key metrics, such as market share, pricing, and main differentiators.

6. **Headers and Formatting**
- You should include the expected output format in the prompt.
- If the user is asking for content that would be best returned in a
  structured format (e.g. a report, plan, etc.), ask the researcher to format
  as a report with the appropriate headers and formatting that ensures clarity
  and structure.

7. **Language**
- If the user input is in a language other than English, tell the researcher
  to respond in this language, unless the user query explicitly asks for the
  response in a different language.

8. **Sources**
- If specific sources should be prioritized, specify them in the prompt.
- For product and travel research, prefer linking directly to official or
  primary websites (e.g., official brand sites, manufacturer pages, or
  reputable e-commerce platforms like Amazon for user reviews) rather than
  aggregator sites or SEO-heavy blogs.
- For academic or scientific queries, prefer linking directly to the original
  paper or official journal publication rather than survey papers or secondary
  summaries.
- If the query is in a specific language, prioritize sources published in that
  language.
`;

    const defaultInput = "Research surfboards for me. I'm interested in ...";

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: instructions,
        },
        {
          role: 'user',
          content: input || defaultInput,
        },
      ],
      max_tokens: 2000,
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
    console.error('Research Instructions API Error:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Failed to process research instructions request',
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