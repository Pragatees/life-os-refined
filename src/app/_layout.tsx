// src/app/_layout.tsx

import { useEffect, useRef } from "react";
import { Stack } from "expo-router";

import NotificationBootstrap from "../notifications/NotificationBootstrap";

export default function RootLayout() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) {
      return;
    }

    initialized.current = true;

    const initializeApp = async () => {
      try {
        await NotificationBootstrap.initialize();

        await NotificationBootstrap.synchronize();
      } catch (error) {
        console.error(
          "[NotificationBootstrap] Initialization failed:",
          error
        );
      }
    };

    initializeApp();

    return () => {
      NotificationBootstrap.shutdown();
    };
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}