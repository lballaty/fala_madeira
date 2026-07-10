// File: src/platform/web/notifications.web.ts
// Description: Web implementation of NotificationsAdapter using the Notification API.
//   Immediate notifications show right away; future-dated ones are scheduled with a
//   session-scoped timer (the web platform has no persistent local scheduling without
//   a push service — schedule() is a documented no-op when unsupported, and callers
//   gate reminder UX on isAvailable()).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import {
  NotificationPermissionState,
  NotificationsAdapter,
  PlatformError,
  ScheduledNotification,
} from '../types';

const notificationCtor = (): typeof Notification | null => {
  const w = globalThis as { Notification?: unknown };
  return typeof w.Notification === 'function' ? (w.Notification as typeof Notification) : null;
};

const mapPermission = (permission: NotificationPermission): NotificationPermissionState => {
  switch (permission) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    default:
      return 'prompt';
  }
};

export const createWebNotificationsAdapter = (): NotificationsAdapter => {
  // Session-scoped pending timers keyed by notification id.
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const show = (notification: ScheduledNotification) => {
    const Ctor = notificationCtor();
    if (!Ctor || Ctor.permission !== 'granted') return;
    // Fire-and-forget: the Notification displays on construction.
    new Ctor(notification.title, { body: notification.body, tag: notification.id });
  };

  return {
    isAvailable: () => notificationCtor() !== null,

    async requestPermission(): Promise<NotificationPermissionState> {
      const Ctor = notificationCtor();
      if (!Ctor) return 'unsupported';
      if (Ctor.permission === 'granted' || Ctor.permission === 'denied') {
        return mapPermission(Ctor.permission);
      }
      try {
        return mapPermission(await Ctor.requestPermission());
      } catch (e) {
        throw new PlatformError(
          'notifications',
          'permission-denied',
          'Notification permission could not be requested.',
          e instanceof Error ? e.message : String(e),
        );
      }
    },

    async schedule(notification: ScheduledNotification): Promise<void> {
      const Ctor = notificationCtor();
      if (!Ctor) return; // unsupported platform — documented no-op

      // Re-scheduling the same id replaces the pending notification.
      const existing = pending.get(notification.id);
      if (existing !== undefined) {
        clearTimeout(existing);
        pending.delete(notification.id);
      }

      const delay = (notification.at ?? 0) - Date.now();
      if (delay <= 0) {
        show(notification);
        return;
      }
      const timer = setTimeout(() => {
        pending.delete(notification.id);
        show(notification);
      }, delay);
      pending.set(notification.id, timer);
    },

    async cancel(id: string): Promise<void> {
      const timer = pending.get(id);
      if (timer !== undefined) {
        clearTimeout(timer);
        pending.delete(id);
      }
    },
  };
};
