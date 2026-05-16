#!/usr/bin/env node
/**
 * Analyze RSVP submission timing for bot-like patterns.
 *
 * Pulls every archived period (and the current one) from Vercel KV and flags
 * submissions that look automated:
 *   - sub-second offsets from form-open time (humans need ~1.5–3s)
 *   - bursts of multiple "different" people submitting within ~200ms
 *   - suspiciously uniform inter-arrival cadence across the first N entries
 *
 * Usage:
 *   vercel env pull .env.local            # one-time, gets KV_* credentials
 *   node --env-file=.env.local scripts/analyze-rsvp-timing.mjs           # list org slugs
 *   node --env-file=.env.local scripts/analyze-rsvp-timing.mjs <slug>    # analyze one org
 *
 * Requires Node 20+ for --env-file.
 */

import { kv } from '@vercel/kv';

const SUB_SECOND_THRESHOLD_S = 1.0;     // anyone faster than this is suspicious
const FAST_THRESHOLD_S = 2.0;            // worth flagging but plausibly human
const BURST_GAP_MS = 200;                // consecutive gaps below this = burst
const BURST_MIN_COUNT = 3;               // at least N entries to call it a burst
const CADENCE_WINDOW = 5;                // analyze first N inter-arrival gaps
const CADENCE_MEAN_MS = 500;             // mean gap below this...
const CADENCE_STDEV_MS = 100;            // ...with stdev below this = robotic
const TOP_ROWS = 15;

async function main() {
  const slug = process.argv[2];
  const orgs = (await kv.get('playday:organizations')) || [];

  if (!slug) {
    console.log('Available organizations:');
    for (const o of orgs) {
      console.log(`  ${o.slug.padEnd(20)} ${o.name}`);
    }
    console.log('\nUsage: node --env-file=.env.local scripts/analyze-rsvp-timing.mjs <slug>');
    return;
  }

  const org = orgs.find(o => o.slug === slug);
  if (!org) {
    console.error(`No organization with slug "${slug}"`);
    process.exit(1);
  }

  const settings = await kv.get(`org:${org.id}:settings`);
  if (!settings?.accessPeriod) {
    console.error('Organization has no accessPeriod settings; cannot compute open times.');
    process.exit(1);
  }

  const archive = (await kv.get(`org:${org.id}:archive`)) || [];
  const current = (await kv.get(`org:${org.id}:rsvp-data`)) || { mainList: [], waitlist: [] };

  console.log(`Analyzing ${org.name} (${slug})`);
  console.log(`Timezone: ${settings.accessPeriod.timezone || 'Africa/Lagos'}`);
  console.log(`Open: day=${settings.accessPeriod.startDay} ${pad(settings.accessPeriod.startHour)}:${pad(settings.accessPeriod.startMinute)}`);
  console.log(`Periods: ${archive.length} archived + 1 current`);

  const periods = [
    { weekId: 'CURRENT', mainList: current.mainList, waitlist: current.waitlist },
    ...archive,
  ];

  let totalFlagged = 0;
  for (const period of periods) {
    if (analyzePeriod(period, settings)) totalFlagged++;
  }

  console.log(`\n──────────────────────────────────────────`);
  console.log(`Summary: ${totalFlagged}/${periods.length} periods had at least one anomaly.`);
}

