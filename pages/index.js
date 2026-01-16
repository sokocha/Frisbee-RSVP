import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

const MAIN_LIST_LIMIT = 30;
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

  const handleReset = async () => {
    if (window.confirm('Are you sure you want to clear all RSVPs? This cannot be undone.')) {
      setSubmitting(true);
      try {
        const response = await fetch('/api/rsvp', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reset' })
        });

        const data = await response.json();

        if (response.ok) {
          setMainList([]);
          setWaitlist([]);
          setHasSignedUp(false);
          setMySignup(null);
          showMessage(data.message, 'success');
        } else {
          showMessage(data.error, 'error');
        }
      } catch (error) {
        console.error('Failed to reset RSVPs:', error);
        showMessage('Failed to reset RSVPs. Please try again.', 'error');
      }
      setSubmitting(false);
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const isMySignup = (person) => person.deviceId === deviceId;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  const spotsLeft = MAIN_LIST_LIMIT - mainList.length;

  return (
    <>
      <Head>
        <title>Weekly Frisbee RSVP</title>
        <meta name="description" content="RSVP for weekly frisbee pickup games" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🥏</text></svg>" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-6xl mb-2">🥏</div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Weekly Frisbee</h1>
            <p className="text-green-200">First come, first served • {MAIN_LIST_LIMIT} spots available</p>
          </div>

          {/* Message Toast */}
          {message && (
            <div className={`mb-4 p-4 rounded-lg text-center font-medium ${
              message.type === 'success' ? 'bg-green-500 text-white' :
              message.type === 'error' ? 'bg-red-500 text-white' :
              'bg-yellow-500 text-black'
            }`}>
              {message.text}
            </div>
          )}

          {/* Already Signed Up Notice */}
          {hasSignedUp && mySignup && (
            <div className="mb-4 p-4 bg-blue-500 text-white rounded-lg text-center">
              <p className="font-medium">You're signed up as: {mySignup.name}</p>
              <p className="text-sm text-blue-100 mt-1">One signup per device allowed</p>
            </div>
          )}

          {/* RSVP Form */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            {!hasSignedUp ? (
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !submitting && handleRSVP()}
                  placeholder="Enter your name"
                  disabled={submitting}
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none text-lg disabled:bg-gray-100"
                />
                <button
                  onClick={handleRSVP}
                  disabled={submitting}
                  className="px-8 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold rounded-xl transition-colors text-lg"
                >
                  {submitting ? 'Submitting...' : 'RSVP'}
                </button>
              </div>
            ) : (
              <div className="text-center text-gray-600 py-2">
                <p>You've already signed up for this week!</p>
              </div>
            )}

            {/* Status Bar */}
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>{mainList.length} / {MAIN_LIST_LIMIT} spots filled</span>
                <span className={spotsLeft > 0 ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>
                  {spotsLeft > 0 ? `${spotsLeft} spots left` : 'Waitlist open'}
                </span>
              </div>
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    spotsLeft === 0 ? 'bg-orange-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${(mainList.length / MAIN_LIST_LIMIT) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Main List */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">
                Playing ({mainList.length})
              </h2>
            </div>

            {mainList.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No RSVPs yet. Be the first!</p>
            ) : (
              <div className="space-y-2">
                {mainList.map((person, index) => (
                  <div
                    key={person.id}
                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                      isMySignup(person)
                        ? 'bg-blue-50 hover:bg-blue-100 ring-2 ring-blue-300'
                        : 'bg-green-50 hover:bg-green-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 text-white rounded-full flex items-center justify-center font-bold text-sm ${
                        isMySignup(person) ? 'bg-blue-600' : 'bg-green-600'
                      }`}>
                        {index + 1}
                      </span>
                      <div>
                        <span className="font-medium text-gray-800">
                          {person.name}
                          {person.isWhitelisted && <span className="text-xs bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded ml-2">AIS</span>}
                          {isMySignup(person) && <span className="text-blue-600 text-xs ml-2">(You)</span>}
                        </span>
                        <span className="text-xs text-gray-500 ml-2">{formatTime(person.timestamp)}</span>
                      </div>
                    </div>
                    {isMySignup(person) && !person.isWhitelisted && (
                      <button
                        onClick={() => handleDropout(person.id)}
                        disabled={submitting}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 px-3 py-1 rounded-lg transition-colors text-sm"
                      >
                        Drop out
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Waitlist */}
          {(waitlist.length > 0 || mainList.length >= MAIN_LIST_LIMIT) && (
            <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                Waitlist ({waitlist.length})
              </h2>

              {waitlist.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Waitlist is empty</p>
              ) : (
                <div className="space-y-2">
                  {waitlist.map((person, index) => (
                    <div
                      key={person.id}
                      className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                        isMySignup(person)
                          ? 'bg-blue-50 hover:bg-blue-100 ring-2 ring-blue-300'
                          : 'bg-orange-50 hover:bg-orange-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 text-white rounded-full flex items-center justify-center font-bold text-sm ${
                          isMySignup(person) ? 'bg-blue-600' : 'bg-orange-500'
                        }`}>
                          {index + 1}
                        </span>
                        <div>
                          <span className="font-medium text-gray-800">
                            {person.name}
                            {person.isWhitelisted && <span className="text-xs bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded ml-2">AIS</span>}
                            {isMySignup(person) && <span className="text-blue-600 text-xs ml-2">(You)</span>}
                          </span>
                          <span className="text-xs text-gray-500 ml-2">{formatTime(person.timestamp)}</span>
                        </div>
                      </div>
                      {isMySignup(person) && !person.isWhitelisted && (
                        <button
                          onClick={() => handleDropout(person.id, true)}
                          disabled={submitting}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 px-3 py-1 rounded-lg transition-colors text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="text-center mt-8 text-green-200 text-sm">
            <p>Catch-234 Weekly Pickup</p>
          </div>
        </div>
      </div>
    </>
  );
}
