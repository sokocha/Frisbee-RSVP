import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState('login'); // 'login' or 'request'
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [intendedSport, setIntendedSport] = useState('');
  const [intendedLocation, setIntendedLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message || 'Check your email for a login link!');
      } else {
        setError(data.error || 'Failed to send login link');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestAccess(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name,
          intendedSport,
          intendedLocation,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        if (data.status === 'existing') {
          setMessage('Check your email for a login link!');
        } else if (data.status === 'pending') {
          setMessage("Your request has been submitted! You'll receive an email when approved.");
        } else if (data.status === 'approved') {
          setMessage('Welcome! Check your email for a login link.');
        } else {
          setMessage(data.message);
        }
      } else {
        setError(data.error || 'Failed to submit request');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>{mode === 'login' ? 'Log In' : 'Request Access'} - PlayDay</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">PlayDay</h1>
            <p className="text-gray-500">Sports RSVP made simple</p>
          </div>

          {/* Tabs */}
          <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => {
                setMode('login');
                setError(null);
                setMessage(null);
              }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'login'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => {
                setMode('request');
                setError(null);
                setMessage(null);
              }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'request'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Request Access
            </button>
          </div>

          {/* Messages */}
          {message && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
              {message}
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Login Form */}
          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Sending...' : 'Send Login Link'}
              </button>

              <p className="mt-4 text-center text-sm text-gray-500">
                We'll email you a magic link to log in.
              </p>
            </form>
          )}

          {/* Request Access Form */}
          {mode === 'request' && (
            <form onSubmit={handleRequestAccess}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sport you want to organize
                  </label>
                  <select
                    value={intendedSport}
                    onChange={e => setIntendedSport(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    value={intendedLocation}
                    onChange={e => setIntendedLocation(e.target.value)}
                    placeholder="e.g., Lagos, Nigeria"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Submitting...' : 'Request Access'}
              </button>

              <p className="mt-4 text-center text-sm text-gray-500">
                Your request will be reviewed by our team.
              </p>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
