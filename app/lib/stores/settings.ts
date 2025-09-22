import { atom } from 'nanostores';

export type AppSettings = {
  showTokenUsage: boolean;
  editorLineWrapping: boolean;
};

const DEFAULT_SETTINGS: AppSettings = {
  showTokenUsage: false,
  editorLineWrapping: true,
};

const STORAGE_KEY = 'app_settings_v1';

function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed } as AppSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const settingsStore = atom<AppSettings>(loadSettings());

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  const next = { ...settingsStore.get(), [key]: value } as AppSettings;
  settingsStore.set(next);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore persistence errors
    }
  }
}

// Shortcut settings and runtime actions
export type Shortcut = {
  key: string;
  ctrlOrMetaKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  action: () => void;
};

export type Shortcuts = {
  toggleTerminal: Shortcut;
};

const DEFAULT_SHORTCUTS: Shortcuts = {
  toggleTerminal: {
    key: '`',
    ctrlOrMetaKey: true,
    action: () => {
      import('./workbench').then(({ workbenchStore }) => {
        const current = workbenchStore.showTerminal.get();
        workbenchStore.toggleTerminal(!current);
      });
    },
  },
};

export const shortcutsStore = atom<Shortcuts>(DEFAULT_SHORTCUTS);
