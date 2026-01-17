import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';

const DEFAULT_MAIN_LIST_LIMIT = 30;
const DEVICE_KEY = 'frisbee-device-id';

// Generate a unique device ID based on browser characteristics
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

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36) + Date.now().toString(36);
}

// Get or create device ID
function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  return deviceId;
}

// Confetti component
function Confetti({ show }) {
  if (!show) return null;

  const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
  const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {confettiPieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute w-3 h-3 animate-confetti"
          style={{
            left: `${piece.left}%`,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            transform: `rotate(${piece.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
}

// Toast component with icons
function Toast({ message, onClose }) {
  if (!message) return null;

  const icons = {
    success: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  };

  const styles = {
    success: 'bg-emerald-500/95 text-white',
    error: 'bg-red-500/95 text-white',
    warning: 'bg-amber-500/95 text-black',
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
      <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-sm ${styles[message.type]}`}>
        <span className="flex-shrink-0">{icons[message.type]}</span>
        <span className="font-medium">{message.text}</span>
        <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100 transition-opacity">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Skeleton loading component
function SkeletonLoader() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-green-800 to-teal-900 p-3 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header skeleton */}
        <div className="text-center mb-6 md:mb-8 animate-pulse">
          <div className="w-16 h-16 bg-white/20 rounded-full mx-auto mb-3" />
          <div className="h-10 bg-white/20 rounded-xl w-48 mx-auto mb-2" />
          <div className="h-4 bg-white/10 rounded w-64 mx-auto" />
        </div>

        {/* Form skeleton */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-5 md:p-6 mb-4 md:mb-6 animate-pulse">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 h-14 bg-white/20 rounded-xl" />
            <div className="h-14 w-full md:w-32 bg-white/20 rounded-xl" />
          </div>
          <div className="mt-4">
            <div className="flex justify-between mb-2">
              <div className="h-4 bg-white/20 rounded w-24" />
              <div className="h-4 bg-white/20 rounded w-20" />
            </div>
            <div className="h-3 bg-white/20 rounded-full" />
          </div>
        </div>

        {/* List skeleton */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-5 md:p-6 animate-pulse">
          <div className="h-7 bg-white/20 rounded w-32 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <div className="w-10 h-10 bg-white/20 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-white/20 rounded w-32 mb-1" />
                  <div className="h-3 bg-white/10 rounded w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Countdown timer component
function CountdownTimer({ targetTime }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const target = new Date(targetTime);
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft('Opening soon...');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`);
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return (
    <div className="text-2xl font-mono font-bold text-white animate-pulse">
      {timeLeft}
    </div>
  );
}

// Empty state component
function EmptyState() {
  return (
    <div className="text-center py-8 md:py-12">
      <div className="text-6xl mb-4 animate-bounce-slow">🥏</div>
      <p className="text-gray-400 text-lg font-medium">No RSVPs yet</p>
      <p className="text-gray-500 text-sm mt-1">Be the first to claim your spot!</p>
    </div>
  );
}

// Spinner component for buttons
function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

// Get initials from name
function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Get color from name (deterministic)
function getAvatarColor(name) {
  const colors = [
    'from-emerald-400 to-teal-500',
    'from-blue-400 to-indigo-500',
    'from-purple-400 to-pink-500',
    'from-amber-400 to-orange-500',
    'from-rose-400 to-red-500',
    'from-cyan-400 to-blue-500',
    'from-green-400 to-emerald-500',
    'from-fuchsia-400 to-purple-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function FrisbeeRSVP() {
  const [mainList, setMainList] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [hasSignedUp, setHasSignedUp] = useState(false);
  const [mySignup, setMySignup] = useState(null);
  const [accessStatus, setAccessStatus] = useState({ isOpen: true, message: null });
  const [mainListLimit, setMainListLimit] = useState(DEFAULT_MAIN_LIST_LIMIT);
  const [snoozedNames, setSnoozedNames] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [snoozeModal, setSnoozeModal] = useState({ show: false, person: null, action: null });
  const [snoozePassword, setSnoozePassword] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ show: false, personId: null, isWaitlist: false });

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
    try {
      const response = await fetch('/api/rsvp');
      if (response.ok) {
        const data = await response.json();
        setMainList(data.mainList || []);
        setWaitlist(data.waitlist || []);
        setAccessStatus(data.accessStatus || { isOpen: true, message: null });
        setMainListLimit(data.mainListLimit || DEFAULT_MAIN_LIST_LIMIT);
        setSnoozedNames(data.snoozedNames || []);
        setWhitelist(data.whitelist || []);
        checkMySignup(data.mainList || [], data.waitlist || [], currentDeviceId);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
    setLoading(false);
  }, [checkMySignup]);

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);
    loadData(id);
  }, [loadData]);

  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleRSVP = async () => {
    if (hasSignedUp) {
      showMessage("You've already signed up from this device!", 'error');
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      showMessage('Please enter your name', 'error');
      return;
    }

    const nameParts = trimmedName.split(/\s+/);
    if (nameParts.length < 2) {
      showMessage('Please enter your first and last name (required for facility access)', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, deviceId })
      });

      const data = await response.json();

      if (response.ok) {
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        setName('');
        setHasSignedUp(true);
        setMySignup(data.person);
        showMessage(data.message, data.listType === 'main' ? 'success' : 'warning');

        // Show confetti for main list signup
        if (data.listType === 'main') {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 4000);
        }
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      console.error('Failed to submit RSVP:', error);
      showMessage('Failed to submit RSVP. Please try again.', 'error');
    }
    setSubmitting(false);
  };

  const handleDropout = async (personId, isWaitlist = false) => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/rsvp', {
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
        showMessage(data.message, 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      console.error('Failed to remove RSVP:', error);
      showMessage('Failed to remove RSVP. Please try again.', 'error');
    }
    setSubmitting(false);
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const formatDisplayName = (fullName) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0];
    }
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    const lastNameAbbrev = lastName.slice(0, 3);
    return `${firstName} ${lastNameAbbrev}.`;
  };

  const isMySignup = (person) => person.deviceId === deviceId;

  const openSnoozeModal = (person, action) => {
    setSnoozeModal({ show: true, person, action });
    setSnoozePassword('');
  };

  const closeSnoozeModal = () => {
    setSnoozeModal({ show: false, person: null, action: null });
    setSnoozePassword('');
  };

  const openConfirmModal = (personId, isWaitlist = false) => {
    setConfirmModal({ show: true, personId, isWaitlist });
  };

  const closeConfirmModal = () => {
    setConfirmModal({ show: false, personId: null, isWaitlist: false });
  };

  const handleConfirmedDropout = async () => {
    await handleDropout(confirmModal.personId, confirmModal.isWaitlist);
    closeConfirmModal();
  };

  const handleSnoozeSubmit = async () => {
    if (!snoozePassword.trim()) {
      showMessage('Please enter the password', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/rsvp', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: snoozeModal.action,
          personId: snoozeModal.person?.id || 0,
          personName: snoozeModal.person?.name,
          password: snoozePassword
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        if (data.snoozedNames !== undefined) {
          setSnoozedNames(data.snoozedNames);
        }
        showMessage(data.message, 'success');
        closeSnoozeModal();
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      console.error('Failed to process request:', error);
      showMessage('Failed to process request. Please try again.', 'error');
    }
    setSubmitting(false);
  };

  const spotsLeft = mainListLimit - mainList.length;
  const isLowSpots = spotsLeft > 0 && spotsLeft <= 5;

  // Parse next open time from message (e.g., "Opens Thursday at 12:00 PM WAT")
  const nextOpenTime = useMemo(() => {
    if (!accessStatus.message) return null;
    // This is a simplified parser - in production you'd want proper date parsing
    const match = accessStatus.message.match(/Opens (\w+) at ([\d:]+\s*(?:AM|PM))/i);
    if (match) {
      const [, day, time] = match;
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const today = new Date();
      const targetDayIndex = days.findIndex(d => d.toLowerCase() === day.toLowerCase());
      if (targetDayIndex !== -1) {
        const daysUntil = (targetDayIndex - today.getDay() + 7) % 7 || 7;
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + daysUntil);
        const [timeStr, period] = time.split(/\s+/);
        const [hours, minutes] = timeStr.split(':');
        let hour = parseInt(hours);
        if (period?.toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (period?.toUpperCase() === 'AM' && hour === 12) hour = 0;
        targetDate.setHours(hour, parseInt(minutes) || 0, 0, 0);
        return targetDate.toISOString();
      }
    }
    return null;
  }, [accessStatus.message]);

  if (loading) {
    return <SkeletonLoader />;
  }

  return (
    <>
      <Head>
        <title>Weekly Frisbee RSVP</title>
        <meta name="description" content="RSVP for weekly frisbee pickup games" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🥏</text></svg>" />
      </Head>

      <style jsx global>{`
        @keyframes confetti {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes slide-down {
          0% { transform: translate(-50%, -100%); opacity: 0; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes fade-in-up {
          0% { transform: translateY(10px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
        }
        .animate-confetti { animation: confetti 3s ease-out forwards; }
        .animate-slide-down { animation: slide-down 0.3s ease-out forwards; }
        .animate-fade-in-up { animation: fade-in-up 0.4s ease-out forwards; }
        .animate-bounce-slow { animation: bounce-slow 2s ease-in-out infinite; }
        .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
        .glass-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .glass-card-solid {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .card-hover {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .card-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.3);
        }
        .stagger-1 { animation-delay: 0.05s; }
        .stagger-2 { animation-delay: 0.1s; }
        .stagger-3 { animation-delay: 0.15s; }
        .stagger-4 { animation-delay: 0.2s; }
        .stagger-5 { animation-delay: 0.25s; }
      `}</style>

      <Confetti show={showConfetti} />
      <Toast message={message} onClose={() => setMessage(null)} />

      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-green-800 to-teal-900 p-3 md:p-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-6 md:mb-8 animate-fade-in-up">
            <div className="text-5xl md:text-6xl mb-2 animate-bounce-slow">🥏</div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2 bg-gradient-to-r from-white via-emerald-200 to-teal-200 bg-clip-text text-transparent">
              Weekly Frisbee
            </h1>
            <p className="text-emerald-200/80 text-sm md:text-base">First come, first served • {mainListLimit} spots available</p>
          </div>

          {/* Access Status Banner */}
          {!accessStatus.isOpen && (
            <div className="mb-4 glass-card rounded-2xl p-4 md:p-5 text-center animate-fade-in-up border-red-500/30">
              <div className="flex items-center justify-center gap-2 text-red-300 mb-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-4V8a3 3 0 00-6 0v4m-2 4h14a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2z" />
                </svg>
                <span className="font-medium">RSVP is currently closed</span>
              </div>
              {nextOpenTime && (
                <div className="mt-3">
                  <p className="text-emerald-200/60 text-sm mb-1">Opens in</p>
                  <CountdownTimer targetTime={nextOpenTime} />
                </div>
              )}
              {!nextOpenTime && accessStatus.message && (
                <p className="text-emerald-200/60 text-sm">{accessStatus.message}</p>
              )}
            </div>
          )}

          {/* Already Signed Up Notice */}
          {hasSignedUp && mySignup && (
            <div className="mb-4 glass-card rounded-2xl p-4 text-center animate-fade-in-up border-blue-400/30">
              <div className="flex items-center justify-center gap-2 text-blue-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">You're signed up as: {mySignup.name}</span>
              </div>
              <p className="text-sm text-blue-200/60 mt-1">One signup per device allowed</p>
            </div>
          )}

          {/* Snoozed Members Section */}
          {snoozedNames.length > 0 && (
            <div className="mb-4 glass-card rounded-2xl p-4 animate-fade-in-up border-amber-400/30">
              <p className="font-medium text-amber-300 mb-3 flex items-center gap-2">
                <span>😴</span> Skipping this week
              </p>
              <div className="flex flex-wrap gap-2">
                {snoozedNames.map((snoozedName, index) => (
                  accessStatus.isOpen ? (
                    <button
                      key={index}
                      onClick={() => openSnoozeModal({ name: snoozedName }, 'unsnooze')}
                      className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 px-3 py-1.5 rounded-full text-sm transition-all hover:scale-105"
                    >
                      {snoozedName} <span className="text-amber-400 ml-1">↩</span>
                    </button>
                  ) : (
                    <span
                      key={index}
                      className="bg-amber-500/20 text-amber-200 px-3 py-1.5 rounded-full text-sm"
                    >
                      {snoozedName}
                    </span>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Snooze/Unsnooze Modal */}
          {snoozeModal.show && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in-up">
              <div className="glass-card-solid rounded-3xl shadow-2xl p-6 max-w-md w-full">
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  {snoozeModal.action === 'snooze' ? '😴 Skip This Week' : '🎉 Rejoin This Week'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {snoozeModal.action === 'snooze'
                    ? `Confirm you are ${snoozeModal.person?.name} by entering the AIS password.`
                    : `Confirm your identity to rejoin this week's list.`}
                </p>
                <input
                  type="password"
                  value={snoozePassword}
                  onChange={(e) => setSnoozePassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !submitting && handleSnoozeSubmit()}
                  placeholder="Enter AIS password"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none mb-4 transition-colors"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button
                    onClick={closeSnoozeModal}
                    disabled={submitting}
                    className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSnoozeSubmit}
                    disabled={submitting}
                    className={`flex-1 px-4 py-3 text-white font-medium rounded-xl disabled:opacity-50 transition-all flex items-center justify-center gap-2 ${
                      snoozeModal.action === 'snooze'
                        ? 'bg-amber-500 hover:bg-amber-600'
                        : 'bg-emerald-500 hover:bg-emerald-600'
                    }`}
                  >
                    {submitting ? <Spinner /> : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Confirmation Modal for Drop Out */}
          {confirmModal.show && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in-up">
              <div className="glass-card-solid rounded-3xl shadow-2xl p-6 max-w-md w-full">
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  {confirmModal.isWaitlist ? '🚪 Leave Waitlist?' : '🚪 Cancel RSVP?'}
                </h3>
                <p className="text-gray-600 mb-6">
                  {confirmModal.isWaitlist
                    ? 'Are you sure you want to remove yourself from the waitlist?'
                    : 'Are you sure you want to cancel your RSVP? Your spot will be given to the next person on the waitlist.'}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={closeConfirmModal}
                    disabled={submitting}
                    className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl disabled:opacity-50 transition-colors"
                  >
                    Keep my spot
                  </button>
                  <button
                    onClick={handleConfirmedDropout}
                    disabled={submitting}
                    className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {submitting ? <Spinner /> : 'Yes, cancel'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* RSVP Form */}
          <div className="glass-card-solid rounded-3xl shadow-2xl p-4 md:p-6 mb-4 md:mb-6 animate-fade-in-up card-hover">
            {!accessStatus.isOpen ? (
              <div className="text-center text-gray-400 py-4">
                <p className="text-lg font-medium text-gray-500">RSVP is currently closed</p>
                <p className="text-sm mt-1 text-gray-400">{accessStatus.message}</p>
              </div>
            ) : !hasSignedUp ? (
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !submitting && handleRSVP()}
                  placeholder="Enter your full name (first & last)"
                  disabled={submitting}
                  className="flex-1 px-4 py-3 md:py-4 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none text-base md:text-lg disabled:bg-gray-50 transition-colors"
                />
                <button
                  onClick={handleRSVP}
                  disabled={submitting}
                  className="px-6 md:px-8 py-3 md:py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:from-gray-300 disabled:to-gray-400 text-white font-semibold rounded-xl transition-all text-base md:text-lg flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25"
                >
                  {submitting ? <Spinner /> : 'RSVP'}
                </button>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-2">
                <p>You've already signed up for this week!</p>
              </div>
            )}

            {/* Status Bar */}
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span className="font-medium">{mainList.length} / {mainListLimit} spots filled</span>
                <span className={`font-semibold ${
                  spotsLeft === 0 ? 'text-orange-500' : isLowSpots ? 'text-red-500' : 'text-emerald-600'
                } ${isLowSpots ? 'animate-pulse' : ''}`}>
                  {spotsLeft > 0 ? `${spotsLeft} spots left` : 'Waitlist open'}
                  {isLowSpots && ' 🔥'}
                </span>
              </div>
              <div className={`h-3 bg-gray-100 rounded-full overflow-hidden ${isLowSpots ? 'animate-pulse-glow' : ''}`}>
                <div
                  className={`h-full transition-all duration-700 ease-out rounded-full ${
                    spotsLeft === 0 ? 'bg-gradient-to-r from-orange-400 to-orange-500' :
                    isLowSpots ? 'bg-gradient-to-r from-red-400 to-red-500' :
                    'bg-gradient-to-r from-emerald-400 to-teal-500'
                  }`}
                  style={{ width: `${(mainList.length / mainListLimit) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Main List */}
          <div className="glass-card-solid rounded-3xl shadow-2xl p-4 md:p-6 mb-4 md:mb-6 animate-fade-in-up card-hover">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg md:text-xl font-bold text-gray-800 flex items-center gap-2">
                <span className="text-xl">🏃</span> Playing ({mainList.length})
              </h2>
            </div>

            {mainList.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-2">
                {mainList.map((person, index) => (
                  <div
                    key={person.id}
                    className={`flex items-center justify-between p-3 rounded-xl transition-all hover:scale-[1.01] animate-fade-in-up stagger-${Math.min(index + 1, 5)} ${
                      isMySignup(person)
                        ? 'bg-blue-50 ring-2 ring-blue-300'
                        : 'bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white bg-gradient-to-br ${
                        isMySignup(person) ? 'from-blue-400 to-blue-600' : getAvatarColor(person.name)
                      } shadow-lg`}>
                        {getInitials(person.name)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">
                            {formatDisplayName(person.name)}
                          </span>
                          {person.isWhitelisted && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">AIS</span>
                          )}
                          {isMySignup(person) && (
                            <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full font-medium">You</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">{formatTime(person.timestamp)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 font-medium">#{index + 1}</span>
                      {isMySignup(person) && !person.isWhitelisted && (
                        <button
                          onClick={() => openConfirmModal(person.id, false)}
                          disabled={submitting}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-all text-sm font-medium"
                        >
                          Drop out
                        </button>
                      )}
                      {person.isWhitelisted && (
                        <button
                          onClick={() => openSnoozeModal(person, 'snooze')}
                          disabled={submitting}
                          className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-all text-sm font-medium"
                        >
                          Skip week
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
            <div className="glass-card-solid rounded-3xl shadow-2xl p-4 md:p-6 mb-4 md:mb-6 animate-fade-in-up card-hover">
              <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="text-xl">⏳</span> Waitlist ({waitlist.length})
              </h2>

              {waitlist.length === 0 ? (
                <p className="text-gray-400 text-center py-6">Waitlist is empty</p>
              ) : (
                <div className="space-y-2">
                  {waitlist.map((person, index) => (
                    <div
                      key={person.id}
                      className={`flex items-center justify-between p-3 rounded-xl transition-all hover:scale-[1.01] animate-fade-in-up ${
                        isMySignup(person)
                          ? 'bg-blue-50 ring-2 ring-blue-300'
                          : 'bg-gradient-to-r from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white bg-gradient-to-br ${
                          isMySignup(person) ? 'from-blue-400 to-blue-600' : 'from-orange-400 to-amber-500'
                        } shadow-lg`}>
                          {getInitials(person.name)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-800">
                              {formatDisplayName(person.name)}
                            </span>
                            {person.isWhitelisted && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">AIS</span>
                            )}
                            {isMySignup(person) && (
                              <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full font-medium">You</span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{formatTime(person.timestamp)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 font-medium">#{index + 1}</span>
                        {isMySignup(person) && !person.isWhitelisted && (
                          <button
                            onClick={() => openConfirmModal(person.id, true)}
                            disabled={submitting}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-all text-sm font-medium"
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

          {/* Footer */}
          <div className="text-center mt-6 md:mt-8 text-emerald-300/60 text-sm animate-fade-in-up">
            <p>Catch-234 Weekly Pickup</p>
          </div>
        </div>
      </div>
    </>
  );
}
