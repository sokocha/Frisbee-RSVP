import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Verify() {
  const router = useRouter();
  const { token } = router.query;
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [error, setError] = useState(null);

  useEffect(() => {
    if (token) {
      verifyToken(token);
    }
  }, [token]);

  async function verifyToken(token) {
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus('success');
        // Redirect to dashboard after short delay
        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      } else {
        setStatus('error');
        setError(data.error || 'Invalid or expired link');
      }
    } catch (err) {
      setStatus('error');
      setError('Something went wrong. Please try again.');
    }
  }

  return (
    <>
      <Head>
        <title>Verifying... - PlayDay</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          {status === 'verifying' && (
            <>
              <div className="mb-6">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              </div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Verifying your link...</h1>
              <p className="text-gray-500">Please wait a moment.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mb-6">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">You're logged in!</h1>
              <p className="text-gray-500">Redirecting to your dashboard...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mb-6">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Link Invalid</h1>
              <p className="text-gray-500 mb-6">{error}</p>
              <Link
                href="/auth/login"
                className="inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Request New Link
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
