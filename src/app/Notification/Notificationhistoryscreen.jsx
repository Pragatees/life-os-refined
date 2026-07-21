// src/app/Notification/Notificationhistoryscreen.jsx
//
// Displays two tabs: Upcoming (live, from Expo's pending list) and Missed
// (from NotificationHistoryService's persisted log — see that file's
// header comment for why this needs its own storage-backed history).
//
// Route: "/Notification/Notificationhistoryscreen"
// Link to it from anywhere with: router.push("/Notification/Notificationhistoryscreen")
//
// FIX: As of Expo SDK 56, expo-router is no longer compatible with
// react-navigation — importing anything from "@react-navigation/native"
// directly (even just for a hook like useFocusEffect) breaks the Metro
// bundle with:
//   "As of SDK 56, expo-router is no longer compatible with react-navigation"
// expo-router now re-exports the hooks you need itself. useFocusEffect
// below comes from "expo-router", not "@react-navigation/native".
//
// FIX: import paths corrected for this file's actual location
// (src/app/Notification/Notificationhistoryscreen.jsx). From here,
// "../../notifications/core/..." resolves to src/notifications/core/...
//
// FIX: header no longer relies on SafeAreaView's top inset alone — on
// several Android devices with a punch-hole/selfie camera, SafeAreaView's
// default inset sits above the cutout, not below it, so header content
// rendered under/behind the camera. Replaced with the dashboard's manual
// paddingTop strategy (StatusBar.currentHeight on Android, fixed 50 on iOS).
//
// SIDEBAR: integrated the same slide-in Sidebar used on the dashboard
// (app/(tabs)/sidebar), with identical animation timing/easing. UPDATED:
// panel is now pinned to the LEFT edge (left: 0, no `right` set) and
// translateX starts at -sidebarWidth so it slides in from the left side
// of the screen instead of the right. Rounded corners, border, and shadow
// direction were all flipped to match (rounded on the RIGHT edge of the
// panel now, shadow falls to the right). The menu button has been moved
// to the left side with the back button now on the right side.

