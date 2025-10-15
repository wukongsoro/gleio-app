import { useStore } from '@nanostores/react';
import { CheckCircle2, Loader2, Globe } from 'lucide-react';
import { researchStore } from '~/lib/stores/research';
import { CitationBadge } from '~/components/research/CitationBadge';
import type { EvidenceCard } from '~/types/research';

export function ResearchPanel() {
  const currentTask = useStore(researchStore.currentTaskId);
  const tasks = useStore(researchStore.tasks);
  const isStreaming = useStore(researchStore.isStreaming);

  const task = currentTask ? tasks[currentTask] : null;

  if (!task) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Globe className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No active research
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Enable Deep Search in the chat and send a message to start researching
          </p>
        </div>
      </div>
    );
  }

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

  // calculate domain breakdown
  const domainBreakdown = task.evidence.reduce(
    (acc, ev) => {
      try {
        const url = new URL(ev.url);
        const domain = url.hostname.replace('www.', '');

        if (!acc[domain]) {
          acc[domain] = { name: domain, count: 0, favicon: `https://www.google.com/s2/favicons?domain=${domain}` };
        }

        acc[domain].count++;
      } catch (e) {
        // invalid URL
      }

      return acc;
    },
    {} as Record<string, { name: string; count: number; favicon: string }>,
  );

  const domains = Object.values(domainBreakdown).sort((a, b) => b.count - a.count);
  const totalSources = task.evidence.length;

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* header */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">{task.goal}</h2>
          <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
            <span className="capitalize">{task.mode} mode</span>
            {task.coverage !== undefined && (
              <>
                <span>•</span>
                <span>Coverage: {Math.round(task.coverage * 100)}%</span>
              </>
            )}
          </div>
        </div>

        {/* research plan created */}
        {task.plan.length > 0 && (
          <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-white mb-2">Research plan created</p>
              <div className="space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
                {task.plan.map((q, i) => (
                  <div key={q.id} className="flex items-start gap-2">
                    <span className="text-gray-500 dark:text-gray-500 flex-shrink-0">{i + 1}.</span>
                    <span className="flex-1">{q.text}</span>
                    {q.done && <span className="text-green-600 dark:text-green-400">✓</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* gathered sources */}
        {task.evidence.length > 0 && (
          <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            {isStreaming && task.status === 'running' ? (
              <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-white mb-3">
                Gathered {totalSources} source{totalSources !== 1 ? 's' : ''}
              </p>
              <div className="space-y-2">
                {domains.slice(0, 5).map((domain) => {
                  const percentage = (domain.count / totalSources) * 100;

                  return (
                    <div key={domain.name} className="flex items-center gap-3">
                      <img src={domain.favicon} alt="" className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm text-gray-700 dark:text-gray-300 min-w-[120px] truncate">
                        {domain.name}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-500 w-8">{domain.count}</span>
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 max-w-[200px]">
                        <div
                          className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {domains.length > 5 && (
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                    ... {domains.length - 5} other domain{domains.length - 5 !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* final report */}
        {task.status === 'done' && task.draft && (
          <div className="prose prose-gray dark:prose-invert max-w-none">
            {task.draft.executiveSummary && (
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Executive Summary</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {renderCitationsInText(task.draft.executiveSummary, task.evidence)}
                </p>
              </div>
            )}

            {task.draft.sections.map((section, idx) => (
              <div key={idx} className="mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">{section.heading}</h3>
                <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {renderCitationsInText(section.body, task.evidence)}
                </div>
              </div>
            ))}

            {task.draft.faq && task.draft.faq.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">FAQ</h3>
                <div className="space-y-4">
                  {task.draft.faq.map((item, idx) => (
                    <div key={idx} className="border-l-4 border-blue-500 dark:border-blue-400 pl-4">
                      <p className="font-semibold text-gray-900 dark:text-white mb-2">{item.q}</p>
                      <p className="text-gray-700 dark:text-gray-300">{item.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {task.draft.bibliography.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Sources</h3>
                <ol className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  {task.draft.bibliography.map((citation, idx) => (
                    <li key={idx} className="pl-2">
                      {citation}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {task.draft.limitations.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Limitations</h3>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 list-disc pl-6">
                  {task.draft.limitations.map((limitation, idx) => (
                    <li key={idx}>{limitation}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* loading state */}
        {isStreaming && task.status === 'running' && !task.draft.executiveSummary && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400">
                {task.steps.length > 0 ? `${task.steps[task.steps.length - 1].kind}...` : 'Starting research...'}
              </p>
            </div>
          </div>
        )}

        {/* error state */}
        {task.status === 'error' && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-300 font-medium">Research failed</p>
            <p className="text-red-700 dark:text-red-400 text-sm mt-1">
              {task.errorMessage || 'An error occurred while conducting research. Please try again.'}
            </p>
            {task.steps.length > 0 && (
              <div className="mt-3 text-xs text-red-600 dark:text-red-400">
                <p className="font-medium mb-1">Debug info:</p>
                <p>Failed at step: {task.steps[task.steps.length - 1]?.kind}</p>
                {task.steps[task.steps.length - 1]?.errorMessage && (
                  <p className="mt-1">Step error: {task.steps[task.steps.length - 1].errorMessage}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

