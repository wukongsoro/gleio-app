import React, { type RefCallback, useMemo } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';
import { IconButton } from '~/components/ui/IconButton';
import { Workbench } from '~/components/workbench/Workbench.client';
import { classNames } from '~/utils/classNames';
import { Messages } from './Messages.client';
import { PromptBox } from './PromptBox';
import GalaxyLogo from '~/components/ui/GalaxyLogo';

import styles from './BaseChat.module.scss';

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  messages?: ChatMessage[];
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string, deepSearch?: boolean) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  isHome?: boolean;
  user?: { name?: string };
  deepSearchEnabled?: boolean;
  onToggleDeepSearch?: () => void;
}

const SUGGESTION_CHIPS = [
  { text: 'Validate my startup idea' },
  { text: 'Create a SaaS platform' },
  { text: 'Build a marketplace' },
  { text: 'Design a landing page' },
];

const TEXTAREA_MIN_HEIGHT = 76;

// Greeting pools based on time of day
const GREETING_POOLS = {
  morning: [
    "Good morning, {name} ☀️",
    "Rise and shine, {name}!",
    "A bright day ahead, {name}."
  ],
  afternoon: [
    "Good afternoon, {name}.",
    "Hope your day's going well, {name}.",
    "Ready to make progress, {name}?"
  ],
  evening: [
    "Good evening, {name} 🌙",
    "Unwind and create, {name}.",
    "What's on the agenda tonight, {name}?"
  ],
  neutral: [
    "What's on the agenda today, {name}?",
    "Ready to build something great, {name}?",
    "How can I help today, {name}?"
  ]
};

// Get time-based greeting category
const getTimeCategory = () => {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "neutral"; // Late night uses neutral
};

// Get random greeting from appropriate pool
const getGreeting = (user?: { name?: string }) => {
  const timeCategory = getTimeCategory();
  const name = user?.name || "there";
  const pool = GREETING_POOLS[timeCategory];

  // Get random greeting from the pool
  const randomGreeting = pool[Math.floor(Math.random() * pool.length)];

  // Replace placeholder with name
  return randomGreeting.replace("{name}", name);
};

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      messageRef,
      scrollRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      enhancingPrompt = false,
      promptEnhanced = false,
      messages,
      input = '',
      sendMessage,
      handleInputChange,
      enhancePrompt,
      handleStop,
      user,
      deepSearchEnabled = false,
      onToggleDeepSearch,
    },
    ref,
  ) => {
    // Debug: BaseChat rendered with sendMessage
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    
    // Memoize greeting to prevent it from changing on every render
    const greeting = useMemo(() => {
      return user?.name ? getGreeting(user) : "Welcome to Gleio";
    }, [user?.name]);
      
    return (
        <div
        ref={ref}
          className={classNames(
            styles.BaseChat,
            'relative flex h-full w-full overflow-hidden bg-transparent',
          )}
        data-chat-visible={showChat}
        data-chat-started={chatStarted}
      >
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <div ref={scrollRef} className="flex overflow-y-auto w-full h-full">
          <div className={classNames(styles.Chat, 'flex flex-col flex-grow h-full')}>

            {/* Chat Started View */}
            {chatStarted && (
              <div className="h-full flex flex-col">
                <ClientOnly>
                  {() => (
                    <Messages
                      ref={messageRef}
                      className="flex flex-col w-full flex-1 max-w-4xl px-4 pt-8 pb-4 mx-auto z-1 overflow-y-auto"
                      messages={messages}
                      isStreaming={isStreaming}
                    />
                  )}
                </ClientOnly>
                <div className="relative w-full max-w-4xl mx-auto z-prompt px-4 pb-6 pt-2">
                  <PromptBox
                    ref={textareaRef}
                    className="w-full"
                    value={input}
                    onChange={handleInputChange}
                    onEnhance={enhancePrompt}
                    enhancingPrompt={enhancingPrompt}
                    isStreaming={isStreaming}
                    onStop={handleStop}
                    deepSearchEnabled={deepSearchEnabled}
                    onToggleDeepSearch={onToggleDeepSearch}
                    onSubmit={(value, imageFile, deepSearch) => {
                      if (isStreaming) {
                        handleStop?.();
                        return;
                      }
                      const syntheticEvent = {
                        preventDefault: () => {},
                        stopPropagation: () => {},
                        type: 'submit',
                        target: { value },
                        currentTarget: { value },
                      } as unknown as React.UIEvent;
                      sendMessage?.(syntheticEvent, value, deepSearch);
                    }}
                  />
                </div>
              </div>
            )}

            {/* Home View */}
            {!chatStarted && (
              <div
                id="intro"
                className="flex-1 flex flex-col items-center justify-center px-6 py-4"
              >
                {/* Greeting Section */}
                <div className="mb-8 animate-fadeIn">
                  <p className={`text-3xl md:text-4xl lg:text-5xl text-center text-conformity-elements-textPrimary leading-snug tracking-tight ${user?.name ? 'font-medium' : 'font-semibold'}`}>
                    {greeting}
                    {/* Example usage: <BaseChat user={{ name: "John" }} ... /> */}
                  </p>
                </div>
                
                {/* Chat Input - Perfectly centered */}
                <div className="w-full max-w-4xl mb-6 flex justify-center items-center">
                  <div className="w-full max-w-3xl">
                  <PromptBox
                    ref={textareaRef}
                      className="w-full"
                    value={input}
                    onChange={handleInputChange}
                    onEnhance={enhancePrompt}
                    enhancingPrompt={enhancingPrompt}
                    isStreaming={isStreaming}
                    onStop={handleStop}
                    deepSearchEnabled={deepSearchEnabled}
                    onToggleDeepSearch={onToggleDeepSearch}
                    onSubmit={(value, imageFile, deepSearch) => {
                      if (isStreaming) {
                        handleStop?.();
                        return;
                      }
                      const syntheticEvent = {
                        preventDefault: () => {},
                        stopPropagation: () => {},
                        type: 'submit',
                        target: { value },
                        currentTarget: { value },
                      } as unknown as React.UIEvent;
                      sendMessage?.(syntheticEvent, value, deepSearch);
                    }}
                  />
                  </div>
                </div>
                
                {/* Suggestion Chips - Perfectly centered */}
                <div className="w-full max-w-4xl flex justify-center">
                  <div id="examples" className="flex flex-wrap gap-4 justify-center items-center max-w-3xl">
                  {SUGGESTION_CHIPS.map((chip, index) => (
                    <button
                      key={index}
                      onClick={(event) => {
                        // Suggestion chip clicked
                        sendMessage?.(event, chip.text);
                      }}
                      className="inline-flex items-center px-5 py-3 bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-gray-200 dark:border-gray-600/30 hover:border-gray-300 dark:hover:border-gray-500/50 rounded-2xl transition-all duration-300 ease-out text-neutral-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white text-sm font-medium shadow-sm hover:shadow-lg backdrop-blur-sm transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-1"
                    >
                      <span>{chip.text}</span>
                    </button>
                  ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <ClientOnly>{() => <Workbench chatStarted={chatStarted} isStreaming={isStreaming} />}</ClientOnly>
        </div>
      </div>
    );
  },
);
