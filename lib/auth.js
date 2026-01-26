import { kv } from '@vercel/kv';
import { GLOBAL_KEYS, getGlobalData, setGlobalData } from './kv';

/**
 * Authentication helpers for organizer magic link auth
 */

const TOKEN_EXPIRY_MINUTES = 15;
const SESSION_EXPIRY_DAYS = 30;

/**
 * Generate a cryptographically secure random token
 */
function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  const randomValues = new Uint8Array(32);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 32; i++) {
    token += chars[randomValues[i] % chars.length];
  }
  return token;
}

/**
 * Generate a UUID v4
 */
export function generateId() {
  return crypto.randomUUID();
}

/**
 * Create a magic link token for an email
 * @param {string} email - Organizer email
 * @returns {string} The magic link token
 */
export async function createMagicToken(email) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();

  // Store token -> email mapping with expiry
  const tokens = await getGlobalData(GLOBAL_KEYS.MAGIC_TOKENS, {});
  tokens[token] = {
    email: email.toLowerCase(),
    expiresAt,
    createdAt: new Date().toISOString(),
  };

  // Clean up expired tokens while we're here
  const now = new Date();
  for (const [t, data] of Object.entries(tokens)) {
    if (new Date(data.expiresAt) < now) {
      delete tokens[t];
    }
  }

  await setGlobalData(GLOBAL_KEYS.MAGIC_TOKENS, tokens);
  return token;
}

/**
 * Verify and consume a magic link token
 * @param {string} token - The magic link token
 * @returns {string|null} The email if valid, null if invalid/expired
 */
export async function verifyMagicToken(token) {
  const tokens = await getGlobalData(GLOBAL_KEYS.MAGIC_TOKENS, {});
  const tokenData = tokens[token];

  if (!tokenData) {
    return null;
  }

  // Check if expired
  if (new Date(tokenData.expiresAt) < new Date()) {
    delete tokens[token];
    await setGlobalData(GLOBAL_KEYS.MAGIC_TOKENS, tokens);
    return null;
  }

  // Consume the token (one-time use)
  const email = tokenData.email;
  delete tokens[token];
  await setGlobalData(GLOBAL_KEYS.MAGIC_TOKENS, tokens);

  return email;
}

/**
 * Create a session for an organizer
 * @param {string} organizerId - Organizer ID
 * @returns {string} Session token
 */
export async function createSession(organizerId) {
  const sessionToken = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const sessions = await getGlobalData(GLOBAL_KEYS.SESSIONS, {});
  sessions[sessionToken] = {
    organizerId,
    expiresAt,
    createdAt: new Date().toISOString(),
  };

  // Clean up expired sessions
  const now = new Date();
  for (const [t, data] of Object.entries(sessions)) {
    if (new Date(data.expiresAt) < now) {
      delete sessions[t];
    }
  }

  await setGlobalData(GLOBAL_KEYS.SESSIONS, sessions);
  return sessionToken;
}

/**
 * Verify a session token
 * @param {string} sessionToken - Session token from cookie
 * @returns {string|null} Organizer ID if valid, null if invalid/expired
 */
export async function verifySession(sessionToken) {
  if (!sessionToken) return null;

  const sessions = await getGlobalData(GLOBAL_KEYS.SESSIONS, {});
  const sessionData = sessions[sessionToken];

  if (!sessionData) {
    return null;
  }

  // Check if expired
  if (new Date(sessionData.expiresAt) < new Date()) {
    delete sessions[sessionToken];
    await setGlobalData(GLOBAL_KEYS.SESSIONS, sessions);
    return null;
  }

  return sessionData.organizerId;
}

/**
 * Delete a session (logout)
 * @param {string} sessionToken - Session token to delete
 */
export async function deleteSession(sessionToken) {
  if (!sessionToken) return;

  const sessions = await getGlobalData(GLOBAL_KEYS.SESSIONS, {});
  delete sessions[sessionToken];
  await setGlobalData(GLOBAL_KEYS.SESSIONS, sessions);
}

/**
 * Get organizer from session token in request
 * @param {Request} req - Next.js request object
 * @returns {Object|null} Organizer object or null
 */
export async function getOrganizerFromRequest(req) {
  // Check cookie first
  const cookies = req.cookies || {};
  let sessionToken = cookies.session;

  // Also check Authorization header (Bearer token)
  if (!sessionToken) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      sessionToken = authHeader.slice(7);
    }
  }

  if (!sessionToken) return null;

  const organizerId = await verifySession(sessionToken);
  if (!organizerId) return null;

  // Get organizer data
  const organizers = await getGlobalData(GLOBAL_KEYS.ORGANIZERS, []);
  return organizers.find(o => o.id === organizerId) || null;
}

/**
 * Check if email is the super admin
 * @param {string} email - Email to check
 * @returns {boolean}
 */
export function isSuperAdmin(email) {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  return superAdminEmail && email.toLowerCase() === superAdminEmail.toLowerCase();
}

/**
 * Parse cookies from request headers
 * @param {Request} req - Next.js request object
 * @returns {Object} Cookie key-value pairs
 */
export function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = {};

  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      cookies[name] = rest.join('=');
    }
  });

  return cookies;
}
