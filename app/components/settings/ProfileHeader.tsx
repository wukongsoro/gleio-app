import React, { useState } from "react";
import { Avatar } from "~/components/ui/Avatar";
import { getSettingsDataLayer, type UserProfile } from "~/lib/settings/data";

const CARD_CLASS = "rounded-lg border border-conformity-elements-borderColor bg-conformity-elements-background-depth-3/65 p-5 shadow-sm";

interface ProfileHeaderProps {
  profile: UserProfile | null;
  isLoading: boolean;
  onProfileUpdate: (updates: Partial<UserProfile>) => void;
}

export function ProfileHeader({ profile, isLoading, onProfileUpdate }: ProfileHeaderProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStartEdit = () => {
    setEditName(profile?.name || '');
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!editName.trim() || editName === profile?.name) {
      setIsEditingName(false);
      return;
    }

    setIsUpdating(true);
    try {
      const dataLayer = getSettingsDataLayer();
      const result = await dataLayer.updateProfile({ name: editName.trim() });
      if (result.data) onProfileUpdate(result.data);
    } catch (error) {
      console.error('Failed to update name:', error);
    } finally {
      setIsUpdating(false);
      setIsEditingName(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName('');
    setIsEditingName(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveName();
    if (e.key === 'Escape') handleCancelEdit();
  };

  const joined = profile
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  if (isLoading) {
    return (
      <section className={CARD_CLASS}>
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-conformity-elements-background-depth-2 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-40 rounded bg-conformity-elements-background-depth-2 animate-pulse" />
            <div className="h-4 w-56 rounded bg-conformity-elements-background-depth-2 animate-pulse" />
          </div>
          <div className="hidden h-8 w-20 rounded bg-conformity-elements-background-depth-2 animate-pulse sm:block" />
        </div>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className={CARD_CLASS}>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-conformity-elements-background-depth-2">
            <span className="text-xl text-conformity-elements-textTertiary">?</span>
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold text-conformity-elements-textPrimary">Profile not found</p>
            <p className="text-sm text-conformity-elements-textTertiary">Unable to load profile information.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={CARD_CLASS}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar src={profile.avatar_url} alt={`${profile.name} avatar`} name={profile.name} size={68} />
          <div className="min-w-0 flex-1 space-y-1">
            {isEditingName ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  onKeyDown={handleKeyPress}
                  className="flex-1 rounded-md border border-conformity-elements-borderColor bg-conformity-elements-background-depth-2 px-3 py-2 text-sm font-medium text-conformity-elements-textPrimary placeholder:text-conformity-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your name"
                  disabled={isUpdating}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveName}
                    disabled={isUpdating || !editName.trim()}
                    className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isUpdating ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={isUpdating}
                    className="rounded-md border border-conformity-elements-borderColor px-3 py-2 text-sm font-medium text-conformity-elements-textSecondary transition hover:bg-conformity-elements-background-depth-2 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <h1 className="min-w-0 truncate text-xl font-semibold text-conformity-elements-textPrimary">{profile.name}</h1>
                <button
                  onClick={handleStartEdit}
                  className="inline-flex items-center gap-1 text-sm font-medium text-conformity-elements-textSecondary transition hover:text-conformity-elements-textPrimary"
                >
                  <span className="i-ph:pencil-simple text-sm" aria-hidden />
                  Edit name
                </button>
              </div>
            )}

            <p className="truncate text-sm text-conformity-elements-textTertiary">{profile.email}</p>
            {joined && <p className="text-xs text-conformity-elements-textTertiary">Member since {joined}</p>}
          </div>
        </div>

        {!isEditingName && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-conformity-elements-borderColor px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-conformity-elements-textSecondary">
              <span className="i-ph:user-circle text-sm" aria-hidden />
              Account
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-conformity-elements-borderColor px-3 py-1 text-xs text-conformity-elements-textTertiary">
              <span className="i-ph:clock text-sm" aria-hidden />
              Active session
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
