import { useStore } from '@nanostores/react';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { themeStore, toggleTheme } from '~/lib/stores/theme';
import { classNames } from '~/utils/classNames';

interface HeaderActionButtonsProps {}

export function HeaderActionButtons({}: HeaderActionButtonsProps) {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const { showChat } = useStore(chatStore);
  const theme = useStore(themeStore);

  const canHideChat = showWorkbench || !showChat;

  return (
    <div className="flex items-center gap-2">
      <div className="flex border border-conformity-elements-borderColor rounded-md overflow-hidden">
        <Button
          active={showChat}
          disabled={!canHideChat}
          onClick={() => {
            if (canHideChat) {
              chatStore.setKey('showChat', !showChat);
            }
          }}
        >
          <div className="i-ph:chat-circle text-sm" />
        </Button>
        <div className="w-[1px] bg-conformity-elements-borderColor" />
        <Button
          active={showWorkbench}
          onClick={() => {
            if (showWorkbench && !showChat) {
              chatStore.setKey('showChat', true);
            }

            workbenchStore.showWorkbench.set(!showWorkbench);
          }}
        >
          <div className="i-ph:code-bold" />
        </Button>
      </div>

      {/* Theme Toggle Button */}
      <Button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <div className={theme === 'dark' ? 'i-ph:sun-dim-duotone text-sm' : 'i-ph:moon-stars-duotone text-sm'} />
      </Button>
    </div>
  );
}

interface ButtonProps {
  active?: boolean;
  disabled?: boolean;
  children?: any;
  onClick?: VoidFunction;
  title?: string;
}

function Button({ active = false, disabled = false, children, onClick, title }: ButtonProps) {
  return (
    <button
      className={classNames('flex items-center p-1.5', {
        'bg-conformity-elements-item-backgroundDefault hover:bg-conformity-elements-item-backgroundActive text-conformity-elements-textTertiary hover:text-conformity-elements-textPrimary':
          !active,
        'bg-conformity-elements-item-backgroundAccent text-conformity-elements-item-contentAccent': active && !disabled,
        'bg-conformity-elements-item-backgroundDefault text-alpha-gray-20 dark:text-alpha-white-20 cursor-not-allowed':
          disabled,
      })}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}
