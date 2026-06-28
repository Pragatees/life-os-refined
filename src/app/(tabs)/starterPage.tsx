import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Starter() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkLogin();
  }, []);

  const checkLogin = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      console.log("Stored Token:", token);

      if (token) {
        router.replace("/(tabs)/dashboard");
      } else {
        setChecking(false);
      }
    } catch (error) {
      console.log("Error reading token:", error);
      setChecking(false);
    }
  };

  const handleGetStarted = () => {
    router.replace("/(auth)/login");
  };

  if (checking) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.logo}>Life-OS</Text>

        <Text style={styles.tagline}>
          Organize your life.
          {"\n"}
          Complete your goals.
          {"\n"}
          Stay productive.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.button}
        activeOpacity={0.8}
        onPress={handleGetStarted}
      >
        <Text style={styles.buttonText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },

  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 25,
    justifyContent: "space-between",
    paddingVertical: 70,
  },

  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  logo: {
    fontSize: 44,
    fontWeight: "bold",
    color: "#2563EB",
    marginBottom: 20,
  },

  tagline: {
    fontSize: 18,
    color: "#555",
    textAlign: "center",
    lineHeight: 30,
  },

  button: {
    backgroundColor: "#2563EB",
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: "center",
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
});