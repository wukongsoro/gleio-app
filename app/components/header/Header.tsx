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
        'flex items-center p-6 h-[var(--header-height)] backdrop-blur-md transition-theme',
        isHome
          ? 'bg-transparent'
          : 'bg-[var(--conformity-elements-bg-depth-1)]/60 glass-effect border-b border-[var(--conformity-elements-borderColor)]',
      )}
    >
      <div className="flex items-center gap-4 z-logo text-conformity-elements-textPrimary">
        <a href="/" className="flex items-center">
          {isHome ? (
            <GleioLogo variant="horizontal" size="md" className="opacity-95" monochrome />
          ) : (
            <div className="w-auto h-10 rounded-lg overflow-hidden shadow-premium relative border border-conformity-elements-accent-primary/20 px-2">
              <div className="absolute inset-0 bg-gradient-to-br from-conformity-elements-accent-primary/20 to-conformity-elements-accent-secondary/30 rounded-lg" />
              <GleioLogo variant="horizontal" size="md" className="relative z-10 h-full" />
            </div>
          )}
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
