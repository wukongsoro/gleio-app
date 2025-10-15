import { motion, type Variants } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { deleteById, getAllByUser, chatId, type ChatHistoryItem, clearAllChats, openDatabase, currentUserId, migrateChatsToUser, clearChatsByUser } from '~/lib/persistence';
import { cubicEasingFn } from '~/utils/easings';
import { logger } from '~/utils/logger';
import { HistoryItem } from './HistoryItem';
import { binDates } from './date-binning';
import { SidebarAccount } from './SidebarAccount';

const createMenuVariants = (offset: number): Variants => ({
  closed: {
    opacity: 0,
    visibility: 'hidden',
    left: offset - 150,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    opacity: 1,
    visibility: 'initial',
    left: offset,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
});

type DialogContent = { type: 'delete'; item: ChatHistoryItem } | { type: 'clearAll' } | null;

export function Menu() {
  const menuRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState<DialogContent>(null);
  const [query, setQuery] = useState('');

  // Check if user is authenticated
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    name: string;
    email: string;
    avatar?: string;
  } | null>(null);

  // Check authentication status and get user profile from database
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { auth } = await import('~/lib/supabase');
        const { user, error } = await auth.getCurrentUser();

        if (user && !error) {
          setIsAuthenticated(true);

          // Try to get profile from database first
          const { getSettingsDataLayer } = await import('~/lib/settings/data');
          const dataLayer = getSettingsDataLayer();
          const profileResult = await dataLayer.getProfile();

          if (profileResult.data) {
            // Use database profile
            setUser({
              id: profileResult.data.id,
              name: profileResult.data.name,
              email: profileResult.data.email,
              avatar: profileResult.data.avatar_url
            });
          } else {
            // Fallback to auth metadata
            setUser({
              id: user.id,
              name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
              email: user.email || '',
              avatar: user.user_metadata?.avatar_url
            });
          }
        } else {
          setIsAuthenticated(false);
          setUser(null);
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        setIsAuthenticated(false);
        setUser(null);
      }
    };

    checkAuth();

    // Listen for Supabase auth state changes
    let authSubscription: any = null;
    let profileCleanup: (() => void) | undefined;

    const setupAuthListener = async () => {
      try {
        const { auth } = await import('~/lib/supabase');
        authSubscription = auth.onAuthStateChange((event, session) => {
          console.log('Auth state changed:', event, session?.user?.email);
          if (event === 'SIGNED_IN' && session?.user) {
            checkAuth(); // Re-fetch user data when signed in
          } else if (event === 'SIGNED_OUT') {
            setIsAuthenticated(false);
            setUser(null);
          }
        });
      } catch (error) {
        console.error('Error setting up auth listener:', error);
      }
    };

    // Listen for profile updates from settings data layer
    const setupProfileListener = async () => {
      const { getSettingsDataLayer } = await import('~/lib/settings/data');
      const dataLayer = getSettingsDataLayer();

      const handleProfileUpdate = (payload: any) => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          setUser(current => {
            if (current && payload.new.id === current.id) {
              return {
                ...current,
                name: payload.new.name || current.name,
                email: payload.new.email || current.email,
                avatar: payload.new.avatar_url || current.avatar
              };
            }
            return current;
          });
        }
      };

      dataLayer.on('profile-update', handleProfileUpdate);

      return () => {
        dataLayer.off('profile-update', handleProfileUpdate);
      };
    };

    setupAuthListener();
    setupProfileListener().then(cleanup => {
      profileCleanup = cleanup;
    });

    return () => {
      if (authSubscription) {
        authSubscription.data.subscription.unsubscribe();
      }
      if (profileCleanup) {
        profileCleanup();
      }
    };
  }, []);

  const loadEntries = useCallback(() => {
    if (typeof window === 'undefined') return;

    const userId = user?.id;
    if (!userId) {
      // Clear list if no user is logged in
      setList([]);
      return;
    }

    // Set current user ID for chat storage
    currentUserId.set(userId);

    openDatabase().then((database: IDBDatabase | undefined) => {
      if (database) {
        // Migrate existing chats to current user if needed
        migrateChatsToUser(database, userId)
          .then(() => getAllByUser(database, userId))
          .then((list: ChatHistoryItem[]) => list.filter((item: ChatHistoryItem) => {
            // Filter out items without proper identification
            const hasIdentifier = item.urlId || item.id;
            const hasContent = item.description || (item.messages && item.messages.length > 0);
            return hasIdentifier && hasContent;
          }))
          .then(setList)
          .catch((error: any) => toast.error(error.message));
      }
    });
  }, [user?.id]);

  const deleteItem = useCallback((event: React.UIEvent, item: ChatHistoryItem) => {
    event.preventDefault();

    openDatabase().then((database) => {
      if (database) {
        deleteById(database, item.id)
          .then(() => {
            loadEntries();

            if (chatId.get() === item.id) {
              // hard page navigation to clear the stores
              window.location.pathname = '/';
            }
          })
          .catch((error) => {
            toast.error('Failed to delete conversation');
            logger.error(error);
          });
      }
    });
  }, [loadEntries]);

  const clearAllEntries = useCallback(() => {
    openDatabase().then((database) => {
      if (database) {
        clearAllChats(database)
          .then(() => {
            setList([]);
            toast.success('All chats cleared successfully!');
            
            if (chatId.get()) {
              // Navigate to home to clear current chat
              window.location.pathname = '/';
            }
          })
          .catch((error) => {
            toast.error('Failed to clear all chats');
            logger.error(error);
          });
      }
    });
  }, []);

  const closeDialog = () => {
    setDialogContent(null);
  };

  // Account handlers
  const handleLogin = () => {
    window.location.href = '/login';
  };

  const handleSignup = () => {
    window.location.href = '/signup';
  };

  const handleSettings = () => {
    window.location.href = '/settings';
  };

  const handleLogout = async () => {
    try {
      // Clear user's chats from IndexedDB before logout
      if (user?.id) {
        const database = await openDatabase();
        if (database) {
          await clearChatsByUser(database, user.id);
        }
      }

      const { auth } = await import('~/lib/supabase');
      const { error } = await auth.signOut();

      if (error) {
        console.error('Logout error:', error.message);
        // Even if Supabase logout fails, clear local state
      }

      setIsAuthenticated(false);
      setUser(null);
      currentUserId.set(undefined);
      // Clear chat list
      setList([]);
      // Reload to update the entire app state
      window.location.reload();
    } catch (error) {
      console.error('Error during logout:', error);
      // Force clear state even if logout fails
      setIsAuthenticated(false);
      setUser(null);
      currentUserId.set(undefined);
      setList([]);
      window.location.reload();
    }
  };

  useEffect(() => {
    if (open) {
      loadEntries();
    }
  }, [open]);

  // Detect other AI tool sidebars to prevent overlap
  const [sidebarOffset, setSidebarOffset] = useState(0);

  useEffect(() => {
    const detectOtherSidebars = () => {
      let offset = 0;
      let detectedSidebars: string[] = [];
      
      // Check for ChatGPT sidebars (multiple possible selectors)
      const chatgptSelectors = [
        'nav[aria-label="Chat history"]',
        '[data-testid="conversation-turn-3"]',
        '.flex.h-full.w-\\[260px\\]',
        'nav.flex.h-full.flex-col',
        '.sidebar-container',
        'aside[class*="sidebar"]'
      ];
      
      for (const selector of chatgptSelectors) {
        const element = document.querySelector(selector);
        if (element && element.getBoundingClientRect().width > 200) {
          const rect = element.getBoundingClientRect();
          if (rect.left < 300) { // Only count left-side sidebars
            offset = Math.max(offset, rect.right + 10);
            detectedSidebars.push('ChatGPT');
            break;
          }
        }
      }
      
      // Check for Claude sidebars
      const claudeSelectors = [
        '[data-testid="sidebar"]',
        'aside[class*="sidebar"]',
        '.sidebar',
        'nav[class*="sidebar"]',
        '[class*="conversation-list"]'
      ];
      
      for (const selector of claudeSelectors) {
        const element = document.querySelector(selector);
        if (element && element.getBoundingClientRect().width > 200) {
          const rect = element.getBoundingClientRect();
          if (rect.left < 300) { // Only count left-side sidebars
            offset = Math.max(offset, rect.right + 10);
            detectedSidebars.push('Claude');
            break;
          }
        }
      }
      
      // Check for browser extension sidebars (like AI Side Panel Extension)
      const extensionSelectors = [
        '[id*="extension"]',
        '[class*="extension-sidebar"]',
        '[data-extension-sidebar]'
      ];
      
      for (const selector of extensionSelectors) {
        const element = document.querySelector(selector);
        if (element && element.getBoundingClientRect().width > 100) {
          const rect = element.getBoundingClientRect();
          if (rect.left < 300) {
            offset = Math.max(offset, rect.right + 10);
            detectedSidebars.push('Extension');
            break;
          }
        }
      }
      
      // Debug logging (remove in production)
      if (detectedSidebars.length > 0) {
        console.log(`Gleio AI: Detected sidebars: ${detectedSidebars.join(', ')}, offset: ${offset}px`);
      }
      
      setSidebarOffset(offset);
    };

    // Initial detection
    detectOtherSidebars();
    
    // Re-check periodically for dynamic sidebars
    const interval = setInterval(detectOtherSidebars, 2000);
    
    // Also detect on window resize and focus
    window.addEventListener('resize', detectOtherSidebars);
    window.addEventListener('focus', detectOtherSidebars);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', detectOtherSidebars);
      window.removeEventListener('focus', detectOtherSidebars);
    };
  }, []);

  useEffect(() => {
    const enterThreshold = 40 + sidebarOffset;
    const exitThreshold = 40;

    function onMouseMove(event: MouseEvent) {
      // Adjust trigger area based on other sidebars
      if (event.pageX > sidebarOffset && event.pageX < enterThreshold) {
        setOpen(true);
      }

      if (menuRef.current && event.clientX > menuRef.current.getBoundingClientRect().right + exitThreshold) {
        setOpen(false);
      }
    }

    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [sidebarOffset]);

  const visibleList = query
    ? list.filter((i) => (i.description || '').toLowerCase().includes(query.toLowerCase()))
    : list;

  const menuVariants = createMenuVariants(sidebarOffset);

  return (
    <motion.div
      ref={menuRef}
      initial="closed"
      animate={open ? 'open' : 'closed'}
      variants={menuVariants}
      className={`flex flex-col side-menu fixed top-0 w-[350px] h-full bg-conformity-elements-background-depth-2 border-r rounded-r-3xl border-conformity-elements-borderColor shadow-xl shadow-conformity-elements-sidebar-dropdownShadow text-sm ${sidebarOffset > 0 ? 'border-l-2 border-l-blue-500/30' : ''}`}
      style={{ zIndex: 1000 + Math.floor(sidebarOffset / 10) }} // Dynamic z-index to layer above other sidebars
    >
      <div className="flex items-center h-[var(--header-height)]">{/* Placeholder */}</div>
      <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
        <div className="p-4">
          {sidebarOffset > 0 && (
            <div className="mb-2 text-xs text-conformity-elements-textTertiary bg-blue-500/10 border border-blue-500/20 rounded-md p-2 flex items-center gap-2">
              <span className="i-ph:info text-blue-400" />
              <span>Positioned to avoid overlap with other AI tools</span>
            </div>
          )}
          <a
            href="/"
            className="flex gap-2 items-center bg-conformity-elements-sidebar-buttonBackgroundDefault text-conformity-elements-sidebar-buttonText hover:bg-conformity-elements-sidebar-buttonBackgroundHover rounded-md p-2 transition-theme"
          >
            <span className="inline-block i-ph:chat-circle scale-110" />
            Start new chat
          </a>
          <div className="mt-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 i-ph:magnifying-glass text-conformity-elements-textTertiary" />
              <input
                placeholder="Search"
                className="w-full pl-9 pr-3 py-2 rounded-md bg-white/5 border border-conformity-elements-borderColor text-conformity-elements-textPrimary placeholder-conformity-elements-textTertiary focus:bg-white/10 focus:border-conformity-elements-accent-primary/50 focus:outline-none transition-colors"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="text-conformity-elements-textPrimary font-medium pl-6 pr-5 my-2 flex items-center justify-between">
          <span>Your Chats</span>
          {visibleList.length > 0 && (
            <button
              onClick={() => setDialogContent({ type: 'clearAll' })}
              className="text-conformity-elements-textTertiary hover:text-conformity-elements-textPrimary text-xs"
              title="Clear all chats"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="flex-1 overflow-scroll pl-4 pr-5 pb-5">
          {visibleList.length === 0 && (
            <div className="pl-2 text-conformity-elements-textTertiary">No previous conversations</div>
          )}
          <DialogRoot open={dialogContent !== null}>
            {binDates(visibleList).map(({ category, items }) => (
              <div key={category} className="mt-4 first:mt-0 space-y-1">
                <div className="text-conformity-elements-textTertiary sticky top-0 z-1 bg-conformity-elements-background-depth-2 pl-2 pt-2 pb-1">
                  {category}
                </div>
                {items.map((item) => (
                  <HistoryItem key={item.id} item={item} onDelete={() => setDialogContent({ type: 'delete', item })} />
                ))}
              </div>
            ))}
            <Dialog onBackdrop={closeDialog} onClose={closeDialog}>
              {dialogContent?.type === 'delete' && (
                <>
                  <DialogTitle>Delete Chat?</DialogTitle>
                  <DialogDescription asChild>
                    <div>
                      <p>
                        You are about to delete <strong>{dialogContent.item.description}</strong>.
                      </p>
                      <p className="mt-1">Are you sure you want to delete this chat?</p>
                    </div>
                  </DialogDescription>
                  <div className="px-5 pb-4 bg-conformity-elements-background-depth-2 flex gap-2 justify-end">
                    <DialogButton type="secondary" onClick={closeDialog}>
                      Cancel
                    </DialogButton>
                    <DialogButton
                      type="danger"
                      onClick={(event) => {
                        deleteItem(event, dialogContent.item);
                        closeDialog();
                      }}
                    >
                      Delete
                    </DialogButton>
                  </div>
                </>
              )}
              {dialogContent?.type === 'clearAll' && (
                <>
                  <DialogTitle>Clear All Chats?</DialogTitle>
                  <DialogDescription asChild>
                    <div>
                      <p>
                        You are about to delete <strong>all {list.length} chats</strong>.
                      </p>
                      <p className="mt-1">This action cannot be undone. Are you sure?</p>
                    </div>
                  </DialogDescription>
                  <div className="px-5 pb-4 bg-conformity-elements-background-depth-2 flex gap-2 justify-end">
                    <DialogButton type="secondary" onClick={closeDialog}>
                      Cancel
                    </DialogButton>
                    <DialogButton
                      type="danger"
                      onClick={() => {
                        clearAllEntries();
                        closeDialog();
                      }}
                    >
                      Clear All
                    </DialogButton>
                  </div>
                </>
              )}
            </Dialog>
          </DialogRoot>
        </div>

        {/* Account Section - pushed to the very bottom */}
        <SidebarAccount
          user={user}
          onLogin={handleLogin}
          onSignup={handleSignup}
          onSettings={handleSettings}
          onLogout={handleLogout}
        />
      </div>
    </motion.div>
  );
}
