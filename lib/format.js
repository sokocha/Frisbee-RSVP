/**
 * Formatting helpers used across the app.
 */

/**
 * Format a future ISO date string as a human-readable relative time.
 * - Past/now → "soon"
 * - < 1 hour → "in 45m"
 * - < 1 day  → "in 5h 30m"
 * - < 7 days → "in 3d 5h"
 * - ≥ 7 days → "Feb 3" (month + day)
 */
export function formatNextOpen(isoString) {
  const now = new Date();
  const target = new Date(isoString);
  const diffMs = target - now;
  if (diffMs <= 0) return 'soon';

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays >= 7) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[target.getMonth()]} ${target.getDate()}`;
  }
  if (diffDays >= 1) {
    const remainHours = diffHours % 24;
    return remainHours > 0 ? `in ${diffDays}d ${remainHours}h` : `in ${diffDays}d`;
  }
  if (diffHours >= 1) {
    const remainMins = diffMins % 60;
    return remainMins > 0 ? `in ${diffHours}h ${remainMins}m` : `in ${diffHours}h`;
  }
  return `in ${diffMins}m`;
}
