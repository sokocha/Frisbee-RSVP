import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // New org form state
  const [newOrg, setNewOrg] = useState({
    name: '',
    slug: '',
    sport: '',
    location: '',
    timezone: 'Africa/Lagos',
  });
  const [slugStatus, setSlugStatus] = useState({ checking: false, available: null, error: null });

  useEffect(() => {
    fetchUserData();
  }, []);

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

  function handleSlugChange(e) {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setNewOrg({ ...newOrg, slug: value });

    // Debounce slug check
    clearTimeout(window.slugCheckTimeout);
    window.slugCheckTimeout = setTimeout(() => checkSlug(value), 300);
  }

  async function handleCreateOrg(e) {
    e.preventDefault();
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

      setOrganizations([...organizations, data.organization]);
      setShowCreateForm(false);
      setNewOrg({ name: '', slug: '', sport: '', location: '', timezone: 'Africa/Lagos' });
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
            <div>
              <h1 className="text-2xl font-bold text-gray-900">PlayDay</h1>
              <p className="text-sm text-gray-500">Welcome, {user?.name}</p>
            </div>
            <div className="flex items-center gap-4">
              {user?.isSuperAdmin && (
                <a
                  href="/super-admin"
                  className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                >
                  Super Admin
                </a>
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
          {/* Organizations */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Your Organizations</h2>
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Create Organization
              </button>
            </div>

            {organizations.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-gray-500 mb-4">You don't have any organizations yet.</p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Create your first organization
                </button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {organizations.map(org => (
                  <div
                    key={org.id}
                    className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{org.name}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        org.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {org.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-1 capitalize">{org.sport}</p>
                    {org.location && (
                      <p className="text-sm text-gray-400 mb-4">{org.location}</p>
                    )}
                    <div className="flex gap-2">
                      <a
                        href={`/${org.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        View Page
                      </a>
                      <a
                        href={`/${org.slug}/admin`}
                        className="flex-1 text-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Manage
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Create Organization Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold mb-4">Create Organization</h3>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateOrg}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Organization Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newOrg.name}
                      onChange={e => setNewOrg({ ...newOrg, name: e.target.value })}
                      placeholder="e.g., Lagos Padel Club"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      URL Slug *
                    </label>
                    <div className="flex items-center">
                      <span className="text-gray-500 text-sm mr-1">playday.app/</span>
                      <input
                        type="text"
                        required
                        value={newOrg.slug}
                        onChange={handleSlugChange}
                        placeholder="lagos-padel"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    {slugStatus.checking && (
                      <p className="text-sm text-gray-500 mt-1">Checking availability...</p>
                    )}
                    {slugStatus.available === true && (
                      <p className="text-sm text-green-600 mt-1">This slug is available!</p>
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
                      required
                      value={newOrg.sport}
                      onChange={e => setNewOrg({ ...newOrg, sport: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select a sport</option>
                      <option value="frisbee">Frisbee</option>
                      <option value="padel">Padel</option>
                      <option value="tennis">Tennis</option>
                      <option value="volleyball">Volleyball</option>
                      <option value="basketball">Basketball</option>
                      <option value="football">Football</option>
                      <option value="cycling">Cycling</option>
                      <option value="running">Running</option>
                      <option value="swimming">Swimming</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={newOrg.location}
                      onChange={e => setNewOrg({ ...newOrg, location: e.target.value })}
                      placeholder="e.g., Victoria Island, Lagos"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Timezone
                    </label>
                    <select
                      value={newOrg.timezone}
                      onChange={e => setNewOrg({ ...newOrg, timezone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
                      <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
                      <option value="Africa/Johannesburg">Africa/Johannesburg (SAST)</option>
                      <option value="Europe/London">Europe/London (GMT/BST)</option>
                      <option value="Europe/Paris">Europe/Paris (CET)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setError('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || slugStatus.available === false}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
