#!/usr/bin/env node
/**
 * Analyze RSVP submission timing for bot-like patterns.
 *
 * Pulls every archived period (and the current one) from Vercel KV and flags
 * submissions that look automated. Thresholds account for the real
 * client-open flow: returning members have a prefilled name and only click
 * one button, but the path still requires a countdown-driven page reload +
 * hydrate + render before the button is clickable.
 *
 *   < 0.5s  — physically impossible without scripting the API directly
 *   < 1.0s  — bypassed the reload path; likely a script
 *   < 2.0s  — fast but plausible for a primed regular with a synced clock
 *
 * Usage:
 *   vercel env pull .env.local            # one-time, gets KV_* credentials
 *   node --env-file=.env.local scripts/analyze-rsvp-timing.mjs           # list org slugs
 *   node --env-file=.env.local scripts/analyze-rsvp-timing.mjs <slug>    # analyze one org
 *
 * Requires Node 20+ for --env-file.
 */

import { kv } from '@vercel/kv';

const BOT_THRESHOLD_S = 0.5;        // below this is mechanically impossible for a human
const LIKELY_BOT_THRESHOLD_S = 1.0; // below this bypassed the reload path
const FAST_THRESHOLD_S = 2.0;       // below this is fast-but-normal for a primed regular
const CADENCE_WINDOW = 5;           // analyze first N inter-arrival gaps
const CADENCE_MEAN_MS = 500;        // mean gap below this...
const CADENCE_STDEV_MS = 100;       // ...with stdev below this = robotic

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

function tagFor(offset) {
  if (offset < BOT_THRESHOLD_S)        return '  🚨 BOT (sub-500ms)';
  if (offset < LIKELY_BOT_THRESHOLD_S) return '  ⚠️  likely bot (sub-1s)';
  if (offset < FAST_THRESHOLD_S)       return '  ·  fast';
  return '';
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

  console.log(`\nAll submissions:`);
  rows.forEach((r, i) => {
    console.log(`  #${String(i + 1).padStart(3)}  +${r.offset.toFixed(3).padStart(8)}s  ${r.name}${tagFor(r.offset)}`);
  });

  const flags = [];

  // 1. Bot-level entries (<500ms)
  const botEntries = rows.filter(r => r.offset < BOT_THRESHOLD_S);
  if (botEntries.length > 0) {
    flags.push(
      `${botEntries.length} sub-500ms entr${botEntries.length === 1 ? 'y' : 'ies'} — ` +
      `impossible without scripting the API directly:\n` +
      botEntries.map(r => `       • ${r.name}  +${r.offset.toFixed(3)}s  device=${shortId(r.deviceId)}`).join('\n')
    );
  }

  // 2. Likely-bot entries (500ms–1s)
  const likelyBot = rows.filter(r => r.offset >= BOT_THRESHOLD_S && r.offset < LIKELY_BOT_THRESHOLD_S);
  if (likelyBot.length > 0) {
    flags.push(
      `${likelyBot.length} sub-1s entr${likelyBot.length === 1 ? 'y' : 'ies'} — ` +
      `bypassed the reload path, likely scripted:\n` +
      likelyBot.map(r => `       • ${r.name}  +${r.offset.toFixed(3)}s  device=${shortId(r.deviceId)}`).join('\n')
    );
  }

  // 3. Robotic cadence in the opening window
  const deltas = [];
  for (let i = 1; i < rows.length; i++) {
    deltas.push(rows[i].ts - rows[i - 1].ts);
  }
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

/**
 * Find the most recent open boundary at-or-before the given timestamp.
 * Mirrors the local-time conversion pattern used in lib/recurrence.js.
 */
function computeOpenTime(tsISO, settings) {
  const tz = settings.accessPeriod.timezone || 'Africa/Lagos';
  const { startDay, startHour, startMinute } = settings.accessPeriod;
  const utc = new Date(tsISO);

  // Get tz wall-clock components for utc via Intl (no ms involved).
  const tzView = new Date(utc.toLocaleString('en-US', { timeZone: tz }));

  let daysBack = (tzView.getDay() - startDay + 7) % 7;
  const currentMinutes = tzView.getHours() * 60 + tzView.getMinutes();
  const startMinutes = startHour * 60 + startMinute;
  if (daysBack === 0 && currentMinutes < startMinutes) daysBack = 7;

  const target = new Date(tzView);
  target.setDate(target.getDate() - daysBack);
  target.setHours(startHour, startMinute, 0, 0);

  // Compute tz offset using a second-aligned reference so utc's milliseconds
  // don't leak into the offset (which was the prior bug).
  const utcRounded = new Date(Math.floor(utc.getTime() / 1000) * 1000);
  const tzViewRounded = new Date(utcRounded.toLocaleString('en-US', { timeZone: tz }));
  const tzOffsetMs = tzViewRounded.getTime() - utcRounded.getTime();

  return new Date(target.getTime() - tzOffsetMs);
}

function pad(n) { return String(n).padStart(2, '0'); }
function shortId(id) { return id ? id.slice(0, 8) : '(none)'; }

main().catch(err => {
  console.error(err);
  process.exit(1);
});
