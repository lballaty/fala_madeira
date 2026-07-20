// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/tutor/tutorMessageParser.ts
// Description: TB-14 — pure parser that segments an AI tutor turn (a long interleaved PT/EN Markdown
//   wall) into playable Portuguese phrases vs. non-spoken prose. The tutor prompt asks the model to
//   emit the Portuguese, a phonetic guide, and the English translation, usually via soft labels
//   ("Português:" / "Pronunciation:" / "English:") and/or a narrative PT line directly above an
//   "English:" translation line — but nothing ever parsed those labels, so both read-aloud paths
//   spoke the whole mixed-language message (PT + phonetic + English). This parser isolates the PT so
//   the renderer can offer a per-phrase, PT-only play. It is deliberately CONSERVATIVE: text is only
//   marked playable when it is confidently Portuguese (a label block, or a line immediately above an
//   English: translation). Everything else stays prose. If zero phrases are found it returns a single
//   prose segment (whole message) so the renderer falls back to today's whole-message render + play
//   and a weird model turn never breaks chat.
// Author: TB-14 (with assistant)
// Created: 2026-07-20
//
// PURE: no React/DOM/network imports. Unit-tested in __tests__/tutorMessageParser.test.ts.

export type TutorSegment =
  | { kind: 'phrase'; pt: string; en?: string; phonetic?: string }
  | { kind: 'prose'; text: string };

// Label matchers. Labels may be bold (**Português:**) or plain, and the Portuguese label may be
// spelled "Português" or "Portugues" (with/without the accent). The value is whatever follows the
// colon on the same line (may be empty when the model puts the value on the next line — we don't
// support that split form; the common case is value-on-same-line).
const RE_PT_LABEL = /^\s*(?:[-*]\s*)?\**\s*(?:portugu[eê]s)\s*\**\s*:\s*(.*)$/i;
const RE_PRON_LABEL = /^\s*(?:[-*]\s*)?\**\s*(?:pronunciation|pronúncia|pronuncia)\s*\**\s*:\s*(.*)$/i;
const RE_EN_LABEL = /^\s*(?:[-*]\s*)?\**\s*(?:english|inglês|ingles)\s*\**\s*:\s*(.*)$/i;

