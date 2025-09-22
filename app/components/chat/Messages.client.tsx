import React from 'react';
import { classNames } from '~/utils/classNames';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  messages?: ChatMessage[];
}

export const Messages = React.memo(React.forwardRef<HTMLDivElement, MessagesProps>((props: MessagesProps, ref) => {
  const { id, isStreaming = false, messages = [] } = props;

  return (
    <div id={id} ref={ref} className={props.className}>
      {messages.length > 0
        ? messages.map((message, index) => {
            const { role, content } = message;
            const isUserMessage = role === 'user';
            const isFirst = index === 0;
            const isLast = index === messages.length - 1;

            return (
              <div
                key={index}
                className={classNames('w-full transition-all duration-200', {
                  'mt-6': !isFirst,
                })}
              >
                {isUserMessage ? (
                  <div className="w-full p-6 rounded-2xl bg-conformity-elements-messages-background shadow-sm border border-conformity-elements-borderColor">
                    <div className="w-full">
                      <UserMessage content={content} />
                    </div>
                  </div>
                ) : (
                  <div className={classNames('w-full max-w-none', {
                    'bg-conformity-elements-messages-background/50 border border-conformity-elements-borderColor/30 rounded-2xl': !isStreaming || (isStreaming && !isLast),
                    'bg-gradient-to-b from-conformity-elements-messages-background/40 via-conformity-elements-messages-background/20 to-transparent border border-conformity-elements-borderColor/20 rounded-2xl':
                      isStreaming && isLast,
                  })}>
                    <div className="p-6 pl-8">
                      <div className="w-full prose prose-lg max-w-none">
                        <AssistantMessage content={content} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        : null}
      {isStreaming && (
        <div className="text-center w-full text-conformity-elements-textSecondary i-svg-spinners:3-dots-fade text-4xl mt-4"></div>
      )}
    </div>
  );
}));

