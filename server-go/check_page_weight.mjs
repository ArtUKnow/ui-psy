// Page weight and load time in Chromium under Lighthouse "Slow 4G" throttling, first and repeat visit.
// Scenarios: login screen, home screen after sign-in, landing.
// Usage: node server-go/check_page_weight.mjs <label>=<baseURL> ... > report.json
import { chromium } from '@playwright/test';

const SLOW_4G = { offline: false, latency: 150, downloadThroughput: 1638.4 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 };
const RUNS = 3;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const SCENARIOS = { login: { path: '/app' }, home: { path: '/app', signIn: true }, landing: { path: '/' } };

async function visit(page, cdp, url, reload) {
  let bytes = 0, requests = 0;
  const onDone = e => { bytes += e.encodedDataLength; requests++; };
  cdp.on('Network.loadingFinished', onDone);
  const started = Date.now();
  let lastByte = started;
  const onAny = () => { lastByte = Date.now(); };
  cdp.on('Network.loadingFinished', onAny);
  if (reload) await page.reload({ waitUntil: 'load' }); else await page.goto(url, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle');
  cdp.off('Network.loadingFinished', onDone);
  cdp.off('Network.loadingFinished', onAny);
  const loadMs = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return n.loadEventEnd - n.startTime; });
  // doneMs: until the last response finished, which includes images React adds after the load event.
  return { bytes, requests, loadMs: Math.round(loadMs), doneMs: lastByte - started };
}

const browser = await chromium.launch();
const report = { time_utc: new Date().toISOString(), network: 'Chromium CDP emulation, Lighthouse Slow 4G: 150 ms RTT, 1.6 Mbit/s down', runs: RUNS, results: {} };
for (const arg of process.argv.slice(2)) {
  const [label, base] = arg.split('=');
  report.results[label] = {};
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const context = await browser.newContext({ baseURL: base, viewport: { width: 390, height: 844 } });
      // Registration through the context's own request API sets the refresh cookie, so /app opens signed in.
      if (scenario.signIn) await context.request.post('/api/auth/register', { data: { email: `weight-${crypto.randomUUID()}@example.test`, password: 'synthetic-weight-password-2026' } });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
      runs.push({ first: await visit(page, cdp, base + scenario.path, false), repeat: await visit(page, cdp, base + scenario.path, true) });
      await context.close();
    }
    const pick = (kind, key) => median(runs.map(r => r[kind][key]));
    report.results[label][name] = {
      first: { bytes: pick('first', 'bytes'), requests: pick('first', 'requests'), loadMs: pick('first', 'loadMs'), doneMs: pick('first', 'doneMs') },
      repeat: { bytes: pick('repeat', 'bytes'), requests: pick('repeat', 'requests'), loadMs: pick('repeat', 'loadMs'), doneMs: pick('repeat', 'doneMs') },
      runs,
    };
  }
}
await browser.close();
console.log(JSON.stringify(report, null, 2));