// Strip surrounding Markdown emphasis/list markers from a captured value so the playable/displayed
// text is clean (the label regexes already consume the label itself + a leading list marker on the
// label line; this cleans the *value*).
const stripMarkdown = (s: string): string =>
  s
    .replace(/^\s*[-*]\s+/, '') // leading list marker
    .replace(/\*\*/g, '') // bold
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2') // italic *x* (not bold **)
    .replace(/`/g, '') // inline code ticks
    .trim();

const isHeading = (line: string): boolean => /^\s*#{1,6}\s/.test(line);

// A "note" line — e.g. "Nota do João:" / "Note:" — is prose, never playable, even though it may
// contain Portuguese words.
const isNoteLine = (line: string): boolean => /^\s*(?:[-*]\s*)?\**\s*(?:nota|note)\b/i.test(line);

// Does a line have real content (after trimming Markdown noise)?
const hasContent = (s: string): boolean => stripMarkdown(s).length > 0;

/**
 * Parse a tutor model turn into ordered segments.
 *
 * Rules (conservative — only mark playable when confidently Portuguese):
 *  - A LABELED BLOCK: a "Português:"/"Portugues:" line (bold or plain), optionally followed by
 *    "Pronunciation:" and/or "English:" lines, becomes ONE phrase {pt, phonetic?, en?}.
 *  - A NARRATIVE PT line immediately followed by an "English:" line becomes a phrase {pt, en}.
 *  - Everything else (pure-English paragraphs, objectives lists, notes, headings) is prose (verbatim).
 *  - FALLBACK: if zero phrase segments are found, return [{ kind:'prose', text }].
 *  - Preserve order. Never throw. Trim; drop empty segments.
 */
export function parseTutorMessage(text: string): TutorSegment[] {
  if (typeof text !== 'string') return [{ kind: 'prose', text: '' }];

  const lines = text.split('\n');
  const segments: TutorSegment[] = [];
  let proseBuffer: string[] = [];
  let phraseCount = 0;

  const flushProse = () => {
    if (proseBuffer.length === 0) return;
    const joined = proseBuffer.join('\n');
    // Only emit prose that has real content (avoid empty/whitespace-only segments), but keep the
    // internal blank lines verbatim within a non-empty block.
    if (joined.trim().length > 0) {
      segments.push({ kind: 'prose', text: joined.trim() });
    }
    proseBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // A note / heading is always prose — check before the PT-label / PT+English heuristics so a
    // "Nota:" line that happens to contain Portuguese is not captured as a phrase.
    if (isNoteLine(line) || isHeading(line)) {
      proseBuffer.push(line);
      continue;
    }

    const ptMatch = line.match(RE_PT_LABEL);
    if (ptMatch) {
      // LABELED BLOCK. The Portuguese value is on this line. Look ahead for optional Pronunciation:
      // and English: lines (in any order, contiguous, skipping blank lines between them).
      const pt = stripMarkdown(ptMatch[1]);
      let phonetic: string | undefined;
      let en: string | undefined;
      let j = i + 1;
      while (j < lines.length) {
        const look = lines[j];
        if (look.trim() === '') {
          // Allow a single/blank separator between label lines, but stop if the block is clearly over.
          // Peek: if the NEXT non-blank line is another label of the block, continue; else stop.
          let k = j + 1;
          while (k < lines.length && lines[k].trim() === '') k++;
          if (k < lines.length && (RE_PRON_LABEL.test(lines[k]) || RE_EN_LABEL.test(lines[k]))) {
            j = k;
            continue;
          }
          break;
        }
        const pronM = look.match(RE_PRON_LABEL);
        if (pronM && phonetic === undefined) {
          phonetic = stripMarkdown(pronM[1]) || undefined;
          j++;
          continue;
        }
        const enM = look.match(RE_EN_LABEL);
        if (enM && en === undefined) {
          en = stripMarkdown(enM[1]) || undefined;
          j++;
          continue;
        }
        break;
      }

      if (pt) {
        flushProse();
        segments.push({ kind: 'phrase', pt, ...(phonetic ? { phonetic } : {}), ...(en ? { en } : {}) });
        phraseCount++;
        i = j - 1; // advance past the consumed block lines
        continue;
      }
      // Empty PT value — treat as prose (nothing confident to play).
      proseBuffer.push(line);
      continue;
    }

    // NARRATIVE PT + English: pairing. A content line immediately followed (allowing blank lines)
    // by an "English:" line → the content line is the Portuguese phrase, the English: line its
    // translation. The current line must NOT itself be an English:/Pronunciation: label.
    if (hasContent(line) && !RE_EN_LABEL.test(line) && !RE_PRON_LABEL.test(line)) {
      let k = i + 1;
      while (k < lines.length && lines[k].trim() === '') k++;
      if (k < lines.length) {
        const enM = lines[k].match(RE_EN_LABEL);
        if (enM) {
          const pt = stripMarkdown(line);
          const en = stripMarkdown(enM[1]) || undefined;
          if (pt) {
            flushProse();
            segments.push({ kind: 'phrase', pt, ...(en ? { en } : {}) });
            phraseCount++;
            i = k; // consume through the English: line
            continue;
          }
        }
      }
    }

    // Default: prose.
    proseBuffer.push(line);
  }

  flushProse();

  // Fallback: nothing confidently Portuguese → single prose segment (whole message), so the renderer
  // shows the whole message + a whole-message play (today's behavior).
  if (phraseCount === 0) {
    return [{ kind: 'prose', text: text.trim() }];
  }

  return segments;
}
