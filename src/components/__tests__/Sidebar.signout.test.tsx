// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/components/__tests__/Sidebar.signout.test.tsx
// Description: EN-9 regression — the desktop sidebar exposes a persistent "Sign Out" control (so
//   sign-out is always available, not only at the bottom of the Profile tab). Proves the control
//   renders when onSignOut is provided and calls it on click, and is absent when it is not.
// Author: Claude (with owner)
// Created: 2026-07-17

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Home } from 'lucide-react';
import { Sidebar, type NavItem } from '../Sidebar';

const navItems: NavItem[] = [{ id: 'home', label: 'Home', icon: Home }];

describe('Sidebar — persistent Sign Out (EN-9)', () => {
  it('renders a Sign Out control and calls onSignOut when clicked', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    render(
      <Sidebar navItems={navItems} activeTab="home" onSelectTab={() => {}} onSignOut={onSignOut} />,
    );
    const btn = screen.getByTestId('nav-sign-out');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('Sign Out');

    await user.click(btn);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('omits the Sign Out control when onSignOut is not provided', () => {
    render(<Sidebar navItems={navItems} activeTab="home" onSelectTab={() => {}} />);
    expect(screen.queryByTestId('nav-sign-out')).toBeNull();
  });
});
