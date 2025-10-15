import { useState } from 'react';
import { ResearchWorkbench } from '~/components/research/ResearchWorkbench';

export default function ResearchTestPage() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const [mode, setMode] = useState<'quick' | 'heavy'>('quick');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartResearch = async () => {
    if (!goal.trim()) {
      setError('Please enter a research goal');

      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/research-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, mode }),
      });

      if (!response.ok) {
        throw new Error('Failed to start research');
      }

      const data = (await response.json()) as { taskId: string };
      setTaskId(data.taskId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">Research Workbench Test</h1>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8">
          <div className="mb-6">
            <label htmlFor="goal" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Research Goal
            </label>
            <textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g., What are the latest developments in quantum computing for 2024?"
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Research Mode</label>
            <div className="flex gap-4">
              <button
                onClick={() => setMode('quick')}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  mode === 'quick'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Quick Mode
              </button>
              <button
                onClick={() => setMode('heavy')}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  mode === 'heavy'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Heavy Mode
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded-lg">
              {error}
            </div>
          )}

          <button
            onClick={handleStartResearch}
            disabled={loading || !goal.trim()}
            className="w-full px-6 py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Starting Research...
              </span>
            ) : (
              'Start Deep Research'
            )}
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Test Instructions</h2>
          <ol className="space-y-3 text-gray-700 dark:text-gray-300">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center">
                1
              </span>
              <span>Enter a research goal in the text area above</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center">
                2
              </span>
              <span>Select Quick or Heavy mode</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center">
                3
              </span>
              <span>Click "Start Deep Research"</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center">
                4
              </span>
              <span>The Research Workbench will open and show live progress</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center">
                5
              </span>
              <span>Navigate through Plan, Sources, Notes, and Report tabs</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center">
                6
              </span>
              <span>Use Export PDF or Download JSON to save results</span>
            </li>
          </ol>
        </div>
      </div>

      {taskId && <ResearchWorkbench taskId={taskId} onClose={() => setTaskId(null)} />}
    </div>
  );
}

