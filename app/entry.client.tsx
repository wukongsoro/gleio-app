import { RemixBrowser } from '@remix-run/react';
import { startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';

// Reduce noisy dev logs from Vite HMR and other debug sources during development
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const HIDDEN_PATTERNS = [
    /\[vite\]\s+connecting/i,
    /\[vite\]\s+connected/i,
    /hot updated:/i,
    /\[Contextify\].*running source code in new context/i,
  ];

  console.log = (...args: any[]) => {
    const str = args.join(' ');
    if (HIDDEN_PATTERNS.some((re) => re.test(str))) return;
    originalLog.apply(console, args);
  };

  console.warn = (...args: any[]) => {
    const str = args.join(' ');
    if (HIDDEN_PATTERNS.some((re) => re.test(str))) return;
    originalWarn.apply(console, args);
  };
}

startTransition(() => {
  // Initialize WebContainer on client startup
  import('~/lib/webcontainer').then(() => {
    console.log('✅ WebContainer module dynamically imported');
  }).catch((error) => {
    console.error('❌ Failed to dynamically import WebContainer module:', error);
  });

  // Hydrate the main app
  hydrateRoot(document.getElementById('root')!, <RemixBrowser />);
});
