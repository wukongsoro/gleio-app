import React, { useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  knowledgeBaseStore,
  addKnowledgeBaseEntry,
  updateKnowledgeBaseEntry,
  removeKnowledgeBaseEntry,
  clearKnowledgeBase,
  type KnowledgeBaseEntry,
} from '~/lib/stores/knowledge-base';

type DraftEntry = {
  title: string;
  content: string;
};

const emptyDraft: DraftEntry = { title: '', content: '' };
const CARD_CLASS = 'rounded-lg border border-conformity-elements-borderColor bg-conformity-elements-background-depth-3/65 p-4 shadow-sm';

function formatTimestamp(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function KnowledgeCard() {
  const { entries } = useStore(knowledgeBaseStore);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [entries]);

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftEntry>({ ...emptyDraft });

  const startAdd = () => {
    setDraft({ ...emptyDraft });
    setEditingId(null);
    setIsEditing(true);
  };

  const startEdit = (entry: KnowledgeBaseEntry) => {
    setDraft({ title: entry.title, content: entry.content });
    setEditingId(entry.id);
    setIsEditing(true);
  };

  const resetDraft = () => {
    setDraft({ ...emptyDraft });
    setEditingId(null);
    setIsEditing(false);
  };

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    const title = draft.title.trim();
    const content = draft.content.trim();

    if (!title && !content) {
      resetDraft();
      return;
    }

    if (editingId) {
      updateKnowledgeBaseEntry(editingId, { title, content });
    } else {
      addKnowledgeBaseEntry({ title, content });
    }

    resetDraft();
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this knowledge entry? This cannot be undone.')) {
      removeKnowledgeBaseEntry(id);

      if (editingId === id) {
        resetDraft();
      }
    }
  };

  const handleClearAll = () => {
    if (sortedEntries.length === 0) return;

    if (window.confirm('Clear all knowledge base entries? This cannot be undone.')) {
      clearKnowledgeBase();
      resetDraft();
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.28em] text-conformity-elements-textTertiary">Knowledge base</p>
        <h2 className="text-xl font-semibold text-conformity-elements-textPrimary">Share context Gleio should trust</h2>
        <p className="max-w-[70ch] text-sm text-conformity-elements-textTertiary">
          Store guidelines, messaging pillars, and SOPs locally. They accompany every prompt so Gleio replies as if it were on your team.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/8 p-4">
        <span className="i-ph:lightbulb text-lg text-blue-400" aria-hidden />
        <p className="text-sm text-conformity-elements-textSecondary">
          Keep entries concise and factual. Use headings, bullets, or quick paragraphs—everything is bundled before each response.
        </p>
      </div>

      <div className="space-y-4">
        {isEditing ? (
          <form onSubmit={handleSubmit} className={`space-y-4 ${CARD_CLASS}`}>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-conformity-elements-textSecondary" htmlFor="knowledge-title">
                Title
              </label>
              <input
                id="knowledge-title"
                type="text"
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="e.g. Brand voice"
                className="w-full rounded-lg border border-conformity-elements-borderColor bg-conformity-elements-background-depth-2 px-3 py-2 text-sm text-conformity-elements-textPrimary focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-conformity-elements-textSecondary" htmlFor="knowledge-content">
                Details
              </label>
              <textarea
                id="knowledge-content"
                value={draft.content}
                onChange={(event) => setDraft((prev) => ({ ...prev, content: event.target.value }))}
                placeholder="Provide the guidance, facts, or procedures the agent should follow."
                rows={6}
                className="w-full resize-none rounded-lg border border-conformity-elements-borderColor bg-conformity-elements-background-depth-2 px-3 py-2 text-sm text-conformity-elements-textPrimary focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-conformity-elements-textTertiary">Empty entries will be discarded automatically.</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetDraft}
                  className="rounded-lg border border-conformity-elements-borderColor px-4 py-2 text-sm font-medium text-conformity-elements-textSecondary transition-colors hover:bg-conformity-elements-background-depth-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                >
                  {editingId ? 'Save changes' : 'Add entry'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={startAdd}
              className="inline-flex items-center gap-2 rounded-lg border border-dashed border-conformity-elements-borderColor px-4 py-2 text-sm font-medium text-conformity-elements-textSecondary transition-colors hover:border-blue-500 hover:text-conformity-elements-textPrimary"
            >
              <span className="i-ph:plus-circle text-lg" aria-hidden />
              Add knowledge entry
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={sortedEntries.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="i-ph:trash-simple" aria-hidden />
              Clear all
            </button>
          </div>
        )}

        <div className="space-y-3">
          {sortedEntries.length === 0 && !isEditing ? (
            <div className="rounded-lg border border-dashed border-conformity-elements-borderColor bg-conformity-elements-background-depth-3/60 p-5 text-sm text-conformity-elements-textSecondary">
              No entries yet. Add product messaging, FAQ answers, escalation paths, or any details the agent should
              reference automatically.
            </div>
          ) : (
            sortedEntries.map((entry) => (
              <article key={entry.id} className={`space-y-3 ${CARD_CLASS}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <h3 className="text-base font-medium text-conformity-elements-textPrimary">
                      {entry.title || 'Untitled entry'}
                    </h3>
                    {entry.content ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-conformity-elements-textSecondary">
                        {entry.content}
                      </p>
                    ) : (
                      <p className="text-sm italic text-conformity-elements-textTertiary">No details provided.</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => startEdit(entry)}
                      className="inline-flex items-center gap-2 rounded-lg border border-conformity-elements-borderColor px-3 py-1.5 text-conformity-elements-textSecondary transition-colors hover:bg-conformity-elements-background-depth-2"
                    >
                      <span className="i-ph:pencil-simple" aria-hidden />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      className="inline-flex items-center gap-2 rounded-lg border border-transparent px-3 py-1.5 text-red-400 transition-colors hover:text-red-300"
                    >
                      <span className="i-ph:trash" aria-hidden />
                      Delete
                    </button>
                  </div>
                </div>
                <div className="text-xs text-conformity-elements-textTertiary">
                  Updated {formatTimestamp(entry.updatedAt)}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
