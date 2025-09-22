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

  useEffect(() => {
    if (!activePreview) {
      setUrl('');
      setIframeUrl(undefined);
      return;
    }

    const { baseUrl } = activePreview;
    setUrl(baseUrl);

    // add timestamp to force reload and prevent caching issues
    try {
      const u = new URL(baseUrl);
      u.searchParams.set('t', String(Date.now()));
      setIframeUrl(u.toString());
    } catch {
      // fallback to naive query param append
      const sep = baseUrl.includes('?') ? '&' : '?';
      setIframeUrl(`${baseUrl}${sep}t=${Date.now()}`);
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
        {activePreview ? (
          <iframe ref={iframeRef} className="border-none w-full h-full bg-white" src={iframeUrl} />
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
