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
                className={classNames('w-full', {
                  'mb-8': !isLast,
                })}
              >
                {isUserMessage ? (
                  <div className="w-full flex justify-end">
                    <div className="max-w-[70%]">
                      <div className="bg-conformity-elements-messages-background/60 border border-conformity-elements-borderColor/30 rounded-[20px] px-[14px] py-[10px]">
                        <UserMessage content={content} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full">
                    <div className={classNames('', {
                      'animate-pulse': isStreaming && isLast,
                    })}>
                      <AssistantMessage content={content} />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        : null}
      {isStreaming && (
        <div className="flex items-center gap-1 w-full max-w-3xl px-4 py-2 text-conformity-elements-textSecondary">
          <div className="i-svg-spinners:3-dots-fade text-xl"></div>
        </div>
      )}
    </div>
  );
}));

