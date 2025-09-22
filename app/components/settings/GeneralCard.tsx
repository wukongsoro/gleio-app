import React from 'react';
import { useStore } from '@nanostores/react';
import { settingsStore, setSetting } from '~/lib/stores/settings';
import { themeStore, type Theme } from '~/lib/stores/theme';
import { clearAllChats, openDatabase } from '~/lib/persistence';

const CARD_CLASS = 'rounded-lg border border-conformity-elements-borderColor bg-conformity-elements-background-depth-3/65 p-4 shadow-sm';

interface GeneralCardProps {
  isLoading?: boolean;
}

export function GeneralCard({ isLoading }: GeneralCardProps) {
  const theme = useStore(themeStore);
  const settings = useStore(settingsStore);

  const handleThemeChange = (newTheme: Theme) => {
    themeStore.set(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('conformity_theme', newTheme);
      document.querySelector('html')?.setAttribute('data-theme', newTheme);
    }
  };

  const handleClearAllChats = async () => {
    if (!confirm('Delete all chat history? This cannot be undone.')) return;

    try {
      const database = await openDatabase();
      if (database) {
        await clearAllChats(database);
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Failed to clear chats:', error);
      alert('Failed to clear chat history. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-conformity-elements-background-depth-3 rounded animate-pulse" />
        <div className="space-y-4">
          <div className="h-20 bg-conformity-elements-background-depth-3 rounded animate-pulse" />
          <div className="h-20 bg-conformity-elements-background-depth-3 rounded animate-pulse" />
          <div className="h-20 bg-conformity-elements-background-depth-3 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-conformity-elements-textPrimary">General</h2>
        <p className="text-sm text-conformity-elements-textTertiary">
          Quick tweaks for the interface and editor. Changes apply instantly and are saved to this browser.
        </p>
      </div>

      <div className={CARD_CLASS}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-conformity-elements-textPrimary">
              <span className="i-ph:moon-stars text-base" aria-hidden />
              <span>Theme</span>
            </div>
            <p className="text-sm text-conformity-elements-textTertiary">
              Switch between dark and light modes to match your workspace lighting.
            </p>
          </div>
          <div className="flex gap-2">
            <ThemeButton isActive={theme === 'dark'} label="Dark" icon="🌙" onClick={() => handleThemeChange('dark')} />
            <ThemeButton isActive={theme === 'light'} label="Light" icon="☀️" onClick={() => handleThemeChange('light')} />
          </div>
        </div>
      </div>

      <SettingRow
        icon="i-ph:chart-bar"
        title="Token usage display"
        description="Show current prompt usage above the chat input so you can manage output length."
      >
        <Toggle checked={settings.showTokenUsage} onChange={(value) => setSetting('showTokenUsage', value)} />
      </SettingRow>

      <SettingRow
        icon="i-ph:text-align-left"
        title="Editor line wrapping"
        description="Wrap long lines instead of scrolling horizontally inside the editor."
      >
        <Toggle checked={settings.editorLineWrapping} onChange={(value) => setSetting('editorLineWrapping', value)} />
      </SettingRow>

      <div className="rounded-lg border border-red-500/30 bg-red-500/8 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-100">
              <span className="i-ph:warning text-base" aria-hidden />
              <span>Delete all chat history</span>
            </div>
            <p className="text-sm text-red-100/80">
              Removes every conversation stored locally. Projects and workspace settings stay untouched.
            </p>
          </div>
          <button
            onClick={handleClearAllChats}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            Delete chats
          </button>
        </div>
      </div>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

function ThemeButton({ isActive, label, icon, onClick }: { isActive: boolean; label: string; icon: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        isActive
          ? 'border-blue-600 bg-blue-600 text-white'
          : 'border-conformity-elements-borderColor bg-conformity-elements-background-depth-3 text-conformity-elements-textPrimary hover:bg-conformity-elements-background-depth-2'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function SettingRow({ icon, title, description, children }: { icon: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-conformity-elements-borderColor bg-conformity-elements-background-depth-3 p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-conformity-elements-textPrimary">
            <span className={`${icon} text-base`} aria-hidden />
            <span>{title}</span>
          </div>
          <p className="text-sm text-conformity-elements-textTertiary max-w-[60ch]">{description}</p>
        </div>
        <div className="flex items-center justify-end md:min-w-[140px]">{children}</div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        checked
          ? 'bg-blue-600'
          : 'bg-conformity-elements-background-depth-3 border border-conformity-elements-borderColor'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`ml-0.5 inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
