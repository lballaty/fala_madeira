// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/legal/privacy.ts
// Description: Privacy Policy content for FalaMadeira as a typed LegalDocument constant.
//   DRAFT — pending legal review. GDPR notice for a Czech controller (SearchingFool,
//   support@searchingfool.com). Data flows are stated to match the actual implementation:
//   Supabase EU-West (London) hosting, Gemini via edge functions, browser/device speech
//   recognition, in-app deletion via the delete-account edge function.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { LegalDocument } from './types';

export const PRIVACY_POLICY: LegalDocument = {
  id: 'privacy',
  title: 'Privacy Policy',
  version: '0.1.0',
  lastUpdated: '2026-07-09',
  status: 'draft',
  intro: [
    'This policy explains what personal data FalaMadeira collects, why, and what rights you have. We do not show ads and we never sell your data.',
  ],
  sections: [
    {
      heading: '1. Who is responsible for your data',
      paragraphs: [
        'The data controller is SearchingFool, based in the Czech Republic. Contact: support@searchingfool.com.',
      ],
    },
    {
      heading: '2. What data we collect',
      bullets: [
        'Account data — your email address, authentication credentials (managed by our hosting provider; we never see your password in plain text), and the consent choices you made at signup.',
        'Learning progress — lesson completions, streak, time spent, quiz results, your chosen tutor and audio settings.',
        'AI conversation content — the messages you type or dictate to the AI tutor, and the AI’s replies.',
        'Voice and speech data — when you use voice input, speech recognition runs in your browser or on your device and we receive only the resulting text. We do not currently store your voice recordings. If a future pronunciation-feedback feature stores audio, we will update this policy and ask you first.',
        'Support and diagnostics — support tickets you open and diagnostic logs (app events and errors, linked to your account) used to keep the service secure and fix problems.',
      ],
    },
    {
      heading: '3. Why we process it, and on what legal basis',
      bullets: [
        'To provide the service (accounts, lessons, progress, sync) — performance of our contract with you (GDPR Art. 6(1)(b)).',
        'To power AI features (sending your conversation content to our AI provider, generating tutor replies and synthetic speech) — your consent, given at signup (Art. 6(1)(a)). You can withdraw it at any time (see section 7).',
        'To keep the service secure and working (diagnostic and security logs, abuse prevention) — our legitimate interest in running a safe, reliable service (Art. 6(1)(f)).',
      ],
    },
    {
      heading: '4. Who processes data for us',
      paragraphs: ['We use a small number of service providers (processors):'],
      bullets: [
        'Supabase — database, authentication, and server functions. Our project is hosted in the EU-West (London) region.',
        'Google (Gemini API) — generates AI tutor replies, lessons, translations, and currently also synthetic speech (text-to-speech). Your conversation text is sent to Google for this purpose through our server functions.',
        'Microsoft Azure — planned as an additional text-to-speech provider; if enabled, the text to be spoken would be sent to Azure.',
        'Your browser or device vendor — when you use voice input, speech recognition is performed by your browser (Web Speech API) or, in a future iOS app, by Apple’s on-device speech recognition. Depending on your browser, audio may be processed on the vendor’s servers (for example Google servers when using Chrome). This happens under the vendor’s own privacy terms.',
      ],
      // Note for legal review: DPA / SCC status for each processor to be confirmed.
    },
    {
      heading: '5. Where your data is stored and international transfers',
      paragraphs: [
        'Your account and learning data are stored in Supabase’s EU-West (London, United Kingdom) region. The UK benefits from an EU adequacy decision.',
        'AI requests are processed by Google’s Gemini API and may be processed outside the EEA. Such transfers rely on the safeguards in our providers’ data-processing terms (such as EU Standard Contractual Clauses). [To be verified in legal review.]',
      ],
    },
    {
      heading: '6. How long we keep data',
      bullets: [
        'Account and learning data — for as long as your account exists.',
        'Diagnostic and security logs — for a limited period needed for security and debugging, then deleted; log rows tied to your account are removed when you delete the account.',
        'Support tickets — while your account exists; removed when you delete the account.',
      ],
    },
    {
      heading: '7. Your rights',
      paragraphs: ['Under the GDPR you can, at any time:'],
      bullets: [
        'access the data we hold about you and receive a copy (portability);',
        'correct inaccurate data;',
        'delete your data — see section 8;',
        'restrict or object to processing based on legitimate interest;',
        'withdraw your consent to AI processing — contact us at support@searchingfool.com, or delete your account; withdrawing consent means the AI features can no longer be used, and does not affect the lawfulness of processing before withdrawal;',
        'complain to a supervisory authority — in the Czech Republic this is the Úřad pro ochranu osobních údajů (ÚOOÚ), www.uoou.gov.cz. You may also complain to the authority in your own EU country.',
      ],
    },
    {
      heading: '8. Deleting your account',
      paragraphs: [
        'Profile → Delete Account & Data deletes your account immediately: your profile, lessons and lesson requests, quiz and progress records, support tickets, diagnostic logs, video suggestions, lesson corrections, and finally the account itself. This cannot be undone.',
        'Data already cached on your own device (see section 9) stays on your device until you clear it or uninstall the app.',
      ],
    },
    {
      heading: '9. Data stored on your device',
      paragraphs: [
        'To work fast and partly offline, the app caches data on your device using browser storage (localStorage and IndexedDB): lesson content, generated audio, and your local preferences. This data stays on your device and is under your control — clearing site data or uninstalling the app removes it.',
      ],
    },
    {
      heading: '10. Security',
      paragraphs: [
        'All traffic is encrypted in transit (TLS). Access to your rows in our database is restricted to your authenticated account (row-level security), and administrative deletion runs through authenticated server functions.',
      ],
    },
    {
      heading: '11. Children',
      paragraphs: [
        'FalaMadeira is not directed at children under 15, and we do not knowingly process their data. If you believe a child has created an account, contact us and we will delete it.',
      ],
    },
    {
      heading: '12. Changes and contact',
      paragraphs: [
        'We may update this policy; the version and date at the top always show the current revision, and we will notify you in the app about material changes.',
        'Privacy questions and requests: support@searchingfool.com.',
      ],
    },
  ],
};
