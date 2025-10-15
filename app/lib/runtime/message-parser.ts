import type { ActionType, BoltAction, BoltActionData, FileAction, ShellAction } from '~/types/actions';
import type { BoltArtifactData } from '~/types/artifact';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';

const ARTIFACT_TAG_OPEN = '<boltArtifact';
const ARTIFACT_TAG_CLOSE = '</boltArtifact>';
const ARTIFACT_ACTION_TAG_OPEN = '<boltAction';
const ARTIFACT_ACTION_TAG_CLOSE = '</boltAction>';

// Maximum number of messages to keep in memory
const MAX_MESSAGES_IN_MEMORY = 100;

const logger = createScopedLogger('MessageParser');

export interface ArtifactCallbackData extends BoltArtifactData {
  messageId: string;
}

export interface ActionCallbackData {
  artifactId: string;
  messageId: string;
  actionId: string;
  action: BoltAction;
}

export type ArtifactCallback = (data: ArtifactCallbackData) => void;
export type ActionCallback = (data: ActionCallbackData) => void;

export interface ParserCallbacks {
  onArtifactOpen?: ArtifactCallback;
  onArtifactClose?: ArtifactCallback;
  onActionOpen?: ActionCallback;
  onActionClose?: ActionCallback;
}

interface ElementFactoryProps {
  messageId: string;
}

type ElementFactory = (props: ElementFactoryProps) => string;

export interface StreamingMessageParserOptions {
  callbacks?: ParserCallbacks;
  artifactElement?: ElementFactory;
  maxMessagesInMemory?: number;
  stripMarkdownFences?: boolean;
}

interface MessageState {
  processedLength: number;
  insideArtifact: boolean;
  insideAction: boolean;
  currentArtifact?: BoltArtifactData;
  currentAction: BoltActionData;
  actionId: number;
  lastAccessed: number;
  output: string;
}

export class StreamingMessageParser {
  #messages = new Map<string, MessageState>();
  #messageOrder: string[] = [];
  #maxMessages: number;
  #stripMarkdownFences: boolean;

  constructor(private _options: StreamingMessageParserOptions = {}) {
    this.#maxMessages = _options.maxMessagesInMemory ?? MAX_MESSAGES_IN_MEMORY;
    this.#stripMarkdownFences = _options.stripMarkdownFences ?? false;
  }

  /**
   * Pre-process content to strip markdown fences if needed
   */
  #preprocessContent(content: string): string {
    if (!this.#stripMarkdownFences) {
      return content;
    }

    // Method 1: Simple fence pattern
    const simpleFencePattern = /```\s*(?:[a-zA-Z0-9_-]+)?\s*\n(<boltArtifact[\s\S]*?<\/boltArtifact>)\s*\n```/g;
    if (simpleFencePattern.test(content)) {
      logger.trace('Stripping markdown fences using simple pattern');
      return content.replace(simpleFencePattern, '$1');
    }

    // Method 2: Separate start/end fence removal
    const fenceStartPattern = /```(?:[a-zA-Z0-9_-]+)?\s*\n(?=<boltArtifact)/g;
    const fenceEndPattern = /(?<=<\/boltArtifact>)\s*\n```/g;
    
    if (fenceStartPattern.test(content)) {
      logger.trace('Stripping markdown fences using separate patterns');
      // Reset regex lastIndex after test
      fenceStartPattern.lastIndex = 0;
      content = content.replace(fenceStartPattern, '');
      content = content.replace(fenceEndPattern, '');
    }

