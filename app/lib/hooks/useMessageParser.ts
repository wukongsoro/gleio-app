import type { UIMessage } from 'ai';
import { useCallback, useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { StreamingMessageParser } from '~/lib/runtime/message-parser';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';

export type LegacyMessage = {
  id: string;
  role: string;
  content: string;
};

const logger = createScopedLogger('useMessageParser');

// Set this to true only during development debugging
const DEBUG_MODE = false;

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<{ [key: number]: string }>({});
  const processedMessagesRef = useRef<Set<string>>(new Set());
  const artifactFoundRef = useRef<Set<string>>(new Set());
  const streamingContentRef = useRef<{ [key: string]: string }>({});
  
  // Create a single parser instance that will be reused
  const messageParserRef = useRef<StreamingMessageParser>(
    new StreamingMessageParser({
      stripMarkdownFences: true,
      callbacks: {
        onArtifactOpen: (data) => {
          logger.trace('onArtifactOpen', data);
          console.log('🎯 WORKBENCH: Opening artifact:', data.id);

          // Track that an artifact was found for this message
          artifactFoundRef.current.add(data.messageId);

          workbenchStore.showWorkbench.set(true);
          workbenchStore.addArtifact(data);
        },
        onArtifactClose: (data) => {
          logger.trace('onArtifactClose');
          workbenchStore.updateArtifact(data, { closed: true });
        },
        onActionOpen: (data) => {
          logger.trace('onActionOpen', data.action);

          // we only add shell actions when the close tag got parsed because only then we have the content
          if (data.action.type !== 'shell') {
            workbenchStore.addAction(data);
          }
        },
        onActionClose: (data) => {
          logger.trace('onActionClose', data.action);

          if (data.action.type === 'shell') {
            workbenchStore.addAction(data);
          }

          workbenchStore.runAction(data);
        },
      },
    })
  );

  const parseMessages = useCallback((messages: LegacyMessage[], isLoading: boolean) => {

    const newParsedMessages: { [key: number]: string } = {};

    for (const [index, message] of messages.entries()) {
      if (message.role === 'assistant') {
        const isLastMessage = index === messages.length - 1;
        const isStreamingMessage = isLoading && isLastMessage;

        // Skip if we've already processed this complete message
        if (processedMessagesRef.current.has(message.id) && !isStreamingMessage) {
          continue;
        }


        let finalContent;

        if (isStreamingMessage) {
          // For streaming messages, accumulate content and parse it for display
          streamingContentRef.current[message.id] = message.content;
          
          // Parse content in real-time for workbench functionality
          const parsedContent = messageParserRef.current.parse(message.id, message.content);
          
          // If artifacts were found for this message, show only descriptive text in chat
          if (artifactFoundRef.current.has(message.id)) {
            finalContent = 'I\'ve created the files in the workbench. You can see the code and preview in the side panel.';
          } else {
            // Show parsed content (with boltArtifact tags removed) if no complete artifact yet
            finalContent = parsedContent;
          }
          
        } else {
          // For complete messages, check if this was previously streaming
          const wasStreaming = streamingContentRef.current[message.id];
          if (wasStreaming && message.content !== wasStreaming) {
            // This message was streaming and now it's complete - use the final content
            finalContent = message.content;
          } else {
            finalContent = message.content;
          }

          // Clean up streaming content
          delete streamingContentRef.current[message.id];

          // Parse the content using the shared parser instance for complete messages
          const parsedContent = messageParserRef.current.parse(message.id, finalContent);

          if (DEBUG_MODE) {
            console.log('Parsed content preview:', parsedContent.substring(0, 100) + '...');
            console.log('Contains boltArtifact:', parsedContent.includes('<boltArtifact'));
          }

          // Check if artifacts were detected for this message
          const hasArtifacts = artifactFoundRef.current.has(message.id);
          const containsBoltArtifactTag = finalContent.includes('<boltArtifact');

          // If artifacts were found, show only descriptive text in chat
          if (hasArtifacts) {
            finalContent = 'I\'ve created the files in the workbench. You can see the code and preview in the side panel.';
          } else {
            finalContent = parsedContent;
          }

          // Show toast and add inline hint if the message contains boltArtifact tags but they weren't parsed successfully
          if (containsBoltArtifactTag && !hasArtifacts) {
            toast.error('Code artifacts could not be parsed. Please ensure proper formatting without markdown code blocks around <boltArtifact> tags.');

            // Add inline hint to the parsed content
            const hintMessage = `\n\n---\n\n💡 **Hint**: This response contains code artifacts that couldn't be parsed. Please ask me to regenerate the response with proper formatting (without wrapping \`<boltArtifact>\` tags in markdown code blocks).`;
            finalContent = parsedContent + hintMessage;
          }

          // Mark message as fully processed
          processedMessagesRef.current.add(message.id);
        }

        newParsedMessages[index] = finalContent;
      }
    }

    // Update state with all parsed messages at once
    setParsedMessages(newParsedMessages);
  }, []);

  return { parsedMessages, parseMessages };
}