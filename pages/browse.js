import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

const sportEmojis = {
  frisbee: '🥏', padel: '🎾', tennis: '🎾', volleyball: '🏐',
  basketball: '🏀', football: '⚽', cycling: '🚴', running: '🏃',
  swimming: '🏊', yoga: '🧘', pickleball: '🏓', other: '🏆',
};

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const timeOfDayOptions = [
  { value: 'morning', label: 'Morning', range: [5, 12] },
  { value: 'afternoon', label: 'Afternoon', range: [12, 17] },
  { value: 'evening', label: 'Evening', range: [17, 24] },
];

// Loading skeleton component
function CardSkeleton() {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 animate-pulse">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
        <div className="flex-1">
          <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-100 rounded w-1/2"></div>
        </div>
      </div>
      <div className="h-4 bg-gray-100 rounded w-2/3 mb-3"></div>
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="h-6 bg-gray-100 rounded-full w-16"></div>
        <div className="h-4 bg-gray-100 rounded w-20"></div>
      </div>
    </div>
  );
}

export default function BrowsePage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState([]);
  const [filters, setFilters] = useState({ sports: [], locations: [], gameDays: [] });
  const [loading, setLoading] = useState(true);
  const [selectedSport, setSelectedSport] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Handle URL query parameters for sport filter
  useEffect(() => {
    if (router.isReady && router.query.sport) {
      setSelectedSport(router.query.sport);
    }
  }, [router.isReady, router.query.sport]);

  useEffect(() => {
    fetchOrganizations();
    checkAuthStatus();

    // Back to top button visibility
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  async function checkAuthStatus() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setIsLoggedIn(!!data.organizer);
      }
    } catch (error) {
      // Not logged in, that's fine
    }
  }

  async function fetchOrganizations() {
    try {
      const res = await fetch('/api/organizations/public');
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.organizations || []);
        setFilters(data.filters || { sports: [], locations: [], gameDays: [] });
      }
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    }
    setLoading(false);
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Filter organizations
  const filteredOrgs = organizations.filter(org => {
    if (selectedSport && org.sport !== selectedSport) return false;
    if (selectedLocation && org.location !== selectedLocation) return false;
    if (selectedDay !== '' && org.gameDay !== parseInt(selectedDay)) return false;
    if (selectedTimeOfDay) {
      const timeOption = timeOfDayOptions.find(t => t.value === selectedTimeOfDay);
      if (timeOption && org.startHour !== null) {
        const [filterStart, filterEnd] = timeOption.range;
        const eventStart = org.startHour;
        const eventEnd = org.endHour !== null ? org.endHour : org.startHour + 1; // Default 1 hour if no end time
        // Check if event duration overlaps with filter time range
        // Overlap exists if event starts before filter ends AND event ends after filter starts
        if (eventStart >= filterEnd || eventEnd <= filterStart) return false;
      } else if (org.startHour === null) {
        return false; // Exclude events without a set time when filtering by time
      }
    }
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

  return (
    <>
      <Head>
        <title>Browse Events - PlayDay</title>
        <meta name="description" content="Find and join sports events near you" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        {/* Header */}
        <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Link href={isLoggedIn ? "/browse" : "/"} className="flex items-center gap-2">
                <span className="text-2xl">🏆</span>
                <span className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors">PlayDay</span>
              </Link>
              {isLoggedIn && (
                <Link
                  href="/dashboard"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  Dashboard
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-8">
          {/* Page Title */}
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
              Find Your Game
            </h1>
            <p className="text-gray-600">
              Browse sports events and sign up to play
            </p>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search events..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                />
              </div>

              {/* Sport Filter */}
              {filters.sports.length > 0 && (
                <div className="md:w-48">
                  <select
                    value={selectedSport}
                    onChange={e => setSelectedSport(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 appearance-none cursor-pointer"
                  >
                    <option value="">All Sports</option>
                    {filters.sports.map(sport => (
                      <option key={sport} value={sport} className="capitalize">
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
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 appearance-none cursor-pointer"
                  >
                    <option value="">All Locations</option>
                    {filters.locations.map(location => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Day of Week Filter */}
              {filters.gameDays.length > 0 && (
                <div className="md:w-44">
                  <select
                    value={selectedDay}
                    onChange={e => setSelectedDay(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 appearance-none cursor-pointer"
                  >
                    <option value="">Any Day</option>
                    {filters.gameDays.map(day => (
                      <option key={day} value={day}>
                        {dayNames[day]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Time of Day Filter */}
              <div className="md:w-40">
                <select
                  value={selectedTimeOfDay}
                  onChange={e => setSelectedTimeOfDay(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 appearance-none cursor-pointer"
                >
                  <option value="">Any Time</option>
                  {timeOfDayOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Active filters */}
            {(selectedSport || selectedLocation || selectedDay !== '' || selectedTimeOfDay) && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="text-gray-500 text-sm">Filters:</span>
                {selectedSport && (
                  <button
                    onClick={() => setSelectedSport('')}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm hover:bg-blue-200 transition-colors"
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
                    className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm hover:bg-green-200 transition-colors"
                  >
                    {selectedLocation}
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {selectedDay !== '' && (
                  <button
                    onClick={() => setSelectedDay('')}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm hover:bg-purple-200 transition-colors"
                  >
                    {dayNames[parseInt(selectedDay)]}
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {selectedTimeOfDay && (
                  <button
                    onClick={() => setSelectedTimeOfDay('')}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm hover:bg-orange-200 transition-colors"
                  >
                    {timeOfDayOptions.find(t => t.value === selectedTimeOfDay)?.label}
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => { setSelectedSport(''); setSelectedLocation(''); setSelectedDay(''); setSelectedTimeOfDay(''); }}
                  className="text-gray-500 hover:text-gray-700 text-sm ml-2"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Results count */}
          {!loading && (
            <p className="text-gray-500 text-sm mb-4">
              {filteredOrgs.length} event{filteredOrgs.length !== 1 ? 's' : ''} found
            </p>
          )}

          {/* Loading Skeletons */}
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : filteredOrgs.length === 0 ? (
            /* Empty State */
            <div className="text-center py-16">
              <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">No events found</h3>
              <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                We couldn't find any events matching your criteria. Try adjusting your filters or search query.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {(selectedSport || selectedLocation || selectedDay !== '' || selectedTimeOfDay || searchQuery) && (
                  <button
                    onClick={() => {
                      setSelectedSport('');
                      setSelectedLocation('');
                      setSelectedDay('');
                      setSelectedTimeOfDay('');
                      setSearchQuery('');
                    }}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
                  >
                    Clear All Filters
                  </button>
                )}
                <Link
                  href={isLoggedIn ? "/dashboard" : "/auth/login"}
                  className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                >
                  Create Your Own Event
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredOrgs.map(org => (
                <Link
                  key={org.slug}
                  href={`/${org.slug}`}
                  className="group bg-white hover:shadow-md border border-gray-100 hover:border-gray-200 rounded-2xl p-5 transition-all"
                >
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-3xl">{sportEmojis[org.sport] || sportEmojis.other}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                        {org.name}
                      </h3>
                      <p className="text-gray-500 text-sm capitalize">{org.sport}</p>
                    </div>
                  </div>

                  {/* Location and Schedule */}
                  <div className="space-y-1 mb-3">
                    {org.location && (
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="truncate">{org.location}</span>
                      </div>
                    )}
                    {org.gameDay !== null && (
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>
                          {dayNames[org.gameDay]}
                          {org.startHour !== null && ` at ${org.startHour > 12 ? org.startHour - 12 : org.startHour || 12}${org.startHour >= 12 ? 'pm' : 'am'}`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        org.isOpen
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {org.isOpen ? 'Open' : 'Closed'}
                      </span>
                    </div>
                    <span className="text-gray-500 text-sm">
                      {org.signupCount}/{org.maxParticipants} signed up
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-200 mt-12 py-6 text-center text-gray-400 text-sm">
          <p>Powered by <Link href="/" className="text-gray-600 hover:text-gray-900">PlayDay</Link></p>
        </footer>

        {/* Back to Top Button */}
        {showBackToTop && (
          <button
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-105 z-50"
            aria-label="Back to top"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        )}
      </div>
    </>
  );
}