    return content;
  }

  /**
   * Clean up old messages to prevent memory leaks
   */
  #cleanupOldMessages() {
    if (this.#messageOrder.length <= this.#maxMessages) {
      return;
    }

    // Remove oldest messages
    const toRemove = this.#messageOrder.length - this.#maxMessages;
    const removed = this.#messageOrder.splice(0, toRemove);
    
    for (const messageId of removed) {
      this.#messages.delete(messageId);
      logger.trace(`Cleaned up old message state: ${messageId}`);
    }
  }

  parse(messageId: string, input: string) {
    try {
      // Pre-process content if needed
      const processedInput = this.#preprocessContent(input);
      
      let state = this.#messages.get(messageId);

      const initializeState = () => ({
        processedLength: 0,
        insideAction: false,
        insideArtifact: false,
        currentAction: { content: '' },
        actionId: 0,
        lastAccessed: Date.now(),
        output: '',
      } satisfies MessageState);

      if (!state) {
        state = initializeState();
        this.#messages.set(messageId, state);
        this.#messageOrder.push(messageId);
        this.#cleanupOldMessages();
      } else {
        // Reset state if content shrank (e.g., final message replaces streaming chunk)
        if (processedInput.length < state.processedLength) {
          const existingIndex = this.#messageOrder.indexOf(messageId);
          state = initializeState();
          this.#messages.set(messageId, state);
          if (existingIndex === -1) {
            this.#messageOrder.push(messageId);
            this.#cleanupOldMessages();
          }
        } else {
          state.lastAccessed = Date.now();
        }
      }

      let output = '';
      let i = state.processedLength;
      let earlyBreak = false;

      while (i < processedInput.length) {
        if (state.insideArtifact) {
          const currentArtifact = state.currentArtifact;

          if (currentArtifact === undefined) {
            unreachable('Artifact not initialized');
          }

          if (state.insideAction) {
            const closeIndex = processedInput.indexOf(ARTIFACT_ACTION_TAG_CLOSE, i);

            const currentAction = state.currentAction;

            if (closeIndex !== -1) {
              currentAction.content += processedInput.slice(i, closeIndex);

              let content = currentAction.content.trim();

              if ('type' in currentAction && currentAction.type === 'file') {
                content += '\n';
              }

              currentAction.content = content;

              this._options.callbacks?.onActionClose?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId - 1),
                action: currentAction as BoltAction,
              });

              state.insideAction = false;
              state.currentAction = { content: '' };

              i = closeIndex + ARTIFACT_ACTION_TAG_CLOSE.length;
            } else {
              break;
            }
          } else {
            const actionOpenIndex = processedInput.indexOf(ARTIFACT_ACTION_TAG_OPEN, i);
            const artifactCloseIndex = processedInput.indexOf(ARTIFACT_TAG_CLOSE, i);

            if (actionOpenIndex !== -1 && (artifactCloseIndex === -1 || actionOpenIndex < artifactCloseIndex)) {
              const actionEndIndex = processedInput.indexOf('>', actionOpenIndex);

              if (actionEndIndex !== -1) {
                state.insideAction = true;

                state.currentAction = this.#parseActionTag(processedInput, actionOpenIndex, actionEndIndex);

                this._options.callbacks?.onActionOpen?.({
                  artifactId: currentArtifact.id,
                  messageId,
                  actionId: String(state.actionId++),
                  action: state.currentAction as BoltAction,
                });

                i = actionEndIndex + 1;
              } else {
                break;
              }
            } else if (artifactCloseIndex !== -1) {
              this._options.callbacks?.onArtifactClose?.({ messageId, ...currentArtifact });

              state.insideArtifact = false;
              state.currentArtifact = undefined;

              i = artifactCloseIndex + ARTIFACT_TAG_CLOSE.length;
            } else {
              break;
            }
          }
        } else if (processedInput[i] === '<' && processedInput[i + 1] !== '/') {
          let j = i;
          let potentialTag = '';

          while (j < processedInput.length && potentialTag.length < ARTIFACT_TAG_OPEN.length) {
            potentialTag += processedInput[j];

            if (potentialTag === ARTIFACT_TAG_OPEN) {
              const nextChar = processedInput[j + 1];

              if (nextChar && nextChar !== '>' && nextChar !== ' ') {
                output += processedInput.slice(i, j + 1);
                i = j + 1;
                break;
              }

              const openTagEnd = processedInput.indexOf('>', j);

              if (openTagEnd !== -1) {
                const artifactTag = processedInput.slice(i, openTagEnd + 1);

                const artifactTitle = this.#extractAttribute(artifactTag, 'title') as string;
                const artifactId = this.#extractAttribute(artifactTag, 'id') as string;

                if (!artifactTitle) {
                  logger.warn('Artifact title missing');
                }

                if (!artifactId) {
                  logger.warn('Artifact id missing');
                }

                state.insideArtifact = true;

                const currentArtifact = {
                  id: artifactId || `artifact_${Date.now()}`,
                  title: artifactTitle || 'Untitled',
                } satisfies BoltArtifactData;

                state.currentArtifact = currentArtifact;

                this._options.callbacks?.onArtifactOpen?.({ messageId, ...currentArtifact });

                const artifactFactory = this._options.artifactElement ?? createArtifactElement;

                output += artifactFactory({ messageId });

                i = openTagEnd + 1;
              } else {
                earlyBreak = true;
              }

              break;
            } else if (!ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
              output += processedInput.slice(i, j + 1);
              i = j + 1;
              break;
            }

            j++;
          }

          if (j === processedInput.length && ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
            break;
          }
        } else {
          // Regular character processing
          output += processedInput[i];
          i++;
        }

        if (earlyBreak) {
          break;
        }
      }

      state.processedLength = i;
      state.output += output;

      return state.output;
    } catch (error) {
      logger.error('Error parsing message:', error);
      // Return the original input on error to prevent data loss
      return input;
    }
  }

  /**
   * Reset parser state for all messages or specific message
   */
  reset(messageId?: string) {
    if (messageId) {
      this.#messages.delete(messageId);
      const index = this.#messageOrder.indexOf(messageId);
      if (index > -1) {
        this.#messageOrder.splice(index, 1);
      }
    } else {
      this.#messages.clear();
      this.#messageOrder = [];
    }
  }

  /**
   * Get the number of messages currently in memory
   */
  getMessageCount(): number {
    return this.#messages.size;
  }

  #parseActionTag(input: string, actionOpenIndex: number, actionEndIndex: number) {
    const actionTag = input.slice(actionOpenIndex, actionEndIndex + 1);

    const actionType = this.#extractAttribute(actionTag, 'type') as ActionType;

    const actionAttributes = {
      type: actionType,
      content: '',
    };

    if (actionType === 'file') {
      // Accept both `filePath` and `filepath` attribute names for better tolerance with model output
      let filePath = (this.#extractAttribute(actionTag, 'filePath') ||
        this.#extractAttribute(actionTag, 'filepath')) as string;

      if (!filePath) {
        logger.debug('File path not specified, using default');
        filePath = 'untitled.txt';
      }

      (actionAttributes as FileAction).filePath = filePath;
    } else if (actionType !== 'shell') {
      logger.warn(`Unknown action type '${actionType}'`);
    }

    return actionAttributes as FileAction | ShellAction;
  }

  /**
   * Extract attribute value from a tag, handling escaped quotes
   */
  #extractAttribute(tag: string, attributeName: string): string | undefined {
    // First try simple pattern
    const simpleMatch = tag.match(new RegExp(`${attributeName}="([^"]*)"`, 'i'));
    if (simpleMatch) {
      return simpleMatch[1];
    }

    // Handle single quotes
    const singleQuoteMatch = tag.match(new RegExp(`${attributeName}='([^']*)'`, 'i'));
    if (singleQuoteMatch) {
      return singleQuoteMatch[1];
    }

    // Handle no quotes
    const noQuoteMatch = tag.match(new RegExp(`${attributeName}=([^\\s>]+)`, 'i'));
    if (noQuoteMatch) {
      return noQuoteMatch[1];
    }

    return undefined;
  }
}

const createArtifactElement: ElementFactory = (props) => {
  const elementProps = [
    'class="__boltArtifact__"',
    ...Object.entries(props).map(([key, value]) => {
      return `data-${camelToDashCase(key)}=${JSON.stringify(value)}`;
    }),
  ];

  return `<div ${elementProps.join(' ')}></div>`;
};

function camelToDashCase(input: string) {
  return input.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
