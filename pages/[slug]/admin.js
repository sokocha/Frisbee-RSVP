import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

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
  const [activeTab, setActiveTab] = useState('lists');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Whitelist form
  const [newWhitelistNames, setNewWhitelistNames] = useState('');

  // Game info form
  const [newRule, setNewRule] = useState('');

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
    gameInfo: {
      enabled: false,
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

        if (data.settings) {
          setSettingsForm({
            mainListLimit: data.settings.mainListLimit || 30,
            accessPeriod: data.settings.accessPeriod || settingsForm.accessPeriod,
            gameInfo: data.settings.gameInfo || settingsForm.gameInfo,
          });
        }
      }
    } catch (error) {
      console.error('Failed to load admin data:', error);
    }
    setLoading(false);
  }

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
    setSaving(true);
    try {
      const res = await fetch(`/api/org/${slug}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-settings', data: { settings: settingsForm } }),
      });

      const data = await res.json();

      if (res.ok) {
        setSettings(data.settings);
        setMainList(data.mainList);
        setWaitlist(data.waitlist);
        showMessage('Settings saved');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage('Failed to save settings', 'error');
    }
    setSaving(false);
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Organization Not Found</h1>
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
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{org?.name}</h1>
                <p className="text-sm text-gray-500">/{slug} Admin</p>
              </div>
              <div className="flex gap-3">
                <a
                  href={`/${slug}`}
                  target="_blank"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  View Public Page
                </a>
                <Link
                  href="/dashboard"
                  className="px-3 py-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  Dashboard
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

        {/* Tabs */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4">
            <nav className="flex gap-6">
              {['lists', 'whitelist', 'settings', 'gameinfo', 'archive'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-3 border-b-2 font-medium text-sm ${
                    activeTab === tab
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'gameinfo' ? 'Game Info' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <main className="max-w-5xl mx-auto px-4 py-6">
          {/* Lists Tab */}
          {activeTab === 'lists' && (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Main List */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold">Main List ({mainList.length}/{settingsForm.mainListLimit})</h2>
                  <button
                    onClick={handleResetSignups}
                    disabled={saving}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Reset Week
                  </button>
                </div>
                {mainList.length === 0 ? (
                  <p className="text-gray-400 text-center py-4">No signups yet</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {mainList.map((person, i) => (
                      <div key={person.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div>
                          <span className="text-gray-400 text-sm mr-2">#{i + 1}</span>
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
                <h2 className="font-semibold mb-4">Waitlist ({waitlist.length})</h2>
                {waitlist.length === 0 ? (
                  <p className="text-gray-400 text-center py-4">Waitlist empty</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {waitlist.map((person, i) => (
                      <div key={person.id} className="flex items-center justify-between p-2 bg-orange-50 rounded">
                        <div>
                          <span className="text-gray-400 text-sm mr-2">#{i + 1}</span>
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
          )}

          {/* Whitelist Tab */}
          {activeTab === 'whitelist' && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="font-semibold mb-4">Add Members</h2>
                <form onSubmit={handleAddWhitelist}>
                  <textarea
                    value={newWhitelistNames}
                    onChange={e => setNewWhitelistNames(e.target.value)}
                    placeholder="Enter names (one per line)"
                    rows={5}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
                  />
                  <button
                    type="submit"
                    disabled={saving || !newWhitelistNames.trim()}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Adding...' : 'Add Members'}
                  </button>
                </form>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="font-semibold mb-4">Current Members ({whitelist.length})</h2>
                {whitelist.length === 0 ? (
                  <p className="text-gray-400 text-center py-4">No whitelisted members</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {whitelist.map((member, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-blue-50 rounded">
                        <span className="font-medium">{member.name}</span>
                        <button
                          onClick={() => handleRemoveWhitelist(member.name)}
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
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-lg">
              <h2 className="font-semibold mb-4">Organization Settings</h2>
              <form onSubmit={handleSaveSettings} className="space-y-4">
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
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settingsForm.accessPeriod.enabled}
                      onChange={e => setSettingsForm({
                        ...settingsForm,
                        accessPeriod: { ...settingsForm.accessPeriod, enabled: e.target.checked }
                      })}
                      className="rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Enable scheduled RSVP window</span>
                  </label>
                </div>

                {settingsForm.accessPeriod.enabled && (
                  <div className="space-y-3 pl-6 border-l-2 border-gray-100">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Opens on</label>
                        <select
                          value={settingsForm.accessPeriod.startDay}
                          onChange={e => setSettingsForm({
                            ...settingsForm,
                            accessPeriod: { ...settingsForm.accessPeriod, startDay: parseInt(e.target.value) }
                          })}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                        >
                          {days.map((day, i) => (
                            <option key={i} value={i}>{day}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Hour</label>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={settingsForm.accessPeriod.startHour}
                          onChange={e => setSettingsForm({
                            ...settingsForm,
                            accessPeriod: { ...settingsForm.accessPeriod, startHour: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Minute</label>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={settingsForm.accessPeriod.startMinute}
                          onChange={e => setSettingsForm({
                            ...settingsForm,
                            accessPeriod: { ...settingsForm.accessPeriod, startMinute: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Closes on</label>
                        <select
                          value={settingsForm.accessPeriod.endDay}
                          onChange={e => setSettingsForm({
                            ...settingsForm,
                            accessPeriod: { ...settingsForm.accessPeriod, endDay: parseInt(e.target.value) }
                          })}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                        >
                          {days.map((day, i) => (
                            <option key={i} value={i}>{day}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Hour</label>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={settingsForm.accessPeriod.endHour}
                          onChange={e => setSettingsForm({
                            ...settingsForm,
                            accessPeriod: { ...settingsForm.accessPeriod, endHour: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Minute</label>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={settingsForm.accessPeriod.endMinute}
                          onChange={e => setSettingsForm({
                            ...settingsForm,
                            accessPeriod: { ...settingsForm.accessPeriod, endMinute: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </form>
            </div>
          )}

          {/* Game Info Tab */}
          {activeTab === 'gameinfo' && (
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
                    <span className="font-medium text-gray-900">Show Game Day Info</span>
                    <p className="text-sm text-gray-500">Display weather, location, and rules on the public RSVP page</p>
                  </div>
                </label>
              </div>

              {settingsForm.gameInfo?.enabled && (
                <>
                  {/* Game Schedule */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="font-semibold mb-4">Game Schedule</h3>
                    <p className="text-sm text-gray-500 mb-4">Set when your game typically takes place (used for weather forecast)</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="col-span-2 md:col-span-1">
                        <label className="block text-xs text-gray-500 mb-1">Day</label>
                        <select
                          value={settingsForm.gameInfo?.gameDay || 0}
                          onChange={e => setSettingsForm({
                            ...settingsForm,
                            gameInfo: { ...settingsForm.gameInfo, gameDay: parseInt(e.target.value) }
                          })}
                          className="w-full px-2 py-2 border border-gray-200 rounded text-sm"
                        >
                          {days.map((day, i) => (
                            <option key={i} value={i}>{day}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Start Hour</label>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={settingsForm.gameInfo?.startHour || 17}
                          onChange={e => setSettingsForm({
                            ...settingsForm,
                            gameInfo: { ...settingsForm.gameInfo, startHour: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-2 py-2 border border-gray-200 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Start Min</label>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={settingsForm.gameInfo?.startMinute || 0}
                          onChange={e => setSettingsForm({
                            ...settingsForm,
                            gameInfo: { ...settingsForm.gameInfo, startMinute: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-2 py-2 border border-gray-200 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">End Hour</label>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={settingsForm.gameInfo?.endHour || 19}
                          onChange={e => setSettingsForm({
                            ...settingsForm,
                            gameInfo: { ...settingsForm.gameInfo, endHour: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-2 py-2 border border-gray-200 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">End Min</label>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={settingsForm.gameInfo?.endMinute || 0}
                          onChange={e => setSettingsForm({
                            ...settingsForm,
                            gameInfo: { ...settingsForm.gameInfo, endMinute: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-2 py-2 border border-gray-200 rounded text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Weather */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <label className="flex items-center gap-3 mb-4">
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
                      <span className="font-medium">Show Weather Forecast</span>
                    </label>
                    {settingsForm.gameInfo?.weather?.enabled && (
                      <p className="text-sm text-gray-500 ml-7">
                        Weather will be shown based on the location configured below.
                      </p>
                    )}
                  </div>

                  {/* Location */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
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
                      <span className="font-medium">Show Location & Directions</span>
                    </label>
                    {settingsForm.gameInfo?.location?.enabled && (
                      <div className="space-y-3 ml-7">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Location Name</label>
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

                  {/* Field Rules */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
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
                      <span className="font-medium">Show Field Rules</span>
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
                    {saving ? 'Saving...' : 'Save Game Info Settings'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Archive Tab */}
          {activeTab === 'archive' && (
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
      </div>
    </>
  );
}
