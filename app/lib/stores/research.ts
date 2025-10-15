import { atom, map, type MapStore, type WritableAtom } from 'nanostores';
import type { ResearchTask } from '~/types/research';

export class ResearchStore {
  currentTaskId: WritableAtom<string | null> = import.meta.hot?.data.currentTaskId ?? atom(null);
  tasks: MapStore<Record<string, ResearchTask>> = import.meta.hot?.data.tasks ?? map({});
  deepSearchEnabled: WritableAtom<boolean> = import.meta.hot?.data.deepSearchEnabled ?? atom(false);
  isStreaming: WritableAtom<boolean> = import.meta.hot?.data.isStreaming ?? atom(false);

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.currentTaskId = this.currentTaskId;
      import.meta.hot.data.tasks = this.tasks;
      import.meta.hot.data.deepSearchEnabled = this.deepSearchEnabled;
      import.meta.hot.data.isStreaming = this.isStreaming;
    }
  }

  get currentTask() {
    const taskId = this.currentTaskId.get();

    if (!taskId) {
      return null;
    }

    return this.tasks.get()[taskId] || null;
  }

  setTask(task: ResearchTask) {
    this.tasks.setKey(task.id, task);
    this.currentTaskId.set(task.id);
  }

  updateTask(taskId: string, updates: Partial<ResearchTask>) {
    const currentTask = this.tasks.get()[taskId];

    if (currentTask) {
      this.tasks.setKey(taskId, { ...currentTask, ...updates });
    }
  }

  toggleDeepSearch() {
    this.deepSearchEnabled.set(!this.deepSearchEnabled.get());
  }

  async startResearch(goal: string, mode: 'quick' | 'heavy' = 'quick') {
    console.log('[ResearchStore] Starting research:', { goal, mode });
    this.isStreaming.set(true);

    try {
      const response = await fetch('/api/research-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, mode }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        console.error('[ResearchStore] API error:', errorData);
        throw new Error(errorData?.error || 'Failed to start research');
      }

      const data = (await response.json()) as { taskId: string };
      console.log('[ResearchStore] Research started with taskId:', data.taskId);
      this.currentTaskId.set(data.taskId);

      // start polling for updates
      this.pollTaskUpdates(data.taskId);

      return data.taskId;
    } catch (error) {
      console.error('[ResearchStore] Failed to start research:', error);
      this.isStreaming.set(false);
      throw error;
    }
  }

  private pollTaskUpdates(taskId: string) {
    console.log('[ResearchStore] Starting to poll for task:', taskId);
    
    const poll = async () => {
      try {
        const response = await fetch(`/api/research-v2/${taskId}`);

        if (!response.ok) {
          console.error('[ResearchStore] Poll error:', response.status, response.statusText);
          throw new Error(`Failed to fetch task: ${response.status}`);
        }

        const task = (await response.json()) as ResearchTask;
        console.log('[ResearchStore] Task update:', { 
          id: task.id, 
          status: task.status, 
          planLength: task.plan.length,
          evidenceLength: task.evidence.length,
          stepsLength: task.steps.length 
        });
        
        this.setTask(task);

        if (task.status === 'done' || task.status === 'error') {
          console.log('[ResearchStore] Research completed with status:', task.status);
          this.isStreaming.set(false);
        } else {
          // continue polling
          setTimeout(poll, 1000);
        }
      } catch (error) {
        console.error('[ResearchStore] Error polling task:', error);
        this.isStreaming.set(false);
      }
    };

    poll();
  }

  clearCurrent() {
    this.currentTaskId.set(null);
    this.isStreaming.set(false);
  }
}

export const researchStore = new ResearchStore();

