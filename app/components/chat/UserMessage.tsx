import { modificationsRegex } from '~/utils/diff';
import { Markdown } from './Markdown';

interface UserMessageProps {
  content: string;
}

export function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="overflow-hidden">
      <div className="text-conformity-elements-textPrimary leading-relaxed">
      <Markdown limitedMarkdown>{sanitizeUserMessage(content)}</Markdown>
      </div>
    </div>
  );
}

function sanitizeUserMessage(content: string) {
  return content.replace(modificationsRegex, '').trim();
}
