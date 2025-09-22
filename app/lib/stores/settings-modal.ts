import { atom } from 'nanostores';

type SettingsModalState = {
  open: boolean;
  tab: string;
};

const DEFAULT_STATE: SettingsModalState = {
  open: false,
  tab: 'general',
};

export const settingsModalStore = atom<SettingsModalState>(DEFAULT_STATE);

export function openSettingsModal(tab: string = 'general') {
  settingsModalStore.set({ open: true, tab });
}

export function closeSettingsModal() {
  settingsModalStore.set(DEFAULT_STATE);
}

