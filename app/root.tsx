import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/cloudflare';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { themeStore } from './lib/stores/theme';
import { stripIndents } from './utils/stripIndent';
import { createHead } from 'remix-island';
import { useEffect, useState } from 'react';
import React from 'react';

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';

import 'virtual:uno.css';

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.svg',
    type: 'image/svg+xml',
  },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: xtermStyles },
];

const inlineThemeCode = stripIndents`
  setTutorialKitTheme();

  function setTutorialKitTheme() {
    let theme = localStorage.getItem('conformity_theme');

    if (!theme) {
      theme = 'dark'; // Default to dark theme
    }

    // Only set theme if not already set by server-side rendering
    const htmlElement = document.querySelector('html');
    if (htmlElement && !htmlElement.getAttribute('data-theme')) {
      htmlElement.setAttribute('data-theme', theme);
    }
  }
`;

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <Meta />
    <Links />
  </>
));

class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, { hasError: boolean }> {
  constructor(props: {}) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <h1>Something went wrong.</h1>;
    }
    return this.props.children;
  }
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <ClientOnly fallback={children}>{() => <ThemeProvider>{children}</ThemeProvider>}</ClientOnly>
    </div>
  );
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const theme = useStore(themeStore);

  useEffect(() => {
    setIsHydrated(true);
    // Initialize theme from localStorage after hydration
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('conformity_theme');
      if (savedTheme && (savedTheme === 'dark' || savedTheme === 'light')) {
        themeStore.set(savedTheme);
      }
    }
  }, []);

  useEffect(() => {
    if (isHydrated && typeof window !== 'undefined') {
      document.querySelector('html')?.setAttribute('data-theme', theme);
    }
  }, [theme, isHydrated]);

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Outlet />
      </Layout>
      <ScrollRestoration />
      <Scripts />
    </ErrorBoundary>
  );
}
