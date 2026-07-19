// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/components/__tests__/Sidebar.about.test.tsx
// Description: NAV-1c / EN-4b regression — the desktop sidebar exposes a pinned "About" entry so the
//   in-app About modal is discoverable in the nav, not only buried under Settings (owner report,
//   staging .19.1). Proves the control renders (data-testid="nav-about") with its label when
//   aboutItem + onOpenAbout are provided and fires onOpenAbout on click, and is absent when they are
//   not (mobile keeps About under Settings — the bottom bar deliberately does not get this entry).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-19

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Home, Info } from 'lucide-react';
import { Sidebar, type NavItem } from '../Sidebar';

const navItems: NavItem[] = [{ id: 'home', label: 'Home', icon: Home }];
const aboutItem: NavItem = { id: 'about', label: 'About', icon: Info };

describe('Sidebar — desktop About entry (NAV-1c / EN-4b)', () => {
  it('renders an About control and calls onOpenAbout when clicked', async () => {
    const user = userEvent.setup();
    const onOpenAbout = vi.fn();
    render(
      <Sidebar
        navItems={navItems}
        activeTab="home"
        onSelectTab={() => {}}
        aboutItem={aboutItem}
        onOpenAbout={onOpenAbout}
      />,
    );
    const btn = screen.getByTestId('nav-about');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('About');

    await user.click(btn);
    expect(onOpenAbout).toHaveBeenCalledTimes(1);
  });

  it('omits the About control when aboutItem/onOpenAbout are not provided', () => {
    render(<Sidebar navItems={navItems} activeTab="home" onSelectTab={() => {}} />);
    expect(screen.queryByTestId('nav-about')).toBeNull();
  });
});
