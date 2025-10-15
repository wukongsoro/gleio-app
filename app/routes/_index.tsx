import { json, type MetaFunction } from '@remix-run/cloudflare';
import { useLocation } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { ErrorBoundary } from '~/components/ui/ErrorBoundary';
import { ChatOnlyIndicator } from '~/components/ui/ChatOnlyIndicator';
import { ProtectedRoute } from '~/components/auth';

export const meta: MetaFunction = () => {
  return [
    { title: 'Gleio AI' },
    { name: 'description', content: 'Gleio AI - Where powerful AI meets limitless possibilities' },
  ];
};

export const loader = () => json({});

export default function Index() {
  const { pathname } = useLocation();
  // Treat homepage and chat pages consistently with home theme
  const isHome = pathname === '/' || !pathname.startsWith('/settings') && !pathname.startsWith('/login') && !pathname.startsWith('/signup');
  return (
    <div className={`flex flex-col h-full w-full home-theme bg-app-gradient`}>
      <ErrorBoundary>
        <Header isHome={pathname === '/'} />
      </ErrorBoundary>
      <ErrorBoundary>
        <ClientOnly fallback={<BaseChat isHome={pathname === '/'} />}>{() => <Chat isHome={pathname === '/'} />}</ClientOnly>
      </ErrorBoundary>
      <ClientOnly>
        {() => <ChatOnlyIndicator />}
      </ClientOnly>
    </div>
  );
}
