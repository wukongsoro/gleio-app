import { memo, useState } from 'react';

interface ThinkingProcessProps {
  content: string;
}

export const ThinkingProcess = memo(({ content }: ThinkingProcessProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-4 border border-conformity-elements-borderColor/30 rounded-[12px] bg-conformity-elements-background/20 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-[10px] flex items-center justify-between hover:bg-conformity-elements-background/40 transition-colors"
        aria-expanded={isExpanded}
        style={{
          fontFamily: 'ui-sans-serif, -apple-system, system-ui, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"',
          WebkitFontSmoothing: 'antialiased'
        }}
      >
        <span className="text-[13px] font-medium text-conformity-elements-textSecondary">
          {isExpanded ? 'Hide reasoning' : 'Show reasoning'}
        </span>
        <div
          className={`transition-transform duration-200 text-conformity-elements-textSecondary ${
            isExpanded ? 'rotate-180' : ''
          }`}
        >
          <div className="i-ph:caret-down-bold text-sm"></div>
        </div>
      </button>
      
      {isExpanded && (
        <div className="border-t border-conformity-elements-borderColor/30 px-4 py-3">
          <div 
            className="text-conformity-elements-textSecondary whitespace-pre-line"
            style={{
              fontSize: '13px',
              lineHeight: '1.6',
              fontFamily: 'ui-sans-serif, -apple-system, system-ui, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"',
              WebkitFontSmoothing: 'antialiased'
            }}
          >
            {content}
          </div>
        </div>
      )}
    </div>
  );
});

ThinkingProcess.displayName = 'ThinkingProcess';

