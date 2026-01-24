import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';

// Maximum communities to display on home page
const MAX_COMMUNITIES_DISPLAY = 6;

export default function Landing() {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchOrganizations();
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.organizer);
      }
    } catch (err) {
      // Not logged in, that's fine
    } finally {
      setCheckingAuth(false);
    }
  }

  async function fetchOrganizations() {
    try {
      // Fetch public list of active organizations
      const res = await fetch('/api/public/organizations');
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.organizations || []);
      }
    } catch (err) {
      console.error('Failed to fetch organizations:', err);
    } finally {
      setLoading(false);
    }
  }

  // Filter organizations by search query
  const filteredOrgs = searchQuery
    ? organizations.filter(org =>
        org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        org.sport?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        org.location?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : organizations;

  // Limit displayed organizations - prioritize by signup count (most active)
  const displayedOrgs = filteredOrgs.slice(0, MAX_COMMUNITIES_DISPLAY);
  const hasMoreOrgs = filteredOrgs.length > MAX_COMMUNITIES_DISPLAY;

  const sportEmojis = {
    frisbee: '🥏',
    padel: '🎾',
    tennis: '🎾',
    volleyball: '🏐',
    basketball: '🏀',
    football: '⚽',
    cycling: '🚴',
    running: '🏃',
    swimming: '🏊',
    yoga: '🧘',
    pickleball: '🏓',
    other: '🏆',
  };

  return (
    <>
      <Head>
        <title>PlayDay - Sports RSVP Made Simple</title>
        <meta name="description" content="The easiest way to organize weekly sports sessions. RSVP, manage waitlists, and coordinate with your group." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        {/* Header */}
        <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <nav className="flex justify-between items-center">
            {user ? (
              <Link href="/browse" className="text-2xl font-bold text-gray-900 hover:text-blue-600 transition-colors">
                PlayDay
              </Link>
            ) : (
              <div className="text-2xl font-bold text-gray-900">PlayDay</div>
            )}
            <div className="flex items-center gap-4">
              {checkingAuth ? (
                <div className="w-20 h-8" /> // Placeholder while checking auth
              ) : user ? (
                <Link
                  href="/dashboard"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/auth/login" className="text-gray-600 hover:text-gray-900">
                    Log in
                  </Link>
                  <Link
                    href="/auth/login"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>

        {/* Hero */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-16">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Sports RSVP<br />
              <span className="text-blue-600">Made Simple</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
              The easiest way to organize weekly sports sessions.
              Manage RSVPs, waitlists, and keep your group coordinated.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href={user ? "/dashboard?create=true" : "/auth/login"}
                className="px-8 py-4 bg-blue-600 text-white text-lg font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
              >
                Start Organizing
              </Link>
              <a
                href="#communities"
                className="px-8 py-4 bg-white text-gray-700 text-lg font-medium rounded-xl hover:bg-gray-50 transition-colors border border-gray-200"
              >
                Browse Communities
              </a>
            </div>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-8 mb-20">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Easy RSVPs</h3>
              <p className="text-gray-600">
                One-tap signup. No accounts needed for participants.
                Device-based tracking prevents double signups.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Smart Waitlists</h3>
              <p className="text-gray-600">
                Automatic waitlist management with priority for regulars.
                Members get promoted when spots open up.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Scheduled Windows</h3>
              <p className="text-gray-600">
                Set when RSVPs open and close. Weekly resets keep everything
                fresh and fair for everyone.
              </p>
            </div>
          </div>

          {/* Active Communities */}
          <div id="communities" className="mb-20">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">
              Active Communities
            </h2>

            {/* Search Bar */}
            <div className="max-w-md mx-auto mb-8">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by name, sport, or location..."
                  className="w-full px-4 py-3 pl-11 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
                <svg
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {searchQuery && (
                <p className="text-sm text-gray-500 mt-2 text-center">
                  Found {filteredOrgs.length} {filteredOrgs.length === 1 ? 'community' : 'communities'}
                </p>
              )}
            </div>

            {loading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white p-6 rounded-xl border border-gray-100 animate-pulse">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
                      <div className="flex-1">
                        <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : displayedOrgs.length > 0 ? (
              <>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {displayedOrgs.map(org => (
                    <Link
                      key={org.id}
                      href={`/${org.slug}`}
                      className="block bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all"
                    >
                      <div className="flex items-start gap-4">
                        <div className="text-3xl">
                          {sportEmojis[org.sport] || sportEmojis.other}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{org.name}</h3>
                          <p className="text-sm text-gray-500 capitalize">{org.sport}</p>
                          {org.location && (
                            <p className="text-sm text-gray-400 mt-1">{org.location}</p>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                {hasMoreOrgs && (
                  <div className="text-center mt-8">
                    <Link
                      href="/browse"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                    >
                      View All {organizations.length} Communities
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16">
                <div className="w-24 h-24 mx-auto mb-6 bg-blue-50 rounded-full flex items-center justify-center">
                  <svg className="w-12 h-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                  {searchQuery ? 'No matching communities' : 'No active communities yet'}
                </h3>
                <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                  {searchQuery
                    ? 'Try adjusting your search or be the first to create a community for this sport!'
                    : 'Be the first to create a sports community and start organizing games.'}
                </p>
                <Link
                  href="/auth/login"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
                >
                  Create Your Community
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </Link>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-12 text-center text-white">
            {user ? (
              <>
                <h2 className="text-3xl font-bold mb-4">Create another community?</h2>
                <p className="text-blue-100 mb-8 max-w-xl mx-auto">
                  Add a new organization for a different sport or location.
                </p>
                <Link
                  href="/dashboard"
                  className="inline-block px-8 py-4 bg-white text-blue-600 text-lg font-medium rounded-xl hover:bg-blue-50 transition-colors"
                >
                  Go to Dashboard
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-bold mb-4">Ready to organize your group?</h2>
                <p className="text-blue-100 mb-8 max-w-xl mx-auto">
                  Request organizer access and start managing your sports community in minutes.
                </p>
                <Link
                  href="/auth/login"
                  className="inline-block px-8 py-4 bg-white text-blue-600 text-lg font-medium rounded-xl hover:bg-blue-50 transition-colors"
                >
                  Request Access
                </Link>
              </>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 mt-20 border-t border-gray-200">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-gray-500">
              PlayDay - Sports RSVP made simple
            </div>
            <div className="flex gap-6 text-sm text-gray-500">
              <Link href="/auth/login" className="hover:text-gray-700">
                Organizer Login
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
