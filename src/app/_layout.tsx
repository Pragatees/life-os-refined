// src/app/_layout.tsx
// Root layout for Expo Router — replaces App.tsx

import { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import {
  initializeNotifications,
  firePermissionGrantedNotification,
} from "../services/notificationService";

export default function RootLayout() {
  // useRef prevents re-running on Fast Refresh / Hot Reload
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const setup = async () => {
      // Sets foreground handler + requests OS permission.
      // Note: the actual "welcome" notification for a successful LOGIN is
      // separate — call useTaskStore.getState().onLoginSuccess(userName)
      // from your auth/login screen once the user is authenticated.
      const result = await initializeNotifications();

      console.log("[App] Notification permission result:", result);

      if (result === "granted") {
        // Brand-new OS-level grant: fire a quick confirmation so the user
        // sees notifications are working, independent of login flow.
        await firePermissionGrantedNotification();
      }

      // "already_granted" → permission existed before, no extra notification
      // "denied"          → user said no, all scheduling is skipped automatically
    };

    setup().catch((e) => {
      console.error("[App] Notification initialization failed:", e);
    });
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}