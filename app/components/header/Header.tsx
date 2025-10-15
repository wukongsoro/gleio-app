import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import GalaxyLogo from '~/components/ui/GalaxyLogo';
import GleioLogo from '~/components/ui/GleioLogo';
import { useState, useEffect } from 'react';

export function Header({ isHome = false }: { isHome?: boolean }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const chat = useStore(chatStore);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return (
    <header
      className={classNames(
        'flex items-center px-6 h-[var(--header-height)] backdrop-blur-md transition-theme',
        isHome
          ? 'bg-transparent'
          : 'bg-[var(--conformity-elements-bg-depth-1)]/60 glass-effect border-b border-[var(--conformity-elements-borderColor)]',
      )}
    >
      <div className="flex items-center gap-3 z-logo text-conformity-elements-textPrimary">
        <a href="/" className="flex items-center gap-3">
          <GleioLogo variant="mark" size="md" className="opacity-90" />
          <span className="text-lg font-semibold tracking-tight">Gleio AI</span>
        </a>
      </div>
      <span className="flex-1 px-6 truncate text-center text-conformity-elements-textPrimary">
        <ClientOnly>{() => <ChatDescription />}</ClientOnly>
      </span>
      {/* Reserve space for action buttons to prevent layout shift */}
      <div className="mr-2" style={{ minWidth: isHydrated && chat.started ? 'auto' : '0px', overflow: 'hidden' }}>
        {isHydrated && chat.started && (
          <ClientOnly>
            {() => <HeaderActionButtons />}
          </ClientOnly>
        )}
      </div>
    </header>
  );
}