import { useCallback, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TouchableOpacity,
  TouchableWithoutFeedback,
  RefreshControl,
  ActivityIndicator,
  Platform,
  StatusBar,
  Animated,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import NotificationHistoryService from "../../notifications/core/Notificationhistoryservice";
import { NotificationType } from "../../notifications/core/NotificationTypes";
// ⚠️ Verify this path against your actual folder structure.
import Sidebar from "../(tabs)/sidebar";

// ─── Theme Tokens (Claymorphism) ───────────────────────────────────────────
// Kept identical in shape/values to app/(dashboard)/index.tsx so both
// screens always look like the same app.
const DARK = {
  bg: "#0A0A0B",
  surface: "#18181B",
  surfaceAlt: "#212124",
  accent: "#FF8A3D",
  accentSoft: "#3A2617",
  success: "#3DD68C",
  warning: "#FFC24B",
  danger: "#FF6B5B",
  dangerSoft: "#3A1E1A",
  textPrimary: "#F5F5F4",
  textSecondary: "#9B9B9F",
  border: "#28282C",
  shadowDark: "#000000",
};

const BRIGHT = {
  bg: "#F4F4F5",
  surface: "#FFFFFF",
  surfaceAlt: "#EDEDEF",
  accent: "#FF7A2F",
  accentSoft: "#FFE4CE",
  success: "#22B573",
  warning: "#F0A93B",
  danger: "#EF5A4C",
  dangerSoft: "#FDEBEA",
  textPrimary: "#1C1C1E",
  textSecondary: "#7A7A80",
  border: "#E6E6E9",
  shadowDark: "#B9B9C0",
};

const TYPE_LABELS = {
  [NotificationType.TASK]: "Task",
  [NotificationType.GOAL]: "Goal",
  [NotificationType.NOTE]: "Note",
  [NotificationType.AI_REVIEW]: "AI Review",
  [NotificationType.ACCOUNT]: "Account",
  [NotificationType.ROUTINE]: "Routine",
  [NotificationType.SYSTEM]: "System",
};

const SCREEN_BY_TYPE = {
  [NotificationType.TASK]: "/dashboard",
  [NotificationType.GOAL]: "/GoalScreen",
  [NotificationType.NOTE]: "/NotesScreen",
  [NotificationType.AI_REVIEW]: "/ai_review",
  [NotificationType.ACCOUNT]: "/profile",
  [NotificationType.ROUTINE]: "/dashboard",
  [NotificationType.SYSTEM]: "/",
};

const getSidebarWidth = () => Math.min(300, Dimensions.get("window").width * 0.8);

export default function NotificationHistoryScreen() {
  const [theme, setTheme] = useState("dark"); // "bright" | "dark"
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [upcoming, setUpcoming] = useState([]);
  const [missed, setMissed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Sidebar state (mirrors dashboard) ──────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(getSidebarWidth());

  // Starts off-screen to the LEFT (negative value, equal to the panel's
  // own width) so it slides in from the left edge toward translateX: 0.
  const translateX = useRef(new Animated.Value(-getSidebarWidth())).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", () => {
      const w = getSidebarWidth();
      setSidebarWidth(w);
      if (!sidebarOpen) translateX.setValue(-w);
    });
    return () => subscription.remove();
  }, [sidebarOpen]);

  useEffect(() => {
    if (sidebarOpen) {
      setSidebarMounted(true);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        // Closing slides back out to the LEFT (negative), not the right.
        Animated.timing(translateX, { toValue: -sidebarWidth, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setSidebarMounted(false);
      });
    }
  }, [sidebarOpen, sidebarWidth]);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // ── Theme: load + persist (same AsyncStorage key as the dashboard) ────
  const loadTheme = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem("theme");
      if (saved === "bright" || saved === "dark") {
        setTheme(saved);
      }
    } catch (error) {
      console.error("Error loading theme:", error);
    } finally {
      setThemeLoaded(true);
    }
  }, []);

  // Persist theme changes made from this screen's sidebar too, not just
  // state — otherwise it wouldn't survive an app restart.
  const handleThemeChange = useCallback(async (next) => {
    setTheme(next);
    try {
      await AsyncStorage.setItem("theme", next);
    } catch (error) {
      console.error("Error saving theme:", error);
    }
  }, []);

  const load = useCallback(async () => {
    const [upcomingList, missedList] = await Promise.all([
      NotificationHistoryService.getUpcoming(),
      NotificationHistoryService.getMissed(),
    ]);

    setUpcoming(upcomingList);
    setMissed(missedList);
  }, []);

  // Reload every time the screen gains focus — trigger times keep moving
  // forward, so "missed" needs to be re-reconciled on every visit rather
  // than once on mount. Theme is re-read here too, in case it was changed
  // on another screen since our last visit.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        setLoading(true);
        await Promise.all([loadTheme(), load()]);
        if (!cancelled) setLoading(false);
      })();

      return () => {
        cancelled = true;
      };
    }, [load, loadTheme])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadTheme(), load()]);
    setRefreshing(false);
  }, [load, loadTheme]);

  const handlePress = (entry) => {
    const type = entry.payload?.type;
    const screen = (type && SCREEN_BY_TYPE[type]) || "/dashboard";
    router.push(screen);
  };

  const C = theme === "bright" ? BRIGHT : DARK;
  const data = activeTab === "upcoming" ? upcoming : missed;

  if (!themeLoaded) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: DARK.bg }]}>
        <View style={[styles.loadingClay, { backgroundColor: DARK.surface, shadowColor: DARK.shadowDark }]}>
          <ActivityIndicator size="large" color={DARK.accent} />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: C.bg, paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 50 },
      ]}
    >
      <StatusBar
        barStyle={theme === "bright" ? "dark-content" : "light-content"}
        backgroundColor={C.bg}
      />

      {/* ── Header ── */}
      <View
        style={[
          styles.headerCard,
          { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark },
        ]}
      >
        {/* Menu button on the LEFT side */}
        <TouchableOpacity
          onPress={openSidebar}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.iconBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
        >
          <Ionicons name="menu-outline" size={20} color={C.textPrimary} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: C.textPrimary }]}>Notifications</Text>

        {/* Back button on the RIGHT side */}
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.iconBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
        >
          <Ionicons name="chevron-back" size={18} color={C.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* ── Tabs: Upcoming vs. Already Arrived (Missed) ── */}
      <View style={[styles.tabBar, { backgroundColor: C.surface, borderColor: C.border }]}>
        <TabButton
          label={`Upcoming (${upcoming.length})`}
          active={activeTab === "upcoming"}
          onPress={() => setActiveTab("upcoming")}
          C={C}
        />
        <TabButton
          label={`Missed (${missed.length})`}
          active={activeTab === "missed"}
          onPress={() => setActiveTab("missed")}
          C={C}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, index) => `${item.id}_${index}`}
          contentContainerStyle={
            data.length === 0 ? styles.emptyContainer : styles.listContainer
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyEmoji}>
                {activeTab === "upcoming" ? "🔔" : "✅"}
              </Text>
              <Text style={[styles.emptyTitle, { color: C.textPrimary }]}>
                {activeTab === "upcoming"
                  ? "Nothing scheduled"
                  : "No missed notifications"}
              </Text>
              <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
                {activeTab === "upcoming"
                  ? "New reminders will show up here once they're scheduled."
                  : "Notifications you missed will appear here."}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <NotificationRow
              entry={item}
              missed={activeTab === "missed"}
              onPress={() => handlePress(item)}
              C={C}
            />
          )}
        />
      )}

      {/* ── Sidebar overlay (left-anchored slide-in, matches dashboard) ── */}
      {sidebarMounted && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={closeSidebar}>
            <Animated.View
              style={[styles.backdrop, StyleSheet.absoluteFill, { opacity: backdropOpacity }]}
            />
          </TouchableWithoutFeedback>

          <Animated.View
            style={[
              styles.sidebarPanel,
              {
                width: sidebarWidth,
                backgroundColor: C.surface,
                borderRightColor: C.border,
                transform: [{ translateX }],
              },
            ]}
          >
            <Sidebar
              isOpen={sidebarOpen}
              onClose={closeSidebar}
              currentTheme={theme}
              onThemeChange={handleThemeChange}
            />
          </Animated.View>
        </View>
      )}
    </View>
  );
}

