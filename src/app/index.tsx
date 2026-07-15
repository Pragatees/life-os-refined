// src/app/index.tsx

import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    const checkLogin = async () => {
      try {
        const token = await AsyncStorage.getItem("token");

        if (token) {
          router.replace("/(tabs)/dashboard");
        } else {
          router.replace("/(tabs)/starterPage");
        }
      } catch (error) {
        console.error("Error checking login status:", error);
        router.replace("/(tabs)/starterPage");
      }
    };

    checkLogin();
  }, []);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <ActivityIndicator size="large" />
    </View>
  );
}