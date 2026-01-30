import { kv } from '@vercel/kv';

/**
 * Namespaced KV helper for multi-tenant data isolation.
 * All organization-specific data is prefixed with `org:{orgId}:`
 */

// Global keys (not org-scoped)
export const GLOBAL_KEYS = {
  ORGANIZERS: 'playday:organizers',
  ORGANIZATIONS: 'playday:organizations',
  MAGIC_TOKENS: 'playday:magic-tokens',
  SESSIONS: 'playday:sessions',
};

// Organization-scoped key suffixes
export const ORG_KEY_SUFFIXES = {
  RSVP_DATA: 'rsvp-data',
  SETTINGS: 'settings',
  WHITELIST: 'whitelist',
  ARCHIVE: 'archive',
  LAST_RESET: 'last-reset',
  LAST_EMAIL: 'last-email',
  SNOOZED: 'snoozed',
  EMAIL_STATUS: 'email-status',
  EMAIL_LOG: 'email-log',
};

/**
 * Generate an org-scoped KV key
 * @param {string} orgId - Organization ID
 * @param {string} suffix - Key suffix from ORG_KEY_SUFFIXES
 * @returns {string} Namespaced key
 */
export function orgKey(orgId, suffix) {
  if (!orgId) throw new Error('orgId is required for org-scoped keys');
  return `org:${orgId}:${suffix}`;
}

/**
 * Get org-scoped data
 * @param {string} orgId - Organization ID
 * @param {string} suffix - Key suffix
 * @param {*} defaultValue - Default value if key doesn't exist
 */
export async function getOrgData(orgId, suffix, defaultValue = null) {
  const key = orgKey(orgId, suffix);
  const data = await kv.get(key);
  return data ?? defaultValue;
}

/**
 * Set org-scoped data
 * @param {string} orgId - Organization ID
 * @param {string} suffix - Key suffix
 * @param {*} value - Value to store
 */
export async function setOrgData(orgId, suffix, value) {
  const key = orgKey(orgId, suffix);
  await kv.set(key, value);
}

/**
 * Delete org-scoped data
 * @param {string} orgId - Organization ID
 * @param {string} suffix - Key suffix
 */
export async function deleteOrgData(orgId, suffix) {
  const key = orgKey(orgId, suffix);
  await kv.del(key);
}

/**
 * Get global (non-org-scoped) data
 * @param {string} key - Global key from GLOBAL_KEYS
 * @param {*} defaultValue - Default value if key doesn't exist
 */
export async function getGlobalData(key, defaultValue = null) {
  const data = await kv.get(key);
  return data ?? defaultValue;
}

/**
 * Set global (non-org-scoped) data
 * @param {string} key - Global key from GLOBAL_KEYS
 * @param {*} value - Value to store
 */
export async function setGlobalData(key, value) {
  await kv.set(key, value);
}

/**
 * Delete all data for an organization (for cleanup/deletion)
 * @param {string} orgId - Organization ID
 */
export async function deleteAllOrgData(orgId) {
  const suffixes = Object.values(ORG_KEY_SUFFIXES);
  await Promise.all(suffixes.map(suffix => deleteOrgData(orgId, suffix)));
}

// Re-export raw kv for cases where direct access is needed
export { kv };
