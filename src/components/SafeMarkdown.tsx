// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/components/SafeMarkdown.tsx
// Description: XSS-safe markdown renderer for AI/model output (ENGINEERING-STANDARDS §4). The tutor
//   chat and practice modal render Gemini-generated text as markdown; model output is untrusted, so
//   every render goes through rehype-sanitize (GitHub-flavored default schema) which strips script,
//   event handlers, javascript: URLs, and disallowed raw HTML before it reaches the DOM. This is the
//   single AI-output render path — both the chat tab and the practice modal use it, so there is no
//   second, un-sanitized markdown surface to drift.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

interface SafeMarkdownProps {
  /** Untrusted markdown (typically model output) to render sanitized. */
  children: string;
}

/**
 * Render untrusted markdown with rehype-sanitize applied. Use this for ALL AI/model
 * output — never `<Markdown>` directly on model text (that path allows raw HTML).
 */
export const SafeMarkdown = ({ children }: SafeMarkdownProps) => (
  <Markdown rehypePlugins={[rehypeSanitize]}>{children}</Markdown>
);

export default SafeMarkdown;
