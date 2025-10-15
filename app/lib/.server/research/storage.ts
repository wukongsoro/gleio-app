import type { ResearchTask } from '~/types/research';

// in-memory storage for research tasks (in production, use a database)
const tasks = new Map<string, ResearchTask>();

export function saveResearchTask(task: ResearchTask): void {
  tasks.set(task.id, task);
}

export function getResearchTask(taskId: string): ResearchTask | undefined {
  return tasks.get(taskId);
}

export function updateResearchTask(taskId: string, updates: Partial<ResearchTask>): void {
  const task = tasks.get(taskId);

  if (task) {
    tasks.set(taskId, { ...task, ...updates });
  }
}

export function deleteResearchTask(taskId: string): void {
  tasks.delete(taskId);
}

export function getAllResearchTasks(): ResearchTask[] {
  return Array.from(tasks.values());
}

