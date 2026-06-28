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
      // Sets foreground handler + requests OS permission
      const result = await initializeNotifications();

      console.log("[App] Notification permission result:", result);

      if (result === "granted") {
        // Brand-new grant: fire an immediate notification so the user sees
        // that notifications are working right away.
        // This also confirms the channel/handler setup is correct.
        await firePermissionGrantedNotification();
      }

      // "already_granted" → permission existed before, no welcome notification
      // "denied"          → user said no, all scheduling is skipped automatically
    };

    setup().catch((e) => {
      console.error("[App] Notification initialization failed:", e);
    });
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}