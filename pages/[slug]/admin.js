import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { LAGOS_AREAS, formatLocation, parseArea } from '../../lib/locations';
import { getNthDayOfMonth } from '../../lib/recurrence';

// Helper: Format time as 12-hour with am/pm
function formatTime12h(hour, minute) {
  const h = hour % 12 || 12;
  const m = minute.toString().padStart(2, '0');
  const ampm = hour < 12 ? 'am' : 'pm';
  return `${h}:${m}${ampm}`;
}

// Helper: Calculate time remaining until close
function getTimeUntilClose(accessPeriod, timezone) {
  if (!accessPeriod?.enabled) return null;

  try {
    const now = new Date();
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const currentDay = localTime.getDay();
    const currentHour = localTime.getHours();
    const currentMinute = localTime.getMinutes();

    const { startDay, startHour, startMinute, endDay, endHour, endMinute } = accessPeriod;

    // Calculate minutes from start of week
    const currentMins = currentDay * 24 * 60 + currentHour * 60 + currentMinute;
    const startMins = startDay * 24 * 60 + startHour * 60 + startMinute;
    const endMins = endDay * 24 * 60 + endHour * 60 + endMinute;

    // Check if currently open
    let isOpen;
    if (startMins <= endMins) {
      isOpen = currentMins >= startMins && currentMins < endMins;
    } else {
      isOpen = currentMins >= startMins || currentMins < endMins;
    }

    if (!isOpen) return null;

    // Calculate minutes until close
    let minsUntilClose;
    if (startMins <= endMins) {
      minsUntilClose = endMins - currentMins;
    } else {
      if (currentMins >= startMins) {
        minsUntilClose = (7 * 24 * 60 - currentMins) + endMins;
      } else {
        minsUntilClose = endMins - currentMins;
      }
    }

    const hours = Math.floor(minsUntilClose / 60);
    const mins = minsUntilClose % 60;

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  } catch {
    return null;
  }
}

// Helper: Get current time in timezone
function getCurrentTimeInTimezone(timezone) {
  try {
    const now = new Date();
    return now.toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return null;
  }
}

// TimePicker component
function TimePicker({ hour, minute, onChange, label }) {
  const timeValue = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

  const handleChange = (e) => {
    const [h, m] = e.target.value.split(':').map(Number);
    onChange(h, m);
  };

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input
        type="time"
        value={timeValue}
        onChange={handleChange}
        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
      />
    </div>
  );
}

