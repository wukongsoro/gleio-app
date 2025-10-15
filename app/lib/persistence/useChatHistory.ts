import { useLoaderData, useNavigate } from '@remix-run/react';
import { useState, useEffect } from 'react';
import { atom } from 'nanostores';
import type { UIMessage } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { getMessages, getNextId, getUrlId, openDatabase, setMessages } from './db';

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: UIMessage[];
  timestamp: string;
  userId?: string; // Add user ID for isolation
}

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

let dbPromise: Promise<IDBDatabase | undefined> | undefined;

function getDatabase() {
  if (!dbPromise) {
    dbPromise = persistenceEnabled ? openDatabase() : Promise.resolve(undefined);
  }
  return dbPromise;
}

export const db = undefined;

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const currentUserId = atom<string | undefined>(undefined);

export function useChatHistory() {
  const navigate = useNavigate();
  const loaderData = useLoaderData<{ id?: string }>();
  const { id: mixedId } = loaderData || {};

  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();
  const [db, setDb] = useState<IDBDatabase | undefined>();
  const [dbLoaded, setDbLoaded] = useState<boolean>(false);

  useEffect(() => {
    getDatabase().then((database) => {
      setDb(database);
      setDbLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!dbLoaded) {
      // Still loading database, don't show error yet
      return;
    }

    if (!db) {
      setReady(true);

      if (persistenceEnabled) {
        toast.error(`Chat persistence is unavailable`);
      }

      return;
    }

    if (mixedId) {
      getMessages(db, mixedId)
        .then((storedMessages) => {
          if (storedMessages) {
            // Chat exists, load its data even if messages array is empty
            setInitialMessages(storedMessages.messages || []);
            setUrlId(storedMessages.urlId);
            description.set(storedMessages.description);
            chatId.set(storedMessages.id);
            setReady(true);
          } else {
            // Chat not found, redirect to home
            console.warn(`Chat with ID ${mixedId} not found`);
            toast.error('Chat not found');
            navigate(`/`, { replace: true });
            setReady(true);
          }
        })
        .catch((error) => {
          console.error('Error loading chat:', error);
          toast.error('Failed to load chat: ' + error.message);
          // Don't redirect on error, just show empty chat
          setReady(true);
        });
    }
  }, [db, dbLoaded, mixedId, navigate]);

  return {
    ready: !mixedId || ready,
    initialMessages,
    storeMessageHistory: async (messages: UIMessage[]) => {
      if (!db || messages.length === 0) {
        return;
      }

      const { firstArtifact } = workbenchStore;

      // Ensure we have a chat ID first
      if (initialMessages.length === 0 && !chatId.get()) {
        const nextId = await getNextId(db);
        chatId.set(nextId);
      }

      const currentChatId = chatId.get() as string;
      
      // Generate urlId if we have an artifact and don't have one yet
      if (!urlId && firstArtifact?.id) {
        const newUrlId = await getUrlId(db, firstArtifact.id);
        navigateChat(newUrlId);
        setUrlId(newUrlId);
      }

      // If still no urlId, use the chat ID as the urlId for navigation
      const finalUrlId = urlId || currentChatId;
      
      if (!urlId) {
        setUrlId(finalUrlId);
        navigateChat(finalUrlId);
      }

      if (!description.get() && firstArtifact?.title) {
        description.set(firstArtifact?.title);
      }

      await setMessages(db, currentChatId, messages, finalUrlId, description.get(), currentUserId.get());
    },
  };
}

function navigateChat(nextId: string) {
  /**
   * FIXME: Using the intended navigate function causes a rerender for <Chat /> that breaks the app.
   *
   * `navigate(`/chat/${nextId}`, { replace: true });`
   */
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;

  window.history.replaceState({}, '', url);
}
