import { useStore } from '@nanostores/react';
import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { computed } from 'nanostores';
import { memo, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { ErrorBoundary, WebContainerErrorFallback } from '~/components/ui/ErrorBoundary';
import {
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { Slider, type SliderOptions } from '~/components/ui/Slider';
import { workbenchStore, type WorkbenchViewType } from '~/lib/stores/workbench';
import { errorsStore, type ParsedError } from '~/lib/stores/errors';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { renderLogger } from '~/utils/logger';
import { EditorPanel } from './EditorPanel';
import { Preview } from './Preview';
import { ErrorPanel } from './ErrorPanel';
import { ResearchPanel } from './ResearchPanel';

interface WorkspaceProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
  onSendMessage?: (message: string) => void;
}

const viewTransition = { ease: cubicEasingFn };

const sliderOptions: SliderOptions<WorkbenchViewType> = {
  left: {
    value: 'code',
    text: 'Code',
  },
  middle: {
    value: 'preview',
    text: 'Preview',
  },
  right: {
    value: 'research',
    text: 'Research',
  },
};

const workbenchVariants = {
  closed: {
    width: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    width: 'var(--workbench-width)',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

export const Workbench = memo(({ chatStarted, isStreaming, onSendMessage }: WorkspaceProps) => {
  renderLogger.trace('Workbench');

  const hasPreview = useStore(computed(workbenchStore.previews, (previews) => previews.length > 0));
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);
  const files = useStore(workbenchStore.files);
  const selectedView = useStore(workbenchStore.currentView);
  const errors = useStore(errorsStore.errors);
  const isFixing = useStore(errorsStore.isFixing);
  const isFirstRender = useRef(true);

  const setSelectedView = (view: WorkbenchViewType) => {
    workbenchStore.currentView.set(view);
  };

  useEffect(() => {
    if (hasPreview && showWorkbench) {
      // force preview view when preview becomes available
      setSelectedView('preview');
    }
  }, [hasPreview, showWorkbench]);

  useEffect(() => {
    // Skip on first render to avoid glitches
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Update CSS variables when workbench is toggled
    const root = document.documentElement;
    if (!showWorkbench) {
      root.style.setProperty('--workbench-width', '0px');
      root.style.setProperty('--chat-workbench-gap', '0px');
    } else {
      root.style.setProperty('--workbench-width', `calc(100% - var(--chat-min-width) - 16px)`);
      root.style.setProperty('--chat-workbench-gap', '16px');
    }
  }, [showWorkbench]);

  useEffect(() => {
    workbenchStore.setDocuments(files);
  }, [files]);

  const onEditorChange = useCallback<OnEditorChange>((update) => {
    workbenchStore.setCurrentDocumentContent(update.content);
  }, []);

  const onEditorScroll = useCallback<OnEditorScroll>((position) => {
    workbenchStore.setCurrentDocumentScrollPosition(position);
  }, []);

  const onFileSelect = useCallback((filePath: string | undefined) => {
    workbenchStore.setSelectedFile(filePath);
  }, []);

  const onFileSave = useCallback(() => {
    workbenchStore.saveCurrentDocument().catch(() => {
      toast.error('Failed to update file content');
    });
  }, []);

  const onFileReset = useCallback(() => {
    workbenchStore.resetCurrentDocument();
  }, []);

  const handleFixError = useCallback(async (error: ParsedError) => {
    if (!onSendMessage) {
      toast.error('Unable to fix error: chat not available');
      return;
    }

    try {
      await errorsStore.requestFix(error, onSendMessage);
      toast.success(`🔧 AI is fixing: ${error.message}`);
    } catch (err) {
      toast.error('Failed to request fix');
      console.error('Error requesting fix:', err);
    }
  }, [onSendMessage]);

  const errorsList = Object.values(errors);

  return (
    chatStarted && (
      <ErrorBoundary fallback={WebContainerErrorFallback}>
        <motion.div
          initial="closed"
          animate={showWorkbench ? 'open' : 'closed'}
          variants={workbenchVariants}
          className="z-workbench"
        >
          <div
            className={classNames(
              'fixed top-[var(--header-height)] bottom-0 w-[var(--workbench-inner-width)] z-0 transition-[left,width] duration-200 enormity-ease-cubic-bezier',
              {
                'left-[var(--workbench-left)]': showWorkbench,
                'left-[100%]': !showWorkbench,
              },
            )}
          >
            <div className="absolute inset-0 pt-6 pb-6 pr-6">
              <div className="h-full flex flex-col bg-conformity-elements-background-depth-2 border border-conformity-elements-borderColor shadow-lg rounded-lg overflow-hidden">
                <div className="flex items-center px-3 py-2 border-b border-conformity-elements-borderColor">
                  <Slider selected={selectedView} options={sliderOptions} setSelected={setSelectedView} />
                  <div className="ml-auto" />
                  {selectedView === 'code' && (
                    <PanelHeaderButton
                      className="mr-1 text-sm"
                      onClick={() => {
                        workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get());
                      }}
                    >
                      <div className="i-ph:terminal" />
                      Toggle Terminal
                    </PanelHeaderButton>
                  )}
                  <IconButton
                    icon="i-ph:x-circle"
                    className="-mr-1"
                    size="xl"
                    onClick={() => {
                      workbenchStore.showWorkbench.set(false);
                    }}
                  />
                </div>
                <div className="relative flex-1 overflow-hidden">
                  <View
                    initial={{ x: selectedView === 'code' ? 0 : '-100%' }}
                    animate={{ x: selectedView === 'code' ? 0 : '-100%' }}
                  >
                    <EditorPanel
                      editorDocument={currentDocument}
                      isStreaming={isStreaming}
                      selectedFile={selectedFile}
                      files={files}
                      unsavedFiles={unsavedFiles}
                      onFileSelect={onFileSelect}
                      onEditorScroll={onEditorScroll}
                      onEditorChange={onEditorChange}
                      onFileSave={onFileSave}
                      onFileReset={onFileReset}
                    />
                  </View>
                  <View
                    initial={{ x: selectedView === 'preview' ? 0 : '100%' }}
                    animate={{ x: selectedView === 'preview' ? 0 : '100%' }}
                  >
                    <Preview />
                  </View>
                  <View
                    initial={{ x: selectedView === 'research' ? 0 : '200%' }}
                    animate={{ x: selectedView === 'research' ? 0 : '200%' }}
                  >
                    <ResearchPanel />
                  </View>
                </div>
                {/* Error Panel at the bottom */}
                {errorsList.length > 0 && (
                  <ErrorPanel
                    errors={errorsList.map(e => e.fullError)}
                    onFixError={handleFixError}
                    isFixing={isFixing}
                  />
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </ErrorBoundary>
    )
  );
});

interface ViewProps extends HTMLMotionProps<'div'> {
  children: JSX.Element;
}

const View = memo(({ children, ...props }: ViewProps) => {
  return (
    <motion.div className="absolute inset-0" transition={viewTransition} {...props}>
      {children}
    </motion.div>
  );
});