// Visual timeline component showing the weekly recurring schedule
// Always shows events in logical order: RSVP Opens -> RSVP Closes -> Game Starts -> Game Ends -> Repeat
function WeeklyTimeline({ gameDay, gameStartHour, gameStartMinute, gameEndHour, gameEndMinute, rsvpOpenDay, rsvpOpenHour, rsvpOpenMinute, rsvpCloseDay, rsvpCloseHour, rsvpCloseMinute, recurrence, monthlyOccurrence }) {
  const fullDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const formatTime = (h, m) => {
    const hour = h % 12 || 12;
    const min = (m || 0).toString().padStart(2, '0');
    const ampm = h < 12 ? 'am' : 'pm';
    return `${hour}:${min}${ampm}`;
  };

  // Calculate the next upcoming game date
  const getNextGameDate = () => {
    const now = new Date();
    if (recurrence === 'monthly') {
      const year = now.getFullYear();
      const month = now.getMonth();
      // Check current month first, then next months
      for (let offset = 0; offset <= 2; offset++) {
        const m = (month + offset) % 12;
        const y = (month + offset) >= 12 ? year + 1 : year;
        const candidate = getNthDayOfMonth(y, m, gameDay, monthlyOccurrence || 1);
        if (candidate) {
          const gameDateTime = new Date(candidate);
          gameDateTime.setHours(gameStartHour, gameStartMinute, 0, 0);
          if (gameDateTime > now) return candidate;
        }
      }
      return null;
    }
    // Weekly: find next occurrence of gameDay
    const today = now.getDay();
    let daysUntil = gameDay - today;
    if (daysUntil < 0) daysUntil += 7;
    if (daysUntil === 0) {
      const gameTime = new Date(now);
      gameTime.setHours(gameStartHour, gameStartMinute, 0, 0);
      if (now >= gameTime) daysUntil = 7;
    }
    const nextGame = new Date(now);
    nextGame.setDate(nextGame.getDate() + daysUntil);
    return nextGame;
  };

  const nextGameDate = getNextGameDate();

  // Get the actual date for each event relative to the next game date
  const getEventDate = (eventDay, eventType) => {
    if (!nextGameDate) return null;
    const gameDateCopy = new Date(nextGameDate);
    let dayOffset = eventDay - gameDay;
    // RSVP events (open/close) happen before or on game day, not after
    if (eventType === 'open' || eventType === 'close') {
      if (dayOffset > 0) dayOffset -= 7;
    }
    const eventDate = new Date(gameDateCopy);
    eventDate.setDate(eventDate.getDate() + dayOffset);
    return eventDate;
  };

  const formatDate = (date) => {
    if (!date) return '';
    return `${months[date.getMonth()]} ${date.getDate()}`;
  };

  // Always show events in logical order (not sorted by time)
  // This is the recurring cycle: Opens -> Closes -> Game Starts -> Game Ends -> (repeat)
  const events = [
    { type: 'open', day: rsvpOpenDay, hour: rsvpOpenHour, minute: rsvpOpenMinute, label: 'RSVP Opens', color: 'text-green-600', bg: 'bg-green-100', icon: '📬' },
    { type: 'close', day: rsvpCloseDay, hour: rsvpCloseHour, minute: rsvpCloseMinute, label: 'RSVP Closes', color: 'text-orange-600', bg: 'bg-orange-100', icon: '🔒' },
    { type: 'game-start', day: gameDay, hour: gameStartHour, minute: gameStartMinute, label: 'Game Starts', color: 'text-blue-600', bg: 'bg-blue-100', icon: '🏆' },
    { type: 'game-end', day: gameDay, hour: gameEndHour, minute: gameEndMinute, label: 'Game Ends', color: 'text-purple-600', bg: 'bg-purple-100', icon: '🏁' },
  ];

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-green-300 via-blue-300 to-purple-300"></div>

      {/* Events - always in logical order */}
      <div className="space-y-3">
        {events.map((event, index) => {
          const eventDate = getEventDate(event.day, event.type);
          return (
            <div key={event.type} className="flex items-start gap-3 relative">
              {/* Dot on timeline */}
              <div className={`w-8 h-8 rounded-full ${event.bg} flex items-center justify-center text-sm z-10 flex-shrink-0`}>
                {event.icon}
              </div>
              {/* Event details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${event.color}`}>{event.label}</span>
                </div>
                <p className="text-xs text-gray-500">
                  {fullDays[event.day]} at {formatTime(event.hour, event.minute)}
                  {eventDate && (
                    <span className="text-gray-400"> — {formatDate(eventDate)}</span>
                  )}
                </p>
              </div>
              {/* Connector to next */}
              {index < events.length - 1 && (
                <div className="absolute left-4 top-8 w-0.5 h-3 bg-gray-200"></div>
              )}
            </div>
          );
        })}

        {/* Repeat indicator */}
        <div className="flex items-start gap-3 relative opacity-60">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm z-10 flex-shrink-0">
            🔄
          </div>
          <div className="flex-1">
            <span className="text-xs text-gray-500 italic">
              {recurrence === 'monthly'
                ? `Cycle repeats monthly (${monthlyOccurrence === 'last' ? 'last' : ['1st', '2nd', '3rd', '4th'][monthlyOccurrence - 1] || '1st'} ${fullDays[gameDay]})`
                : 'Cycle repeats weekly'}
            </span>
          </div>
        </div>

        {/* Validation warning: close before open on same day */}
        {rsvpOpenDay === rsvpCloseDay && (rsvpCloseHour * 60 + (rsvpCloseMinute || 0)) <= (rsvpOpenHour * 60 + (rsvpOpenMinute || 0)) && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 font-medium">
              Close time must be after open time
            </p>
            <p className="text-xs text-red-600 mt-1">
              RSVP opens and closes on {fullDays[rsvpOpenDay]}, but the close time is before the open time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrgAdmin() {
  const router = useRouter();
  const { slug } = router.query;

  const [org, setOrg] = useState(null);
  const [mainList, setMainList] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [settings, setSettings] = useState(null);
  const [archive, setArchive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [activeTab, setActiveTab] = useState('people');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Track unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const initialSettingsRef = useRef(null);

  // Email status
  const [emailStatus, setEmailStatus] = useState(null);
  const [lastEmailWeek, setLastEmailWeek] = useState(null);
  const [emailLog, setEmailLog] = useState([]);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  // Whitelist form
  const [newWhitelistNames, setNewWhitelistNames] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [resendingCode, setResendingCode] = useState(null);

  // Game info form
  const [newRule, setNewRule] = useState('');

  // Delete confirmation
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Mobile nav
  const [showMobileNav, setShowMobileNav] = useState(false);

  // Search filter for lists
  const [listSearchQuery, setListSearchQuery] = useState('');

  // Countdown timer
  const [countdown, setCountdown] = useState(null);

  // PDF export
  const [exportingPdf, setExportingPdf] = useState(false);

  // Email form - separate state for text inputs to allow typing commas
  const [emailRecipients, setEmailRecipients] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailBcc, setEmailBcc] = useState('');

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    mainListLimit: 30,
    accessPeriod: {
      enabled: true,
      startDay: 4,
      startHour: 12,
      startMinute: 0,
      endDay: 5,
      endHour: 10,
      endMinute: 0,
    },
    email: {
      enabled: false,
      recipients: [],
      cc: [],
      bcc: [],
      subject: 'Weekly RSVP List - {{week}}',
      body: 'Please find attached the RSVP list for this week.\n\nTotal participants: {{count}}',
    },
    gameInfo: {
      enabled: false,
      recurrence: 'weekly',
      monthlyOccurrence: null,
      gameDay: 0, // Sunday
      startHour: 17,
      startMinute: 0,
      endHour: 19,
      endMinute: 0,
      location: {
        enabled: false,
        name: '',
        address: '',
        googleMapsUrl: '',
      },
      rules: {
        enabled: false,
        items: [],
      },
      weather: {
        enabled: false,
      },
    },
    whatsapp: {
      enabled: false,
      groupUrl: '',
    },
  });

  useEffect(() => {
    if (slug) loadData();
  }, [slug]);

  async function loadData() {
    try {
      const res = await fetch(`/api/org/${slug}/admin`);

      if (res.status === 401) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      if (res.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setOrg(data.organization);
        setMainList(data.mainList || []);
        setWaitlist(data.waitlist || []);
        setWhitelist(data.whitelist || []);
        setSettings(data.settings);
        setArchive(data.archive || []);
        setEmailStatus(data.emailStatus || null);
        setLastEmailWeek(data.lastEmailWeek || null);
        setEmailLog(data.emailLog || []);

        if (data.settings) {
          const formData = {
            mainListLimit: data.settings.mainListLimit || 30,
            accessPeriod: data.settings.accessPeriod || settingsForm.accessPeriod,
            email: data.settings.email || settingsForm.email,
            gameInfo: data.settings.gameInfo || settingsForm.gameInfo,
            whatsapp: data.settings.whatsapp || settingsForm.whatsapp,
          };
          setSettingsForm(formData);
          initialSettingsRef.current = JSON.stringify(formData);
          // Initialize email text fields from arrays
          setEmailRecipients((data.settings.email?.recipients || []).join(', '));
          setEmailCc((data.settings.email?.cc || []).join(', '));
          setEmailBcc((data.settings.email?.bcc || []).join(', '));
        }
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      console.error('Failed to load admin data:', error);
    }
    setLoading(false);
  }

  // Track changes to settings
  useEffect(() => {
    if (initialSettingsRef.current && settings) {
      const currentSettings = JSON.stringify(settingsForm);
      setHasUnsavedChanges(currentSettings !== initialSettingsRef.current);
    }
  }, [settingsForm, settings]);

  // Warn on navigation with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Countdown timer - update every minute
  useEffect(() => {
    if (!settingsForm.accessPeriod?.enabled || !org) return;

    const updateCountdown = () => {
      const timezone = settingsForm.accessPeriod.timezone || org?.timezone || 'Africa/Lagos';
      const remaining = getTimeUntilClose(settingsForm.accessPeriod, timezone);
      setCountdown(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [settingsForm.accessPeriod, org]);

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  async function handleAddWhitelist(e) {
    e.preventDefault();
    if (!newWhitelistNames.trim()) return;

    setSaving(true);
    try {
      const names = newWhitelistNames.split('\n').map(n => n.trim()).filter(Boolean);

      const res = await fetch(`/api/org/${slug}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-whitelist', data: { names } }),
      });

      const data = await res.json();

      if (res.ok) {
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        setWhitelist(data.whitelist);
        setNewWhitelistNames('');
        showMessage(`Added ${data.added?.length || 0} members`);
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage('Failed to add members', 'error');
    }
    setSaving(false);
  }

  async function handleRemoveWhitelist(name) {
    if (!confirm(`Remove ${name} from whitelist?`)) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/org/${slug}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove-whitelist', data: { name } }),
      });

      const data = await res.json();

      if (res.ok) {
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        setWhitelist(data.whitelist);
        showMessage('Member removed');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage('Failed to remove member', 'error');
    }
    setSaving(false);
  }

  async function handleRemovePerson(personId, isWaitlist) {
    if (!confirm('Remove this person from the list?')) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/org/${slug}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove-person', data: { personId, isWaitlist } }),
      });

      const data = await res.json();

      if (res.ok) {
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        showMessage('Person removed');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage('Failed to remove person', 'error');
    }
    setSaving(false);
  }

  async function handleSaveSettings(e) {
    e.preventDefault();

    // Validate RSVP window: if same day, close time must be after open time
    if (settingsForm.accessPeriod?.enabled) {
      const ap = settingsForm.accessPeriod;
      const sameDay = (ap.startDay ?? 0) === (ap.endDay ?? 0);
      const startTime = (ap.startHour ?? 0) * 60 + (ap.startMinute ?? 0);
      const endTime = (ap.endHour ?? 0) * 60 + (ap.endMinute ?? 0);
      if (sameDay && endTime <= startTime) {
        showMessage('RSVP window is invalid: close time must be after open time when on the same day', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      // Parse email text fields into arrays before saving
      const settingsToSave = {
        ...settingsForm,
        email: {
          ...settingsForm.email,
          recipients: emailRecipients.split(',').map(e => e.trim()).filter(Boolean),
          cc: emailCc.split(',').map(e => e.trim()).filter(Boolean),
          bcc: emailBcc.split(',').map(e => e.trim()).filter(Boolean),
        }
      };
      const res = await fetch(`/api/org/${slug}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-settings', data: { settings: settingsToSave } }),
      });

      const data = await res.json();

      if (res.ok) {
        setSettings(data.settings);
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        initialSettingsRef.current = JSON.stringify(settingsForm);
        setHasUnsavedChanges(false);
        showMessage('Settings saved');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage('Failed to save settings', 'error');
    }
    setSaving(false);
  }

  async function handleUpdateVisibility(newVisibility) {
    setSaving(true);
    try {
      const res = await fetch(`/api/org/${slug}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-visibility', data: { visibility: newVisibility } }),
      });

      const data = await res.json();

      if (res.ok) {
        setOrg({ ...org, visibility: newVisibility });
        showMessage(`Community is now ${newVisibility}`);
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage('Failed to update visibility', 'error');
    }
    setSaving(false);
  }

  async function handleDeleteCommunity() {
    if (deleteConfirmName !== org?.name) {
      showMessage('Community name does not match', 'error');
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/org/${slug}/admin`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.push('/dashboard');
      } else {
        const data = await res.json();
        showMessage(data.error || 'Failed to delete community', 'error');
      }
    } catch (error) {
      showMessage('Failed to delete community', 'error');
    }
    setDeleting(false);
  }

  async function handleResetSignups() {
    if (!confirm('Reset all signups? Whitelisted members will be kept.')) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/org/${slug}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-signups', data: {} }),
      });

      const data = await res.json();

      if (res.ok) {
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        showMessage('Signups reset');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage('Failed to reset signups', 'error');
    }
    setSaving(false);
  }

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // State for sending email
  const [sendingEmail, setSendingEmail] = useState(false);

  async function handleSendEmailNow() {
    if (!confirm('Send the RSVP list email now?')) return;

    setSendingEmail(true);
    try {
      const res = await fetch(`/api/org/${slug}/send-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showMessage(data.message || 'Email sent successfully!');
        setEmailStatus(data);
      } else {
        // Show more detailed error message
        const errorMsg = data.details
          ? `${data.error}: ${data.details}`
          : (data.error || 'Failed to send email');
        showMessage(errorMsg, 'error');
        console.error('Send email error:', data);
      }
    } catch (error) {
      showMessage('Failed to send email: ' + error.message, 'error');
      console.error('Send email exception:', error);
    }
    setSendingEmail(false);
  }

  async function handleSendTestEmail() {
    setSendingTestEmail(true);
    try {
      const res = await fetch(`/api/org/${slug}/send-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showMessage('Test email sent to your email address!');
      } else {
        showMessage(data.error || 'Failed to send test email', 'error');
      }
    } catch (error) {
      showMessage('Failed to send test email', 'error');
    }
    setSendingTestEmail(false);
  }

  // Format email preview with template variables
  function getEmailPreview() {
    const subject = (settingsForm.email?.subject || '')
      .replace(/\{\{week\}\}/g, '2026-W04')
      .replace(/\{\{org\}\}/g, org?.name || 'Community')
      .replace(/\{\{sport\}\}/g, org?.sport || 'sport');

    const sampleNames = mainList.length > 0
      ? mainList.slice(0, 3).map(p => p.name).join(', ') + (mainList.length > 3 ? '...' : '')
      : 'John Doe, Jane Smith, Bob Wilson';

    const body = (settingsForm.email?.body || '')
      .replace(/\{\{count\}\}/g, mainList.length.toString())
      .replace(/\{\{list\}\}/g, sampleNames)
      .replace(/\{\{week\}\}/g, '2026-W04')
      .replace(/\{\{org\}\}/g, org?.name || 'Community')
      .replace(/\{\{sport\}\}/g, org?.sport || 'sport');

    return { subject, body };
  }

  // Export list to PDF (client-side generation)
  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      // Sort list alphabetically
      const sortedList = [...mainList].sort((a, b) => a.name.localeCompare(b.name));

      // Get current week
      const now = new Date();
      const year = now.getFullYear();
      const startOfYear = new Date(year, 0, 1);
      const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
      const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
      const weekId = `${year}-W${weekNum.toString().padStart(2, '0')}`;

      // Create a simple HTML-based printable document
      const printWindow = window.open('', '_blank');
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${org?.name || 'RSVP'} List - ${weekId}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; }
            h1 { text-align: center; margin-bottom: 5px; }
            .subtitle { text-align: center; color: #666; margin-bottom: 20px; }
            .meta { text-align: center; color: #888; font-size: 14px; margin-bottom: 30px; }
            .list { margin: 0; padding: 0; list-style: none; }
            .list li { padding: 8px 0; border-bottom: 1px solid #eee; display: flex; }
            .list li:last-child { border-bottom: none; }
            .num { color: #888; min-width: 30px; }
            .name { flex: 1; }
            .badge { background: #e3f2fd; color: #1976d2; padding: 2px 6px; border-radius: 4px; font-size: 12px; margin-left: 8px; }
            .footer { text-align: center; color: #aaa; font-size: 12px; margin-top: 40px; }
            @media print {
              body { padding: 20px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>${org?.name || 'RSVP'} List</h1>
          ${org?.sport ? `<p class="subtitle">${org.sport.charAt(0).toUpperCase() + org.sport.slice(1)}</p>` : ''}
          <p class="meta">Week: ${weekId} | Generated: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <h3>Participants (${sortedList.length})</h3>
          <ul class="list">
            ${sortedList.length === 0 ? '<li>No participants registered.</li>' : sortedList.map((person, i) => `
              <li>
                <span class="num">${i + 1}.</span>
                <span class="name">${person.name}</span>
                ${person.isWhitelisted ? '<span class="badge">Member</span>' : ''}
              </li>
            `).join('')}
          </ul>
          <p class="footer">Generated by PlayDay RSVP</p>
          <div class="no-print" style="text-align: center; margin-top: 20px;">
            <button onclick="window.print()" style="padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">
              Print / Save as PDF
            </button>
          </div>
        </body>
        </html>
      `;
      printWindow.document.write(html);
      printWindow.document.close();
      showMessage('PDF export opened in new tab');
    } catch (error) {
      showMessage('Failed to export PDF', 'error');
      console.error('PDF export error:', error);
    }
    setExportingPdf(false);
  }

  // Filter lists based on search query
  const filteredMainList = listSearchQuery
    ? mainList.filter(p => p.name.toLowerCase().includes(listSearchQuery.toLowerCase()))
    : mainList;
  const filteredWaitlist = listSearchQuery
    ? waitlist.filter(p => p.name.toLowerCase().includes(listSearchQuery.toLowerCase()))
    : waitlist;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Community Not Found</h1>
          <Link href="/" className="text-blue-600">Go home</Link>
        </div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Unauthorized</h1>
          <p className="text-gray-600 mb-4">You need to be logged in as an organizer to access this page.</p>
          <Link href="/auth/login" className="text-blue-600">Log in</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Admin - {org?.name} - PlayDay</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <Link href="/browse" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors">
                  <span className="text-xl">🏆</span>
                  <span className="font-semibold hidden sm:inline">PlayDay</span>
                </Link>
                <span className="text-gray-300">|</span>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{org?.name}</h1>
                  <p className="text-sm text-gray-500">/{slug} Admin</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/${slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View Public Page
                </a>
                <Link
                  href="/dashboard"
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  ← Dashboard
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* Message Toast */}
        {message && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg ${
            message.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
          }`}>
            {message.text}
          </div>
        )}

        {/* Unsaved Changes Warning */}
        {hasUnsavedChanges && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
            <div className="max-w-5xl mx-auto flex items-center justify-between">
              <span className="text-sm text-amber-800">You have unsaved changes</span>
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="text-sm font-medium text-amber-700 hover:text-amber-900"
              >
                Save now
              </button>
            </div>
          </div>
        )}

        {/* Tabs - Desktop */}
        <div className="bg-white border-b border-gray-200 hidden md:block">
          <div className="max-w-5xl mx-auto px-4">
            <nav className="flex gap-6 overflow-x-auto">
              {[
                { id: 'people', label: 'People' },
                { id: 'schedule', label: 'Schedule' },
                { id: 'settings', label: 'Settings' },
                { id: 'communication', label: 'Communication' },
                { id: 'event', label: 'Event Details' },
                { id: 'history', label: 'History' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 border-b-2 font-medium text-sm whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tabs - Mobile Bottom Nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
          <nav className="grid grid-cols-6 gap-1 px-2 py-2">
            {[
              { id: 'people', icon: '👥', label: 'People' },
              { id: 'schedule', icon: '🗓️', label: 'Schedule' },
              { id: 'settings', icon: '⚙️', label: 'Settings' },
              { id: 'communication', icon: '💬', label: 'Comms' },
              { id: 'event', icon: '📅', label: 'Event' },
              { id: 'history', icon: '📁', label: 'History' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center py-1 rounded-lg text-xs ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-500'
                }`}
              >
                <span className="text-lg">{tab.icon}</span>
                <span className="truncate w-full text-center">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <main className="max-w-5xl mx-auto px-4 py-6 pb-24 md:pb-6">
          {/* People Tab - Combined Lists and Members */}
          {activeTab === 'people' && (
            <div className="space-y-6">
              {/* Countdown Banner */}
              {countdown && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-green-500 text-lg">⏱️</span>
                    <span className="text-green-800 font-medium">Sign-ups close in {countdown}</span>
                  </div>
                  <span className="text-green-600 text-sm">Window is open</span>
                </div>
              )}

              {/* This Week's Signups Section */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span>📋</span> This Week's Signups
                </h2>

                {/* Search and Export Bar */}
                <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-col sm:flex-row gap-3 mb-4">
                  {/* Search */}
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={listSearchQuery}
                      onChange={e => setListSearchQuery(e.target.value)}
                      placeholder="Search participants..."
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {listSearchQuery && (
                      <button
                        onClick={() => setListSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {/* Export PDF */}
                  <button
                    onClick={handleExportPdf}
                    disabled={exportingPdf || mainList.length === 0}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {exportingPdf ? 'Exporting...' : 'Export PDF'}
                  </button>
                </div>

                {/* Search Results Count */}
                {listSearchQuery && (
                  <p className="text-sm text-gray-500 mb-4">
                    Found {filteredMainList.length} in main list, {filteredWaitlist.length} in waitlist
                  </p>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  {/* Main List */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-medium text-gray-900">Main List ({mainList.length}/{settingsForm.mainListLimit})</h3>
                      <button
                        onClick={handleResetSignups}
                        disabled={saving}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Reset Week
                      </button>
                    </div>
                    {filteredMainList.length === 0 ? (
                      <p className="text-gray-400 text-center py-4">
                        {listSearchQuery ? 'No matches found' : 'No signups yet'}
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {filteredMainList.map((person, i) => (
                          <div key={person.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div>
                              <span className="text-gray-400 text-sm mr-2">#{mainList.indexOf(person) + 1}</span>
                              <span className="font-medium">{person.name}</span>
                              {person.isWhitelisted && (
                                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Member</span>
                              )}
                            </div>
                            <button
                              onClick={() => handleRemovePerson(person.id, false)}
                              disabled={saving}
                              className="text-red-500 hover:text-red-600 text-sm"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Waitlist */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-900 mb-4">Waitlist ({waitlist.length})</h3>
                    {filteredWaitlist.length === 0 ? (
                      <p className="text-gray-400 text-center py-4">
                        {listSearchQuery ? 'No matches found' : 'Waitlist empty'}
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {filteredWaitlist.map((person, i) => (
                          <div key={person.id} className="flex items-center justify-between p-2 bg-orange-50 rounded">
                            <div>
                              <span className="text-gray-400 text-sm mr-2">#{waitlist.indexOf(person) + 1}</span>
                              <span className="font-medium">{person.name}</span>
                            </div>
                            <button
                              onClick={() => handleRemovePerson(person.id, true)}
                              disabled={saving}
                              className="text-red-500 hover:text-red-600 text-sm"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Permanent Members Section */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span>⭐</span> Permanent Members
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  Members are automatically signed up each week and get priority positioning.
                  Members with email addresses receive a snooze code to skip a week when needed.
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-900 mb-4">Add Member</h3>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newMemberName.trim()) return;

                      setSaving(true);
                      try {
                        const res = await fetch(`/api/org/${slug}/admin`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'add-whitelist',
                            data: {
                              members: [{ name: newMemberName.trim(), email: newMemberEmail.trim() || null }]
                            }
                          }),
                        });

                        const data = await res.json();

                        if (res.ok) {
                          setMainList(data.mainList);
                          setWaitlist(data.waitlist);
                          setWhitelist(data.whitelist);
                          setNewMemberName('');
                          setNewMemberEmail('');
                          const emailSent = data.added?.some(m => m.emailSent);
                          showMessage(`Added ${data.added?.length || 0} member${emailSent ? ' - welcome email sent!' : ''}`);
                        } else {
                          showMessage(data.error, 'error');
                        }
                      } catch (error) {
                        showMessage('Failed to add member', 'error');
                      }
                      setSaving(false);
                    }}>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Name *</label>
                          <input
                            type="text"
                            value={newMemberName}
                            onChange={e => setNewMemberName(e.target.value)}
                            placeholder="John Doe"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Email (optional)</label>
                          <input
                            type="email"
                            value={newMemberEmail}
                            onChange={e => setNewMemberEmail(e.target.value)}
                            placeholder="john@example.com"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <p className="text-xs text-gray-400 mt-1">If provided, they'll receive a snooze code via email</p>
                        </div>
                        <button
                          type="submit"
                          disabled={saving || !newMemberName.trim()}
                          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {saving ? 'Adding...' : 'Add Member'}
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-900 mb-4">Current Members ({whitelist.length})</h3>
                    {whitelist.length === 0 ? (
                      <p className="text-gray-400 text-center py-4">No permanent members</p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {whitelist.map((member, i) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-blue-50 rounded">
                            <div className="flex-1 min-w-0">
                              <span className="font-medium block truncate">{member.name}</span>
                              {member.email && (
                                <span className="text-xs text-gray-500">
                                  {member.email.replace(/^(.{2}).*(@.*)$/, '$1***$2')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              {member.email && member.snoozeCode && (
                                <button
                                  onClick={async () => {
                                    setResendingCode(member.name);
                                    try {
                                      const res = await fetch(`/api/org/${slug}/admin`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          action: 'resend-snooze-code',
                                          data: { memberName: member.name }
                                        }),
                                      });
                                      const data = await res.json();
                                      if (res.ok) {
                                        showMessage('Snooze code sent!');
                                      } else {
                                        showMessage(data.error, 'error');
                                      }
                                    } catch (error) {
                                      showMessage('Failed to resend code', 'error');
                                    }
                                    setResendingCode(null);
                                  }}
                                  disabled={resendingCode === member.name}
                                  className="text-blue-600 hover:text-blue-700 text-xs whitespace-nowrap"
                                >
                                  {resendingCode === member.name ? 'Sending...' : 'Resend Code'}
                                </button>
                              )}
                              <button
                                onClick={() => handleRemoveWhitelist(member.name)}
                                disabled={saving}
                                className="text-red-500 hover:text-red-600 text-sm"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Schedule Tab - Game Schedule + RSVP Window + Timeline */}
          {activeTab === 'schedule' && (
            <div className="space-y-6 max-w-2xl">
              {/* Visual Timeline Preview */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100 p-6">
                <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <span>📅</span> {(settingsForm.gameInfo?.recurrence || 'weekly') === 'monthly' ? 'Monthly' : 'Weekly'} Schedule Timeline
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  This is how your {(settingsForm.gameInfo?.recurrence || 'weekly') === 'monthly' ? 'monthly' : 'weekly'} RSVP cycle works.
                </p>
                <WeeklyTimeline
                  gameDay={settingsForm.gameInfo?.gameDay ?? 0}
                  gameStartHour={settingsForm.gameInfo?.startHour ?? 17}
                  gameStartMinute={settingsForm.gameInfo?.startMinute ?? 0}
                  gameEndHour={settingsForm.gameInfo?.endHour ?? 19}
                  gameEndMinute={settingsForm.gameInfo?.endMinute ?? 0}
                  rsvpOpenDay={settingsForm.accessPeriod?.startDay ?? 0}
                  rsvpOpenHour={settingsForm.accessPeriod?.startHour ?? 0}
                  rsvpOpenMinute={settingsForm.accessPeriod?.startMinute ?? 0}
                  rsvpCloseDay={settingsForm.accessPeriod?.endDay ?? 0}
                  rsvpCloseHour={settingsForm.accessPeriod?.endHour ?? 0}
                  rsvpCloseMinute={settingsForm.accessPeriod?.endMinute ?? 0}
                  recurrence={settingsForm.gameInfo?.recurrence || 'weekly'}
                  monthlyOccurrence={settingsForm.gameInfo?.monthlyOccurrence}
                />
                {/* Timezone Display */}
                <div className="text-xs text-gray-500 mt-4 pt-3 border-t border-blue-100">
                  <span className="font-medium">Timezone:</span> {settingsForm.accessPeriod?.timezone || org?.timezone || 'Africa/Lagos'}
                  {getCurrentTimeInTimezone(settingsForm.accessPeriod?.timezone || org?.timezone || 'Africa/Lagos') && (
                    <span className="ml-2 text-gray-400">
                      (Currently: {getCurrentTimeInTimezone(settingsForm.accessPeriod?.timezone || org?.timezone || 'Africa/Lagos')})
                    </span>
                  )}
                </div>
              </div>

              {/* Game Schedule Section */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <span>🏆</span> Game Schedule
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  When does your game happen?
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {/* Recurrence Type */}
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">How often?</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'weekly', label: 'Weekly', desc: 'Every week' },
                        { value: 'monthly', label: 'Monthly', desc: 'Once a month' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSettingsForm({
                            ...settingsForm,
                            gameInfo: { ...settingsForm.gameInfo, recurrence: opt.value }
                          })}
                          className={`p-2.5 rounded-lg border-2 text-left transition-all ${
                            (settingsForm.gameInfo?.recurrence || 'weekly') === opt.value
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div className="text-xs text-gray-500">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={(settingsForm.gameInfo?.recurrence || 'weekly') === 'monthly' ? '' : 'col-span-2'}>
                    <label className="block text-xs text-gray-500 mb-1">Game Day</label>
                    <select
                      value={settingsForm.gameInfo?.gameDay ?? 0}
                      onChange={e => setSettingsForm({
                        ...settingsForm,
                        gameInfo: { ...settingsForm.gameInfo, gameDay: parseInt(e.target.value) }
                      })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      {days.map((day, i) => (
                        <option key={i} value={i}>{day}</option>
                      ))}
                    </select>
                  </div>

                  {/* Monthly Occurrence Picker */}
                  {(settingsForm.gameInfo?.recurrence || 'weekly') === 'monthly' && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Which occurrence?</label>
                      <select
                        value={settingsForm.gameInfo?.monthlyOccurrence ?? 1}
                        onChange={e => setSettingsForm({
                          ...settingsForm,
                          gameInfo: { ...settingsForm.gameInfo, monthlyOccurrence: e.target.value === 'last' ? 'last' : parseInt(e.target.value) }
                        })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      >
                        <option value={1}>1st {days[settingsForm.gameInfo?.gameDay ?? 0]}</option>
                        <option value={2}>2nd {days[settingsForm.gameInfo?.gameDay ?? 0]}</option>
                        <option value={3}>3rd {days[settingsForm.gameInfo?.gameDay ?? 0]}</option>
                        <option value={4}>4th {days[settingsForm.gameInfo?.gameDay ?? 0]}</option>
                        <option value="last">Last {days[settingsForm.gameInfo?.gameDay ?? 0]}</option>
                      </select>
                    </div>
                  )}
                  <TimePicker
                    label="Game Starts"
                    hour={settingsForm.gameInfo?.startHour ?? 17}
                    minute={settingsForm.gameInfo?.startMinute ?? 0}
                    onChange={(h, m) => setSettingsForm({
                      ...settingsForm,
                      gameInfo: { ...settingsForm.gameInfo, startHour: h, startMinute: m }
                    })}
                  />
                  <TimePicker
                    label="Game Ends"
                    hour={settingsForm.gameInfo?.endHour ?? 19}
                    minute={settingsForm.gameInfo?.endMinute ?? 0}
                    onChange={(h, m) => setSettingsForm({
                      ...settingsForm,
                      gameInfo: { ...settingsForm.gameInfo, endHour: h, endMinute: m }
                    })}
                  />
                </div>
              </div>

              {/* RSVP Window Section */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <span>📬</span> RSVP Window
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  {(settingsForm.gameInfo?.recurrence || 'weekly') === 'monthly'
                    ? `When can people sign up, relative to your game day (${days[settingsForm.gameInfo?.gameDay ?? 0]})?`
                    : 'When can people sign up for your game?'}
                </p>

                {(settingsForm.gameInfo?.recurrence || 'weekly') === 'monthly' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-4">
                    For monthly events, these days refer to the week of your game. e.g. if your game is the last {days[settingsForm.gameInfo?.gameDay ?? 0]}, selecting &quot;{days[(settingsForm.gameInfo?.gameDay ?? 0) === 0 ? 6 : (settingsForm.gameInfo?.gameDay ?? 0) - 1]}&quot; means the {days[(settingsForm.gameInfo?.gameDay ?? 0) === 0 ? 6 : (settingsForm.gameInfo?.gameDay ?? 0) - 1]} right before it.
                  </div>
                )}

                <label className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    checked={settingsForm.accessPeriod?.enabled ?? true}
                    onChange={e => setSettingsForm({
                      ...settingsForm,
                      accessPeriod: { ...settingsForm.accessPeriod, enabled: e.target.checked }
                    })}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Enable scheduled RSVP window</span>
                </label>

                {settingsForm.accessPeriod?.enabled && (
                  <div className="space-y-4 pl-4 border-l-2 border-green-100">
                    {/* RSVP Opens */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Opens on</label>
                        <select
                          value={settingsForm.accessPeriod?.startDay ?? 0}
                          onChange={e => setSettingsForm({
                            ...settingsForm,
                            accessPeriod: { ...settingsForm.accessPeriod, startDay: parseInt(e.target.value) }
                          })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                        >
                          {days.map((day, i) => (
                            <option key={i} value={i}>{day}</option>
                          ))}
                        </select>
                        {(settingsForm.gameInfo?.recurrence || 'weekly') === 'monthly' && (() => {
                          const gameDay = settingsForm.gameInfo?.gameDay ?? 0;
                          let offset = (settingsForm.accessPeriod?.startDay ?? 0) - gameDay;
                          if (offset > 0) offset -= 7;
                          const label = offset === 0 ? 'Same day as game' : `${Math.abs(offset)} day${Math.abs(offset) > 1 ? 's' : ''} before game day`;
                          return <p className="text-xs text-blue-600 mt-1">{label}</p>;
                        })()}
                      </div>
                      <TimePicker
                        label="Opens at"
                        hour={settingsForm.accessPeriod?.startHour ?? 0}
                        minute={settingsForm.accessPeriod?.startMinute ?? 0}
                        onChange={(h, m) => setSettingsForm({
                          ...settingsForm,
                          accessPeriod: { ...settingsForm.accessPeriod, startHour: h, startMinute: m }
                        })}
                      />
                    </div>

                    {/* RSVP Closes */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Closes on</label>
                        <select
                          value={settingsForm.accessPeriod?.endDay ?? 0}
                          onChange={e => setSettingsForm({
                            ...settingsForm,
                            accessPeriod: { ...settingsForm.accessPeriod, endDay: parseInt(e.target.value) }
                          })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                        >
                          {days.map((day, i) => (
                            <option key={i} value={i}>{day}</option>
                          ))}
                        </select>
                        {(settingsForm.gameInfo?.recurrence || 'weekly') === 'monthly' && (() => {
                          const gameDay = settingsForm.gameInfo?.gameDay ?? 0;
                          let offset = (settingsForm.accessPeriod?.endDay ?? 0) - gameDay;
                          if (offset > 0) offset -= 7;
                          const label = offset === 0 ? 'Same day as game' : `${Math.abs(offset)} day${Math.abs(offset) > 1 ? 's' : ''} before game day`;
                          return <p className="text-xs text-blue-600 mt-1">{label}</p>;
                        })()}
                      </div>
                      <TimePicker
                        label="Closes at"
                        hour={settingsForm.accessPeriod?.endHour ?? 0}
                        minute={settingsForm.accessPeriod?.endMinute ?? 0}
                        onChange={(h, m) => setSettingsForm({
                          ...settingsForm,
                          accessPeriod: { ...settingsForm.accessPeriod, endHour: h, endMinute: m }
                        })}
                      />
                  </div>

                    {/* RSVP Window Validation Warning */}
                    {(() => {
                      const ap = settingsForm.accessPeriod;
                      if (!ap) return null;
                      const sameDay = (ap.startDay ?? 0) === (ap.endDay ?? 0);
                      const startTime = (ap.startHour ?? 0) * 60 + (ap.startMinute ?? 0);
                      const endTime = (ap.endHour ?? 0) * 60 + (ap.endMinute ?? 0);
                      if (sameDay && endTime <= startTime) {
                        return (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-700 font-medium">
                              Close time must be after open time
                            </p>
                            <p className="text-xs text-red-600 mt-1">
                              The RSVP window opens and closes on the same day, but the close time is before or equal to the open time. Set a later close time, or change the close day.
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {!settingsForm.accessPeriod?.enabled && (
                  <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                    ⚠️ RSVPs are always open. Anyone can sign up at any time.
                  </p>
                )}
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {saving ? 'Saving...' : 'Save Schedule Settings'}
              </button>
            </div>
          )}

          {/* Settings Tab - Reorganized into sections */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-2xl">
              {/* Capacity Section */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <span>👥</span> Capacity
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Set the maximum number of participants for your event.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Participants
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={settingsForm.mainListLimit}
                    onChange={e => setSettingsForm({ ...settingsForm, mainListLimit: parseInt(e.target.value) || 30 })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  />
                  <p className="text-xs text-gray-400 mt-1">Additional signups will be placed on the waitlist</p>
                </div>
              </div>

              {/* Visibility Section */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <span>👁️</span> Visibility
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Control whether your community appears in the public browse page.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleUpdateVisibility('private')}
                    disabled={saving || org?.visibility === 'private'}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      org?.visibility === 'private'
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    🔒 Private
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateVisibility('public')}
                    disabled={saving || org?.visibility === 'public'}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      org?.visibility === 'public'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    🌐 Public
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {org?.visibility === 'public'
                    ? 'Anyone can find this community on the browse page.'
                    : 'Only people with the direct link can access this community.'}
                </p>
              </div>

              {/* Save Settings Button */}
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {saving ? 'Saving...' : 'Save All Settings'}
              </button>

              {/* Danger Zone */}
              <div className="bg-white rounded-lg border border-red-200 p-6">
                <h3 className="font-semibold text-red-600 mb-1 flex items-center gap-2">
                  <span>⚠️</span> Danger Zone
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Permanently delete this community and all its data.
                </p>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 border border-red-200"
                >
                  Delete Community
                </button>
              </div>
            </div>
          )}

          {/* Communication Tab - Email + WhatsApp */}
          {activeTab === 'communication' && (
            <div className="space-y-6 max-w-2xl">
              {/* WhatsApp Group Section */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <span>💬</span> WhatsApp Group
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Add a link so participants can join your WhatsApp group for updates.
                </p>

                <label className="flex items-center gap-3 mb-4">
                  <input
                    type="checkbox"
                    checked={settingsForm.whatsapp?.enabled || false}
                    onChange={e => setSettingsForm({
                      ...settingsForm,
                      whatsapp: { ...settingsForm.whatsapp, enabled: e.target.checked }
                    })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Show WhatsApp Group Link on public page</span>
                </label>

                {settingsForm.whatsapp?.enabled && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">WhatsApp Group Invite Link</label>
                    <input
                      type="url"
                      value={settingsForm.whatsapp?.groupUrl || ''}
                      onChange={e => setSettingsForm({
                        ...settingsForm,
                        whatsapp: { ...settingsForm.whatsapp, groupUrl: e.target.value }
                      })}
                      placeholder="https://chat.whatsapp.com/..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Go to your WhatsApp group → Settings → Invite via link → Copy link
                    </p>
                  </div>
                )}
              </div>

              {/* Email Section */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <span>📧</span> Auto-send RSVP List
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Automatically email the RSVP list when sign-ups close each week.
                </p>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settingsForm.email?.enabled || false}
                    onChange={e => setSettingsForm({
                      ...settingsForm,
                      email: { ...settingsForm.email, enabled: e.target.checked }
                    })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Enable automatic email</span>
                </label>
              </div>

              {settingsForm.email?.enabled && (
                <>
                  {/* Recipients */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="font-semibold mb-4">Email Recipients</h3>

                    {/* To */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">To (Main Recipients)</label>
                      <input
                        type="text"
                        value={emailRecipients}
                        onChange={e => setEmailRecipients(e.target.value)}
                        placeholder="email1@example.com, email2@example.com"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">Separate multiple emails with commas</p>
                    </div>

                    {/* CC */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">CC (Carbon Copy)</label>
                      <input
                        type="text"
                        value={emailCc}
                        onChange={e => setEmailCc(e.target.value)}
                        placeholder="manager@example.com"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">Optional - these recipients will be visible to all</p>
                    </div>

                    {/* BCC */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">BCC (Blind Carbon Copy)</label>
                      <input
                        type="text"
                        value={emailBcc}
                        onChange={e => setEmailBcc(e.target.value)}
                        placeholder="backup@example.com"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">Optional - these recipients will be hidden from others</p>
                    </div>
                  </div>

                  {/* Email Content */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="font-semibold mb-4">Email Content</h3>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
                      <input
                        type="text"
                        value={settingsForm.email?.subject || ''}
                        onChange={e => setSettingsForm({
                          ...settingsForm,
                          email: { ...settingsForm.email, subject: e.target.value }
                        })}
                        placeholder="Weekly RSVP List - {{week}}"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">Use {'{{week}}'} for current week, {'{{org}}'} for community name</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Body</label>
                      <textarea
                        value={settingsForm.email?.body || ''}
                        onChange={e => setSettingsForm({
                          ...settingsForm,
                          email: { ...settingsForm.email, body: e.target.value }
                        })}
                        placeholder="Please find attached the RSVP list for this week."
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">Use {'{{count}}'} for participant count, {'{{list}}'} for names</p>
                    </div>
                  </div>

                  {/* Email Preview */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="font-semibold mb-4">Email Preview</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <div>
                        <span className="text-xs text-gray-500 block mb-1">Subject:</span>
                        <p className="text-sm font-medium text-gray-800">{getEmailPreview().subject}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block mb-1">Body:</span>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{getEmailPreview().body}</p>
                      </div>
                      <p className="text-xs text-gray-400 italic">+ RSVP list will be attached as PDF</p>
                    </div>
                  </div>

                  {/* Email History */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                      <h3 className="font-semibold mb-3">Email History</h3>
                      {emailLog.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-500 border-b border-gray-100">
                                <th className="pb-2 pr-4 font-medium">Status</th>
                                <th className="pb-2 pr-4 font-medium">Period</th>
                                <th className="pb-2 pr-4 font-medium">Date</th>
                                <th className="pb-2 font-medium">Recipients</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...emailLog].reverse().map((entry, i) => (
                                <tr key={i} className="border-b border-gray-50 last:border-0">
                                  <td className="py-2 pr-4">
                                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                                      entry.status === 'sent'
                                        ? 'bg-green-50 text-green-700'
                                        : 'bg-red-50 text-red-700'
                                    }`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${
                                        entry.status === 'sent' ? 'bg-green-500' : 'bg-red-500'
                                      }`}></span>
                                      {entry.status === 'sent' ? 'Sent' : 'Failed'}
                                    </span>
                                  </td>
                                  <td className="py-2 pr-4 text-gray-600">{entry.weekId}</td>
                                  <td className="py-2 pr-4 text-gray-600">
                                    {new Date(entry.sentAt || entry.attemptedAt || entry.updatedAt).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit',
                                    })}
                                  </td>
                                  <td className="py-2 text-gray-600">
                                    {entry.status === 'sent'
                                      ? `${entry.recipientCount || '?'} recipient${entry.recipientCount !== 1 ? 's' : ''}`
                                      : (entry.error || 'Unknown error')
                                    }
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : lastEmailWeek ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <span className={`w-2 h-2 rounded-full ${emailStatus?.status !== 'failed' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            <span className="text-gray-600">
                              Last sent: Week {lastEmailWeek}
                              {emailStatus?.sentAt && (
                                <span className="text-gray-400 ml-1">
                                  ({new Date(emailStatus.sentAt).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })})
                                </span>
                              )}
                            </span>
                          </div>
                          {emailStatus?.recipientCount && (
                            <p className="text-xs text-gray-500">
                              Sent to {emailStatus.recipientCount} recipient{emailStatus.recipientCount !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No emails sent yet.</p>
                      )}
                    </div>

                  {/* Test & Manual Send Section */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="font-semibold mb-4">Send Email</h3>

                    {/* Test Email */}
                    <div className="mb-4 pb-4 border-b border-gray-100">
                      <p className="text-sm text-gray-500 mb-3">
                        Send a test email to yourself (uses your organizer email)
                      </p>
                      <button
                        onClick={handleSendTestEmail}
                        disabled={sendingTestEmail}
                        className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 font-medium text-sm"
                      >
                        {sendingTestEmail ? 'Sending...' : 'Send Test Email'}
                      </button>
                    </div>

                    {/* Manual Send */}
                    <p className="text-sm text-gray-500 mb-3">
                      Send the RSVP list to all recipients now
                    </p>
                    <button
                      onClick={handleSendEmailNow}
                      disabled={sendingEmail || !emailRecipients.trim()}
                      className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                    >
                      {sendingEmail ? 'Sending...' : 'Send Email Now'}
                    </button>
                    {!emailRecipients.trim() && (
                      <p className="text-sm text-orange-600 mt-2">Add at least one recipient and save settings first</p>
                    )}
                  </div>
                </>
              )}

              {/* Save Button */}
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {saving ? 'Saving...' : 'Save Communication Settings'}
              </button>
            </div>
          )}

          {/* Event Details Tab (formerly Game Info) */}
          {activeTab === 'event' && (
            <div className="space-y-6 max-w-2xl">
              {/* Master Toggle */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settingsForm.gameInfo?.enabled || false}
                    onChange={e => setSettingsForm({
                      ...settingsForm,
                      gameInfo: { ...settingsForm.gameInfo, enabled: e.target.checked }
                    })}
                    className="w-5 h-5 rounded"
                  />
                  <div>
                    <span className="font-medium text-gray-900">Show Event Details</span>
                    <p className="text-sm text-gray-500">Display weather, location, and rules on the public RSVP page</p>
                  </div>
                </label>
              </div>

              {settingsForm.gameInfo?.enabled && (
                <>
                  {/* Weather Section */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <span>🌤️</span> Weather
                    </h3>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={settingsForm.gameInfo?.weather?.enabled || false}
                        onChange={e => setSettingsForm({
                          ...settingsForm,
                          gameInfo: {
                            ...settingsForm.gameInfo,
                            weather: { ...settingsForm.gameInfo?.weather, enabled: e.target.checked }
                          }
                        })}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Weather Forecast</span>
                    </label>
                    {settingsForm.gameInfo?.weather?.enabled && (
                      <p className="text-sm text-gray-500 mt-2 ml-7">
                        Weather will be shown based on your community's location.
                      </p>
                    )}
                  </div>

                  {/* Location Section (for public page display) */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <span>📍</span> Venue Details
                    </h3>
                    <label className="flex items-center gap-3 mb-4">
                      <input
                        type="checkbox"
                        checked={settingsForm.gameInfo?.location?.enabled || false}
                        onChange={e => setSettingsForm({
                          ...settingsForm,
                          gameInfo: {
                            ...settingsForm.gameInfo,
                            location: { ...settingsForm.gameInfo?.location, enabled: e.target.checked }
                          }
                        })}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Location & Directions on public page</span>
                    </label>
                    {settingsForm.gameInfo?.location?.enabled && (
                      <div className="space-y-3 ml-7">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Area (Lagos)</label>
                          <select
                            value={settingsForm.gameInfo?.location?.area || ''}
                            onChange={e => setSettingsForm({
                              ...settingsForm,
                              gameInfo: {
                                ...settingsForm.gameInfo,
                                location: { ...settingsForm.gameInfo?.location, area: e.target.value }
                              }
                            })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          >
                            <option value="">Select area...</option>
                            {LAGOS_AREAS.map(area => (
                              <option key={area} value={formatLocation(area)}>
                                {area}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Venue Name</label>
                          <input
                            type="text"
                            value={settingsForm.gameInfo?.location?.name || ''}
                            onChange={e => setSettingsForm({
                              ...settingsForm,
                              gameInfo: {
                                ...settingsForm.gameInfo,
                                location: { ...settingsForm.gameInfo?.location, name: e.target.value }
                              }
                            })}
                            placeholder="e.g., 1004 Estate"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Full Address</label>
                          <input
                            type="text"
                            value={settingsForm.gameInfo?.location?.address || ''}
                            onChange={e => setSettingsForm({
                              ...settingsForm,
                              gameInfo: {
                                ...settingsForm.gameInfo,
                                location: { ...settingsForm.gameInfo?.location, address: e.target.value }
                              }
                            })}
                            placeholder="e.g., 1004 Estate, Victoria Island, Lagos, Nigeria"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Google Maps URL (optional)</label>
                          <input
                            type="url"
                            value={settingsForm.gameInfo?.location?.googleMapsUrl || ''}
                            onChange={e => setSettingsForm({
                              ...settingsForm,
                              gameInfo: {
                                ...settingsForm.gameInfo,
                                location: { ...settingsForm.gameInfo?.location, googleMapsUrl: e.target.value }
                              }
                            })}
                            placeholder="https://maps.google.com/..."
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Rules Section */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <span>📋</span> Rules
                    </h3>
                    <label className="flex items-center gap-3 mb-4">
                      <input
                        type="checkbox"
                        checked={settingsForm.gameInfo?.rules?.enabled || false}
                        onChange={e => setSettingsForm({
                          ...settingsForm,
                          gameInfo: {
                            ...settingsForm.gameInfo,
                            rules: { ...settingsForm.gameInfo?.rules, enabled: e.target.checked }
                          }
                        })}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Field Rules</span>
                    </label>
                    {settingsForm.gameInfo?.rules?.enabled && (
                      <div className="ml-7 space-y-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newRule}
                            onChange={e => setNewRule(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && newRule.trim()) {
                                e.preventDefault();
                                const currentRules = settingsForm.gameInfo?.rules?.items || [];
                                setSettingsForm({
                                  ...settingsForm,
                                  gameInfo: {
                                    ...settingsForm.gameInfo,
                                    rules: {
                                      ...settingsForm.gameInfo?.rules,
                                      items: [...currentRules, newRule.trim()]
                                    }
                                  }
                                });
                                setNewRule('');
                              }
                            }}
                            placeholder="Add a rule (press Enter)"
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (newRule.trim()) {
                                const currentRules = settingsForm.gameInfo?.rules?.items || [];
                                setSettingsForm({
                                  ...settingsForm,
                                  gameInfo: {
                                    ...settingsForm.gameInfo,
                                    rules: {
                                      ...settingsForm.gameInfo?.rules,
                                      items: [...currentRules, newRule.trim()]
                                    }
                                  }
                                });
                                setNewRule('');
                              }
                            }}
                            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
                          >
                            Add
                          </button>
                        </div>
                        {(settingsForm.gameInfo?.rules?.items || []).length > 0 && (
                          <div className="space-y-2">
                            {(settingsForm.gameInfo?.rules?.items || []).map((rule, i) => (
                              <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                <span className="text-sm">{rule}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentRules = settingsForm.gameInfo?.rules?.items || [];
                                    setSettingsForm({
                                      ...settingsForm,
                                      gameInfo: {
                                        ...settingsForm.gameInfo,
                                        rules: {
                                          ...settingsForm.gameInfo?.rules,
                                          items: currentRules.filter((_, idx) => idx !== i)
                                        }
                                      }
                                    });
                                  }}
                                  className="text-red-500 hover:text-red-600 text-sm"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Save Button */}
                  <button
                    onClick={handleSaveSettings}
                    disabled={saving}
                    className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                  >
                    {saving ? 'Saving...' : 'Save Event Details'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="font-semibold mb-4">Past Weeks</h2>
              {archive.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No archived weeks yet</p>
              ) : (
                <div className="space-y-4">
                  {archive.map((week, i) => (
                    <div key={i} className="border border-gray-100 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-medium">{week.weekId}</h3>
                        <span className="text-sm text-gray-400">
                          Archived: {new Date(week.archivedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        Main list: {week.mainList?.length || 0} | Waitlist: {week.waitlist?.length || 0}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-red-600 mb-2">Delete Community</h3>
              <p className="text-gray-600 mb-4">
                This will permanently delete <strong>{org?.name}</strong> and all its data including:
              </p>
              <ul className="text-sm text-gray-500 mb-4 list-disc ml-5 space-y-1">
                <li>All RSVP signups</li>
                <li>Whitelist members</li>
                <li>Settings and configurations</li>
                <li>Archive history</li>
              </ul>
              <p className="text-sm text-gray-700 mb-3">
                Type <strong>{org?.name}</strong> to confirm:
              </p>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={e => setDeleteConfirmName(e.target.value)}
                placeholder="Type community name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmName('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteCommunity}
                  disabled={deleting || deleteConfirmName !== org?.name}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting...' : 'Delete Forever'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
