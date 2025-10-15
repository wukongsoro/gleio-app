import { memo, useMemo } from 'react';
import { Markdown } from './Markdown';
import { ThinkingProcess } from './ThinkingProcess';

interface AssistantMessageProps {
  content: string;
}

// Pattern to detect thinking process blocks
const THINKING_TAG_OPEN = '<thinking>';
const THINKING_TAG_CLOSE = '</thinking>';

function extractThinkingProcess(content: string): { thinking: string | null; response: string } {
  const thinkingStartIndex = content.indexOf(THINKING_TAG_OPEN);
  const thinkingEndIndex = content.indexOf(THINKING_TAG_CLOSE);

  if (thinkingStartIndex !== -1 && thinkingEndIndex !== -1 && thinkingEndIndex > thinkingStartIndex) {
    const thinking = content.slice(thinkingStartIndex + THINKING_TAG_OPEN.length, thinkingEndIndex).trim();
    const response = (
      content.slice(0, thinkingStartIndex) + content.slice(thinkingEndIndex + THINKING_TAG_CLOSE.length)
    ).trim();
    return { thinking, response };
  }

  return { thinking: null, response: content };
}

export const AssistantMessage = memo(({ content }: AssistantMessageProps) => {
  const { thinking, response } = useMemo(() => extractThinkingProcess(content), [content]);

  return (
    <div className="overflow-hidden w-full">
      {thinking && <ThinkingProcess content={thinking} />}
      <div 
        className="text-conformity-elements-textPrimary prose prose-sm max-w-none"
        style={{
          fontSize: '15px',
          lineHeight: '1.6',
          fontWeight: 400,
          fontFamily: 'ui-sans-serif, -apple-system, system-ui, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale'
        }}
      >
        <Markdown html>{response}</Markdown>
      </div>
    </div>
  );
});
