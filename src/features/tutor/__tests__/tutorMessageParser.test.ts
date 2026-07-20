// File: src/features/tutor/__tests__/tutorMessageParser.test.ts
// Description: TB-14 — unit tests for the pure tutor-message parser. Verifies the conservative
//   heuristic: labeled Português/Pronunciation/English blocks (bold or plain) collapse to one
//   playable phrase; a narrative PT line immediately above an "English:" line becomes a phrase;
//   English-only paragraphs, objectives lists, notes ("Nota…") and headings stay prose; an
//   interleaved real-shaped turn parses to the correct ordered mix; a no-PT turn falls back to a
//   single prose segment; prose is preserved verbatim and the parse is idempotent.
// Author: TB-14 (with assistant)
// Created: 2026-07-20

import { describe, expect, it } from 'vitest';
import { parseTutorMessage, type TutorSegment } from '../tutorMessageParser';

const phrases = (segs: TutorSegment[]) => segs.filter((s): s is Extract<TutorSegment, { kind: 'phrase' }> => s.kind === 'phrase');
const prose = (segs: TutorSegment[]) => segs.filter((s): s is Extract<TutorSegment, { kind: 'prose' }> => s.kind === 'prose');

describe('parseTutorMessage — labeled blocks', () => {
  it('collapses a bold labeled block to one phrase with pt/phonetic/en', () => {
    const text = [
      '**Português:** Bom dia',
      '**Pronunciation:** bohn DEE-ah',
      '**English:** Good morning',
    ].join('\n');
    const segs = parseTutorMessage(text);
    expect(segs).toEqual([{ kind: 'phrase', pt: 'Bom dia', phonetic: 'bohn DEE-ah', en: 'Good morning' }]);
  });

  it('handles plain (non-bold) labels and the accent-less "Portugues" spelling', () => {
    const text = [
      'Portugues: Obrigado',
      'Pronunciation: oh-bree-GAH-doo',
      'English: Thank you',
    ].join('\n');
    const segs = parseTutorMessage(text);
    expect(segs).toEqual([{ kind: 'phrase', pt: 'Obrigado', phonetic: 'oh-bree-GAH-doo', en: 'Thank you' }]);
  });

  it('handles a list-marker before the label and strips it', () => {
    const text = '- **Português:** Olá\n- **English:** Hello';
    const segs = parseTutorMessage(text);
    expect(phrases(segs)).toEqual([{ kind: 'phrase', pt: 'Olá', en: 'Hello' }]);
  });

  it('a Português-only labeled line (no English/Pronunciation) is still a phrase', () => {
    const segs = parseTutorMessage('**Português:** Tudo bem?');
    expect(segs).toEqual([{ kind: 'phrase', pt: 'Tudo bem?' }]);
  });
});

describe('parseTutorMessage — narrative PT + English pairing', () => {
  it('treats a PT line immediately above an English: line as a phrase', () => {
    const text = 'Como está você hoje?\nEnglish: How are you today?';
    const segs = parseTutorMessage(text);
    expect(phrases(segs)).toEqual([{ kind: 'phrase', pt: 'Como está você hoje?', en: 'How are you today?' }]);
  });

  it('allows a blank line between the PT line and its English: line', () => {
    const text = 'Vamos começar.\n\nEnglish: Let us begin.';
    const segs = parseTutorMessage(text);
    expect(phrases(segs)).toEqual([{ kind: 'phrase', pt: 'Vamos começar.', en: 'Let us begin.' }]);
  });
});

describe('parseTutorMessage — prose (non-playable)', () => {
  it('English-only paragraph is prose', () => {
    const text = 'Today we will practice greetings and simple questions.';
    const segs = parseTutorMessage(text);
    expect(segs).toEqual([{ kind: 'prose', text }]); // fallback (no phrase) → single prose
  });

  it('an objectives list with no PT/English pairing is prose (fallback)', () => {
    const text = 'Our goals:\n- Learn to greet\n- Ask how someone is\n- Say goodbye';
    const segs = parseTutorMessage(text);
    expect(phrases(segs)).toHaveLength(0);
    expect(segs).toEqual([{ kind: 'prose', text }]);
  });

  it('a Nota line is prose even next to a phrase', () => {
    const text = '**Português:** Adeus\n**English:** Goodbye\n\nNota do João: use "tchau" informally.';
    const segs = parseTutorMessage(text);
    expect(phrases(segs)).toEqual([{ kind: 'phrase', pt: 'Adeus', en: 'Goodbye' }]);
    const noteProse = prose(segs);
    expect(noteProse).toHaveLength(1);
    expect(noteProse[0].text).toContain('Nota do João');
  });

  it('a markdown heading is prose', () => {
    const text = '# Lesson 1\n\n**Português:** Sim\n**English:** Yes';
    const segs = parseTutorMessage(text);
    expect(segs[0]).toEqual({ kind: 'prose', text: '# Lesson 1' });
    expect(phrases(segs)).toEqual([{ kind: 'phrase', pt: 'Sim', en: 'Yes' }]);
  });
});

describe('parseTutorMessage — interleaved real-shaped turn', () => {
  it('parses a long interleaved wall into the correct ordered mix', () => {
    const text = [
      'Olá! Vamos aprender saudações hoje.',            // narrative PT (paired below)
      'English: Hello! We are going to learn greetings today.',
      '',
      'Here are the objectives for today:',              // English prose
      '- Greet someone',
      '- Ask how they are',
      '',
      '**Português:** Bom dia',                          // labeled block
      '**Pronunciation:** bohn DEE-ah',
      '**English:** Good morning',
      '',
      'Nota do João: "Bom dia" is used until noon.',      // note prose
    ].join('\n');

    const segs = parseTutorMessage(text);
    const ph = phrases(segs);
    expect(ph).toHaveLength(2);
    expect(ph[0]).toEqual({ kind: 'phrase', pt: 'Olá! Vamos aprender saudações hoje.', en: 'Hello! We are going to learn greetings today.' });
    expect(ph[1]).toEqual({ kind: 'phrase', pt: 'Bom dia', phonetic: 'bohn DEE-ah', en: 'Good morning' });

    // Order is preserved: first segment is the greeting phrase, a note prose exists at the end.
    expect(segs[0].kind).toBe('phrase');
    expect(prose(segs).some((p) => p.text.includes('objectives'))).toBe(true);
    expect(prose(segs).some((p) => p.text.includes('Nota do João'))).toBe(true);
    expect(segs[segs.length - 1]).toEqual({ kind: 'prose', text: 'Nota do João: "Bom dia" is used until noon.' });
  });
});

describe('parseTutorMessage — fallback + robustness', () => {
  it('no-PT input returns a single prose fallback', () => {
    const text = 'Just some plain English with no structure at all.';
    expect(parseTutorMessage(text)).toEqual([{ kind: 'prose', text }]);
  });

  it('never throws and returns prose for empty / non-string input', () => {
    expect(parseTutorMessage('')).toEqual([{ kind: 'prose', text: '' }]);
    // Defensive: exercise the non-string guard (cast, since the signature is `string`).
    expect(parseTutorMessage(undefined as unknown as string)).toEqual([{ kind: 'prose', text: '' }]);
  });

  it('is idempotent on prose (re-parsing the fallback yields the same prose)', () => {
    const text = 'Plain English paragraph.';
    const once = parseTutorMessage(text);
    const twice = parseTutorMessage((once[0] as { text: string }).text);
    expect(twice).toEqual(once);
  });
});
