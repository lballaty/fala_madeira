// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/51-edge-cors-preflight.spec.ts
// Description: Real (unmocked) CORS preflight integration test against the LIVE edge functions.
//   Complements the build-time static gate scripts/check-cors-headers.mjs: the static check
//   asserts the client↔edge header contract in the SOURCE, this asserts it on the DEPLOYED
//   functions — catching deploy drift (code allows a header but the live function is stale) and
//   exercising an actual OPTIONS preflight, which the mocked (route.fulfill) e2e specs never do.
//   Guards the 2026-07-14 TB-2 regression class: a client request header (traceparent) missing
//   from the edge Access-Control-Allow-Headers → browser blocks every edge call. Uses Playwright's
//   APIRequestContext (no page/auth needed for OPTIONS).
// Author: CORS regression guard (with assistant)
// Created: 2026-07-14

import { test, expect } from '@playwright/test';
import { SUPABASE_URL } from './support/env';

// Every header the client attaches to supabase.functions.invoke: the supabase-js baseline plus
// our W3C `traceparent` (OBSERVABILITY-CONTRACT §8). Keep in sync with scripts/check-cors-headers.mjs
// (the source-level contract) — this is the deployed-side mirror.
const CLIENT_REQUEST_HEADERS = ['authorization', 'apikey', 'x-client-info', 'content-type', 'traceparent'];

// All edge functions the client invokes (they share _shared/http.ts corsHeaders, but each is
// deployed independently, so a stale single function is possible).
const EDGE_FUNCTIONS = ['ai-gateway', 'log-sink', 'delete-account'];

test.describe('edge CORS preflight (real, unmocked)', () => {
  for (const fn of EDGE_FUNCTIONS) {
    test(`${fn}: preflight allows every client request header`, async ({ request }) => {
      const res = await request.fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://falamadeira.app',
          'access-control-request-method': 'POST',
          'access-control-request-headers': CLIENT_REQUEST_HEADERS.join(', '),
        },
      });

      // Preflight must succeed (2xx) — a failed preflight blocks the real request in the browser.
      expect(res.status(), `${fn} preflight status`).toBeLessThan(400);

      const allow = (res.headers()['access-control-allow-headers'] ?? '').toLowerCase();
      for (const header of CLIENT_REQUEST_HEADERS) {
        expect(
          allow,
          `edge "${fn}" must allow the "${header}" request header — otherwise the browser CORS ` +
            `preflight fails and EVERY ${fn} call is blocked (see TB-2). Add it to _shared/http.ts corsHeaders + redeploy.`,
        ).toContain(header);
      }
    });
  }
});
