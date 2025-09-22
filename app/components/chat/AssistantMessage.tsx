import { memo } from 'react';
import { Markdown } from './Markdown';

interface AssistantMessageProps {
  content: string;
}

export const AssistantMessage = memo(({ content }: AssistantMessageProps) => {
  return (
    <div className="overflow-hidden w-full">
      <div className="text-conformity-elements-textPrimary leading-relaxed">
      <Markdown html>{content}</Markdown>
      </div>
    </div>
  );
});
