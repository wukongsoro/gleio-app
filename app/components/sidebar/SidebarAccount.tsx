import React, { useState } from 'react';
import { classNames as cn } from '~/utils/classNames';
import { Avatar } from '~/components/ui/Avatar';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface SidebarAccountProps {
  user?: User | null;
  onLogin?: () => void;
  onSignup?: () => void;
  onSettings?: () => void;
  onLogout?: () => void;
}

export function SidebarAccount({
  user,
  onLogin,
  onSignup,
  onSettings,
  onLogout
}: SidebarAccountProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (!user) {
    // Logged out state
    return (
      <div className="mt-auto border-t border-conformity-elements-borderColor p-3">
        <div className="space-y-2">
          <button
            onClick={onLogin}
            className="h-10 w-full rounded-xl bg-conformity-elements-background-depth-2 text-conformity-elements-textPrimary hover:bg-conformity-elements-background-depth-3 border border-conformity-elements-borderColor transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 font-medium"
          >
            Log in
          </button>
          <button
            onClick={onSignup}
            className="h-10 w-full rounded-xl bg-conformity-elements-background-depth-3 border border-conformity-elements-borderColor text-conformity-elements-textPrimary hover:bg-conformity-elements-background-depth-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 font-medium"
          >
            Sign up
          </button>
        </div>
      </div>
    );
  }

  // Logged in state
  return (
    <div className="mt-auto border-t border-conformity-elements-borderColor p-3">
      <div className="space-y-2">
        {/* User info row */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="flex items-center gap-3 rounded-xl p-2 hover:bg-conformity-elements-background-depth-3 w-full text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <Avatar
            src={user.avatar}
            alt={`${user.name} avatar`}
            name={user.name}
            size={32}
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-conformity-elements-textPrimary truncate">
              {user.name}
            </div>
            <div className="text-xs text-conformity-elements-textTertiary truncate">
              {user.email}
            </div>
          </div>
          <svg
            className={cn(
              "w-4 h-4 text-conformity-elements-textTertiary transition-transform flex-shrink-0",
              isMenuOpen ? "rotate-180" : ""
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Menu items */}
        {isMenuOpen && (
          <div className="space-y-1 animate-in slide-in-from-top-2">
            <button
              onClick={() => {
                onSettings?.();
                setIsMenuOpen(false);
              }}
              className="w-full rounded-lg px-3 py-2 text-sm text-left text-conformity-elements-textPrimary hover:bg-conformity-elements-background-depth-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 flex items-center gap-3"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
            <button
              onClick={() => {
                onLogout?.();
                setIsMenuOpen(false);
              }}
              className="w-full rounded-lg px-3 py-2 text-sm text-left text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 flex items-center gap-3 hover:text-red-600 dark:hover:text-red-400"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
