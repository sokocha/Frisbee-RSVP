import React, { useState, useEffect } from 'react';
import Head from 'next/head';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_SETTINGS = {
  accessPeriod: {
    enabled: true,
    startDay: 4,
    startHour: 12,
    startMinute: 0,
    endDay: 5,
    endHour: 10,
    endMinute: 0,
    timezone: 'Africa/Lagos'
  }
};

export default function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mainList, setMainList] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [message, setMessage] = useState(null);
  const [bulkNames, setBulkNames] = useState('');
  const [singleName, setSingleName] = useState('');

  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin', {
        headers: { 'Authorization': `Bearer ${password}` }
      });

      if (response.ok) {
        const data = await response.json();
        setMainList(data.mainList || []);
        setWaitlist(data.waitlist || []);
        setWhitelist(data.whitelist || []);
        setSettings(data.settings || DEFAULT_SETTINGS);
        setIsAuthenticated(true);
      } else {
        showMessage('Invalid password', 'error');
        setIsAuthenticated(false);
      }
    } catch (error) {
      showMessage('Failed to connect', 'error');
    }
    setLoading(false);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    fetchData();
  };

  const updateSettings = async (newSettings) => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`
        },
        body: JSON.stringify({
          action: 'update-settings',
          data: { settings: newSettings }
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSettings(data.settings);
        showMessage('Settings updated', 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage('Failed to update settings', 'error');
    }
    setLoading(false);
  };

  const handleAccessPeriodChange = (field, value) => {
    const newSettings = {
      ...settings,
      accessPeriod: {
        ...settings.accessPeriod,
        [field]: value
      }
    };
    setSettings(newSettings);
  };

  const saveAccessPeriod = () => {
    updateSettings(settings);
  };

  const addWhitelistBulk = async () => {
    if (!bulkNames.trim()) {
      showMessage('Enter at least one name', 'error');
      return;
    }

    const names = bulkNames
      .split('\n')
      .map(n => n.trim())
      .filter(n => n.length > 0);

    if (names.length === 0) {
      showMessage('Enter at least one valid name', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`
        },
        body: JSON.stringify({
          action: 'add-whitelist',
          data: { names }
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        setWhitelist(data.whitelist);
        setBulkNames('');

        let msg = `Added ${data.added.length} alumni`;
        if (data.skipped.length > 0) {
          msg += `, skipped ${data.skipped.length}`;
        }
        showMessage(msg, 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage('Failed to add alumni', 'error');
    }
    setLoading(false);
  };

  const addSingleName = async () => {
    if (!singleName.trim()) {
      showMessage('Enter a name', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`
        },
        body: JSON.stringify({
          action: 'add-whitelist',
          data: { names: [singleName.trim()] }
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        setWhitelist(data.whitelist);
        setSingleName('');

        if (data.added.length > 0) {
          showMessage(`Added ${data.added[0]}`, 'success');
        } else if (data.skipped.length > 0) {
          showMessage(`Skipped: ${data.skipped[0].reason}`, 'warning');
        }
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage('Failed to add alumni', 'error');
    }
    setLoading(false);
  };

  const removePerson = async (personId, isWaitlist = false) => {
    if (!confirm('Remove this person?')) return;

    setLoading(true);
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`
        },
        body: JSON.stringify({
          action: 'remove-person',
          data: { personId, isWaitlist }
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        showMessage('Removed successfully', 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage('Failed to remove', 'error');
    }
    setLoading(false);
  };

  const removeFromWhitelist = async (name) => {
    if (!confirm(`Remove ${name} from whitelist?`)) return;

    setLoading(true);
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`
        },
        body: JSON.stringify({
          action: 'remove-whitelist',
          data: { name }
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        setWhitelist(data.whitelist);
        showMessage('Removed from whitelist', 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage('Failed to remove', 'error');
    }
    setLoading(false);
  };

  const resetSignups = async () => {
    if (!confirm('Reset all non-whitelisted signups? Whitelisted alumni will remain.')) return;

    setLoading(true);
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`
        },
        body: JSON.stringify({ action: 'reset-signups' })
      });

      const data = await response.json();

      if (response.ok) {
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        showMessage('Signups reset, whitelist preserved', 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage('Failed to reset', 'error');
    }
    setLoading(false);
  };

  const resetAll = async () => {
    if (!confirm('RESET EVERYTHING? This removes all signups AND the whitelist!')) return;
    if (!confirm('Are you absolutely sure?')) return;

    setLoading(true);
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`
        },
        body: JSON.stringify({ action: 'reset-all' })
      });

      const data = await response.json();

      if (response.ok) {
        setMainList([]);
        setWaitlist([]);
        setWhitelist([]);
        showMessage('Everything reset', 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage('Failed to reset', 'error');
    }
    setLoading(false);
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const formatTimeDisplay = (hour, minute) => {
    const h = hour % 12 || 12;
    const m = minute.toString().padStart(2, '0');
    const ampm = hour < 12 ? 'AM' : 'PM';
    return `${h}:${m} ${ampm}`;
  };

  const getCurrentAccessStatus = () => {
    if (!settings.accessPeriod.enabled) {
      return { isOpen: true, message: 'Access period disabled - form always open' };
    }

    const now = new Date();
    const watTime = new Date(now.toLocaleString('en-US', { timeZone: settings.accessPeriod.timezone }));
    const currentDay = watTime.getDay();
    const currentHour = watTime.getHours();
    const currentMinute = watTime.getMinutes();

    const { startDay, startHour, startMinute, endDay, endHour, endMinute } = settings.accessPeriod;

    // Convert to minutes since start of week for easier comparison
    const currentMins = currentDay * 24 * 60 + currentHour * 60 + currentMinute;
    const startMins = startDay * 24 * 60 + startHour * 60 + (startMinute || 0);
    const endMins = endDay * 24 * 60 + endHour * 60 + (endMinute || 0);

    let isOpen;
    if (startMins <= endMins) {
      isOpen = currentMins >= startMins && currentMins < endMins;
    } else {
      // Wraps around week (e.g., Friday to Monday)
      isOpen = currentMins >= startMins || currentMins < endMins;
    }

    const statusMessage = isOpen
      ? `Open now (closes ${DAYS[endDay]} ${formatTimeDisplay(endHour, endMinute || 0)})`
      : `Closed (opens ${DAYS[startDay]} ${formatTimeDisplay(startHour, startMinute || 0)})`;

    return { isOpen, message: statusMessage };
  };

  if (!isAuthenticated) {
    return (
      <>
        <Head>
          <title>Admin - Frisbee RSVP</title>
          <meta name="robots" content="noindex" />
        </Head>
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
            <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">Admin Login</h1>

            {message && (
              <div className={`mb-4 p-3 rounded-lg text-center text-sm ${
                message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none mb-4"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold rounded-xl"
              >
                {loading ? 'Checking...' : 'Login'}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  const spotsRemaining = 30 - mainList.length;
  const whitelistCount = mainList.filter(p => p.isWhitelisted).length;
  const regularCount = mainList.filter(p => !p.isWhitelisted).length;
  const accessStatus = getCurrentAccessStatus();

  return (
    <>
      <Head>
        <title>Admin Dashboard - Frisbee RSVP</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div className="min-h-screen bg-gray-100 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
            <button
              onClick={() => setIsAuthenticated(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              Logout
            </button>
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

          {/* Access Status Banner */}
          <div className={`mb-6 p-4 rounded-xl ${accessStatus.isOpen ? 'bg-green-100 border-2 border-green-300' : 'bg-red-100 border-2 border-red-300'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${accessStatus.isOpen ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
              <span className={`font-medium ${accessStatus.isOpen ? 'text-green-800' : 'text-red-800'}`}>
                RSVP Form: {accessStatus.message}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 shadow">
              <div className="text-3xl font-bold text-green-600">{mainList.length}</div>
              <div className="text-gray-500 text-sm">Main List</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow">
              <div className="text-3xl font-bold text-blue-600">{whitelistCount}</div>
              <div className="text-gray-500 text-sm">Whitelisted</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow">
              <div className="text-3xl font-bold text-purple-600">{regularCount}</div>
              <div className="text-gray-500 text-sm">Regular RSVPs</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow">
              <div className="text-3xl font-bold text-orange-600">{waitlist.length}</div>
              <div className="text-gray-500 text-sm">Waitlist</div>
            </div>
          </div>

          {/* Access Period Settings */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Access Period Settings</h2>

            <div className="mb-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.accessPeriod.enabled}
                  onChange={(e) => handleAccessPeriodChange('enabled', e.target.checked)}
                  className="w-5 h-5 rounded text-green-600"
                />
                <span className="font-medium text-gray-700">Enable access period restrictions</span>
              </label>
              <p className="text-sm text-gray-500 mt-1 ml-8">
                When disabled, the RSVP form is always open
              </p>
            </div>

            {settings.accessPeriod.enabled && (
              <div className="border-t pt-4 space-y-4">
                {/* Start Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Opens at:</label>
                  <div className="flex gap-2 flex-wrap items-center">
                    <select
                      value={settings.accessPeriod.startDay}
                      onChange={(e) => handleAccessPeriodChange('startDay', parseInt(e.target.value))}
                      className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:outline-none"
                    >
                      {DAYS.map((day, i) => (
                        <option key={i} value={i}>{day}</option>
                      ))}
                    </select>
                    <select
                      value={settings.accessPeriod.startHour}
                      onChange={(e) => handleAccessPeriodChange('startHour', parseInt(e.target.value))}
                      className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:outline-none"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                      ))}
                    </select>
                    <span className="text-gray-500">:</span>
                    <select
                      value={settings.accessPeriod.startMinute}
                      onChange={(e) => handleAccessPeriodChange('startMinute', parseInt(e.target.value))}
                      className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:outline-none"
                    >
                      {Array.from({ length: 60 }, (_, i) => (
                        <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* End Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Closes at:</label>
                  <div className="flex gap-2 flex-wrap items-center">
                    <select
                      value={settings.accessPeriod.endDay}
                      onChange={(e) => handleAccessPeriodChange('endDay', parseInt(e.target.value))}
                      className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:outline-none"
                    >
                      {DAYS.map((day, i) => (
                        <option key={i} value={i}>{day}</option>
                      ))}
                    </select>
                    <select
                      value={settings.accessPeriod.endHour}
                      onChange={(e) => handleAccessPeriodChange('endHour', parseInt(e.target.value))}
                      className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:outline-none"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                      ))}
                    </select>
                    <span className="text-gray-500">:</span>
                    <select
                      value={settings.accessPeriod.endMinute}
                      onChange={(e) => handleAccessPeriodChange('endMinute', parseInt(e.target.value))}
                      className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:outline-none"
                    >
                      {Array.from({ length: 60 }, (_, i) => (
                        <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-sm text-gray-500">
                  Timezone: West Africa Time (WAT/UTC+1)
                </div>

                <button
                  onClick={saveAccessPeriod}
                  disabled={loading}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg"
                >
                  Save Settings
                </button>
              </div>
            )}
          </div>

          {/* Add Whitelist */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Add AIS Alumni (Whitelist)</h2>

            {/* Single add */}
            <div className="flex gap-3 mb-4">
              <input
                type="text"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                placeholder="Enter name"
                className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:outline-none"
              />
              <button
                onClick={addSingleName}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg"
              >
                Add
              </button>
            </div>

            {/* Bulk add */}
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bulk Add (one name per line)
              </label>
              <textarea
                value={bulkNames}
                onChange={(e) => setBulkNames(e.target.value)}
                placeholder="John Doe&#10;Jane Smith&#10;Alex Johnson"
                rows={5}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:outline-none mb-3"
              />
              <button
                onClick={addWhitelistBulk}
                disabled={loading}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg"
              >
                Add All
              </button>
            </div>
          </div>

          {/* Main List */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              Main List ({mainList.length}/30)
            </h2>

            {mainList.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No signups yet</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {mainList.map((person, index) => (
                  <div
                    key={person.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      person.isWhitelisted ? 'bg-blue-50' : 'bg-green-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 text-white rounded-full flex items-center justify-center font-bold text-xs ${
                        person.isWhitelisted ? 'bg-blue-600' : 'bg-green-600'
                      }`}>
                        {index + 1}
                      </span>
                      <div>
                        <span className="font-medium text-gray-800">{person.name}</span>
                        {person.isWhitelisted && (
                          <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded">AIS</span>
                        )}
                        <span className="text-xs text-gray-500 ml-2">{formatTime(person.timestamp)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => removePerson(person.id, false)}
                      disabled={loading}
                      className="text-red-500 hover:text-red-700 text-sm px-2 py-1"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Waitlist */}
          {waitlist.length > 0 && (
            <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                Waitlist ({waitlist.length})
              </h2>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {waitlist.map((person, index) => (
                  <div
                    key={person.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      person.isWhitelisted ? 'bg-blue-50' : 'bg-orange-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold text-xs">
                        {index + 1}
                      </span>
                      <div>
                        <span className="font-medium text-gray-800">{person.name}</span>
                        {person.isWhitelisted && (
                          <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded">AIS</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removePerson(person.id, true)}
                      disabled={loading}
                      className="text-red-500 hover:text-red-700 text-sm px-2 py-1"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Whitelist Record */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              Whitelist Record ({whitelist.length})
            </h2>

            {whitelist.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No whitelisted alumni</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {whitelist.map((person, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm"
                  >
                    <span>{person.name}</span>
                    <button
                      onClick={() => removeFromWhitelist(person.name)}
                      className="text-blue-600 hover:text-red-600 font-bold"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-red-200">
            <h2 className="text-xl font-bold text-red-600 mb-4">Danger Zone</h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={resetSignups}
                disabled={loading}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-medium rounded-lg"
              >
                Reset Week (Keep Whitelist)
              </button>
              <button
                onClick={resetAll}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium rounded-lg"
              >
                Reset Everything
              </button>
            </div>
            <p className="text-gray-500 text-sm mt-3">
              "Reset Week" clears all regular signups but keeps whitelisted alumni. Use this at the start of each week.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
