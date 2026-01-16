import React, { useState, useEffect } from 'react';
import Head from 'next/head';

const MAIN_LIST_LIMIT = 30;
const STORAGE_KEY = 'frisbee-rsvp-data';

export default function FrisbeeRSVP() {
  const [mainList, setMainList] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        setMainList(data.mainList || []);
        setWaitlist(data.waitlist || []);
      }
    } catch (error) {
      console.log('No existing data found, starting fresh');
    }
    setLoading(false);
  };

  const saveData = (newMainList, newWaitlist) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mainList: newMainList,
        waitlist: newWaitlist,
        lastUpdated: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Failed to save data:', error);
    }
  };

  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleRSVP = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showMessage('Please enter your name', 'error');
      return;
    }

    const allNames = [...mainList, ...waitlist].map(p => p.name.toLowerCase());
    if (allNames.includes(trimmedName.toLowerCase())) {
      showMessage("You're already on the list!", 'error');
      return;
    }

    const newPerson = {
      id: Date.now(),
      name: trimmedName,
      timestamp: new Date().toISOString()
    };

    let newMainList = mainList;
    let newWaitlist = waitlist;

    if (mainList.length < MAIN_LIST_LIMIT) {
      newMainList = [...mainList, newPerson];
      showMessage(`You're in! Spot #${newMainList.length}`, 'success');
    } else {
      newWaitlist = [...waitlist, newPerson];
      showMessage(`Main list full. You're #${newWaitlist.length} on the waitlist`, 'warning');
    }

    setMainList(newMainList);
    setWaitlist(newWaitlist);
    setName('');
    saveData(newMainList, newWaitlist);
  };

  const handleDropout = (personId, isWaitlist = false) => {
    let newMainList = mainList;
    let newWaitlist = waitlist;

    if (isWaitlist) {
      newWaitlist = waitlist.filter(p => p.id !== personId);
      showMessage('Removed from waitlist', 'success');
    } else {
      newMainList = mainList.filter(p => p.id !== personId);

      if (waitlist.length > 0) {
        const promoted = waitlist[0];
        newMainList = [...newMainList, promoted];
        newWaitlist = waitlist.slice(1);
        showMessage(`Spot opened! ${promoted.name} promoted from waitlist`, 'success');
      } else {
        showMessage('Removed from main list', 'success');
      }
    }

    setMainList(newMainList);
    setWaitlist(newWaitlist);
    saveData(newMainList, newWaitlist);
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to clear all RSVPs? This cannot be undone.')) {
      setMainList([]);
      setWaitlist([]);
      saveData([], []);
      showMessage('All RSVPs cleared', 'success');
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

          {/* RSVP Form */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRSVP()}
                placeholder="Enter your name"
                className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none text-lg"
              />
              <button
                onClick={handleRSVP}
                className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors text-lg"
              >
                RSVP
              </button>
            </div>

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
                    className="flex items-center justify-between p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </span>
                      <div>
                        <span className="font-medium text-gray-800">{person.name}</span>
                        <span className="text-xs text-gray-500 ml-2">{formatTime(person.timestamp)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDropout(person.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded-lg transition-colors text-sm"
                    >
                      Drop out
                    </button>
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
                      className="flex items-center justify-between p-3 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                          {index + 1}
                        </span>
                        <div>
                          <span className="font-medium text-gray-800">{person.name}</span>
                          <span className="text-xs text-gray-500 ml-2">{formatTime(person.timestamp)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDropout(person.id, true)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded-lg transition-colors text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Admin Controls */}
          <div className="text-center">
            <button
              onClick={handleReset}
              className="text-white/70 hover:text-white text-sm underline"
            >
              Reset all RSVPs (Admin)
            </button>
          </div>

          {/* Footer */}
          <div className="text-center mt-8 text-green-200 text-sm">
            <p>Catch-234 Weekly Pickup</p>
          </div>
        </div>
      </div>
    </>
  );
}
