import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

const SITE_KEY = '0x4AAAAAADQl-NHcRm5Nppee';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise = null;
function loadTurnstileScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = (e) => {
      scriptPromise = null;
      reject(e);
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

const Turnstile = forwardRef(function Turnstile({ onToken, onError, action = 'rsvp' }, ref) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const tokenRef = useRef(null);

  useImperativeHandle(ref, () => ({
    getToken: () => tokenRef.current,
    reset: () => {
      tokenRef.current = null;
      if (typeof window !== 'undefined' && window.turnstile && widgetIdRef.current !== null) {
        window.turnstile.reset(widgetIdRef.current);
      }
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || widgetIdRef.current !== null) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          action,
          callback: (token) => {
            tokenRef.current = token;
            onToken?.(token);
          },
          'expired-callback': () => {
            tokenRef.current = null;
            if (window.turnstile && widgetIdRef.current !== null) {
              window.turnstile.reset(widgetIdRef.current);
            }
          },
          'error-callback': () => {
            tokenRef.current = null;
            onError?.();
          },
        });
      })
      .catch(() => onError?.());
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined' && window.turnstile && widgetIdRef.current !== null) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [onToken, onError, action]);

  return <div ref={containerRef} className="flex justify-center my-2" />;
});

export default Turnstile;
