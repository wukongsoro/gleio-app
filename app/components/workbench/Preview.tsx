import { useStore } from '@nanostores/react';
import { reloadPreview as reloadWebcontainerPreview } from '@webcontainer/api';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { workbenchStore } from '~/lib/stores/workbench';
import { PortDropdown } from './PortDropdown';

export const Preview = memo(() => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);
  const hasSelectedPreview = useRef(false);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];

  const [url, setUrl] = useState('');
  const [iframeUrl, setIframeUrl] = useState<string | undefined>();
  const [webcontainerFailed, setWebcontainerFailed] = useState(false);

  // Listen for WebContainer failure events
  useEffect(() => {
    const handleWCError = () => {
      setWebcontainerFailed(true);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('webcontainer-error', handleWCError);
      return () => window.removeEventListener('webcontainer-error', handleWCError);
    }
  }, []);

  useEffect(() => {
    if (!activePreview) {
      setUrl('');
      setIframeUrl(undefined);
      return;
    }

    const { baseUrl, currentUrl, ready } = activePreview;
    setUrl(baseUrl);

    if (ready && currentUrl) {
      setIframeUrl(currentUrl);
      // Clear WC failure flag when preview becomes ready
      setWebcontainerFailed(false);
    } else {
      setIframeUrl(undefined);
    }
  }, [activePreview]);

  const validateUrl = useCallback(
    (value: string) => {
      if (!activePreview) {
        return false;
      }

      const { baseUrl } = activePreview;

      if (value === baseUrl) {
        return true;
      } else if (value.startsWith(baseUrl)) {
        return ['/', '?', '#'].includes(value.charAt(baseUrl.length));
      }

      return false;
    },
    [activePreview],
  );

  const findMinPortIndex = useCallback(
    (minIndex: number, preview: { port: number }, index: number, array: { port: number }[]) => {
      return preview.port < array[minIndex].port ? index : minIndex;
    },
    [],
  );

  // when previews change, display the lowest port if user hasn't selected a preview
  useEffect(() => {
    if (previews.length > 1 && !hasSelectedPreview.current) {
      const minPortIndex = previews.reduce(findMinPortIndex, 0);

      setActivePreviewIndex(minPortIndex);
    }
  }, [previews]);

  const reloadPreview = async () => {
    if (!iframeRef.current || !activePreview) return;
    try {
      await reloadWebcontainerPreview(iframeRef.current);
    } catch {
      // hard reload fallback with timestamp
      const baseUrl = activePreview.baseUrl;
      try {
        const u = new URL(baseUrl);
        u.searchParams.set('t', String(Date.now()));
        iframeRef.current.src = u.toString();
        setIframeUrl(u.toString());
      } catch {
        const sep = baseUrl.includes('?') ? '&' : '?';
        const urlWithTimestamp = `${baseUrl}${sep}t=${Date.now()}`;
        iframeRef.current.src = urlWithTimestamp;
        setIframeUrl(urlWithTimestamp);
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      {isPortDropdownOpen && (
        <div className="z-iframe-overlay w-full h-full absolute" onClick={() => setIsPortDropdownOpen(false)} />
      )}
      <div className="bg-conformity-elements-background-depth-2 p-2 flex items-center gap-1.5">
        <IconButton icon="i-ph:arrow-clockwise" onClick={reloadPreview} />
        <div
          className="flex items-center gap-1 flex-grow bg-conformity-elements-preview-addressBar-background border border-conformity-elements-borderColor text-conformity-elements-preview-addressBar-text rounded-full px-3 py-1 text-sm hover:bg-conformity-elements-preview-addressBar-backgroundHover hover:focus-within:bg-conformity-elements-preview-addressBar-backgroundActive focus-within:bg-conformity-elements-preview-addressBar-backgroundActive
        focus-within-border-conformity-elements-borderColorActive focus-within:text-conformity-elements-preview-addressBar-textActive"
        >
          <input
            ref={inputRef}
            className="w-full bg-transparent outline-none"
            type="text"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
            }}
            onKeyDown={async (event) => {
              if (event.key === 'Enter' && validateUrl(url)) {
                setIframeUrl(url);
                if (inputRef.current) {
                  inputRef.current.blur();
                }
                // soft reload via API, fallback as needed
                if (iframeRef.current) {
                  try {
                    await reloadWebcontainerPreview(iframeRef.current);
                  } catch {
                    // ignore, src already updated
                  }
                }
              }
            }}
          />
        </div>
        {previews.length > 1 && (
          <PortDropdown
            activePreviewIndex={activePreviewIndex}
            setActivePreviewIndex={setActivePreviewIndex}
            isDropdownOpen={isPortDropdownOpen}
            setHasSelectedPreview={(value) => (hasSelectedPreview.current = value)}
            setIsDropdownOpen={setIsPortDropdownOpen}
            previews={previews}
          />
        )}
      </div>
      <div className="flex-1 border-t border-conformity-elements-borderColor">
        {previews.length > 0 ? (
          activePreview ? (
            <iframe
              ref={iframeRef}
              className="border-none w-full h-full bg-white"
              src={iframeUrl || undefined}
              srcDoc={
                !iframeUrl
                  ? webcontainerFailed
                    ? `<!doctype html><meta charset="utf-8">
<title>Preview Unavailable</title>
<style>
  body { 
    font-family: system-ui, -apple-system, sans-serif; 
    padding: 2rem; 
    background: #0f172a; 
    color: #e2e8f0; 
    display: flex; 
    align-items: center; 
    justify-content: center; 
    min-height: 100vh;
    margin: 0;
  }
  .container { max-width: 640px; text-align: center; }
  h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #f59e0b; }
  p { margin: 0.75rem 0; line-height: 1.6; }
  .note { 
    background: rgba(251, 191, 36, 0.1); 
    border: 1px solid rgba(251, 191, 36, 0.3); 
    border-radius: 0.5rem; 
    padding: 1rem; 
    margin-top: 1.5rem;
  }
</style>
<body>
  <div class="container">
    <h1>⚠️ Preview Temporarily Unavailable</h1>
    <p>WebContainer couldn't start due to resource constraints (out of memory or too many instances).</p>
    <p>✅ Your files were generated successfully and are visible in the editor.</p>
    <div class="note">
      <p><strong>The preview will start automatically</strong> as soon as system resources free up.</p>
      <p style="margin-top: 0.5rem; font-size: 0.875rem;">Try closing other browser tabs or refreshing the page.</p>
    </div>
  </div>
</body>`
                    : `<!doctype html><meta charset="utf-8">
<title>Loading Preview...</title>
<style>
  body { 
    font-family: system-ui, -apple-system, sans-serif; 
    padding: 2rem; 
    background: #f8fafc; 
    color: #475569; 
    display: flex; 
    align-items: center; 
    justify-content: center; 
    min-height: 100vh;
    margin: 0;
  }
  .container { max-width: 640px; text-align: center; }
  h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #3b82f6; }
  p { margin: 0.75rem 0; line-height: 1.6; }
  .spinner {
    border: 3px solid #e2e8f0;
    border-top: 3px solid #3b82f6;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>🚀 Starting Preview...</h1>
    <p>Setting up development server. This may take a moment.</p>
  </div>
</body>`
                  : undefined
              }
              data-preview-port={activePreview.port}
              data-preview={previews[activePreviewIndex] === activePreview ? 'active' : 'inactive'}
            />
          ) : (
            <div className="flex w-full h-full justify-center items-center bg-white">
              <div className="text-center p-8 max-w-md">
                <div className="text-gray-500 text-lg mb-4">🚀 Starting Preview...</div>
                <div className="text-gray-600 text-sm space-y-2">
                  <p>Dev server is starting up. Available preview URLs:</p>
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-left">
                    <div className="font-medium text-blue-800 mb-1">Try these URLs manually:</div>
                    <ul className="text-blue-700 text-xs space-y-1">
                      {previews.slice(0, 4).map((preview, index) => (
                        <li key={preview.port}>
                          <a
                            href={preview.baseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 underline"
                          >
                            {preview.baseUrl}
                          </a>
                          {!preview.ready && <span className="text-gray-500"> (may not be ready yet)</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Files are being created. The preview will update automatically when the dev server starts.
                  </p>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="flex w-full h-full justify-center items-center bg-white">
            <div className="text-center p-8 max-w-md">
              <div className="text-gray-500 text-lg mb-4">🔧 Preview Not Available</div>
              <div className="text-gray-600 text-sm space-y-2">
                <p>WebContainer failed to initialize. Your files are still accessible in the editor.</p>
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-left">
                  <div className="font-medium text-yellow-800 mb-1">Quick fixes:</div>
                  <ul className="text-yellow-700 text-xs space-y-1">
                    <li>• Close other browser tabs and refresh</li>
                    <li>• Try Chrome or Firefox browsers</li>
                    <li>• Copy code to your local editor</li>
                    <li>• Check localhost:3000-3001 manually</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
