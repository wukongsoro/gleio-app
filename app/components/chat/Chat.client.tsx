
import { useStore } from '@nanostores/react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useAnimate } from 'framer-motion';
import { memo, useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { cssTransition, toast, ToastContainer } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts, useSnapScroll } from '~/lib/hooks';
import type { LegacyMessage } from '~/lib/hooks/useMessageParser';
import { useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { knowledgeBaseStore } from '~/lib/stores/knowledge-base';
import { workbenchStore } from '~/lib/stores/workbench';
import { researchStore } from '~/lib/stores/research';
import { fileModificationsToHTML } from '~/utils/diff';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import { FloatingLogin } from '~/components/auth';
import { useFloatingLogin } from '~/hooks/useFloatingLogin';
import { auth } from '~/lib/supabase';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

const logger = createScopedLogger('Chat');

export function Chat({ isHome = false }: { isHome?: boolean }) {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory } = useChatHistory();

  return (
    <>
      {ready && (
        <ChatImpl
          initialMessages={initialMessages as unknown[]}
          // cast to any to avoid mismatch between UIMessage and unknown
          storeMessageHistory={storeMessageHistory as unknown as (messages: unknown[]) => Promise<void>}
          isHome={isHome}
        />
      )}
      <ToastContainer
        closeButton={({ closeToast }) => {
          return (
            <button className="Toastify__close-button" onClick={closeToast}>
              <div className="i-ph:x text-lg" />
            </button>
          );
        }}
        icon={({ type }) => {
          /**
           * @todo Handle more types if we need them. This may require extra color palettes.
           */
          switch (type) {
            case 'success': {
              return <div className="i-ph:check-bold text-conformity-elements-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-conformity-elements-icon-error text-2xl" />;
            }
          }

          return undefined;
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
      />
    </>
  );
}

interface ChatProps {
  initialMessages: unknown[];
  storeMessageHistory: (messages: unknown[]) => Promise<void>;
}

export const ChatImpl = memo(({ initialMessages, storeMessageHistory, isHome = false }: ChatProps & { isHome?: boolean }) => {
  useShortcuts();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [chatStarted, setChatStarted] = useState((initialMessages as unknown[]).length > 0);
  const [currentUser, setCurrentUser] = useState<{ name?: string } | undefined>(undefined);

  const { showChat } = useStore(chatStore);
  const knowledgeBase = useStore(knowledgeBaseStore);
  const deepSearchEnabled = useStore(researchStore.deepSearchEnabled);

  const [animationScope, animate] = useAnimate();

  const { isVisible: showFloatingLogin, hideFloatingLogin } = useFloatingLogin();

  // Auto-open workbench when loading old chats with messages
  useEffect(() => {
    if ((initialMessages as unknown[]).length > 0) {
      workbenchStore.showWorkbench.set(true);
    }
  }, [initialMessages.length]);

  // Get current user from database profile
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const { user, error } = await auth.getCurrentUser();
        if (user && !error) {
          // First try to get profile from database
          const { getSettingsDataLayer } = await import('~/lib/settings/data');
          const dataLayer = getSettingsDataLayer();
          const profileResult = await dataLayer.getProfile();

          if (profileResult.data) {
            // Use database profile name
            setCurrentUser({ name: profileResult.data.name });
          } else {
            // Fallback to auth metadata
            const displayName = user.user_metadata?.full_name ||
                               user.user_metadata?.name ||
                               user.email?.split('@')[0] ||
                               'there';
            setCurrentUser({ name: displayName });
          }
        } else {
          setCurrentUser(undefined);
        }
      } catch (error) {
        console.error('Failed to get current user:', error);
        setCurrentUser(undefined);
      }
    };

    getCurrentUser();

    // Listen to auth state changes
    const { data: { subscription: authSubscription } } = auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        getCurrentUser(); // Re-fetch user data when signed in
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(undefined);
      }
    });

    // Listen to profile updates from settings data layer
    const setupProfileListener = async () => {
      const { getSettingsDataLayer } = await import('~/lib/settings/data');
      const dataLayer = getSettingsDataLayer();

      const handleProfileUpdate = (payload: any) => {
        if (payload.eventType === 'UPDATE' && payload.new?.name) {
          setCurrentUser({ name: payload.new.name });
        }
      };

      dataLayer.on('profile-update', handleProfileUpdate);

      return () => {
        dataLayer.off('profile-update', handleProfileUpdate);
      };
    };

    let cleanupProfileListener: (() => void) | undefined;

    setupProfileListener().then(cleanup => {
      cleanupProfileListener = cleanup;
    });

    return () => {
      authSubscription.unsubscribe();
      if (cleanupProfileListener) {
        cleanupProfileListener();
      }
    };
  }, []);

  // Floating login handlers
  const handleGoogleLogin = async () => {
    const { auth } = await import('~/lib/supabase');
    const { error } = await auth.signInWithOAuth('google');
    if (error) {
      console.error('Google login error:', error.message);
      alert(error.message || 'Google authentication failed. Please try again.');
      throw error;
    }
    hideFloatingLogin();
    // OAuth will handle the redirect automatically
  };

  const handleGithubLogin = async () => {
    const { auth } = await import('~/lib/supabase');
    const { error } = await auth.signInWithOAuth('github');
    if (error) {
      console.error('GitHub login error:', error.message);
      alert(error.message || 'GitHub authentication failed. Please try again.');
      throw error;
    }
    hideFloatingLogin();
    // OAuth will handle the redirect automatically
  };

  const { messages, stop, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onError: (error: Error) => {
      logger.error('Request failed\n\n', error);
      toast.error('There was an error processing your request');
    },
  });

  // Load initial messages from history
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0 && messages.length === 0) {
      setMessages(initialMessages as any[]);
    }
  }, [initialMessages, messages.length, setMessages]);

  const [input, setInput] = useState('');
  const handleInputChange: React.ChangeEventHandler<HTMLTextAreaElement> = (event) => {
    setInput(event.target.value);
  };
  const isLoading = status === 'submitted' || status === 'streaming';

  const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
  const { parsedMessages, parseMessages } = useMessageParser();

  const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

  useEffect(() => {
    chatStore.setKey('started', (initialMessages as unknown[]).length > 0);
  }, []);

  // Extract concatenated text from a UIMessage's parts
  const getTextFromMessage = (message: any): string => {
    try {
      if (Array.isArray(message?.parts)) {
        return message.parts
          .filter((p: any) => p?.type === 'text')
          .map((p: any) => String(p.text ?? ''))
          .join('');
      }
      return String(message?.content ?? '');
    } catch {
      return '';
    }
  };

  const lastMessageContentRef = useRef<string>('');

  useEffect(() => {
    const legacyMessages = messages.map((m: any) => ({ id: m.id, role: m.role, content: getTextFromMessage(m) }));

    // Always parse messages - but handle streaming vs complete differently
    parseMessages(legacyMessages as LegacyMessage[], isLoading);

    // Only save to history when not streaming and we have new messages
    if (!isLoading && messages.length > initialMessages.length) {
      storeMessageHistory(legacyMessages as unknown[]).catch((error) => toast.error(error.message));
    }
  }, [messages, isLoading, parseMessages, initialMessages.length]);

  const scrollTextArea = () => {
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  };

  const abort = () => {
    stop();
    chatStore.setKey('aborted', true);
    workbenchStore.abortAllActions();
  };

  useEffect(() => {
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.style.height = 'auto';

      const scrollHeight = textarea.scrollHeight;

      textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
      textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
    }
  }, [input, textareaRef]);

  const runAnimation = async () => {
    if (chatStarted) {
      return;
    }

    await Promise.all([
      animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
      animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
    ]);

    chatStore.setKey('started', true);

    setChatStarted(true);
  };

  const sendMessageHandler = async (_event: React.UIEvent, messageInput?: string, deepSearch?: boolean) => {
    const _input = messageInput || input;

    if (_input.length === 0 || isLoading) {
      return;
    }

    // Handle deep search mode
    if (deepSearch) {
      // Clear input and disable deep search
      setInput('');
      researchStore.deepSearchEnabled.set(false);
      
      // Run chat start animation if needed
      if (!chatStarted) {
        await runAnimation();
      }
      
      // Start research in background
      try {
        // Open workbench to Research tab FIRST
        workbenchStore.showWorkbench.set(true);
        workbenchStore.currentView.set('research');

        // Add a chat message indicating research started (without triggering transport)
        const notificationText = `🔍 Starting deep research: "${_input}"\n\n📊 View progress in the Research tab →`;
        const notificationId = globalThis.crypto?.randomUUID?.() ?? `research-${Date.now()}`;

        setMessages((prevMessages: any[]) => {
          const nextMessages = Array.isArray(prevMessages) ? [...prevMessages] : [];
          nextMessages.push({
            id: notificationId,
            role: 'assistant',
            content: notificationText,
            parts: [
              {
                id: `${notificationId}-part`,
                type: 'text',
                text: notificationText,
              },
            ],
          });
          return nextMessages;
        });

        // Start the actual research
        await researchStore.startResearch(_input, 'heavy');
      } catch (error) {
        toast.error('Failed to start research');
        console.error('Research error:', error);

        const errorText = '⚠️ Deep research failed to start. Please try again.';
        const errorId = globalThis.crypto?.randomUUID?.() ?? `research-error-${Date.now()}`;

        setMessages((prevMessages: any[]) => {
          const nextMessages = Array.isArray(prevMessages) ? [...prevMessages] : [];
          nextMessages.push({
            id: errorId,
            role: 'assistant',
            content: errorText,
            parts: [
              {
                id: `${errorId}-part`,
                type: 'text',
                text: errorText,
              },
            ],
          });
          return nextMessages;
        });
      }

      return;
    }

    // Clear input immediately to prevent it from staying in the chatbox
    setInput('');

    /**
     * @note (delm) Usually saving files shouldn't take long but it may take longer if there
     * many unsaved files. In that case we need to block user input and show an indicator
     * of some kind so the user is aware that something is happening. But I consider the
     * happy case to be no unsaved files and I would expect users to save their changes
     * before they send another message.
     */
    await workbenchStore.saveAllFiles();

    const fileModifications = workbenchStore.getFileModifcations();

    chatStore.setKey('aborted', false);

    runAnimation();

    const knowledgePayload = knowledgeBase.entries
      .map((entry) => ({
        id: entry.id,
        title: entry.title.trim(),
        content: entry.content.trim(),
      }))
      .filter((entry) => entry.title || entry.content);

    const chatRequestOptions = knowledgePayload.length > 0 ? { body: { knowledgeBase: knowledgePayload } } : undefined;

    if (fileModifications !== undefined) {
      const diff = fileModificationsToHTML(fileModifications);

      /**
       * If we have file modifications we append a new user message manually since we have to prefix
       * the user input with the file modifications and we don't want the new user input to appear
       * in the prompt. Using `append` is almost the same as `handleSubmit` except that we have to
       * manually reset the input and we'd have to manually pass in file attachments. However, those
       * aren't relevant here.
       */
      await sendMessage({ text: `${diff}\n\n${_input}` }, chatRequestOptions);

      /**
       * After sending a new message we reset all modifications since the model
       * should now be aware of all the changes.
       */
      workbenchStore.resetAllFileModifications();
    } else {
      await sendMessage({ text: _input }, chatRequestOptions);
    }

    resetEnhancer();

    textareaRef.current?.blur();
  };

  const [messageRef, scrollRef] = useSnapScroll();

  // Memoize processed messages to prevent unnecessary re-renders
  const processedMessages = useMemo(() => {
    return messages.map((message, i) => {
      const content =
        message.role === 'assistant'
          ? parsedMessages[i] || getTextFromMessage(message as any)
          : getTextFromMessage(message as any);

      return { id: (message as any).id, role: message.role, content } as any;
    });
  }, [messages, parsedMessages]);

  // Memoize enhance prompt handler to prevent creating new function on every render
  const handleEnhancePrompt = useCallback(() => {
    enhancePrompt(input, (enhancedInput) => {
      setInput(enhancedInput);
      scrollTextArea();
    });
  }, [input, enhancePrompt, scrollTextArea]);

  return (
    <>
      <BaseChat
        ref={animationScope}
        textareaRef={textareaRef}
        input={input}
        showChat={showChat}
        chatStarted={chatStarted}
        isStreaming={isLoading}
        enhancingPrompt={enhancingPrompt}
        promptEnhanced={promptEnhanced}
        sendMessage={sendMessageHandler}
        messageRef={messageRef}
        scrollRef={scrollRef}
        handleInputChange={handleInputChange}
        handleStop={abort}
        isHome={isHome}
        user={currentUser}
        messages={processedMessages}
        deepSearchEnabled={deepSearchEnabled}
        onToggleDeepSearch={() => researchStore.toggleDeepSearch()}
        enhancePrompt={handleEnhancePrompt}
      />

      {/* Floating Login */}
      {showFloatingLogin && (
        <FloatingLogin
          onGoogleLogin={handleGoogleLogin}
          onGithubLogin={handleGithubLogin}
          onClose={hideFloatingLogin}
        />
      )}
    </>
  );
});
