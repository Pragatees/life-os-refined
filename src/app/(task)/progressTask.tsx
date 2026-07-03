// components/ProgressTask.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ScrollView,
  Animated,
  Easing,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";

// ── Import the shared store ──────────────────────────────────────────────────
import { useTaskStore } from "../../store/task";

// ─── Theme Tokens (Claymorphism — matches AddTask) ─────────────────────────
type ThemeTokens = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  accent: string;
  accentGradient: readonly [string, string];
  textPrimary: string;
  textSecondary: string;
  border: string;
  priorityHigh: string;
  priorityMed: string;
  priorityLow: string;
  success: string;
  warning: string;
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
  priorityHigh: "#FF6B5B",
  priorityMed: "#FFC24B",
  priorityLow: "#3DD68C",
  success: "#3DD68C",
  warning: "#FFC24B",
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
  priorityHigh: "#EF5A4C",
  priorityMed: "#F0A93B",
  priorityLow: "#22B573",
  success: "#22B573",
  warning: "#F0A93B",
  danger: "#EF5A4C",
  shadowDark: "#B9B9C0",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  achieved: boolean;
}

export interface ProgressTaskProps {
  theme?: "bright" | "dark";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getProgressColor(pct: number, C: ThemeTokens): string {
  if (pct > 70) return C.success;
  if (pct >= 40) return C.warning;
  return pct === 0 ? C.border : C.danger;
}

function getMotivation(pct: number, total: number): string {
  if (total === 0) return "Add a task to start tracking.";
  if (pct === 100) return "All done — great work!";
  if (pct >= 70)  return "Almost there, keep going.";
  if (pct >= 40)  return "Good progress, stay focused.";
  return "Every step counts.";
}

function buildAchievements(completed: number, pct: number): Achievement[] {
  return [
    { id: "first",      icon: "flash",  title: "First Step",     description: "Complete 1 task",   achieved: completed >= 1 },
    { id: "productive", icon: "flame",  title: "Productive Day", description: "Complete 5+ tasks", achieved: completed >= 5 },
    { id: "perfect",    icon: "trophy", title: "Perfect Day",    description: "100% completion",   achieved: pct === 100 },
  ];
}

// ─── Circular Ring ────────────────────────────────────────────────────────────
const RING = 160;
const SW   = 12;
const R    = (RING - SW) / 2;
const CIRC = 2 * Math.PI * R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function ProgressRing({ percentage, color, C }: { percentage: number; color: string; C: ThemeTokens }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    Animated.timing(anim, { toValue: percentage, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [percentage, anim]);

  const offset = anim.interpolate({ inputRange: [0, 100], outputRange: [CIRC, 0], extrapolate: "clamp" });

  return (
    <View style={{ width: RING, height: RING, alignItems: "center", justifyContent: "center", alignSelf: "center" }}>
      <Svg width={RING} height={RING}>
        <Circle cx={RING/2} cy={RING/2} r={R} stroke={C.border} strokeWidth={SW} fill="transparent" opacity={0.4} />
        <AnimatedCircle
          cx={RING/2} cy={RING/2} r={R}
          stroke={color} strokeWidth={SW} fill="transparent"
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${RING/2}, ${RING/2}`}
        />
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <Text style={{ fontSize: 30, fontWeight: "800", color, letterSpacing: -0.5 }}>{display}%</Text>
        <Text style={{ fontSize: 10, fontWeight: "600", color: C.textSecondary, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 2 }}>done</Text>
      </View>
    </View>
  );
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────
function StatPill({ icon, label, value, color, C }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; color: string; C: ThemeTokens }) {
  return (
    <View style={[stat.pill, { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark }]}>
      <View style={[stat.iconWrap, { backgroundColor: color + "1A", borderColor: color + "33" }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <Text style={[stat.value, { color: C.textPrimary }]}>{value}</Text>
      <Text style={[stat.label, { color: C.textSecondary }]}>{label}</Text>
    </View>
  );
}
const stat = StyleSheet.create({
  pill:    { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 14, alignItems: "center", gap: 4, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 2 },
  iconWrap:{ width: 28, height: 28, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  value:   { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  label:   { fontSize: 10, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
});

// ─── Achievement Badge ────────────────────────────────────────────────────────
function AchievementBadge({ item, index, C }: { item: Achievement; index: number; C: ThemeTokens }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, delay: index * 90, useNativeDriver: true }).start();
  }, [fadeAnim, index]);

  const { achieved } = item;
  return (
    <Animated.View style={[
      ab.card,
      { backgroundColor: C.surface, borderColor: achieved ? C.accent + "40" : C.border, opacity: achieved ? 1 : 0.5 },
      { opacity: fadeAnim },
    ]}>
      <View style={[ab.iconWrap, { backgroundColor: achieved ? C.accent + "20" : C.surfaceAlt, borderColor: achieved ? C.accent + "55" : C.border }]}>
        <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={15} color={achieved ? C.accent : C.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[ab.title, { color: achieved ? C.textPrimary : C.textSecondary }]}>{item.title}</Text>
        <Text style={[ab.desc,  { color: C.textSecondary }]}>{item.description}</Text>
      </View>
      {achieved && <Ionicons name="checkmark-circle" size={15} color={C.success} />}
    </Animated.View>
  );
}
const ab = StyleSheet.create({
  card:    { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 8 },
  iconWrap:{ width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title:   { fontSize: 13, fontWeight: "700", marginBottom: 1 },
  desc:    { fontSize: 11 },
});

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ C }: { C: ThemeTokens }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 40 }}>
      <Ionicons name="sparkles-outline" size={26} color={C.accent} style={{ marginBottom: 12 }} />
      <Text style={{ fontSize: 14, fontWeight: "700", color: C.textPrimary, marginBottom: 4 }}>No tasks today.</Text>
      <Text style={{ fontSize: 12, color: C.textSecondary }}>Add a task to start tracking progress.</Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ProgressTaskComponent({ theme = "dark" }: ProgressTaskProps) {
  const C: ThemeTokens = theme === "bright" ? BRIGHT : DARK;

  // ── Read from the shared store — NO local fetch logic needed ─────────────
  const tasks      = useTaskStore((s: any) => s.tasks);
  const loading    = useTaskStore((s: any) => s.loading);
  const fetchTasks = useTaskStore((s: any) => s.fetchTasks);

  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;

  // Mount: let the store decide if a fetch is needed (uses cache TTL)
  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 340, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 340, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTasks(true);   // force bypass cache on manual pull-to-refresh
    setRefreshing(false);
  };

  // ── Derived values — computed from store data, no local state ────────────
  const total      = tasks.length;
  const completed  = tasks.filter((t: any) => t.completed).length;
  const pending    = total - completed;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  const ringColor  = getProgressColor(percentage, C);
  const achievements = buildAchievements(completed, percentage);

  if (loading && tasks.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 13, color: C.textSecondary }}>Loading progress...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 18, paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.accent} colors={[C.accent]} />}
    >
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: "800", color: C.textPrimary, letterSpacing: -0.3, marginBottom: 3 }}>Today's Progress</Text>
            <Text style={{ fontSize: 12, color: C.textSecondary }}>{getMotivation(percentage, total)}</Text>
          </View>
          <View style={{ width: 34, height: 34, borderRadius: 11, borderWidth: 1, borderColor: ringColor + "40", backgroundColor: ringColor + "1A", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="trending-up" size={15} color={ringColor} />
          </View>
        </View>

        {total === 0 ? <EmptyState C={C} /> : (
          <>
            {/* Ring */}
            <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 22, paddingVertical: 24, marginBottom: 14, shadowColor: C.shadowDark, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.14, shadowRadius: 18, elevation: 4 }}>
              <ProgressRing percentage={percentage} color={ringColor} C={C} />
            </View>

            {/* Stats */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 22 }}>
              <StatPill icon="list-outline"           label="Total" value={total}     color={C.accent}  C={C} />
              <StatPill icon="checkmark-done-outline" label="Done"  value={completed} color={C.success} C={C} />
              <StatPill icon="time-outline"           label="Left"  value={pending}   color={C.warning} C={C} />
            </View>

            {/* Achievements */}
            <Text style={{ fontSize: 10, fontWeight: "700", color: C.textSecondary, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 }}>
              Achievements
            </Text>
            {achievements.map((a, i) => <AchievementBadge key={a.id} item={a} index={i} C={C} />)}
          </>
        )}
      </Animated.View>
    </ScrollView>
  );
}