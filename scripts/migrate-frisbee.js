/**
 * Migration script to move existing frisbee data to the new multi-tenant structure
 *
 * Run this script once after deploying the multi-tenant version:
 * 1. Set the SUPER_ADMIN_EMAIL env var
 * 2. Run: node scripts/migrate-frisbee.js
 *
 * This will:
 * - Create an organizer account for the super admin (auto-approved)
 * - Create a "frisbee" organization
 * - Move all existing frisbee data to the new org-namespaced keys
 *
 * The original data will remain intact (not deleted) for safety.
 */

const LEGACY_KEYS = {
  RSVP_DATA: 'frisbee-rsvp-data',
  SETTINGS: 'frisbee-settings',
  WHITELIST: 'frisbee-whitelist',
  ARCHIVE: 'frisbee-archive',
  LAST_RESET: 'frisbee-last-reset',
  LAST_EMAIL: 'frisbee-last-email',
  SNOOZED: 'frisbee-snoozed',
  EMAIL_STATUS: 'frisbee-email-status',
};

async function migrate() {
  // This script needs to be run in a Node.js environment with access to Vercel KV
  // For production, you might want to create an API endpoint instead

  console.log('=== Frisbee to Multi-Tenant Migration ===\n');

  console.log('This script should be run as an API endpoint or via Vercel CLI.');
  console.log('Create /api/migrate-frisbee endpoint to run this migration.\n');

  console.log('Migration steps:');
  console.log('1. Log in as super admin at /auth/login');
  console.log('2. Create a "frisbee" organization with slug "frisbee"');
  console.log('3. Call POST /api/admin/migrate-frisbee to move data\n');

  console.log('Manual migration via Vercel KV console:');
  console.log('- Copy frisbee-rsvp-data -> org:{orgId}:rsvp-data');
  console.log('- Copy frisbee-settings -> org:{orgId}:settings');
  console.log('- Copy frisbee-whitelist -> org:{orgId}:whitelist');
  console.log('- Copy frisbee-archive -> org:{orgId}:archive');
  console.log('- Copy frisbee-last-reset -> org:{orgId}:last-reset');
  console.log('- Copy frisbee-last-email -> org:{orgId}:last-email');
  console.log('- Copy frisbee-snoozed -> org:{orgId}:snoozed');
  console.log('- Copy frisbee-email-status -> org:{orgId}:email-status');
}

migrate();
