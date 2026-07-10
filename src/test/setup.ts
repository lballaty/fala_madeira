// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/test/setup.ts
// Description: Global test setup for the vitest suite (plan step P6). Registers
//   @testing-library/jest-dom custom matchers (toBeInTheDocument, toHaveTextContent, …) and
//   installs an afterEach cleanup so component tests do not leak DOM between cases. Loaded via
//   vitest.config.ts setupFiles. No network/DB boundaries are touched here — those are mocked
//   per-test at the module boundary (supabase / geminiService / platform).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
