import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const sportEmojis = {
  frisbee: '🥏', padel: '🎾', tennis: '🎾', volleyball: '🏐',
  basketball: '🏀', football: '⚽', cycling: '🚴', running: '🏃',
  swimming: '🏊', pickleball: '🏓', other: '🏆',
};

export default function BrowsePage() {
  const [organizations, setOrganizations] = useState([]);
  const [filters, setFilters] = useState({ sports: [], locations: [] });
  const [loading, setLoading] = useState(true);
  const [selectedSport, setSelectedSport] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchOrganizations();
  }, []);

  async function fetchOrganizations() {
    try {
      const res = await fetch('/api/organizations/public');
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.organizations || []);
        setFilters(data.filters || { sports: [], locations: [] });
      }
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    }
    setLoading(false);
  }

  // Filter organizations
  const filteredOrgs = organizations.filter(org => {
    if (selectedSport && org.sport !== selectedSport) return false;
    if (selectedLocation && org.location !== selectedLocation) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        org.name.toLowerCase().includes(query) ||
        org.sport?.toLowerCase().includes(query) ||
        org.location?.toLowerCase().includes(query)
      );
    }
    return true;
  });

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
        <title>Browse Events - PlayDay</title>
        <meta name="description" content="Find and join sports events near you" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        {/* Header */}
        <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <span className="text-2xl">🏆</span>
                <span className="text-xl font-bold text-white">PlayDay</span>
              </Link>
              <Link
                href="/"
                className="text-white/70 hover:text-white text-sm"
              >
                Home
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-8">
          {/* Page Title */}
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              Find Your Game
            </h1>
            <p className="text-white/60">
              Browse sports events and sign up to play
            </p>
          </div>

          {/* Filters */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search events..."
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                />
              </div>

              {/* Sport Filter */}
              {filters.sports.length > 0 && (
                <div className="md:w-48">
                  <select
                    value={selectedSport}
                    onChange={e => setSelectedSport(e.target.value)}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-white/40 appearance-none cursor-pointer"
                  >
                    <option value="" className="bg-gray-800">All Sports</option>
                    {filters.sports.map(sport => (
                      <option key={sport} value={sport} className="bg-gray-800 capitalize">
                        {sport.charAt(0).toUpperCase() + sport.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Location Filter */}
              {filters.locations.length > 0 && (
                <div className="md:w-64">
                  <select
                    value={selectedLocation}
                    onChange={e => setSelectedLocation(e.target.value)}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-white/40 appearance-none cursor-pointer"
                  >
                    <option value="" className="bg-gray-800">All Locations</option>
                    {filters.locations.map(location => (
                      <option key={location} value={location} className="bg-gray-800">
                        {location}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Active filters */}
            {(selectedSport || selectedLocation) && (
              <div className="flex items-center gap-2 mt-3">
                <span className="text-white/50 text-sm">Filters:</span>
                {selectedSport && (
                  <button
                    onClick={() => setSelectedSport('')}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm"
                  >
                    {selectedSport}
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {selectedLocation && (
                  <button
                    onClick={() => setSelectedLocation('')}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-sm"
                  >
                    {selectedLocation}
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => { setSelectedSport(''); setSelectedLocation(''); }}
                  className="text-white/50 hover:text-white text-sm ml-2"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Results count */}
          <p className="text-white/50 text-sm mb-4">
            {filteredOrgs.length} event{filteredOrgs.length !== 1 ? 's' : ''} found
          </p>

          {/* Organization Cards */}
          {filteredOrgs.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">🔍</div>
              <p className="text-white/70 text-lg mb-2">No events found</p>
              <p className="text-white/50 text-sm">Try adjusting your filters or search query</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredOrgs.map(org => (
                <Link
                  key={org.slug}
                  href={`/${org.slug}`}
                  className="group bg-white/10 hover:bg-white/15 backdrop-blur-sm border border-white/10 hover:border-white/20 rounded-2xl p-5 transition-all"
                >
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-3xl">{sportEmojis[org.sport] || sportEmojis.other}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white truncate group-hover:text-blue-300 transition-colors">
                        {org.name}
                      </h3>
                      <p className="text-white/50 text-sm capitalize">{org.sport}</p>
                    </div>
                  </div>

                  {/* Location */}
                  {org.location && (
                    <div className="flex items-center gap-2 text-white/60 text-sm mb-3">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="truncate">{org.location}</span>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        org.isOpen
                          ? 'bg-green-500/20 text-green-300'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {org.isOpen ? 'Open' : 'Closed'}
                      </span>
                    </div>
                    <span className="text-white/50 text-sm">
                      {org.signupCount}/{org.maxParticipants} signed up
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-white/10 mt-12 py-6 text-center text-white/40 text-sm">
          <p>Powered by <Link href="/" className="text-white/60 hover:text-white">PlayDay</Link></p>
        </footer>
      </div>
    </>
  );
}
