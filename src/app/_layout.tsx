// src/app/_layout.tsx

import { useEffect, useRef } from "react";
import { Stack } from "expo-router";

import NotificationBootstrap from "../notifications/NotificationBootstrap";
import { useTaskStore } from "../store/task";

export default function RootLayout() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) {
      return;
    }

    initialized.current = true;

    const initializeApp = async () => {
      try {
        // FIX: NotificationBootstrap.synchronize() used to run immediately
        // on mount, before zustand-persist's async rehydration of
        // useTaskStore was guaranteed to have finished. On a cold start on
        // a real device (slower AsyncStorage I/O than a dev machine), this
        // could mean TaskNotificationService.syncTasks() ran against an
        // empty `tasks` array and scheduled nothing, relying entirely on a
        // later screen mount to call fetchTasks() and re-sync. We now
        // explicitly wait for rehydration to complete first.
        await useTaskStore.persist.rehydrate();

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