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

  // regular GET request
  const task = getResearchTask(taskId);

  if (!task) {
    return new Response(JSON.stringify({ error: 'Task not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(task), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

