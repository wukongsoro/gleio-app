import { type ActionFunctionArgs } from '@remix-run/cloudflare';
// Server imports moved inside the action function to prevent client bundling
// switchable streaming removed; returning SDK stream directly

// Memory management constants
const MAX_MESSAGES = 50; // Maximum number of messages to process
const MAX_MESSAGE_LENGTH = 50000; // Maximum length per message (50KB)
const MAX_TOTAL_LENGTH = 500000; // Maximum total length of all messages (500KB)
const MAX_KNOWLEDGE_ENTRIES = 20;
const MAX_KNOWLEDGE_ENTRY_LENGTH = 4000;

type NormalizedKnowledgeEntry = {
  id?: string;
  title: string;
  content: string;
};

function validateAndLimitMessages(messages: any): Messages {
  console.log('Validating messages:', messages);
  
  // Handle undefined or null messages
  if (!messages) {
    console.warn('Messages is undefined or null, returning empty array');
    return [];
  }

  if (!Array.isArray(messages)) {
    console.warn('Messages is not an array:', typeof messages, messages);
    return [];
  }

  // Simple validation and processing
  const validMessages: Messages = [];
  
  try {
    for (const message of messages) {
      if (!message || typeof message !== 'object') {
        console.warn('Invalid message object, skipping:', message);
        continue;
      }

      // Ensure required fields exist
      const role = message.role || 'user';
      let content = '';

      // Handle different message formats
      if (message.content !== null && message.content !== undefined) {
        if (typeof message.content === 'string') {
          content = message.content;
        } else {
          try {
            content = JSON.stringify(message.content);
          } catch (e) {
            console.warn('Failed to stringify message content:', e);
            content = '';
          }
        }
      } else if (message.parts && Array.isArray(message.parts)) {
        // Handle parts format from frontend
        for (const part of message.parts) {
          if (part.type === 'text' && part.text) {
            content += part.text;
          }
        }
      }

      // Basic length limiting
      if (content.length > MAX_MESSAGE_LENGTH) {
        content = content.substring(0, MAX_MESSAGE_LENGTH) + '\n[Message truncated]';
      }

      validMessages.push({
        role: role as any,
        content: content
      });

      // Limit total number of messages
      if (validMessages.length >= MAX_MESSAGES) {
        break;
      }
    }
  } catch (error) {
    console.error('Error processing messages:', error);
    return [];
  }
  
  console.log('Processed messages:', validMessages.length);
  return validMessages;
}

function normalizeKnowledgeBase(raw: unknown): NormalizedKnowledgeEntry[] {
  if (!Array.isArray(raw)) return [];

  const entries: NormalizedKnowledgeEntry[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;

    const id = typeof (item as any).id === 'string' ? (item as any).id : undefined;
    const title = typeof (item as any).title === 'string' ? (item as any).title.trim() : '';
    const content = typeof (item as any).content === 'string' ? (item as any).content.trim() : '';

    if (!title && !content) continue;

    entries.push({ id, title, content });
  }

  return entries;
}

