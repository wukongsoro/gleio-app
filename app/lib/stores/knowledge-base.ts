import { atom } from 'nanostores';

export type KnowledgeBaseEntry = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeBaseState = {
  entries: KnowledgeBaseEntry[];
};

const STORAGE_KEY = 'knowledge_base_v1';
const defaultState: KnowledgeBaseState = { entries: [] };

const knowledgeBaseStore = atom<KnowledgeBaseState>(defaultState);

function createId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}

  return `kb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeEntries(entries: unknown): KnowledgeBaseEntry[] {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;

      const id = typeof (entry as any).id === 'string' ? (entry as any).id : createId();
      const title = typeof (entry as any).title === 'string' ? (entry as any).title : '';
      const content = typeof (entry as any).content === 'string' ? (entry as any).content : '';
      const createdAt = typeof (entry as any).createdAt === 'string' ? (entry as any).createdAt : new Date().toISOString();
      const updatedAt = typeof (entry as any).updatedAt === 'string' ? (entry as any).updatedAt : createdAt;

      return { id, title, content, createdAt, updatedAt } satisfies KnowledgeBaseEntry;
    })
    .filter((entry): entry is KnowledgeBaseEntry => entry !== null);
}

function loadKnowledgeBase(): KnowledgeBaseState {
  if (typeof window === 'undefined') return defaultState;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { entries: sanitizeEntries(parsed) };
    }

    if (parsed && typeof parsed === 'object' && 'entries' in parsed) {
      return { entries: sanitizeEntries((parsed as any).entries) };
    }
  } catch (error) {
    console.warn('[knowledge-base] Failed to load from storage', error);
  }

  return defaultState;
}

function persist(state: KnowledgeBaseState) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[knowledge-base] Failed to persist to storage', error);
  }
}

export { knowledgeBaseStore };

export function hydrateKnowledgeBase() {
  const next = loadKnowledgeBase();
  knowledgeBaseStore.set(next);
}

export function addKnowledgeBaseEntry(entry: { title: string; content: string }) {
  const now = new Date().toISOString();
  const normalizedTitle = entry.title.trim();
  const normalizedContent = entry.content.trim();

  const newEntry: KnowledgeBaseEntry = {
    id: createId(),
    title: normalizedTitle,
    content: normalizedContent,
    createdAt: now,
    updatedAt: now,
  };

  const current = knowledgeBaseStore.get();
  const next = { entries: [...current.entries, newEntry] } satisfies KnowledgeBaseState;

  knowledgeBaseStore.set(next);
  persist(next);

  return newEntry.id;
}

export function updateKnowledgeBaseEntry(
  id: string,
  updates: Partial<Pick<KnowledgeBaseEntry, 'title' | 'content'>>,
) {
  const current = knowledgeBaseStore.get();
  const index = current.entries.findIndex((entry) => entry.id === id);

  if (index === -1) return;

  const normalizedTitle = typeof updates.title === 'string' ? updates.title.trim() : current.entries[index].title;
  const normalizedContent =
    typeof updates.content === 'string' ? updates.content.trim() : current.entries[index].content;

  const updatedEntry: KnowledgeBaseEntry = {
    ...current.entries[index],
    title: normalizedTitle,
    content: normalizedContent,
    updatedAt: new Date().toISOString(),
  };

  const nextEntries = [...current.entries];
  nextEntries[index] = updatedEntry;

  const next = { entries: nextEntries } satisfies KnowledgeBaseState;

  knowledgeBaseStore.set(next);
  persist(next);
}

export function removeKnowledgeBaseEntry(id: string) {
  const current = knowledgeBaseStore.get();
  const nextEntries = current.entries.filter((entry) => entry.id !== id);

  const next = { entries: nextEntries } satisfies KnowledgeBaseState;
  knowledgeBaseStore.set(next);
  persist(next);
}

export function clearKnowledgeBase() {
  knowledgeBaseStore.set(defaultState);
  persist(defaultState);
}

if (typeof window !== 'undefined') {
  hydrateKnowledgeBase();

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      hydrateKnowledgeBase();
    }
  });
}

