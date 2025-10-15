import { useState } from 'react';
import type { EvidenceCard } from '~/types/research';

interface CitationBadgeProps {
  id: string;
  evidence?: EvidenceCard;
}

export function CitationBadge({ id, evidence }: CitationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <sup className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">[{id}]</sup>
      {showTooltip && evidence && (
        <div className="absolute z-50 bottom-full left-0 mb-2 w-80 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-sm">
          <div className="font-semibold text-gray-900 dark:text-white mb-1">{evidence.title}</div>
          {evidence.publisher && (
            <div className="text-gray-600 dark:text-gray-400 text-xs mb-2">
              {evidence.publisher} • {evidence.published}
            </div>
          )}
          {evidence.quotes && evidence.quotes[0] && (
            <div className="text-gray-700 dark:text-gray-300 italic border-l-2 border-blue-500 pl-2">
              "{evidence.quotes[0].text}"
            </div>
          )}
          <a
            href={evidence.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline text-xs mt-2 block"
          >
            View source →
          </a>
        </div>
      )}
    </span>
  );
}

