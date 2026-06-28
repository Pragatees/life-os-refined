import React, { useEffect, useState, Dispatch, SetStateAction } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

type Theme = "bright" | "dark";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: Theme;
  onThemeChange: Dispatch<SetStateAction<Theme>>;
}

const STORAGE_KEYS = ["token", "userId", "username", "fullName", "email", "theme"];

export default function Sidebar({
  onClose,
  currentTheme,
  onThemeChange,
}: SidebarProps) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);

  const isDark = currentTheme === "dark";

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      const [name, user] = await Promise.all([
        AsyncStorage.getItem("fullName"),
        AsyncStorage.getItem("username"),
      ]);
      if (cancelled) return;
      setFullName(name || "");
      setUsername(user || "");
      setLoading(false);
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleTheme = async (value: boolean) => {
    const next: Theme = value ? "dark" : "bright";
    onThemeChange(next);
    await AsyncStorage.setItem("theme", next);
  };

  const navigateTo = (path: string) => {
    onClose();
    router.push(path as any);
  };

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove(STORAGE_KEYS);
              onThemeChange("bright");
              onClose();
              router.replace("/login" as any);
            } catch (error) {
              Alert.alert("Error", "Something went wrong while logging out. Please try again.");
            }
          },
        },
      ]
    );
  };

  const t = isDark ? dark : light;

  if (loading) {
    return (
      <View style={[styles.container, t.container]}>
        <ActivityIndicator color={isDark ? "#fff" : "#2563eb"} />
      </View>
    );
  }

  return (
    <View style={[styles.container, t.container]}>
      <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.75}>
        <Ionicons name="close-outline" size={24} color={t.primary.color} />
      </TouchableOpacity>

      <View style={styles.userBlock}>
        <Text style={[styles.fullName, t.primary]}>{fullName}</Text>
        <Text style={[styles.username, t.secondary]}>@{username}</Text>
      </View>

      <View style={[styles.divider, t.divider]} />

      <TouchableOpacity style={styles.item} onPress={() => navigateTo("/profile")}>
        <Text style={[styles.itemText, t.primary]}>Profile</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.item} onPress={() => navigateTo("/dashboard")}>
        <Text style={[styles.itemText, t.primary]}>Dashboard</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.item} onPress={() => navigateTo("/settings")}>
        <Text style={[styles.itemText, t.primary]}>Account Settings</Text>
      </TouchableOpacity>

      <View style={[styles.divider, t.divider]} />

      <View style={styles.themeRow}>
        <Text style={[styles.itemText, t.primary]}>
          {isDark ? "Dark Mode" : "Light Mode"}
        </Text>
        <Switch
          value={isDark}
          onValueChange={toggleTheme}
          trackColor={{ false: "#d1d5db", true: "#2563eb" }}
          thumbColor="#ffffff"
        />
      </View>

      <View style={styles.spacer} />

      <View style={[styles.divider, t.divider]} />

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.75}>
        <Ionicons name="log-out-outline" size={20} color="#ef4444" />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    padding: 4,
    zIndex: 10,
  },
  userBlock: { marginBottom: 24 },
  fullName: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  username: { fontSize: 14 },
  divider: { height: 1, marginVertical: 12 },
  item: { paddingVertical: 14 },
  itemText: { fontSize: 16 },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  spacer: { flex: 1 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
  },
  logoutText: {
    fontSize: 16,
    color: "#ef4444",
    fontWeight: "600",
  },
});

const light = StyleSheet.create({
  container: { backgroundColor: "#ffffff" },
  primary: { color: "#111827" },
  secondary: { color: "#6b7280" },
  divider: { backgroundColor: "#e5e7eb" },
});

const dark = StyleSheet.create({
  container: { backgroundColor: "#111827" },
  primary: { color: "#f9fafb" },
  secondary: { color: "#9ca3af" },
  divider: { backgroundColor: "#374151" },
});