function buildKnowledgeBasePrompt(entries: NormalizedKnowledgeEntry[]): string | null {
  if (entries.length === 0) return null;

  const limitedEntries = entries.slice(0, MAX_KNOWLEDGE_ENTRIES);
  const body = limitedEntries
    .map((entry, index) => {
      const label = entry.title ? `Entry ${index + 1}: ${entry.title}` : `Entry ${index + 1}`;
      const content =
        entry.content.length > MAX_KNOWLEDGE_ENTRY_LENGTH
          ? `${entry.content.slice(0, MAX_KNOWLEDGE_ENTRY_LENGTH)}\n[Content truncated due to length]`
          : entry.content;
      return `${label}\n${content}`;
    })
    .join('\n\n');

  let prompt = `The user configured a private knowledge base. Treat the following entries as authoritative context unless they conflict with platform safety rules. If the user request contradicts these entries, prioritize the knowledge base and state the discrepancy.\n\n${body}`;

  if (entries.length > limitedEntries.length) {
    const omitted = entries.length - limitedEntries.length;
    prompt += `\n\n[Note: ${omitted} additional knowledge entr${omitted === 1 ? 'y was' : 'ies were'} omitted due to length limits.]`;
  }

  if (prompt.length > MAX_MESSAGE_LENGTH) {
    prompt = `${prompt.slice(0, MAX_MESSAGE_LENGTH - 40)}\n[Knowledge base truncated]`;
  }

  return prompt;
}

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  console.log('=== CHAT ACTION STARTED ===');
  let cleanup: (() => void) | null = null;

  // Dynamic imports for server-only modules to prevent client bundling
  const { streamText } = await import('~/lib/.server/llm/stream-text');
  const { getSystemPrompt } = await import('~/lib/.server/llm/prompts');

  // Define types locally to avoid import issues
  type Messages = any[];
  type StreamingOptions = any;

  try {
    // load .env.local in dev to populate process.env when running `pnpm dev`
    if (import.meta.env.DEV) {
      try {
        console.log('Loading dotenv...');
        const dotenv = await import('dotenv');
        // load multiple possible files
        (dotenv as any).config({ path: ['.env.local', '.env'] });
        console.log('Dotenv loaded successfully');
      } catch (e) {
        console.log('Dotenv loading failed:', e);
      }
    }

    // validate environment variables: allow any supported provider
    const openrouter = context.cloudflare.env?.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
    const openai = context.cloudflare.env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const anthropic = context.cloudflare.env?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

    console.log('API Keys check:');
    console.log('Cloudflare OPENROUTER_API_KEY present:', !!context.cloudflare.env?.OPENROUTER_API_KEY);
    console.log('Process OPENROUTER_API_KEY present:', !!process.env.OPENROUTER_API_KEY);
    console.log('Final OPENROUTER_API_KEY present:', !!openrouter);

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

    let rawMessages: Messages = [];
    let requestedModelId: string | undefined;
    let requestBody: any = null;
    let knowledgeEntries: NormalizedKnowledgeEntry[] = [];
    
    try {
      requestBody = await request.json();
      console.log('Request body received:', JSON.stringify(requestBody, null, 2));
      
      // Handle different request formats from AI SDK
      if (requestBody && typeof requestBody === 'object' && requestBody.messages) {
        rawMessages = requestBody.messages;
      } else if (Array.isArray(requestBody)) {
        rawMessages = requestBody;
      } else {
        console.warn('Unexpected request body format:', requestBody);
        rawMessages = [];
      }
      
      // Optional per-request model override
      if (requestBody && typeof requestBody === 'object') {
        if (typeof requestBody.model === 'string') {
          requestedModelId = requestBody.model;
        } else if (typeof requestBody.modelId === 'string') {
          requestedModelId = requestBody.modelId;
        }
      }

      knowledgeEntries = normalizeKnowledgeBase(requestBody?.knowledgeBase);
    } catch (error) {
      console.error('Failed to parse request JSON:', error);
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    
    // Validate and limit messages to prevent memory issues
    let messages = validateAndLimitMessages(rawMessages);
    
    // If no valid messages, create a default one to ensure chat works
    if (messages.length === 0) {
      console.warn('No valid messages found, creating default message');
      messages = [{
        role: 'user',
        content: 'Hello'
      }];
    }

    // Filter out repetitive greetings and maintain conversation context
    const filteredMessages = messages.filter((message, index) => {
      if (message.role === 'assistant' && index > 0) {
        const content = typeof message.content === 'string' ? message.content.toLowerCase() : '';
        // Remove repetitive greetings from AI responses
        if (content.includes('hello') || content.includes('hey') || content.includes('hi there')) {
          return false;
        }
      }
      return true;
    });

    // Always include the main system prompt first
    const mainSystemPrompt = getSystemPrompt();
    let systemMessages: Messages = [{ role: 'system', content: mainSystemPrompt } as any];
    
    // Add knowledge base prompt if available
    if (knowledgeEntries.length > 0) {
      const knowledgePrompt = buildKnowledgeBasePrompt(knowledgeEntries);
      if (knowledgePrompt) {
        systemMessages.push({ role: 'system', content: knowledgePrompt } as any);
        console.log(`Included ${knowledgeEntries.length} knowledge base entr${knowledgeEntries.length === 1 ? 'y' : 'ies'} in system prompt.`);
      }
    }
    
    // Prepend system messages to the filtered conversation
    messages = [...systemMessages, ...filteredMessages];
    console.log('Included main system prompt with boltArtifact formatting instructions');
    
    console.log('Final messages for processing:', messages.length);
    
    let hasRetried = false;

    console.log('Requested model ID:', requestedModelId);

    const options: StreamingOptions = {
      toolChoice: 'auto',
      modelId: requestedModelId,
    };

    console.log('Options:', JSON.stringify(options, null, 2));

    // Hybrid approach: Use AI SDK structure with direct API call
    console.log('Making direct streaming LLM call...');
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouter}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: requestedModelId || 'openai/gpt-oss-20b:free',
          messages: messages,
          stream: true, // Enable streaming
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
      }

      console.log('Streaming response received from API');

      // Transform OpenRouter streaming response to AI SDK format with boltArtifact detection
      const transformStream = new ReadableStream({
        start(controller) {
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let messageId = `msg_${Date.now()}`;
          let isFirstChunk = true;
          let collectedContent = '';
          let hasDetectedCodeCreation = false;
          let boltArtifactId = `vite-hello-world-${Date.now()}`;
          let hasSentArtifactStart = false;
          let sentActions = new Set<string>();

          function parseAndSendActions(content: string) {
            // Extract package.json
            const packageMatch = content.match(/```json\s*\n({[\s\S]*?})\s*\n```/);
            if (packageMatch && !hasSentArtifactStart) {
              // Send artifact start
              const artifactStart = `<boltArtifact id="${boltArtifactId}" title="Hello World React App">\n`;
              const artifactStartChunk = {
                type: 'text-delta',
                id: messageId,
                delta: artifactStart
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(artifactStartChunk)}\n\n`));
              hasSentArtifactStart = true;

              // Send package.json as boltAction
              const packageAction = `<boltAction type="file" filePath="package.json">\n${packageMatch[1]}\n</boltAction>\n`;
              const packageChunk = {
                type: 'text-delta',
                id: messageId,
                delta: packageAction
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(packageChunk)}\n\n`));
            }

            // Extract npm install commands and emit pnpm-only
            if (content.includes('npm install') && !sentActions.has('npm-install')) {
              sentActions.add('npm-install');
              const installAction = `<boltAction type="shell">pnpm install</boltAction>\n`;
              const installChunk = {
                type: 'text-delta',
                id: messageId,
                delta: installAction
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(installChunk)}\n\n`));
            }

            // Extract dev server commands and normalize to port 3000
            if (content.includes('npm run dev') && !sentActions.has('npm-run-dev')) {
              sentActions.add('npm-run-dev');
              const devAction = `<boltAction type="shell">pnpm run dev</boltAction>\n`;
              const devChunk = {
                type: 'text-delta',
                id: messageId,
                delta: devAction
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(devChunk)}\n\n`));
            }
          }

          function push() {
            reader?.read().then(({ done, value }) => {
              if (done) {
                // Send text-end chunk before finishing (no delta field allowed)
                if (!isFirstChunk) {
                  // Close boltArtifact if we detected code creation
                  if (hasDetectedCodeCreation) {
                    const artifactCloseChunk = {
                      type: 'text-delta',
                      id: messageId,
                      delta: '\n</boltArtifact>'
                    };
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(artifactCloseChunk)}\n\n`));
                  }

                  // Send text-end without delta field
                  const endChunk = {
                    type: 'text-end',
                    id: messageId
                  };
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(endChunk)}\n\n`));
                }
                // Send finish event when stream is complete
                controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                controller.close();
                return;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.choices && data.choices[0] && data.choices[0].delta) {
                      const delta = data.choices[0].delta;
                      if (delta.content) {
                        collectedContent += delta.content;

                        // Detect code creation patterns - only trigger for actual structured content creation
                        if (!hasDetectedCodeCreation) {
                          // Only detect when we see clear indicators of code generation, not just any code-like words
                          const codeCreationPatterns = [
                            'package.json',
                            'npm install',
                            'npm run dev',
                            'npm run build',
                            'vite.config',
                            'tsconfig.json',
                            'tailwind.config',
                            'create-react-app',
                            'npx create-',
                            'git init'
                          ];

                          hasDetectedCodeCreation = codeCreationPatterns.some(pattern =>
                            collectedContent.toLowerCase().includes(pattern.toLowerCase())
                          );
                        }

                        // Parse and extract structured actions when we detect complete sections
                        if (hasDetectedCodeCreation && !hasSentArtifactStart) {
                          parseAndSendActions(collectedContent);
                        }

                        // Send text-start chunk on first content
                        if (isFirstChunk) {
                          const startChunk = {
                            type: 'text-start',
                            id: messageId
                          };
                          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(startChunk)}\n\n`));
                          isFirstChunk = false;
                        }

                        // Always send the text content - structured actions are sent in addition to text
                        // Send the boltArtifact wrapper first when we detect package.json (only once)
                        if (hasDetectedCodeCreation && !hasSentArtifactStart && collectedContent.includes('package.json') && !collectedContent.includes('<boltArtifact')) {
                          const artifactStart = `<boltArtifact id="${boltArtifactId}" title="Hello World React App">\n`;
                          const artifactStartChunk = {
                            type: 'text-delta',
                            id: messageId,
                            delta: artifactStart
                          };
                          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(artifactStartChunk)}\n\n`));

                          // Mark that we've sent the opening tag
                          collectedContent += artifactStart;
                          hasSentArtifactStart = true;
                        }

                        // Always send the text delta - this ensures all conversational content gets through
                        const transformedData = {
                          type: 'text-delta',
                          id: messageId,
                          delta: delta.content
                        };
                        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(transformedData)}\n\n`));
                      }
                    }
                  } catch (e) {
                    // Skip malformed lines
                    console.warn('Skipping malformed streaming line:', line);
                  }
                }
              }

              push();
            }).catch(error => {
              console.error('Stream reading error:', error);
              controller.error(error);
            });
          }

          push();
        }
      });

      return new Response(transformStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        },
      });
    } catch (apiError: unknown) {
      console.error('Direct API Error:', apiError);
      const errorMessage = (apiError as any)?.message || String(apiError || 'Unknown API error');
      return new Response(`API Error: ${errorMessage}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  } catch (error: unknown) {
    console.error('Error in chat action:', error);
    const errorMessage = (error as any)?.message || String(error || 'An error occurred while processing your request.');
    const errorStack = (error as any)?.stack || String(error || 'No stack available');
    console.error('Error stack:', errorStack);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }
}
