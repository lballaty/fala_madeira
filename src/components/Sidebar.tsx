// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/components/Sidebar.tsx
// Description: Persistent desktop left-nav for FalaMadeira (U2 responsive-desktop). Renders the
//   SAME five nav destinations as the mobile bottom tab bar (Home / Learning / Practice / Tutor /
//   Profile) plus the admin entry, driving the identical activeTab state — the two nav surfaces are
//   just two presentations of one route model. Shown only on md+ (`hidden md:flex`); the bottom bar
//   takes over below md (`md:hidden`). Chrome uses the semantic --fm-* tokens (bg-elevated /
//   border-line / text-muted / text-brand) so it is theme-correct in light and dark.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import React from 'react';
import { LucideIcon, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';

/** One navigation destination — shared shape used by both the sidebar and the bottom tab bar. */
export interface NavItem {
  /** Stable id; for the five primary tabs this is the activeTab value. 'admin' opens the overlay. */
  id: string;
  /** Human label (sidebar shows it inline; bottom bar shows it under the icon). */
  label: string;
  icon: LucideIcon;
}

interface SidebarProps {
  /** The five primary tabs, in order. */
  navItems: NavItem[];
  /** Currently active primary tab. */
  activeTab: string;
  /** Select a primary tab (drives the same state the bottom bar drives). */
  onSelectTab: (id: string) => void;
  /** Optional admin entry (rendered pinned to the bottom); omitted for non-admins. */
  adminItem?: NavItem;
  /** Whether the admin overlay is open (for the admin entry's active state). */
  isAdminActive?: boolean;
  /** Open the admin overlay. */
  onOpenAdmin?: () => void;
  /** Sign the user out. Rendered as a persistent control pinned to the bottom of the sidebar
   *  (EN-9) so sign-out is always available, not only at the bottom of the Profile tab. */
  onSignOut?: () => void;
}

/**
 * Persistent desktop sidebar. Mobile-first: hidden by default, `md:flex` reveals it on md+.
 * Parallel to the bottom tab bar in App.tsx — same destinations, same handlers, same state.
 */
export function Sidebar({
  navItems,
  activeTab,
  onSelectTab,
  adminItem,
  isAdminActive,
  onOpenAdmin,
  onSignOut,
}: SidebarProps) {
  return (
    <aside className="hidden md:flex md:flex-col w-56 lg:w-64 flex-none border-r border-line bg-elevated safe-area-bottom">
      <div className="px-5 pt-6 pb-4 text-brand font-extrabold text-lg tracking-tight">
        🗣️ FalaMadeira
      </div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id && !isAdminActive;
          return (
            <button
              key={item.id}
              data-testid={`tab-${item.id}`}
              onClick={() => onSelectTab(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                isActive
                  ? 'bg-brand/10 text-brand'
                  : 'text-muted hover:bg-brand/5 hover:text-text',
              )}
            >
              <Icon className="w-5 h-5 flex-none" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      {adminItem && onOpenAdmin && (
        <div className="px-3 pb-4 pt-2 border-t border-line">
          <button
            onClick={onOpenAdmin}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors',
              isAdminActive
                ? 'bg-brand/10 text-brand'
                : 'text-muted hover:bg-brand/5 hover:text-text',
            )}
          >
            <adminItem.icon className="w-5 h-5 flex-none" />
            <span>{adminItem.label}</span>
          </button>
        </div>
      )}
      {onSignOut && (
        <div className="px-3 pb-4 pt-2 border-t border-line">
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-700 dark:text-red-400 transition-colors hover:bg-red-500/10"
          >
            <LogOut className="w-5 h-5 flex-none" />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </aside>
  );
}