function TabButton({ label, active, onPress, C }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tabButton,
        { backgroundColor: active ? C.accent : C.surfaceAlt },
      ]}
    >
      <Text
        style={[
          styles.tabButtonText,
          { color: active ? "#FFFFFF" : C.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function NotificationRow({ entry, missed, onPress, C }) {
  const typeLabel = TYPE_LABELS[entry.payload?.type] ?? "Notification";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: missed ? C.dangerSoft : C.surface,
          borderColor: missed ? C.danger : C.border,
          shadowColor: C.shadowDark,
        },
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.rowTopLine}>
        <Text style={[styles.rowType, { color: C.textSecondary }]}>{typeLabel}</Text>
        <Text
          style={[
            styles.rowTime,
            { color: missed ? C.danger : C.textSecondary },
            missed && styles.rowTimeMissed,
          ]}
        >
          {formatDateTime(entry.trigger)}
        </Text>
      </View>

      <Text style={[styles.rowTitle, { color: C.textPrimary }]} numberOfLines={1}>
        {entry.title}
      </Text>

      <Text style={[styles.rowBody, { color: C.textSecondary }]} numberOfLines={2}>
        {entry.body}
      </Text>

      {missed && (
        <View style={[styles.missedBadge, { backgroundColor: C.danger }]}>
          <Text style={styles.missedBadgeText}>Missed</Text>
        </View>
      )}
    </Pressable>
  );
}

// -----------------------------------------------------------------------------
// Formatting
// -----------------------------------------------------------------------------

function formatDateTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return `Today, ${time}`;
  if (isTomorrow) return `Tomorrow, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;

  const datePart = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  return `${datePart}, ${time}`;
}

// -----------------------------------------------------------------------------
// Styles (static layout only — colors come from theme tokens `C` above)
// -----------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingClay: {
    width: 84,
    height: 84,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },

  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 5,
  },

  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
  },

  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 6,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
  },

  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 13,
    alignItems: "center",
  },

  tabButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },

  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 10,
  },

  emptyContainer: {
    flexGrow: 1,
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },

  emptyEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },

  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
  },

  row: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 3,
  },

  rowPressed: {
    opacity: 0.75,
  },

  rowTopLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },

  rowType: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  rowTime: {
    fontSize: 12,
  },

  rowTimeMissed: {
    fontWeight: "700",
  },

  rowTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },

  rowBody: {
    fontSize: 13,
  },

  missedBadge: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },

  missedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  backdrop: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  sidebarPanel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0, // pinned to the LEFT edge — no `right` set anywhere on this style
    borderRightWidth: 1, // Changed from borderLeftWidth
    borderTopRightRadius: 28, // Changed from borderTopLeftRadius
    borderBottomRightRadius: 28, // Changed from borderBottomLeftRadius
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 6, height: 0 }, // shadow falls right, since panel sits on the left
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
    zIndex: 1000,
  },
});