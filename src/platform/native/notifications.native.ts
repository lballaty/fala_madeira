// File: src/platform/native/notifications.native.ts
// Description: Native (Capacitor) NotificationsAdapter on top of @capacitor/local-notifications.
//   The plugin requires numeric (int32) notification ids, so the adapter's stable string ids
//   are mapped through a deterministic FNV-1a hash — the same string always yields the same
//   number, so scheduling replaces pending notifications and cancel() works across sessions.
//   Plugin import is DYNAMIC so the web bundle never pulls Capacitor plugin code in.
//   TODO(ios-build): verify the iOS permission prompt copy and add any needed
//   capability/entitlement configuration in Xcode (no Info.plist key is required for
//   local notifications, but prompt timing/UX should be validated on device).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import {
  NotificationPermissionState,
  NotificationsAdapter,
  PlatformError,
  ScheduledNotification,
} from '../types';
import { logger } from '../../lib/logger';

// Deterministic string → signed int32 id (FNV-1a, folded to the int32 range the
// plugin requires on iOS/Android). Collisions are astronomically unlikely for
// the app's small reminder set; a collision would only merge two reminders.
const toNumericId = (id: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
};

const mapPermission = (state: string): NotificationPermissionState => {
  switch (state) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'prompt':
    case 'prompt-with-rationale':
      return 'prompt';
    default:
      return 'unsupported';
  }
};

export const createNativeNotificationsAdapter = (): NotificationsAdapter => {
  // Dynamic import keeps @capacitor/local-notifications out of the web bundle.
  let pluginPromise: Promise<typeof import('@capacitor/local-notifications')> | null = null;

  const plugin = async () => {
    pluginPromise ??= import('@capacitor/local-notifications');
    return (await pluginPromise).LocalNotifications;
  };

  return {
    // Local notifications are always present in the native shell (the plugin
    // ships with the app); permission state is a separate question answered
    // by requestPermission().
    isAvailable: () => true,

    async requestPermission(): Promise<NotificationPermissionState> {
      try {
        const ln = await plugin();
        const { display } = await ln.requestPermissions();
        return mapPermission(display);
      } catch (error) {
        logger.warn('NATIVE_NOTIFICATION_PERMISSION_FAILED', 'native notification permission request failed', {
          category: 'SYSTEM_HEALTH',
          error,
        });
        return 'unsupported';
      }
    },

    async schedule(notification: ScheduledNotification): Promise<void> {
      try {
        const ln = await plugin();
        await ln.schedule({
          notifications: [
            {
              id: toNumericId(notification.id),
              title: notification.title,
              body: notification.body ?? '',
              // Omitted or past `at` = show immediately (plugin fires
              // undated notifications right away).
              ...(notification.at && notification.at > Date.now()
                ? { schedule: { at: new Date(notification.at) } }
                : {}),
            },
          ],
        });
      } catch (e) {
        throw new PlatformError(
          'notifications',
          'unknown',
          'Could not schedule the reminder on this device.',
          e instanceof Error ? e.message : String(e),
        );
      }
    },

    async cancel(id: string): Promise<void> {
      try {
        const ln = await plugin();
        await ln.cancel({ notifications: [{ id: toNumericId(id) }] });
      } catch (error) {
        logger.warn('NATIVE_NOTIFICATION_CANCEL_FAILED', 'native notification cancel failed; ignoring missing or stale notification', {
          category: 'SYSTEM_HEALTH',
          error,
          details: { id },
        });
        // Cancelling a notification that was never scheduled is a no-op.
      }
    },
  };
};
