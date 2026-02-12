#!/usr/bin/env node

/**
 * Local/manual + AI Studio chat simulation helper.
 *
 * This script validates key runtime signals against a running backend:
 * 1) health endpoint reports local_manual ingestion mode
 * 2) optional auth login and query request path
 * 3) response schema sanity checks for chat answer/integrity fields
 */

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [k, v] = arg.split('=');
  if (k?.startsWith('--')) args.set(k.slice(2), v ?? 'true');
}

const run = async () => {
  if (args.has('help')) {
    console.log(`Usage:
  node scripts/simulate-local-aistudio-chat.mjs [--baseUrl=http://localhost:3001] [--loginEmail=...] [--loginPassword=...] [--query=...] [--cookie=token=...] [--strict]

Examples:
  node scripts/simulate-local-aistudio-chat.mjs --baseUrl=http://localhost:3001 --cookie='token=...'
  node scripts/simulate-local-aistudio-chat.mjs --baseUrl=http://localhost:3001 --loginEmail=admin@example.com --loginPassword=admin123
  node scripts/simulate-local-aistudio-chat.mjs --strict
`);
    return 0;
  }

  const baseUrl = (args.get('baseUrl') || 'http://localhost:3001').replace(/\/$/, '');
  const query = args.get('query') || 'What is the annual leave limit?';
  const strict = args.has('strict') && args.get('strict') !== 'false';

  const report = {
    timestamp: new Date().toISOString(),
    mode: 'unknown',
    gemini: 'unknown',
    steps: [],
    overall: 'FAIL'
  };

  const pushStep = (name, status, details = {}) => {
    report.steps.push({ name, status, details });
  };

  const fetchJson = async (url, options = {}) => {
    const res = await fetch(url, options);
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    return { res, json };
  };

  const cookieHeader = (cookie) => (cookie ? { Cookie: cookie } : {});

  try {
    let cookie = args.get('cookie') || '';

    // Step 1: Optional login if no cookie provided
    if (!cookie && args.get('loginEmail') && args.get('loginPassword')) {
      const login = await fetchJson(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: args.get('loginEmail'), password: args.get('loginPassword') })
      });

      const setCookie = login.res.headers.get('set-cookie') || '';
      const tokenCookie = setCookie.split(';')[0] || '';
      if (login.res.ok && tokenCookie.includes('=')) {
        cookie = tokenCookie;
        pushStep('auth', 'PASS', { status: login.res.status, method: 'login' });
      } else {
        pushStep('auth', 'FAIL', { status: login.res.status, body: login.json });
      }
    } else if (cookie) {
      pushStep('auth', 'PASS', { method: 'provided-cookie' });
    } else {
      pushStep('auth', strict ? 'FAIL' : 'WARN', {
        reason: strict
          ? 'Strict mode requires cookie or login credentials for admin health + query checks'
          : 'No cookie or login credentials supplied; admin health + query checks may be skipped'
      });
    }

    // Step 2: Health and mode checks
    // /api/v1/system/health is admin-protected. Use it when cookie is available, otherwise
    // fall back to public /api/v1/health to verify backend reachability.
    const healthUrl = cookie ? `${baseUrl}/api/v1/system/health` : `${baseUrl}/api/v1/health`;
    const health = await fetchJson(healthUrl, { headers: cookieHeader(cookie) });

    if (!health.res.ok) {
      pushStep('health', 'FAIL', { status: health.res.status, body: health.json, url: healthUrl });
      console.log(JSON.stringify(report, null, 2));
      return 1;
    }

    if (cookie) {
      const mode = health.json?.mode?.ingestionMode;
      const driveConfigured = health.json?.mode?.driveConfigured;
      const geminiStatus = health.json?.services?.gemini?.status;

      report.mode = mode || 'unknown';
      report.gemini = geminiStatus || 'unknown';

      const modePass = mode === 'local_manual' && driveConfigured === false;
      pushStep('health', modePass ? 'PASS' : 'FAIL', {
        mode,
        driveConfigured,
        geminiStatus,
        url: healthUrl
      });
    } else {
      pushStep('health', 'PASS', {
        status: health.json?.status || 'ok',
        service: health.json?.service || 'aikb-api',
        url: healthUrl
      });
    }

    // Step 3: Query schema check
    if (cookie) {
      const q = await fetchJson(`${baseUrl}/api/v1/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie
        },
        body: JSON.stringify({ query })
      });

      const shapePass = q.res.ok
        && typeof q.json?.answer === 'string'
        && typeof q.json?.integrity === 'object';

      pushStep('query', shapePass ? 'PASS' : 'FAIL', {
        status: q.res.status,
        hasAnswer: typeof q.json?.answer === 'string',
        hasIntegrity: typeof q.json?.integrity === 'object'
      });
    }

    const failed = report.steps.filter((s) => s.status === 'FAIL').length;
    report.overall = failed === 0 ? 'PASS' : 'FAIL';

    console.log(JSON.stringify(report, null, 2));
    return report.overall === 'PASS' ? 0 : 1;
  } catch (error) {
    pushStep('unexpected', 'FAIL', {
      error: error instanceof Error ? error.message : String(error)
    });
    console.log(JSON.stringify(report, null, 2));
    return 1;
  }
};

process.exitCode = await run();
