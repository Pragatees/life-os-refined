import React, { useEffect, useRef, useState, Dispatch, SetStateAction } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  ViewStyle,
  TextStyle,
  ImageStyle,
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

type Theme = "bright" | "dark";

// ─── Theme Tokens (Claymorphism) ───────────────────────────────────────────
type ThemeTokens = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  accent: string;
  accentGradient: readonly [string, string];
  textPrimary: string;
  textSecondary: string;
  border: string;
  danger: string;
  shadowDark: string;
};

const DARK: ThemeTokens = {
  bg: "#0A0A0B",
  surface: "#18181B",
  surfaceAlt: "#212124",
  accent: "#FF8A3D",
  accentGradient: ["#FF8A3D", "#FFB25E"],
  textPrimary: "#F5F5F4",
  textSecondary: "#9B9B9F",
  border: "#28282C",
  danger: "#FF6B5B",
  shadowDark: "#000000",
};

const BRIGHT: ThemeTokens = {
  bg: "#F4F4F5",
  surface: "#FFFFFF",
  surfaceAlt: "#EDEDEF",
  accent: "#FF7A2F",
  accentGradient: ["#FF8A3D", "#FF6B1F"],
  textPrimary: "#1C1C1E",
  textSecondary: "#7A7A80",
  border: "#E6E6E9",
  danger: "#EF5A4C",
  shadowDark: "#B9B9C0",
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: Theme;
  onThemeChange: Dispatch<SetStateAction<Theme>>;
}

const STORAGE_KEYS = ["token", "userId", "username", "fullName", "email", "profilePicture", "theme"];

