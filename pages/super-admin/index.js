import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function SuperAdmin() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [organizers, setOrganizers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      // Check auth
      const authRes = await fetch('/api/auth/me');
      if (authRes.status === 401) {
        router.push('/auth/login');
        return;
      }
      const authData = await authRes.json();

      if (!authData.organizer.isSuperAdmin) {
        router.push('/dashboard');
        return;
      }

      setUser(authData.organizer);

      // Fetch organizers
      const orgRes = await fetch('/api/super-admin/organizers');
      const orgData = await orgRes.json();
      setOrganizers(orgData.organizers || []);

      // Fetch all organizations
      const orgsRes = await fetch('/api/organizations');
      const orgsData = await orgsRes.json();
      setOrganizations(orgsData.organizations || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleOrganizerAction(organizerId, action) {
    setActionLoading(organizerId);

    try {
      const res = await fetch('/api/super-admin/organizers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, organizerId }),
      });

      if (res.ok) {
        // Refresh data
        await fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Action failed');
      }
    } catch (err) {
      alert('Action failed');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  const pendingOrganizers = organizers.filter(o => o.status === 'pending');
  const approvedOrganizers = organizers.filter(o => o.status === 'approved');
  const rejectedOrganizers = organizers.filter(o => o.status === 'rejected');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Super Admin - PlayDay</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-purple-600 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">PlayDay Super Admin</h1>
              <p className="text-sm text-purple-200">{user?.email}</p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-sm text-purple-200 hover:text-white">
                Dashboard
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm text-purple-200 hover:text-white"
              >
                Log out
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-500">Pending Requests</p>
              <p className="text-2xl font-bold text-yellow-600">{pendingOrganizers.length}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-500">Approved Organizers</p>
              <p className="text-2xl font-bold text-green-600">{approvedOrganizers.length}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-500">Total Communities</p>
              <p className="text-2xl font-bold text-blue-600">{organizations.length}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-500">Rejected</p>
              <p className="text-2xl font-bold text-gray-600">{rejectedOrganizers.length}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex gap-6">
              {[
                { id: 'pending', label: 'Pending', count: pendingOrganizers.length },
                { id: 'approved', label: 'Approved', count: approvedOrganizers.length },
                { id: 'organizations', label: 'Communities', count: organizations.length },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-purple-600 text-purple-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                      activeTab === tab.id
                        ? 'bg-purple-100 text-purple-600'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Pending Requests */}
          {activeTab === 'pending' && (
            <div className="bg-white rounded-lg border border-gray-200">
              {pendingOrganizers.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No pending requests
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {pendingOrganizers.map(org => (
                    <div key={org.id} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{org.name}</p>
                        <p className="text-sm text-gray-500">{org.email}</p>
                        <div className="flex gap-4 mt-1 text-xs text-gray-400">
                          {org.intendedSport && <span>Sport: {org.intendedSport}</span>}
                          {org.intendedLocation && <span>Location: {org.intendedLocation}</span>}
                          <span>Requested: {new Date(org.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOrganizerAction(org.id, 'approve')}
                          disabled={actionLoading === org.id}
                          className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionLoading === org.id ? '...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleOrganizerAction(org.id, 'reject')}
                          disabled={actionLoading === org.id}
                          className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Approved Organizers */}
          {activeTab === 'approved' && (
            <div className="bg-white rounded-lg border border-gray-200">
              {approvedOrganizers.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No approved organizers
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {approvedOrganizers.map(org => (
                    <div key={org.id} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{org.name}</p>
                        <p className="text-sm text-gray-500">{org.email}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Approved: {org.approvedAt ? new Date(org.approvedAt).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                        Active
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Communities */}
          {activeTab === 'organizations' && (
            <div className="bg-white rounded-lg border border-gray-200">
              {organizations.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No communities yet
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {organizations.map(org => (
                    <div key={org.id} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{org.name}</p>
                        <div className="flex gap-4 text-sm text-gray-500">
                          <span>/{org.slug}</span>
                          <span className="capitalize">{org.sport}</span>
                          {org.location && <span>{org.location}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          org.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {org.status}
                        </span>
                        <a
                          href={`/${org.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 text-sm"
                        >
                          View
                        </a>
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
