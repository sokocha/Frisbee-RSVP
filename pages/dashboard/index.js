import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { LAGOS_AREAS, formatLocation } from '../../lib/locations';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSlug, setCopiedSlug] = useState(null);
  const [draggedOrg, setDraggedOrg] = useState(null);
  const [dragOverOrg, setDragOverOrg] = useState(null);

  // New org form state
  const [newOrg, setNewOrg] = useState({
    name: '',
    slug: '',
    sport: '',
    location: '',
    streetAddress: '',
    timezone: 'Africa/Lagos',
    maxParticipants: 30,
    gameDay: 0, // Sunday
    gameStartHour: 17,
    gameStartMinute: 0,
    gameEndHour: 19,
    gameEndMinute: 0,
  });
  const [slugStatus, setSlugStatus] = useState({ checking: false, available: null, error: null });
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [createStep, setCreateStep] = useState(1); // Multi-step wizard: 1=Basics, 2=Schedule, 3=Location

  useEffect(() => {
    fetchUserData();
  }, []);

  // Check for create=true query param to auto-open the create modal
  useEffect(() => {
    if (router.isReady && router.query.create === 'true' && !loading) {
      setShowCreateForm(true);
      // Remove the query param from URL without refreshing
      router.replace('/dashboard', undefined, { shallow: true });
    }
  }, [router.isReady, router.query.create, loading]);

  async function fetchUserData() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.status === 401) {
        router.push('/auth/login');
        return;
      }
      const data = await res.json();
      setUser(data.organizer);
      setOrganizations(data.organizations);
    } catch (err) {
      console.error('Failed to fetch user data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function checkSlug(slug) {
    if (!slug || slug.length < 3) {
      setSlugStatus({ checking: false, available: null, error: null });
      return;
    }

    setSlugStatus({ checking: true, available: null, error: null });

    try {
      const res = await fetch(`/api/organizations/check-slug?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      setSlugStatus({
        checking: false,
        available: data.available,
        error: data.error,
        normalized: data.normalized,
      });
    } catch (err) {
      setSlugStatus({ checking: false, available: null, error: 'Failed to check slug' });
    }
  }

  // Generate slug from name
  function generateSlugFromName(name) {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-')          // Replace spaces with hyphens
      .replace(/-+/g, '-')           // Replace multiple hyphens with single
      .replace(/^-|-$/g, '');        // Remove leading/trailing hyphens
  }

  function handleNameChange(e) {
    const name = e.target.value;
    const updates = { ...newOrg, name };

    // Auto-generate slug if not manually edited
    if (!slugManuallyEdited) {
      const generatedSlug = generateSlugFromName(name);
      updates.slug = generatedSlug;

      // Debounce slug check for auto-generated slug
      clearTimeout(window.slugCheckTimeout);
      if (generatedSlug.length >= 3) {
        window.slugCheckTimeout = setTimeout(() => checkSlug(generatedSlug), 300);
      } else {
        setSlugStatus({ checking: false, available: null, error: null });
      }
    }

    setNewOrg(updates);
  }

  function handleSlugChange(e) {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setNewOrg({ ...newOrg, slug: value });
    setSlugManuallyEdited(true); // Mark as manually edited

    // Debounce slug check
    clearTimeout(window.slugCheckTimeout);
    window.slugCheckTimeout = setTimeout(() => checkSlug(value), 300);
  }

  async function handleCreateOrg(e) {
    e.preventDefault();

    // Only submit on the final step
    if (createStep < 3) {
      return;
    }

    // Validate step 3 fields
    if (!newOrg.location || !newOrg.streetAddress) {
      setError('Please fill in all required fields');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrg),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create organization');
      }

      // Re-fetch user data to get updated org list with stats
      await fetchUserData();
      setShowCreateForm(false);
      setNewOrg({
        name: '',
        slug: '',
        sport: '',
        location: '',
        streetAddress: '',
        timezone: 'Africa/Lagos',
        maxParticipants: 30,
        gameDay: 0,
        gameStartHour: 17,
        gameStartMinute: 0,
        gameEndHour: 19,
        gameEndMinute: 0,
      });
      setSlugManuallyEdited(false);
      setSlugStatus({ checking: false, available: null, error: null });
      setCreateStep(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  // Copy link to clipboard
  async function handleCopyLink(slug) {
    const url = `${window.location.origin}/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  // Format relative time
  function formatRelativeTime(timestamp) {
    if (!timestamp) return null;
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString();
  }

  // Filter organizations by search
  const filteredOrgs = organizations.filter(org =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    org.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
    org.sport?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Drag and drop handlers
  function handleDragStart(e, org) {
    setDraggedOrg(org);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, org) {
    e.preventDefault();
    if (draggedOrg && draggedOrg.id !== org.id) {
      setDragOverOrg(org);
    }
  }

  function handleDragLeave() {
    setDragOverOrg(null);
  }

  function handleDrop(e, targetOrg) {
    e.preventDefault();
    if (!draggedOrg || draggedOrg.id === targetOrg.id) return;

    const newOrgs = [...organizations];
    const draggedIndex = newOrgs.findIndex(o => o.id === draggedOrg.id);
    const targetIndex = newOrgs.findIndex(o => o.id === targetOrg.id);

    // Remove dragged item and insert at target position
    const [removed] = newOrgs.splice(draggedIndex, 1);
    newOrgs.splice(targetIndex, 0, removed);

    // Update display order
    const reordered = newOrgs.map((org, index) => ({ ...org, displayOrder: index }));
    setOrganizations(reordered);

    // Save new order to backend
    saveOrgOrder(reordered.map(o => ({ id: o.id, displayOrder: o.displayOrder })));

    setDraggedOrg(null);
    setDragOverOrg(null);
  }

  function handleDragEnd() {
    setDraggedOrg(null);
    setDragOverOrg(null);
  }

  async function saveOrgOrder(orderData) {
    try {
      await fetch('/api/organizations/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: orderData }),
      });
    } catch (err) {
      console.error('Failed to save order:', err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Dashboard - PlayDay</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <Link href="/browse" className="flex items-center gap-2 group">
              <span className="text-2xl">🏆</span>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">PlayDay</h1>
                <p className="text-sm text-gray-500">Welcome, {user?.name}</p>
              </div>
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/browse"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Browse Communities
              </Link>
              {user?.isSuperAdmin && (
                <Link
                  href="/super-admin"
                  className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                >
                  Super Admin
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Log out
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Communities */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Your Communities</h2>
              <div className="flex gap-3 w-full sm:w-auto">
                {organizations.length > 1 && (
                  <input
                    type="text"
                    placeholder="Search communities..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="flex-1 sm:w-64 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium whitespace-nowrap"
                >
                  Create Community
                </button>
              </div>
            </div>

            {organizations.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-gray-500 mb-4">You don't have any communities yet.</p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Create your first community
                </button>
              </div>
            ) : filteredOrgs.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No communities match "{searchQuery}"</p>
              </div>
            ) : (
              <>
                {organizations.length > 1 && (
                  <p className="text-xs text-gray-400 mb-3">Drag cards to reorder</p>
                )}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredOrgs.map(org => (
                    <div
                      key={org.id}
                      draggable
                      onDragStart={e => handleDragStart(e, org)}
                      onDragOver={e => handleDragOver(e, org)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => handleDrop(e, org)}
                      onDragEnd={handleDragEnd}
                      className={`bg-white rounded-lg border p-5 transition-all cursor-move ${
                        draggedOrg?.id === org.id
                          ? 'opacity-50 border-blue-300'
                          : dragOverOrg?.id === org.id
                          ? 'border-blue-500 shadow-lg'
                          : 'border-gray-200 hover:shadow-md'
                      }`}
                    >
                      {/* Header row */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 truncate">{org.name}</h3>
                          <p className="text-sm text-gray-500 capitalize">{org.sport}</p>
                          {org.location && (
                            <p className="text-xs text-gray-400 truncate mt-0.5" title={org.location}>
                              📍 {org.location}
                            </p>
                          )}
                        </div>
                        {/* Window status badge */}
                        <span className={`ml-2 px-2 py-1 text-xs rounded-full font-medium whitespace-nowrap ${
                          org.stats?.windowStatus === 'open'
                            ? 'bg-green-100 text-green-700'
                            : org.stats?.windowStatus === 'always_open'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {org.stats?.windowStatus === 'open' && (
                            <>Open{org.stats.windowTimeUntilChange && ` · ${org.stats.windowTimeUntilChange}`}</>
                          )}
                          {org.stats?.windowStatus === 'closed' && (
                            <>Closed{org.stats.windowTimeUntilChange && ` · Opens in ${org.stats.windowTimeUntilChange}`}</>
                          )}
                          {org.stats?.windowStatus === 'always_open' && 'Always Open'}
                        </span>
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center gap-4 mb-3 text-sm">
                        <div className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="font-medium text-gray-900">
                            {org.stats?.mainListCount || 0}/{org.stats?.mainListLimit || 30}
                          </span>
                          <span className="text-gray-500">signed up</span>
                        </div>
                        {org.stats?.waitlistCount > 0 && (
                          <span className="text-orange-600 text-xs">
                            +{org.stats.waitlistCount} waitlist
                          </span>
                        )}
                      </div>

                      {/* Last activity */}
                      {org.stats?.lastSignup && (
                        <p className="text-xs text-gray-400 mb-3">
                          Last signup: {formatRelativeTime(org.stats.lastSignup)}
                        </p>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2 items-center">
                        <a
                          href={`/${org.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex-1 text-center px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          View
                        </a>
                        <button
                          onClick={e => { e.stopPropagation(); handleCopyLink(org.slug); }}
                          className={`px-3 py-2 text-sm border rounded-lg transition-colors ${
                            copiedSlug === org.slug
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                          }`}
                          title="Copy public link"
                        >
                          {copiedSlug === org.slug ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                          )}
                        </button>
                        <a
                          href={`/${org.slug}/admin`}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 text-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          Manage
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>

        {/* Create Community Modal - Multi-step Wizard */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-md w-full overflow-hidden">
              {/* Header with Progress */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold">Create Community</h3>
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setError('');
                      setSlugManuallyEdited(false);
                      setSlugStatus({ checking: false, available: null, error: null });
                      setCreateStep(1);
                    }}
                    className="text-white/70 hover:text-white"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {/* Step Indicators */}
                <div className="flex items-center gap-2">
                  {[
                    { num: 1, label: 'Basics' },
                    { num: 2, label: 'Schedule' },
                    { num: 3, label: 'Location' },
                  ].map((step, i) => (
                    <div key={step.num} className="flex items-center">
                      <div className={`flex items-center gap-1.5 ${createStep >= step.num ? 'text-white' : 'text-white/50'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          createStep > step.num
                            ? 'bg-white text-blue-600'
                            : createStep === step.num
                            ? 'bg-white/20 border-2 border-white'
                            : 'bg-white/10 border border-white/30'
                        }`}>
                          {createStep > step.num ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            step.num
                          )}
                        </div>
                        <span className="text-xs font-medium hidden sm:inline">{step.label}</span>
                      </div>
                      {i < 2 && (
                        <div className={`w-6 sm:w-8 h-0.5 mx-1 ${createStep > step.num ? 'bg-white' : 'bg-white/20'}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Form Content */}
              <div className="p-6">
                {error && (
                  <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <form
                  onSubmit={handleCreateOrg}
                  onKeyDown={e => {
                    // Prevent Enter key from submitting form - only allow button click
                    if (e.key === 'Enter') {
                      e.preventDefault();
                    }
                  }}
                >
                  {/* Step 1: Basics */}
                  {createStep === 1 && (
                    <div className="space-y-4">
                      <p className="text-gray-500 text-sm mb-4">Let's start with the basics about your community.</p>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Community Name *
                        </label>
                        <input
                          type="text"
                          value={newOrg.name}
                          onChange={handleNameChange}
                          placeholder="e.g., Lagos Padel Club"
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          URL Slug *
                        </label>
                        <div className="flex items-center">
                          <span className="text-gray-400 text-sm mr-1">itsplayday.com/</span>
                          <input
                            type="text"
                            value={newOrg.slug}
                            onChange={handleSlugChange}
                            placeholder="lagos-padel"
                            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        {slugStatus.checking && (
                          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                            <span className="animate-spin">⏳</span> Checking availability...
                          </p>
                        )}
                        {slugStatus.available === true && (
                          <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                            <span>✓</span> This slug is available!
                          </p>
                        )}
                        {slugStatus.error && (
                          <p className="text-sm text-red-600 mt-1">{slugStatus.error}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Sport *
                        </label>
                        <select
                          value={newOrg.sport}
                          onChange={e => setNewOrg({ ...newOrg, sport: e.target.value })}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Select a sport</option>
                          <option value="american-football">🏈 American Football</option>
                          <option value="badminton">🏸 Badminton</option>
                          <option value="basketball">🏀 Basketball</option>
                          <option value="crossfit">🏋🏾 CrossFit</option>
                          <option value="cycling">🚴🏾 Cycling</option>
                          <option value="football">⚽ Football</option>
                          <option value="frisbee">🥏 Frisbee</option>
                          <option value="golf">⛳ Golf</option>
                          <option value="hiking">🥾 Hiking</option>
                          <option value="padel">🎾 Padel</option>
                          <option value="pickleball">🏓 Pickleball</option>
                          <option value="running">🏃🏾 Running</option>
                          <option value="swimming">🏊🏾 Swimming</option>
                          <option value="tennis">🎾 Tennis</option>
                          <option value="volleyball">🏐 Volleyball</option>
                          <option value="yoga">🧘🏾 Yoga</option>
                          <option value="other">🏆 Other</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Schedule */}
                  {createStep === 2 && (
                    <div className="space-y-4">
                      <p className="text-gray-500 text-sm mb-4">When does your game typically take place each week?</p>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Max Participants *
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={newOrg.maxParticipants}
                          onChange={e => setNewOrg({ ...newOrg, maxParticipants: parseInt(e.target.value) || 30 })}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">Additional people will be placed on the waitlist</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Game Day</label>
                        <select
                          value={newOrg.gameDay}
                          onChange={e => setNewOrg({ ...newOrg, gameDay: parseInt(e.target.value) })}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value={0}>Sunday</option>
                          <option value={1}>Monday</option>
                          <option value={2}>Tuesday</option>
                          <option value={3}>Wednesday</option>
                          <option value={4}>Thursday</option>
                          <option value={5}>Friday</option>
                          <option value={6}>Saturday</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={23}
                              value={newOrg.gameStartHour}
                              onChange={e => setNewOrg({ ...newOrg, gameStartHour: parseInt(e.target.value) || 0 })}
                              className="w-14 px-2 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                            />
                            <span className="text-gray-400">:</span>
                            <input
                              type="number"
                              min={0}
                              max={59}
                              step={5}
                              value={newOrg.gameStartMinute.toString().padStart(2, '0')}
                              onChange={e => setNewOrg({ ...newOrg, gameStartMinute: parseInt(e.target.value) || 0 })}
                              className="w-14 px-2 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={23}
                              value={newOrg.gameEndHour}
                              onChange={e => setNewOrg({ ...newOrg, gameEndHour: parseInt(e.target.value) || 0 })}
                              className="w-14 px-2 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                            />
                            <span className="text-gray-400">:</span>
                            <input
                              type="number"
                              min={0}
                              max={59}
                              step={5}
                              value={newOrg.gameEndMinute.toString().padStart(2, '0')}
                              onChange={e => setNewOrg({ ...newOrg, gameEndMinute: parseInt(e.target.value) || 0 })}
                              className="w-14 px-2 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Schedule Preview */}
                      <div className="bg-blue-50 rounded-lg p-3 mt-2">
                        <p className="text-sm text-blue-800">
                          <span className="font-medium">Preview:</span> Every {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][newOrg.gameDay]}, {newOrg.gameStartHour}:{newOrg.gameStartMinute.toString().padStart(2, '0')} - {newOrg.gameEndHour}:{newOrg.gameEndMinute.toString().padStart(2, '0')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Location */}
                  {createStep === 3 && (
                    <div className="space-y-4">
                      <p className="text-gray-500 text-sm mb-4">Where do you play? This helps people find you.</p>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Area (Lagos) *
                        </label>
                        <select
                          value={newOrg.location}
                          onChange={e => setNewOrg({ ...newOrg, location: e.target.value })}
                          required
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Select area</option>
                          {LAGOS_AREAS.map(area => (
                            <option key={area} value={formatLocation(area)}>
                              {area}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Street Address *
                        </label>
                        <input
                          type="text"
                          value={newOrg.streetAddress}
                          onChange={e => setNewOrg({ ...newOrg, streetAddress: e.target.value })}
                          placeholder="e.g., 15 Adeola Odeku Street"
                          required
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">Specific venue address for players to find you</p>
                      </div>

                      {/* Summary Preview */}
                      <div className="bg-gray-50 rounded-lg p-4 mt-2">
                        <p className="text-sm font-medium text-gray-700 mb-2">Summary</p>
                        <div className="space-y-1 text-sm text-gray-600">
                          <p><span className="text-gray-400">Name:</span> {newOrg.name || '—'}</p>
                          <p><span className="text-gray-400">Sport:</span> {newOrg.sport ? newOrg.sport.charAt(0).toUpperCase() + newOrg.sport.slice(1) : '—'}</p>
                          <p><span className="text-gray-400">Capacity:</span> {newOrg.maxParticipants} players</p>
                          {newOrg.location && <p><span className="text-gray-400">Location:</span> {newOrg.location}</p>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Navigation Buttons */}
                  <div className="flex gap-3 mt-6">
                    {createStep > 1 ? (
                      <button
                        type="button"
                        onClick={() => setCreateStep(createStep - 1)}
                        className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                      >
                        Back
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateForm(false);
                          setError('');
                          setSlugManuallyEdited(false);
                          setSlugStatus({ checking: false, available: null, error: null });
                          setCreateStep(1);
                        }}
                        className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                      >
                        Cancel
                      </button>
                    )}

                    {createStep < 3 ? (
                      <button
                        type="button"
                        onClick={() => {
                          // Validate current step before proceeding
                          if (createStep === 1) {
                            if (!newOrg.name || !newOrg.slug || !newOrg.sport) {
                              setError('Please fill in all required fields');
                              return;
                            }
                            if (slugStatus.available === false) {
                              setError('Please choose an available URL slug');
                              return;
                            }
                          }
                          setError('');
                          setCreateStep(createStep + 1);
                        }}
                        disabled={createStep === 1 && slugStatus.checking}
                        className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                      >
                        Continue
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={creating}
                        className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                      >
                        {creating ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="animate-spin">⏳</span> Creating...
                          </span>
                        ) : (
                          'Create Community'
                        )}
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
