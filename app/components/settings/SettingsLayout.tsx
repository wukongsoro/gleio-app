import React from "react";
import { Link } from "@remix-run/react";

interface SettingsLayoutProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onClose?: () => void;
  children: React.ReactNode;
}

const TABS = [
  { key: "general", label: "General", icon: "i-ph:gear" },
  { key: "subscription", label: "Subscription & Tokens", icon: "i-ph:coins" },
  { key: "applications", label: "Applications", icon: "i-ph:app-window" },
  { key: "cloud", label: "Cloud", icon: "i-ph:cloud" },
  { key: "knowledge", label: "Knowledge", icon: "i-ph:books" },
  { key: "experimental", label: "Experimental features", icon: "i-ph:flask" },
];

export function SettingsLayout({ activeTab, onTabChange, onClose, children }: SettingsLayoutProps) {
  const Backdrop = onClose ? (
    <button
      type="button"
      aria-label="Close settings overlay"
      onClick={onClose}
      className="absolute inset-0 bg-black/12 backdrop-blur-sm transition-colors dark:bg-black/24"
    />
  ) : (
    <Link
      to="/"
      className="absolute inset-0 bg-black/18 backdrop-blur-sm"
      aria-label="Close settings overlay"
    />
  );

  const CloseControl = onClose ? (
    <button
      type="button"
      onClick={onClose}
      className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-conformity-elements-borderColor bg-conformity-elements-background-depth-3 text-conformity-elements-textSecondary transition hover:bg-conformity-elements-background-depth-2 hover:text-conformity-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <span className="i-ph:x text-xl" />
    </button>
  ) : (
    <Link
      to="/"
      className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-conformity-elements-borderColor bg-conformity-elements-background-depth-3 text-conformity-elements-textSecondary transition hover:bg-conformity-elements-background-depth-2 hover:text-conformity-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <span className="i-ph:x text-xl" />
    </Link>
  );

  return (
    <div className="fixed inset-0 z-50">
      {Backdrop}
      <div className="absolute left-1/2 top-[calc(var(--header-height)+1rem)] bottom-6 w-[min(1120px,calc(100%-1.5rem))] -translate-x-1/2">
        <div className="flex h-full overflow-hidden rounded-2xl border border-conformity-elements-borderColor bg-conformity-elements-background-depth-2/75 shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop-blur">
          <aside className="w-64 border-r border-conformity-elements-borderColor/55 bg-conformity-elements-background-depth-3/45 p-6">
            <div className="mb-4 text-sm font-medium text-conformity-elements-textSecondary">Settings</div>
            <nav className="space-y-1.5">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => onTabChange(tab.key)}
                    className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                      isActive
                        ? "bg-conformity-elements-background-depth-2 text-conformity-elements-textPrimary shadow-sm ring-1 ring-inset ring-blue-500/30"
                        : "text-conformity-elements-textSecondary hover:bg-conformity-elements-background-depth-3 hover:text-conformity-elements-textPrimary"
                    }`}
                  >
                    <span
                      className={`${tab.icon} text-lg ${
                        isActive
                          ? "text-blue-400"
                          : "text-conformity-elements-textTertiary group-hover:text-conformity-elements-textSecondary"
                      }`}
                      aria-hidden
                    />
                    <span className="font-medium leading-tight">{tab.label}</span>
                    {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden />}
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="border-b border-conformity-elements-borderColor px-8 py-5">
              <p className="text-[11px] uppercase tracking-[0.32em] text-conformity-elements-textTertiary">Workspace preferences</p>
              <h1 className="mt-2 text-xl font-semibold text-conformity-elements-textPrimary">Tailor Gleio to your workflow</h1>
              <p className="mt-1 text-sm text-conformity-elements-textSecondary">
                Adjust appearance, knowledge, and billing without leaving your current project.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div className="mx-auto w-full max-w-3xl space-y-5">{children}</div>
            </div>
          </section>

          {CloseControl}
        </div>
      </div>
    </div>
  );
}
