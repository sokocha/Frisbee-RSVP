import { useState, useEffect, useCallback } from 'react';

const NOTIFICATION_PERMISSION_KEY = 'frisbee-notification-permission';
const SCHEDULED_NOTIFICATIONS_KEY = 'frisbee-scheduled-notifications';

export function useNotifications() {
  const [permission, setPermission] = useState('default');
  const [swRegistration, setSwRegistration] = useState(null);

  // Initialize service worker and check permission
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check current permission
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          setSwRegistration(registration);
          console.log('Service Worker registered');
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return 'denied';
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    localStorage.setItem(NOTIFICATION_PERMISSION_KEY, result);
    return result;
  }, []);

  // Show a local notification immediately
  const showNotification = useCallback(async (title, options = {}) => {
    if (permission !== 'granted') {
      const newPermission = await requestPermission();
      if (newPermission !== 'granted') return false;
    }

    if (swRegistration) {
      await swRegistration.showNotification(title, {
        icon: '/icons/icon-192.svg',
        badge: '/icons/icon-192.svg',
        vibrate: [100, 50, 100],
        ...options
      });
      return true;
    }

    // Fallback to regular notification
    new Notification(title, options);
    return true;
  }, [permission, requestPermission, swRegistration]);

  // Schedule a notification for a specific time using setTimeout
  // This works while the app/tab is open
  const scheduleNotification = useCallback((title, options, triggerTime) => {
    const now = Date.now();
    const delay = triggerTime - now;

    if (delay <= 0) {
      // Time has already passed
      return null;
    }

    const timeoutId = setTimeout(() => {
      showNotification(title, options);
    }, delay);

    // Store scheduled notification info
    const scheduled = JSON.parse(localStorage.getItem(SCHEDULED_NOTIFICATIONS_KEY) || '[]');
    const notificationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    scheduled.push({
      id: notificationId,
      title,
      options,
      triggerTime,
      timeoutId
    });
    localStorage.setItem(SCHEDULED_NOTIFICATIONS_KEY, JSON.stringify(scheduled));

    return notificationId;
  }, [showNotification]);

  // Cancel a scheduled notification
  const cancelScheduledNotification = useCallback((notificationId) => {
    const scheduled = JSON.parse(localStorage.getItem(SCHEDULED_NOTIFICATIONS_KEY) || '[]');
    const notification = scheduled.find(n => n.id === notificationId);

    if (notification && notification.timeoutId) {
      clearTimeout(notification.timeoutId);
    }

    const filtered = scheduled.filter(n => n.id !== notificationId);
    localStorage.setItem(SCHEDULED_NOTIFICATIONS_KEY, JSON.stringify(filtered));
  }, []);

  // Schedule notification for 1 minute before form opens
  const scheduleFormOpeningReminder = useCallback((accessPeriod, timezone = 'Africa/Lagos') => {
    if (!accessPeriod?.enabled) return null;

    // Calculate next opening time
    const now = new Date();
    const { startDay, startHour, startMinute } = accessPeriod;

    // Find the next occurrence of the start day/time
    const nextOpen = new Date(now);
    nextOpen.setHours(startHour, startMinute, 0, 0);

    // Adjust to next occurrence of startDay
    const currentDay = now.getDay();
    let daysUntilOpen = startDay - currentDay;
    if (daysUntilOpen < 0 || (daysUntilOpen === 0 && now >= nextOpen)) {
      daysUntilOpen += 7;
    }
    nextOpen.setDate(nextOpen.getDate() + daysUntilOpen);

    // Schedule for 1 minute before
    const reminderTime = nextOpen.getTime() - 60000; // 1 minute before

    if (reminderTime <= Date.now()) {
      return null; // Already passed
    }

    return scheduleNotification(
      '🥏 Frisbee RSVP Opening Soon!',
      {
        body: 'RSVP form opens in 1 minute. Get ready to claim your spot!',
        tag: 'form-opening-reminder',
        data: { type: 'form-opening', url: '/' }
      },
      reminderTime
    );
  }, [scheduleNotification]);

  return {
    permission,
    swRegistration,
    requestPermission,
    showNotification,
    scheduleNotification,
    cancelScheduledNotification,
    scheduleFormOpeningReminder,
    isSupported: typeof window !== 'undefined' && 'Notification' in window
  };
}

// Hook for tracking main list full notification
export function useMainListFullNotification(mainList, mainListLimit, showNotification) {
  const [notifiedFull, setNotifiedFull] = useState(false);

  useEffect(() => {
    // Check if main list just became full
    if (mainList.length >= mainListLimit && !notifiedFull) {
      setNotifiedFull(true);
      showNotification('🥏 Main List is Full!', {
        body: `All ${mainListLimit} spots have been claimed. You can still join the waitlist.`,
        tag: 'main-list-full',
        data: { type: 'main-list-full', url: '/' }
      });
    } else if (mainList.length < mainListLimit) {
      setNotifiedFull(false);
    }
  }, [mainList.length, mainListLimit, notifiedFull, showNotification]);
}

// Hook for tracking waitlist promotion
export function useWaitlistPromotionNotification(mySignup, mainList, showNotification) {
  const [wasOnWaitlist, setWasOnWaitlist] = useState(false);

  useEffect(() => {
    if (!mySignup) {
      setWasOnWaitlist(false);
      return;
    }

    const isNowOnMainList = mainList.some(p => p.id === mySignup.id);

    // If user was on waitlist and is now on main list, notify them
    if (wasOnWaitlist && isNowOnMainList) {
      const position = mainList.findIndex(p => p.id === mySignup.id) + 1;
      showNotification('🎉 You\'ve Been Promoted!', {
        body: `Great news! You're now #${position} on the main list!`,
        tag: 'waitlist-promotion',
        data: { type: 'waitlist-promotion', url: '/' }
      });
      setWasOnWaitlist(false);
    } else if (!isNowOnMainList && mySignup) {
      setWasOnWaitlist(true);
    }
  }, [mySignup, mainList, wasOnWaitlist, showNotification]);
}
