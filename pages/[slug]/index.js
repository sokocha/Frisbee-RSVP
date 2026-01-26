import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

const DEFAULT_MAIN_LIST_LIMIT = 30;

// Device ID helpers
function generateDeviceId() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillText('device-fingerprint', 2, 2);
  const canvasData = canvas.toDataURL();
  const screenData = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const language = navigator.language;
  const platform = navigator.platform;
  const fingerprint = `${canvasData}-${screenData}-${timezone}-${language}-${platform}`;
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36) + Date.now().toString(36);
}

function getDeviceId(slug) {
  const key = `playday-device-id-${slug}`;
  let deviceId = localStorage.getItem(key);
  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem(key, deviceId);
  }
  return deviceId;
}

function getSavedName(slug) {
  return localStorage.getItem(`playday-saved-name-${slug}`) || '';
}

function setSavedName(slug, name) {
  localStorage.setItem(`playday-saved-name-${slug}`, name);
}

// UI Components
function Toast({ message, onClose }) {
  if (!message) return null;
  const styles = {
    success: 'bg-emerald-500/95 text-white',
    error: 'bg-red-500/95 text-white',
    warning: 'bg-amber-500/95 text-black',
  };
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
      <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-sm ${styles[message.type]}`}>
        <span className="font-medium">{message.text}</span>
        <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CountdownTimer({ targetTime }) {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const target = new Date(targetTime);
      const diff = target - now;
      if (diff <= 0) {
        window.location.reload();
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      if (days > 0) setTimeLeft(`${days}d ${hours}h ${minutes}m`);
      else if (hours > 0) setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      else setTimeLeft(`${minutes}m ${seconds}s`);
    };
    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);
  return <div className="text-2xl font-mono font-bold text-white animate-pulse">{timeLeft}</div>;
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function WeatherCard({ weather, weatherLoading, weatherMessage }) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="glass-card-solid rounded-3xl shadow-2xl overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 md:p-6 flex items-center justify-between text-left"
      >
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span>🌤️</span> Game Day Weather
          </h2>
          {weather && (
            <p className="text-sm text-gray-500 mt-1">
              {weather.gameDateFormatted || weather.gameDay} • {weather.gameTimeRange || `${weather.hourly?.[0]?.hour || ''}:00 - ${weather.hourly?.[weather.hourly?.length - 1]?.hour || ''}:00`}
            </p>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-4 md:px-6 pb-4 md:pb-6">
          {weatherLoading ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 py-4">
              <Spinner /> <span className="text-sm">Loading weather...</span>
            </div>
          ) : weather ? (
            <div className="space-y-4">
              {/* Main weather summary */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-6xl">{weather.summary.icon}</span>
                  <div>
                    <p className="text-4xl font-bold text-gray-800">{weather.summary.temperature}°C</p>
                    <p className="text-gray-600">{weather.summary.description}</p>
                  </div>
                </div>
                <div className="text-right text-sm space-y-1">
                  <p className="text-gray-600 flex items-center justify-end gap-1">
                    <span>💨</span> {weather.summary.windSpeed || 0} km/h
                  </p>
                  <p className="text-gray-600 flex items-center justify-end gap-1">
                    <span>🌧️</span> {weather.summary.precipitationProbability}% chance
                  </p>
                </div>
              </div>

              {/* Hourly forecast */}
              {weather.hourly && weather.hourly.length > 0 && (
                <div className="grid grid-cols-3 gap-3 pt-4">
                  {weather.hourly.map((hour, i) => (
                    <div key={i} className="text-center py-4 bg-gray-50/80 rounded-2xl border border-gray-100">
                      <p className="text-sm font-medium text-gray-500 mb-2">
                        {hour.hour % 12 || 12} {hour.hour < 12 ? 'AM' : 'PM'}
                      </p>
                      <p className="text-2xl mb-2">{hour.icon}</p>
                      <p className="text-xl font-semibold text-gray-800">{hour.temperature}°</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm text-center py-4">{weatherMessage || 'Weather forecast will be available closer to game day.'}</p>
          )}
        </div>
      )}
    </div>
  );
}

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getAvatarColor(name) {
  const colors = [
    'from-emerald-400 to-teal-500', 'from-blue-400 to-indigo-500',
    'from-purple-400 to-pink-500', 'from-amber-400 to-orange-500',
    'from-rose-400 to-red-500', 'from-cyan-400 to-blue-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatDisplayName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  return `${firstName} ${lastName.slice(0, 3)}.`;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

const sportEmojis = {
  'american-football': '🏈', badminton: '🏸', basketball: '🏀',
  crossfit: '🏋🏾', cycling: '🚴🏾', football: '⚽', frisbee: '🥏',
  golf: '⛳', hiking: '🥾', padel: '🎾', pickleball: '🏓',
  running: '🏃🏾', swimming: '🏊🏾', tennis: '🎾', volleyball: '🏐',
  yoga: '🧘🏾', other: '🏆',
};

const sportColors = {
  'american-football': { gradient: 'from-amber-900 via-yellow-800 to-orange-900', accent: 'amber' },
  badminton: { gradient: 'from-lime-900 via-green-800 to-teal-900', accent: 'lime' },
  basketball: { gradient: 'from-orange-900 via-red-800 to-rose-900', accent: 'orange' },
  crossfit: { gradient: 'from-red-900 via-rose-800 to-pink-900', accent: 'red' },
  cycling: { gradient: 'from-sky-900 via-blue-800 to-indigo-900', accent: 'sky' },
  football: { gradient: 'from-green-900 via-emerald-800 to-teal-900', accent: 'green' },
  frisbee: { gradient: 'from-emerald-900 via-green-800 to-teal-900', accent: 'emerald' },
  golf: { gradient: 'from-green-900 via-lime-800 to-emerald-900', accent: 'green' },
  hiking: { gradient: 'from-stone-900 via-amber-800 to-yellow-900', accent: 'stone' },
  padel: { gradient: 'from-blue-900 via-indigo-800 to-purple-900', accent: 'blue' },
  pickleball: { gradient: 'from-yellow-900 via-lime-800 to-green-900', accent: 'yellow' },
  running: { gradient: 'from-purple-900 via-violet-800 to-indigo-900', accent: 'purple' },
  swimming: { gradient: 'from-cyan-900 via-blue-800 to-sky-900', accent: 'cyan' },
  tennis: { gradient: 'from-lime-900 via-green-800 to-emerald-900', accent: 'lime' },
  volleyball: { gradient: 'from-orange-900 via-amber-800 to-yellow-900', accent: 'orange' },
  yoga: { gradient: 'from-pink-900 via-purple-800 to-violet-900', accent: 'pink' },
  other: { gradient: 'from-gray-900 via-slate-800 to-zinc-900', accent: 'gray' },
};

export default function OrgRSVP() {
  const router = useRouter();
  const { slug } = router.query;

  const [org, setOrg] = useState(null);
  const [mainList, setMainList] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [hasSignedUp, setHasSignedUp] = useState(false);
  const [mySignup, setMySignup] = useState(null);
  const [accessStatus, setAccessStatus] = useState({ isOpen: true, message: null, nextOpenTime: null });
  const [mainListLimit, setMainListLimit] = useState(DEFAULT_MAIN_LIST_LIMIT);
  const [savedName, setStoredName] = useState('');
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ show: false, personId: null, isWaitlist: false });
  const [gameInfo, setGameInfo] = useState(null);
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherMessage, setWeatherMessage] = useState(null);
  const [whatsapp, setWhatsapp] = useState(null);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [snoozeModal, setSnoozeModal] = useState({ show: false, personName: null, isUnsnooze: false });
  const [snoozeCode, setSnoozeCode] = useState('');
  const [snoozing, setSnoozing] = useState(false);
  const [snoozedNames, setSnoozedNames] = useState([]);

  const checkMySignup = useCallback((mainList, waitlist, currentDeviceId) => {
    const allSignups = [...mainList, ...waitlist];
    const existingSignup = allSignups.find(p => p.deviceId === currentDeviceId);
    if (existingSignup) {
      setHasSignedUp(true);
      setMySignup(existingSignup);
    } else {
      setHasSignedUp(false);
      setMySignup(null);
    }
  }, []);

  const loadData = useCallback(async (currentDeviceId) => {
    if (!slug) return;
    try {
      const response = await fetch(`/api/org/${slug}/rsvp`);
      if (response.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setOrg(data.organization);
        setMainList(data.mainList || []);
        setWaitlist(data.waitlist || []);
        setAccessStatus(data.accessStatus || { isOpen: true, message: null, nextOpenTime: null });
        setMainListLimit(data.mainListLimit || DEFAULT_MAIN_LIST_LIMIT);
        setGameInfo(data.gameInfo || null);
        setWhatsapp(data.whatsapp || null);
        setIsOrganizer(data.isOrganizer || false);
        setSnoozedNames(data.snoozedNames || []);
        checkMySignup(data.mainList || [], data.waitlist || [], currentDeviceId);

        // Fetch weather if enabled
        if (data.gameInfo?.weather) {
          fetchWeather();
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
    setLoading(false);
  }, [slug, checkMySignup]);

  const fetchWeather = useCallback(async () => {
    if (!slug) return;
    setWeatherLoading(true);
    try {
      const response = await fetch(`/api/org/${slug}/weather`);
      if (response.ok) {
        const data = await response.json();
        setWeather(data.weather);
        setWeatherMessage(data.message || null);
      }
    } catch (error) {
      console.error('Failed to fetch weather:', error);
    }
    setWeatherLoading(false);
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    const id = getDeviceId(slug);
    setDeviceId(id);
    const remembered = getSavedName(slug);
    if (remembered) {
      setStoredName(remembered);
      setName(remembered);
    }
    loadData(id);
  }, [slug, loadData]);

  const showToast = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleRSVP = async () => {
    if (hasSignedUp) {
      showToast("You've already signed up from this device!", 'error');
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast('Please enter your name', 'error');
      return;
    }
    const nameParts = trimmedName.split(/\s+/);
    if (nameParts.length < 2) {
      showToast('Please enter your first and last name', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/org/${slug}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, deviceId })
      });
      const data = await response.json();
      if (response.ok) {
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        setHasSignedUp(true);
        setMySignup(data.person);
        showToast(data.message, data.listType === 'main' ? 'success' : 'warning');
        setSavedName(slug, trimmedName);
        setStoredName(trimmedName);
        setShowNameEdit(false);
        // Show success animation
        setShowSuccessAnimation(true);
        setTimeout(() => setShowSuccessAnimation(false), 2500);
      } else {
        showToast(data.error, 'error');
      }
    } catch (error) {
      showToast('Failed to submit RSVP. Please try again.', 'error');
    }
    setSubmitting(false);
  };

  const handleDropout = async (personId, isWaitlist = false) => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/org/${slug}/rsvp`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, deviceId, isWaitlist })
      });
      const data = await response.json();
      if (response.ok) {
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        setHasSignedUp(false);
        setMySignup(null);
        showToast(data.message, 'success');
      } else {
        showToast(data.error, 'error');
      }
    } catch (error) {
      showToast('Failed to remove RSVP. Please try again.', 'error');
    }
    setSubmitting(false);
  };

  const handleSnooze = async (isUnsnooze = false) => {
    if (!snoozeCode.trim()) {
      showToast('Please enter your snooze code', 'error');
      return;
    }
    setSnoozing(true);
    try {
      const response = await fetch(`/api/org/${slug}/rsvp`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isUnsnooze ? 'unsnooze' : 'snooze',
          snoozeCode: snoozeCode.trim().toUpperCase()
        })
      });
      const data = await response.json();
      if (response.ok) {
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        setSnoozedNames(data.snoozedNames || []);
        setSnoozeModal({ show: false, personName: null, isUnsnooze: false });
        setSnoozeCode('');
        showToast(data.message, 'success');
        // Update signup status based on action
        if (isUnsnooze && data.person) {
          // Check if the restored person matches our device
          checkMySignup(data.mainList, data.waitlist, deviceId);
        } else if (!isUnsnooze && mySignup && data.snoozedNames?.includes(mySignup.name)) {
          setHasSignedUp(false);
          setMySignup(null);
        }
      } else {
        showToast(data.error, 'error');
      }
    } catch (error) {
      showToast(`Failed to ${isUnsnooze ? 'rejoin' : 'snooze'}. Please try again.`, 'error');
    }
    setSnoozing(false);
  };

  const isMySignup = (person) => person.deviceId === deviceId;
  const spotsLeft = mainListLimit - mainList.length;
  const isLowSpots = spotsLeft > 0 && spotsLeft <= 5;

  const colors = sportColors[org?.sport] || sportColors.other;
  const emoji = sportEmojis[org?.sport] || sportEmojis.other;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (notFound) {
    return (
      <>
        <Head>
          <title>Not Found - PlayDay</title>
        </Head>
        <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="text-6xl mb-4">🔍</div>
            <h1 className="text-2xl font-bold text-white mb-2">Community Not Found</h1>
            <p className="text-gray-400 mb-6">This community doesn't exist or is not active.</p>
            <Link href="/" className="text-blue-400 hover:text-blue-300">Go to PlayDay home</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{org?.name || 'RSVP'} - PlayDay</title>
        <meta name="description" content={`RSVP for ${org?.name} ${org?.sport} sessions. Join the community and secure your spot for the next game.`} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />

        {/* Canonical URL */}
        {slug && <link rel="canonical" href={`https://itsplayday.com/${slug}`} />}

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        {slug && <meta property="og:url" content={`https://itsplayday.com/${slug}`} />}
        <meta property="og:title" content={`${org?.name || 'RSVP'} - PlayDay`} />
        <meta property="og:description" content={`RSVP for ${org?.name} ${org?.sport} sessions. Join the community and secure your spot for the next game.`} />
        <meta property="og:image" content="https://itsplayday.com/og-image.png" />
        <meta property="og:site_name" content="PlayDay" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${org?.name || 'RSVP'} - PlayDay`} />
        <meta name="twitter:description" content={`RSVP for ${org?.name} ${org?.sport} sessions. Join the community and secure your spot for the next game.`} />
        <meta name="twitter:image" content="https://itsplayday.com/og-image.png" />
      </Head>

      <style jsx global>{`
        @keyframes slide-down {
          0% { transform: translate(-50%, -100%); opacity: 0; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        .animate-slide-down { animation: slide-down 0.3s ease-out forwards; }
        .glass-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .glass-card-solid {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
        }
        @keyframes success-pop {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes confetti {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(-100px) rotate(720deg); opacity: 0; }
        }
        .animate-success-pop { animation: success-pop 0.5s ease-out forwards; }
        .animate-confetti { animation: confetti 1s ease-out forwards; }
      `}</style>

      <Toast message={message} onClose={() => setMessage(null)} />

      {/* Success Animation Overlay */}
      {showSuccessAnimation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="animate-success-pop">
            <div className="w-32 h-32 bg-green-500 rounded-full flex items-center justify-center shadow-2xl">
              <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          {/* Confetti particles */}
          <div className="absolute">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-confetti"
                style={{
                  left: `${50 + Math.cos(i * 45 * Math.PI / 180) * 60}%`,
                  top: `${50 + Math.sin(i * 45 * Math.PI / 180) * 60}%`,
                  animationDelay: `${i * 0.1}s`,
                }}
              >
                <span className="text-2xl">{['🎉', '⭐', '✨', '🎊'][i % 4]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`min-h-screen bg-gradient-to-br ${colors.gradient} p-3 md:p-8`}>
        {/* Top Navigation with Breadcrumbs */}
        <nav className="max-w-2xl mx-auto mb-4">
          <div className="flex items-center justify-between">
            <Link href="/browse" className="flex items-center gap-2 text-white/70 hover:text-white transition-colors">
              <span className="text-xl">🏆</span>
              <span className="font-semibold">PlayDay</span>
            </Link>
            <div className="flex items-center gap-3">
              {isOrganizer && (
                <Link
                  href={`/${slug}/admin`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Manage
                </Link>
              )}
            </div>
          </div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mt-2 text-sm text-white/50">
            <Link href="/browse" className="hover:text-white/70 transition-colors">Communities</Link>
            <span>›</span>
            <Link href={`/browse?sport=${org?.sport}`} className="capitalize hover:text-white/70 transition-colors">{org?.sport}</Link>
            <span>›</span>
            <span className="text-white/70">{org?.name}</span>
          </div>
        </nav>

        <main className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-6 md:mb-8">
            <div className="text-4xl md:text-5xl mb-2">{emoji}</div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2 text-white">
              {org?.name}
            </h1>
            <p className="text-white/70 text-sm capitalize">
              {org?.sport} {org?.location && `• ${org.location}`}
            </p>
            <p className="text-white/50 text-sm mt-1">{mainListLimit} spots available</p>
          </div>

          {/* Game Day Schedule Card */}
          {gameInfo && gameInfo.enabled && (
            <div className="glass-card-solid rounded-3xl shadow-2xl p-4 md:p-6 mb-4">
              <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span>📅</span> Game Day Schedule
              </h2>
              <div className="text-gray-600">
                <p className="text-lg font-medium">
                  {gameInfo.recurrence === 'monthly'
                    ? `${gameInfo.monthlyOccurrence === 'last' ? 'Last' : ['1st', '2nd', '3rd', '4th'][gameInfo.monthlyOccurrence - 1] || '1st'} ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][gameInfo.gameDay]} of every month`
                    : `Every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][gameInfo.gameDay]}`
                  }
                </p>
                <p className="text-gray-500">
                  {(() => {
                    const formatGameTime = (h, m) => {
                      const hour = h % 12 || 12;
                      const minute = m.toString().padStart(2, '0');
                      const ampm = h < 12 ? 'AM' : 'PM';
                      return `${hour}:${minute} ${ampm}`;
                    };
                    return `${formatGameTime(gameInfo.startHour, gameInfo.startMinute)} - ${formatGameTime(gameInfo.endHour, gameInfo.endMinute)}`;
                  })()}
                </p>
                {(() => {
                  const now = new Date();
                  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                  let nextDate = null;

                  if (gameInfo.recurrence === 'monthly') {
                    const occ = gameInfo.monthlyOccurrence || 1;
                    for (let offset = 0; offset <= 2; offset++) {
                      const m = (now.getMonth() + offset) % 12;
                      const y = (now.getMonth() + offset) >= 12 ? now.getFullYear() + 1 : now.getFullYear();
                      if (occ === 'last') {
                        const lastDay = new Date(y, m + 1, 0);
                        let d = lastDay.getDate();
                        while (new Date(y, m, d).getDay() !== gameInfo.gameDay) d--;
                        const candidate = new Date(y, m, d);
                        candidate.setHours(gameInfo.startHour, gameInfo.startMinute, 0, 0);
                        if (candidate > now) { nextDate = candidate; break; }
                      } else {
                        let count = 0;
                        for (let d = 1; d <= 31; d++) {
                          const dt = new Date(y, m, d);
                          if (dt.getMonth() !== m) break;
                          if (dt.getDay() === gameInfo.gameDay) {
                            count++;
                            if (count === occ) {
                              dt.setHours(gameInfo.startHour, gameInfo.startMinute, 0, 0);
                              if (dt > now) { nextDate = dt; }
                              break;
                            }
                          }
                        }
                        if (nextDate) break;
                      }
                    }
                  } else {
                    const today = now.getDay();
                    let daysUntil = gameInfo.gameDay - today;
                    if (daysUntil < 0) daysUntil += 7;
                    if (daysUntil === 0) {
                      const gameTime = new Date(now);
                      gameTime.setHours(gameInfo.startHour, gameInfo.startMinute, 0, 0);
                      if (now >= gameTime) daysUntil = 7;
                    }
                    nextDate = new Date(now);
                    nextDate.setDate(nextDate.getDate() + daysUntil);
                  }

                  if (nextDate) {
                    return (
                      <p className="text-sm text-blue-600 font-medium mt-1">
                        Next game: {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][nextDate.getDay()]}, {months[nextDate.getMonth()]} {nextDate.getDate()}
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Location inline within schedule card */}
              {gameInfo.location && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-start gap-3">
                    <span className="text-lg">📍</span>
                    <div>
                      {gameInfo.location.name && (
                        <p className="font-medium text-gray-800">{gameInfo.location.name}</p>
                      )}
                      {gameInfo.location.address && (
                        <p className="text-gray-500 text-sm">{gameInfo.location.address}</p>
                      )}
                      {(gameInfo.location.googleMapsUrl || gameInfo.location.address) && (
                        <a
                          href={gameInfo.location.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([gameInfo.location.address, gameInfo.location.name].filter(Boolean).join(', '))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Open in Google Maps
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Access Status Banner */}
          {!accessStatus.isOpen && (
            <div className="mb-4 glass-card rounded-2xl p-4 text-center border-red-500/30">
              <div className="flex items-center justify-center gap-2 text-red-300 mb-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H9" />
                </svg>
                <span className="font-medium">RSVP is currently closed</span>
              </div>
              {accessStatus.nextOpenTime && (
                <div className="mt-3">
                  <p className="text-white/70 text-sm mb-1">Opens in</p>
                  <CountdownTimer targetTime={accessStatus.nextOpenTime} />
                </div>
              )}
            </div>
          )}

          {/* Already Signed Up Notice with Waitlist Position */}
          {hasSignedUp && mySignup && (
            <div className="mb-4 glass-card rounded-2xl p-4 text-center border-blue-400/30">
              <div className="flex items-center justify-center gap-2 text-blue-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">You're signed up as: {mySignup.name}</span>
              </div>
              {/* Waitlist Position Indicator */}
              {waitlist.find(p => p.deviceId === deviceId) && (
                <div className="mt-2 text-orange-300 text-sm">
                  <span className="font-medium">Waitlist Position: #{waitlist.findIndex(p => p.deviceId === deviceId) + 1}</span>
                  <p className="text-white/50 text-xs mt-1">You'll be notified when a spot opens up</p>
                </div>
              )}
            </div>
          )}

          {/* RSVP Form — only shown when form is open */}
          {accessStatus.isOpen && (
            <div className="glass-card-solid rounded-3xl shadow-2xl p-4 md:p-6 mb-4 md:mb-6">
              {!hasSignedUp ? (
                savedName && !showNameEdit ? (
                  <div className="space-y-3">
                    <div className="text-center">
                      <p className="text-gray-600 text-sm">Welcome back!</p>
                      <p className="text-gray-800 font-semibold text-lg">{savedName}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={handleRSVP}
                        disabled={submitting}
                        className={`flex-1 px-6 py-3 bg-gradient-to-r from-${colors.accent}-500 to-${colors.accent}-600 hover:from-${colors.accent}-600 hover:to-${colors.accent}-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2`}
                      >
                        {submitting ? <Spinner /> : 'RSVP Now'}
                      </button>
                      <button
                        onClick={() => setShowNameEdit(true)}
                        className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl text-sm"
                      >
                        Change name
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {showNameEdit && (
                      <div className="flex justify-between items-center">
                        <p className="text-gray-600 text-sm">Enter a different name:</p>
                        <button
                          onClick={() => { setShowNameEdit(false); setName(savedName); }}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    <div className="flex flex-col md:flex-row gap-3">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !submitting && handleRSVP()}
                          placeholder="Your full name (first & last)"
                          disabled={submitting}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-base disabled:bg-gray-50"
                        />
                      </div>
                      <button
                        onClick={handleRSVP}
                        disabled={submitting}
                        className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                      >
                        {submitting ? <Spinner /> : 'RSVP'}
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="text-center text-gray-500 py-2">
                  <p>You've already signed up for this week!</p>
                </div>
              )}

              {/* Progress Bar */}
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span className="font-medium">{mainList.length} / {mainListLimit} spots filled</span>
                  <span className={`font-semibold ${spotsLeft === 0 ? 'text-orange-500' : isLowSpots ? 'text-red-500' : 'text-green-600'}`}>
                    {spotsLeft > 0 ? `${spotsLeft} spots left` : 'Waitlist open'}
                  </span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-700 rounded-full ${
                      spotsLeft === 0 ? 'bg-orange-500' : isLowSpots ? 'bg-red-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${(mainList.length / mainListLimit) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Main List */}
          <div className="glass-card-solid rounded-3xl shadow-2xl p-4 md:p-6 mb-4">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span>🏃🏾</span> Playing ({mainList.length})
            </h2>
            {mainList.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-3">{emoji}</div>
                <p className="text-gray-400">No RSVPs yet</p>
                <p className="text-gray-500 text-sm mt-1">
                  {accessStatus.isOpen ? 'Be the first to claim your spot!' : 'RSVPs will open soon'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {mainList.map((person, index) => (
                  <div
                    key={person.id}
                    className={`flex items-center justify-between p-3 rounded-xl ${
                      isMySignup(person) ? 'bg-blue-50 ring-2 ring-blue-300' : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white bg-gradient-to-br ${
                        isMySignup(person) ? 'from-blue-400 to-blue-600' : getAvatarColor(person.name)
                      }`}>
                        {getInitials(person.name)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{formatDisplayName(person.name)}</span>
                          {person.isWhitelisted && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Member</span>
                          )}
                          {isMySignup(person) && (
                            <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">You</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">{formatTime(person.timestamp)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">#{index + 1}</span>
                      {person.isWhitelisted && (
                        <button
                          onClick={() => setSnoozeModal({ show: true, personName: person.name })}
                          className="text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-lg text-xs font-medium"
                        >
                          Skip week?
                        </button>
                      )}
                      {isMySignup(person) && !person.isWhitelisted && (
                        <button
                          onClick={() => setConfirmModal({ show: true, personId: person.id, isWaitlist: false })}
                          disabled={submitting}
                          className="text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium"
                        >
                          Drop out
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Waitlist */}
          {(waitlist.length > 0 || mainList.length >= mainListLimit) && (
            <div className="glass-card-solid rounded-3xl shadow-2xl p-4 md:p-6 mb-4">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span>⏳</span> Waitlist ({waitlist.length})
              </h2>
              {waitlist.length === 0 ? (
                <p className="text-gray-400 text-center py-6">Waitlist is empty</p>
              ) : (
                <div className="space-y-2">
                  {waitlist.map((person, index) => (
                    <div
                      key={person.id}
                      className={`flex items-center justify-between p-3 rounded-xl ${
                        isMySignup(person) ? 'bg-blue-50 ring-2 ring-blue-300' : 'bg-orange-50 hover:bg-orange-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white bg-gradient-to-br ${
                          isMySignup(person) ? 'from-blue-400 to-blue-600' : 'from-orange-400 to-amber-500'
                        }`}>
                          {getInitials(person.name)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-800">{formatDisplayName(person.name)}</span>
                            {isMySignup(person) && (
                              <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">You</span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{formatTime(person.timestamp)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">#{index + 1}</span>
                        {isMySignup(person) && (
                          <button
                            onClick={() => setConfirmModal({ show: true, personId: person.id, isWaitlist: true })}
                            disabled={submitting}
                            className="text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Snoozed Members Section */}
          {snoozedNames.length > 0 && (
            <div className="glass-card-solid rounded-3xl shadow-2xl p-4 md:p-6 mb-4">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span>😴</span> Skipping This Week ({snoozedNames.length})
              </h2>
              <div className="space-y-2">
                {snoozedNames.map((name, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-xl bg-gray-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white bg-gradient-to-br from-gray-400 to-gray-500">
                        {getInitials(name)}
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">{formatDisplayName(name)}</span>
                        <p className="text-xs text-gray-400">Snoozed for this week</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSnoozeModal({ show: true, personName: name, isUnsnooze: true })}
                      className="text-green-600 hover:bg-green-50 px-3 py-1.5 rounded-lg text-sm font-medium"
                    >
                      Rejoin
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Game Info Details Section — Weather & Rules */}
          {gameInfo && gameInfo.enabled && (gameInfo.weather || (gameInfo.rules && gameInfo.rules.items && gameInfo.rules.items.length > 0)) && (
            <div className="space-y-4 mb-4">
              {/* Weather Card */}
              {gameInfo.weather && (
                <WeatherCard
                  weather={weather}
                  weatherLoading={weatherLoading}
                  weatherMessage={weatherMessage}
                />
              )}

              {/* Rules Card */}
              {gameInfo.rules && gameInfo.rules.items && gameInfo.rules.items.length > 0 && (
                <div className="glass-card-solid rounded-3xl shadow-2xl p-4 md:p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <span>📋</span> Field Rules
                  </h2>
                  <ul className="space-y-2">
                    {gameInfo.rules.items.map((rule, index) => (
                      <li key={index} className="flex items-start gap-3 text-gray-600">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </span>
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* WhatsApp Group Card */}
          {whatsapp && whatsapp.enabled && whatsapp.groupUrl && (
            <div className="glass-card-solid rounded-3xl shadow-2xl p-4 md:p-6 mb-4">
              <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span>💬</span> Join the Group
              </h2>
              <p className="text-gray-600 text-sm mb-4">
                Stay updated on game changes, cancellations, and connect with other players.
              </p>
              <a
                href={whatsapp.groupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-xl transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Join WhatsApp Group
              </a>
            </div>
          )}

          {/* Footer */}
          <div className="text-center mt-6 text-white/50 text-sm space-y-2">
            <p>
              <Link href="/browse" className="text-white/70 hover:text-white">Browse all communities</Link>
            </p>
            <p>Powered by <Link href="/" className="text-white/70 hover:text-white">PlayDay</Link></p>
          </div>
        </main>

        {/* Confirm Modal */}
        {confirmModal.show && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-card-solid rounded-3xl shadow-2xl p-6 max-w-md w-full">
              <h3 className="text-xl font-bold text-gray-800 mb-4">
                {confirmModal.isWaitlist ? 'Leave Waitlist?' : 'Cancel RSVP?'}
              </h3>
              <p className="text-gray-600 mb-6">
                {confirmModal.isWaitlist
                  ? 'Are you sure you want to remove yourself from the waitlist?'
                  : 'Are you sure you want to cancel your RSVP? Your spot will be given to the next person.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal({ show: false, personId: null, isWaitlist: false })}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl"
                >
                  Keep my spot
                </button>
                <button
                  onClick={async () => {
                    await handleDropout(confirmModal.personId, confirmModal.isWaitlist);
                    setConfirmModal({ show: false, personId: null, isWaitlist: false });
                  }}
                  disabled={submitting}
                  className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl flex items-center justify-center"
                >
                  {submitting ? <Spinner /> : 'Yes, cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Snooze Modal */}
        {snoozeModal.show && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-card-solid rounded-3xl shadow-2xl p-6 max-w-md w-full">
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                {snoozeModal.isUnsnooze ? 'Rejoin the List?' : 'Skip This Week?'}
              </h3>
              <p className="text-gray-600 mb-4">
                {snoozeModal.isUnsnooze
                  ? 'Enter your member snooze code to rejoin the list for this week.'
                  : "Enter your member snooze code to skip this week. You'll automatically be back on the list next week."}
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Snooze Code
                </label>
                <input
                  type="text"
                  value={snoozeCode}
                  onChange={(e) => setSnoozeCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && !snoozing && handleSnooze(snoozeModal.isUnsnooze)}
                  placeholder="Enter 6-character code"
                  maxLength={6}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none text-center text-xl font-mono tracking-widest uppercase"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-2">
                  Check your email for your personal snooze code from when you were added as a member.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setSnoozeModal({ show: false, personName: null, isUnsnooze: false });
                    setSnoozeCode('');
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSnooze(snoozeModal.isUnsnooze)}
                  disabled={snoozing || snoozeCode.length < 6}
                  className={`flex-1 px-4 py-3 ${snoozeModal.isUnsnooze ? 'bg-green-500 hover:bg-green-600' : 'bg-amber-500 hover:bg-amber-600'} disabled:bg-gray-300 text-white font-medium rounded-xl flex items-center justify-center`}
                >
                  {snoozing ? <Spinner /> : (snoozeModal.isUnsnooze ? 'Rejoin List' : 'Skip This Week')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
