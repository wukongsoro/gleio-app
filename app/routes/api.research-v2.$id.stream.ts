import { type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getResearchTask } from '~/lib/.server/research/storage';

export async function loader({ params }: LoaderFunctionArgs) {
  const taskId = params.id;

  if (!taskId) {
    return new Response(JSON.stringify({ error: 'Task ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // SSE streaming
  const encoder = new TextEncoder();
  let intervalId: NodeJS.Timeout;

  const stream = new ReadableStream({
    start(controller) {
      // send initial connection message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', taskId })}\n\n`));

      // poll for updates every 500ms
      intervalId = setInterval(() => {
        const task = getResearchTask(taskId);

        if (!task) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Task not found' })}\n\n`));
          clearInterval(intervalId);
          controller.close();

          return;
        }

        // send status update
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'status',
              status: task.status,
              taskId,
              timestamp: new Date().toISOString(),
            })}\n\n`,
          ),
        );

        // if task is done, close stream
        if (task.status === 'done' || task.status === 'error') {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'complete',
                taskId,
                timestamp: new Date().toISOString(),
              })}\n\n`,
            ),
          );
          clearInterval(intervalId);
          controller.close();
        }
      }, 500);
    },
    cancel() {
      if (intervalId) {
        clearInterval(intervalId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

