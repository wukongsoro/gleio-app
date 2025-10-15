import { useState, useEffect } from 'react';
import type { ResearchTask, EvidenceCard } from '~/types/research';
import { TrustChip } from './TrustChip';
import { CitationBadge } from './CitationBadge';
import { PrintStyles } from './PrintStyles';

interface ResearchWorkbenchProps {
  taskId: string;
  onClose: () => void;
}

export function ResearchWorkbench({ taskId, onClose }: ResearchWorkbenchProps) {
  const [task, setTask] = useState<ResearchTask | null>(null);
  const [activeTab, setActiveTab] = useState<'plan' | 'sources' | 'notes' | 'report'>('plan');
  const [showTraceDrawer, setShowTraceDrawer] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  useEffect(() => {
    // fetch task initially
    fetch(`/api/research-v2/${taskId}`)
      .then((res) => res.json())
      .then((data) => setTask(data as ResearchTask))
      .catch((err) => console.error('Failed to fetch task:', err));

    // connect to SSE stream for updates
    const eventSource = new EventSource(`/api/research-v2/${taskId}/stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'status' || data.type === 'complete') {
        // refresh task data
        fetch(`/api/research-v2/${taskId}`)
          .then((res) => res.json())
          .then((updatedTask) => setTask(updatedTask as ResearchTask))
          .catch((err) => console.error('Failed to refresh task:', err));
      }
    };

    return () => {
      eventSource.close();
    };
  }, [taskId]);

  const handleExportPDF = () => {
    window.print();
  };

  const handleDownloadJSON = () => {
    const blob = new Blob([JSON.stringify(task, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `research-${taskId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredSources = task?.evidence.filter((e) => {
    if (sourceFilter === 'high') return e.trust >= 0.8;
    if (sourceFilter === 'medium') return e.trust >= 0.6 && e.trust < 0.8;
    if (sourceFilter === 'low') return e.trust < 0.6;

    return true;
  });

  const renderCitationsInText = (text: string, evidence: EvidenceCard[]) => {
    const parts = text.split(/(\[e\w+\])/g);

    return parts.map((part, idx) => {
      const match = part.match(/\[e(\w+)\]/);

      if (match) {
        const evidenceId = `e${match[1]}`;
        const evidenceCard = evidence.find((e) => e.id === evidenceId);

        return <CitationBadge key={idx} id={evidenceId} evidence={evidenceCard} />;
      }

      return <span key={idx}>{part}</span>;
    });
  };

  if (!task) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-md">
          <div className="flex items-center justify-center mb-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          </div>
          <p className="text-center text-gray-700 dark:text-gray-300">Loading research task...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <PrintStyles />
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{task.goal}</h2>
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <span className="capitalize">{task.mode} mode</span>
              <span>•</span>
              <span className={`capitalize ${task.status === 'running' ? 'text-blue-600 dark:text-blue-400' : task.status === 'done' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {task.status}
              </span>
              {task.coverage !== undefined && (
                <>
                  <span>•</span>
                  <span>Coverage: {Math.round(task.coverage * 100)}%</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTraceDrawer(!showTraceDrawer)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              {showTraceDrawer ? 'Hide' : 'Show'} Trace
            </button>
            <button
              onClick={handleExportPDF}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Export PDF
            </button>
            <button
              onClick={handleDownloadJSON}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              Download JSON
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
          {(['plan', 'sources', 'notes', 'report'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'plan' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Research Plan</h3>
              {task.plan.map((subq, idx) => (
                <div
                  key={subq.id}
                  className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          Question {idx + 1}
                        </span>
                        {subq.done && (
                          <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded-full">
                            Done
                          </span>
                        )}
                      </div>
                      <p className="text-gray-900 dark:text-white mb-2">{subq.text}</p>
                      {subq.successCriteria && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                          Success: {subq.successCriteria}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'sources' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Sources ({task.evidence.length})
                </h3>
                <div className="flex gap-2">
                  {(['all', 'high', 'medium', 'low'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setSourceFilter(filter)}
                      className={`px-3 py-1 text-sm font-medium rounded-lg capitalize transition-colors ${
                        sourceFilter === filter
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {filteredSources?.map((evidence) => (
                  <div
                    key={evidence.id}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-gray-900 dark:text-white font-medium flex-1">{evidence.title}</h4>
                      <TrustChip score={evidence.trust} />
                    </div>
                    {evidence.publisher && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {evidence.publisher} • {evidence.published}
                      </p>
                    )}
                    {evidence.snippet && <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{evidence.snippet}</p>}
                    <a
                      href={evidence.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      View source →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Research Notes</h3>
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Notes feature coming soon. This will allow you to highlight text and create claims with auto-attached
                  citations.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'report' && (
            <div className="max-w-4xl mx-auto">
              {task.draft.executiveSummary && (
                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Executive Summary</h3>
                  <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {renderCitationsInText(task.draft.executiveSummary, task.evidence)}
                  </div>
                </div>
              )}

              {task.draft.sections.map((section, idx) => (
                <div key={idx} className="mb-8">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{section.heading}</h3>
                  <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {renderCitationsInText(section.body, task.evidence)}
                  </div>
                </div>
              ))}

              {task.draft.faq && task.draft.faq.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">FAQ</h3>
                  <div className="space-y-4">
                    {task.draft.faq.map((item, idx) => (
                      <div key={idx} className="border-l-4 border-blue-500 pl-4">
                        <p className="font-semibold text-gray-900 dark:text-white mb-2">{item.q}</p>
                        <p className="text-gray-700 dark:text-gray-300">{item.a}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {task.draft.bibliography.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Bibliography</h3>
                  <ol className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    {task.draft.bibliography.map((citation, idx) => (
                      <li key={idx} className="pl-4">
                        {citation}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {task.draft.limitations.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Limitations</h3>
                  <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 list-disc pl-6">
                    {task.draft.limitations.map((limitation, idx) => (
                      <li key={idx}>{limitation}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* trace drawer */}
        {showTraceDrawer && (
          <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-6 max-h-64 overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Run Trace</h3>
            <div className="space-y-2">
              {task.steps.map((step) => (
                <div
                  key={step.id}
                  className="p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">{step.kind}</span>
                    {step.elapsedMs && (
                      <span className="text-xs text-gray-600 dark:text-gray-400">{step.elapsedMs}ms</span>
                    )}
                  </div>
                  {step.subQuestionId && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Sub-question: {step.subQuestionId}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