const MENU_ITEMS: {
  label: string;
  path: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { label: "Manage Tasks", path: "/dashboard", icon: "grid-outline" },
  { label: "Daily Journal", path: "/NotesScreen", icon: "book-outline" },
  { label: "Goals", path: "/GoalScreen", icon: "briefcase-outline" },
  { label: "Progress", path: "/HistoryScreen", icon: "bar-chart-outline" },
  { label: "AI Review", path: "/ai_review", icon: "logo-android" },
  { label: "Notifications", path: "/(Notification)/Notificationhistoryscreen", icon: "notifications-outline" },
  { label: "Profile", path: "/profile", icon: "person-outline" },
  { label: "Account Settings", path: "/settings", icon: "settings-outline" }
];

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// ─── Main Component ────────────────────────────────────────────────────────
export default function Sidebar({ onClose, currentTheme, onThemeChange }: SidebarProps) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const isDark = currentTheme === "dark";
  const C: ThemeTokens = isDark ? DARK : BRIGHT;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      const [name, user, picture] = await Promise.all([
        AsyncStorage.getItem("fullName"),
        AsyncStorage.getItem("username"),
        AsyncStorage.getItem("profilePicture"),
      ]);
      if (cancelled) return;
      setFullName(name || "");
      setUsername(user || "");
      setProfilePicture(picture || "");
      setLoading(false);
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    fadeAnim.setValue(0);
    slideAnim.setValue(16);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 360, useNativeDriver: true }),
    ]).start();
  }, [loading, fadeAnim, slideAnim]);

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
    Alert.alert("Log Out", "Are you sure you want to log out?", [
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
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.flex, styles.centered, { backgroundColor: C.bg }]}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  // Only attempt to render the remote image if we actually have a usable URL
  // and it hasn't already failed to load once this session — otherwise fall
  // back to the initials avatar.
  const showImageAvatar = !!profilePicture && !avatarLoadFailed;

  return (
    <View style={[styles.flex, { backgroundColor: C.bg }]}>
      <TouchableOpacity
        style={[
          styles.closeBtn,
          { backgroundColor: C.surfaceAlt, borderColor: C.border, shadowColor: C.shadowDark },
        ]}
        onPress={onClose}
        activeOpacity={0.75}
      >
        <Ionicons name="close-outline" size={20} color={C.textPrimary} />
      </TouchableOpacity>

      <Animated.View
        style={[styles.flex, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* User block */}
          <View style={[cardStyles.card, styles.userCard, { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark }]}>
            {showImageAvatar ? (
              <Image
                source={{ uri: profilePicture }}
                style={[styles.avatar, { backgroundColor: C.surfaceAlt }]}
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <LinearGradient
                colors={C.accentGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{getInitials(fullName || username || "?")}</Text>
              </LinearGradient>
            )}
            <View style={styles.userTextWrap}>
              <Text style={[styles.fullName, { color: C.textPrimary }]} numberOfLines={1}>
                {fullName || "Unnamed User"}
              </Text>
              <Text style={[styles.username, { color: C.textSecondary }]} numberOfLines={1}>
                @{username || "username"}
              </Text>
            </View>
          </View>

          {/* Section label */}
          <Text style={[lbl.text, { color: C.textSecondary }]}>Menu</Text>

          {/* Menu items card */}
          <View style={[cardStyles.card, styles.menuCard, { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark }]}>
            {MENU_ITEMS.map((mi, idx) => (
              <TouchableOpacity
                key={mi.path}
                style={[
                  styles.item,
                  idx !== MENU_ITEMS.length - 1 && [styles.itemDivider, { borderBottomColor: C.border }],
                ]}
                onPress={() => navigateTo(mi.path)}
                activeOpacity={0.7}
              >
                <View style={[styles.itemIconWrap, { backgroundColor: C.accent + "20" }]}>
                  <Ionicons name={mi.icon} size={16} color={C.accent} />
                </View>
                <Text style={[styles.itemText, { color: C.textPrimary }]}>{mi.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Section label */}
          <Text style={[lbl.text, { color: C.textSecondary }]}>Preferences</Text>

          {/* Theme toggle card */}
          <View
            style={[
              cardStyles.card,
              styles.themeCard,
              { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark },
            ]}
          >
            <View style={[styles.itemIconWrap, { backgroundColor: C.accent + "20" }]}>
              <Ionicons name={isDark ? "moon-outline" : "sunny-outline"} size={16} color={C.accent} />
            </View>
            <Text style={[styles.itemText, styles.flex1, { color: C.textPrimary }]}>
              {isDark ? "Dark Mode" : "Light Mode"}
            </Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: C.border, true: C.accent }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Logout */}
          <TouchableOpacity
            style={[
              cardStyles.card,
              styles.logoutCard,
              { backgroundColor: C.danger + "14", borderColor: C.danger + "33", shadowColor: C.shadowDark },
            ]}
            onPress={handleLogout}
            activeOpacity={0.75}
          >
            <Ionicons name="log-out-outline" size={18} color={C.danger} style={styles.iconSpacer} />
            <Text style={[styles.logoutText, { color: C.danger }]}>Log Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex1: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },
  scrollContent: { paddingHorizontal: 18, paddingTop: 64, paddingBottom: 40 },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  } as ViewStyle,
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  } as ViewStyle,
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  } as ViewStyle,
  avatarText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" } as TextStyle,
  userTextWrap: { flex: 1 },
  fullName: { fontSize: 16, fontWeight: "800", letterSpacing: -0.2, marginBottom: 2 } as TextStyle,
  username: { fontSize: 12 } as TextStyle,
  menuCard: { marginBottom: 20, paddingVertical: 4 } as ViewStyle,
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 4,
  } as ViewStyle,
  itemDivider: { borderBottomWidth: 1 } as ViewStyle,
  itemIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  } as ViewStyle,
  itemText: { fontSize: 14, fontWeight: "600", flex: 1 } as TextStyle,
  themeCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  } as ViewStyle,
  logoutCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  } as ViewStyle,
  logoutText: { fontSize: 14, fontWeight: "700" } as TextStyle,
  iconSpacer: { marginRight: 8 },
});

const cardStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 5,
  } as ViewStyle,
});

const lbl = StyleSheet.create({
  text: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 8,
    marginLeft: 4,
  } as TextStyle,
});