function analyzePeriod(period, settings) {
  const all = [...(period.mainList || []), ...(period.waitlist || [])];
  // Whitelisted entries get their timestamps preserved across resets, so they
  // skew offset math. Analyze only fresh (non-whitelisted) submissions.
  const fresh = all
    .filter(p => !p.isWhitelisted && p.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  console.log(`\n=== ${period.weekId} ===`);
  if (fresh.length === 0) {
    console.log('  (no non-whitelisted submissions)');
    return false;
  }

  const openTime = computeOpenTime(fresh[0].timestamp, settings);
  const rows = fresh.map(p => ({
    name: p.name,
    deviceId: p.deviceId,
    ts: new Date(p.timestamp),
    offset: (new Date(p.timestamp) - openTime) / 1000,
  }));

  console.log(`Form opened: ${openTime.toISOString()}`);
  console.log(`First RSVP:  ${rows[0].ts.toISOString()}  (+${rows[0].offset.toFixed(3)}s)`);
  console.log(`Total non-whitelisted: ${rows.length}`);

  console.log(`\nFirst ${Math.min(TOP_ROWS, rows.length)} submissions:`);
  rows.slice(0, TOP_ROWS).forEach((r, i) => {
    const tag =
      r.offset < SUB_SECOND_THRESHOLD_S ? '  ⚠️  SUB-SECOND' :
      r.offset < FAST_THRESHOLD_S       ? '  ⚠   fast' : '';
    console.log(`  #${String(i + 1).padStart(2)}  +${r.offset.toFixed(3).padStart(7)}s  ${r.name}${tag}`);
  });

  // Inter-arrival deltas in ms
  const deltas = [];
  for (let i = 1; i < rows.length; i++) {
    deltas.push(rows[i].ts - rows[i - 1].ts);
  }

  const flags = [];

  // 1. Sub-second offsets
  const subSecond = rows.filter(r => r.offset < SUB_SECOND_THRESHOLD_S);
  if (subSecond.length > 0) {
    flags.push(
      `${subSecond.length} sub-second entr${subSecond.length === 1 ? 'y' : 'ies'} ` +
      `(humans typically need 1.5–3s to react + type a name + submit):\n` +
      subSecond.map(r => `       • ${r.name}  +${r.offset.toFixed(3)}s  device=${shortId(r.deviceId)}`).join('\n')
    );
  }

  // 2. Bursts of tight consecutive submissions
  let runStart = -1, runLen = 0;
  for (let i = 0; i < deltas.length; i++) {
    if (deltas[i] < BURST_GAP_MS) {
      if (runStart < 0) runStart = i;
      runLen++;
    } else {
      maybeFlagBurst(runStart, runLen, rows, deltas, flags);
      runStart = -1; runLen = 0;
    }
  }
  maybeFlagBurst(runStart, runLen, rows, deltas, flags);

  // 3. Robotic cadence in the opening window
  if (deltas.length >= CADENCE_WINDOW) {
    const window = deltas.slice(0, CADENCE_WINDOW);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
    const stdev = Math.sqrt(variance);
    if (mean < CADENCE_MEAN_MS && stdev < CADENCE_STDEV_MS) {
      flags.push(
        `Robotic cadence in first ${CADENCE_WINDOW} gaps ` +
        `(mean=${mean.toFixed(0)}ms, stdev=${stdev.toFixed(0)}ms). ` +
        `Gaps: [${window.map(d => d + 'ms').join(', ')}]`
      );
    }
  }

  // 4. DeviceId reuse across "different" names (rare but a smoking gun)
  const byDevice = new Map();
  for (const r of rows) {
    if (!r.deviceId) continue;
    if (!byDevice.has(r.deviceId)) byDevice.set(r.deviceId, []);
    byDevice.get(r.deviceId).push(r.name);
  }
  for (const [id, names] of byDevice) {
    const distinct = new Set(names.map(n => n.toLowerCase()));
    if (distinct.size > 1) {
      flags.push(`Single deviceId (${shortId(id)}) used for ${distinct.size} distinct names: ${[...distinct].join(', ')}`);
    }
  }

  console.log(`\nFlags:`);
  if (flags.length === 0) {
    console.log('  (no anomalies)');
    return false;
  }
  flags.forEach(f => console.log(`  ⚠ ${f}`));
  return true;
}

function maybeFlagBurst(runStart, runLen, rows, deltas, flags) {
  if (runStart < 0 || runLen < BURST_MIN_COUNT - 1) return;
  const totalGapMs = deltas.slice(runStart, runStart + runLen).reduce((a, b) => a + b, 0);
  const names = rows.slice(runStart, runStart + runLen + 1).map(r => r.name);
  flags.push(
    `Burst of ${names.length} submissions within ${totalGapMs}ms: ${names.join(' → ')}`
  );
}

/**
 * Find the most recent open boundary at-or-before the given timestamp.
 * Mirrors the local-time conversion pattern used in lib/recurrence.js.
 */
function computeOpenTime(tsISO, settings) {
  const tz = settings.accessPeriod.timezone || 'Africa/Lagos';
  const { startDay, startHour, startMinute } = settings.accessPeriod;
  const utc = new Date(tsISO);
  const local = new Date(utc.toLocaleString('en-US', { timeZone: tz }));

  const target = new Date(local);
  let daysBack = (local.getDay() - startDay + 7) % 7;
  target.setDate(target.getDate() - daysBack);
  target.setHours(startHour, startMinute, 0, 0);
  if (target > local) {
    target.setDate(target.getDate() - 7);
  }
  // local was built by stringifying utc in tz — the diff gives the tz offset
  // that applied at that wall-clock instant, which we subtract to get UTC back.
  const offsetMs = local.getTime() - utc.getTime();
  return new Date(target.getTime() - offsetMs);
}

function pad(n) { return String(n).padStart(2, '0'); }
function shortId(id) { return id ? id.slice(0, 8) : '(none)'; }

main().catch(err => {
  console.error(err);
  process.exit(1);
});
