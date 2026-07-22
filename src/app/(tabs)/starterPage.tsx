import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  Animated,
  FlatList,
  ViewToken,
  Image,
  Platform,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";

const { width: W, height: H } = Dimensions.get("window");

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#080B14",
  bgElevated: "#0D1220",
  border: "rgba(255, 255, 255, 0.09)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  glassTint: "rgba(255, 255, 255, 0.045)",
  orange: "#F97316",
  orangeLight: "#FDBA74",
  orangeDark: "#C2410C",
  emerald: "#10B981",
  emeraldLight: "#6EE7B7",
  textPrimary: "#F8FAFC",
  textSecondary: "#9AA5B8",
  textMuted: "#5E6B82",
  black: "#000000",
};

const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
const RADIUS = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };

// Reusable elevation so cards read as "lifted" rather than flat
const cardShadow = Platform.select({
  ios: {
    shadowColor: C.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
  },
  android: { elevation: 6 },
  default: {},
});

// ─── Founders Photo ──────────────────────────────────────────────────────────
const FOUNDER_PHOTO = require("../../../assets/images/testimonal.jpeg");

// ─── Slide Data ───────────────────────────────────────────────────────────────
interface Slide {
  id: string;
  illustration: React.ReactNode;
  content: React.ReactNode;
}

// ─── Reusable Glass-style Card (plain tint + border, no blur dependency) ────
function GlassCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View style={[glassStyles.wrap, cardShadow, style]}>
      <View style={glassStyles.content}>{children}</View>
    </View>
  );
}

const glassStyles = StyleSheet.create({
  wrap: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bgElevated,
    overflow: "hidden",
  },
  content: {
    padding: SPACING.lg,
  },
});

// ─── Small pill badge used for floating decorative elements ─────────────────
function GlassBadge({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[badgeStyles.badge, style]}>{children}</View>;
}

const badgeStyles = StyleSheet.create({
  badge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
  },
});

// ─── Screen 1: Welcome ──────────────────────────────────────────────────────
function WelcomeIllustration() {
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 3200, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 3200, useNativeDriver: true }),
      ])
    ).start();
  }, [floatAnim]);

  const translateY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  // Computed ONCE — previously used Math.random() directly in render,
  // which reshuffled particle positions on every re-render/animation tick.
  const particles = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        left: (i * 41 + 17) % 280,
        top: (i * 59 + 11) % 230,
        opacity: 0.12 + (i % 4) * 0.05,
        scale: 0.35 + (i % 3) * 0.18,
        color: i % 2 === 0 ? C.orange : C.emerald,
      })),
    []
  );

  const nodes = [
    { icon: "📋", label: "Tasks", x: 18, y: 42 },
    { icon: "🎯", label: "Goals", x: 222, y: 18 },
    { icon: "📝", label: "Notes", x: 252, y: 102 },
    { icon: "🤖", label: "AI", x: 18, y: 122 },
    { icon: "📊", label: "Analytics", x: 130, y: 6 },
    { icon: "🔔", label: "Smart", x: 130, y: 154 },
  ];

  return (
    <View style={welcomeStyles.container}>
      <LinearGradient
        colors={[`${C.orange}18`, `${C.emerald}18`, "transparent"]}
        style={welcomeStyles.glow}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {particles.map((p, i) => (
        <View
          key={i}
          style={[
            welcomeStyles.particle,
            {
              left: p.left,
              top: p.top,
              opacity: p.opacity,
              transform: [{ scale: p.scale }],
              backgroundColor: p.color,
            },
          ]}
        />
      ))}

      <Animated.View style={[welcomeStyles.logoContainer, { transform: [{ translateY }] }]}>
        <LinearGradient
          colors={[C.orange, C.emerald]}
          style={welcomeStyles.logoGlow}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={welcomeStyles.logoInner}>
          <View style={welcomeStyles.logoGrid}>
            {[...Array(4)].map((_, i) => (
              <View key={i} style={welcomeStyles.logoCell} />
            ))}
          </View>
        </View>
      </Animated.View>

      {nodes.map((item, i) => (
        <Animated.View
          key={i}
          style={[
            welcomeStyles.nodeWrap,
            {
              left: item.x,
              top: item.y,
              transform: [
                {
                  translateY: floatAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, (i % 2 === 0 ? 1 : -1) * 7],
                  }),
                },
              ],
            },
          ]}
        >
          <GlassBadge style={welcomeStyles.node}>
            <Text style={welcomeStyles.nodeIcon}>{item.icon}</Text>
            <Text style={welcomeStyles.nodeLabel}>{item.label}</Text>
          </GlassBadge>
        </Animated.View>
      ))}

      <View style={[welcomeStyles.connectionLine, { top: 82, left: 62, width: 76, transform: [{ rotate: "20deg" }] }]} />
      <View style={[welcomeStyles.connectionLine, { top: 100, left: 180, width: 58, transform: [{ rotate: "-15deg" }] }]} />
      <View style={[welcomeStyles.connectionLine, { top: 62, left: 122, width: 96, transform: [{ rotate: "5deg" }] }]} />
    </View>
  );
}

const welcomeStyles = StyleSheet.create({
  container: {
    width: 300,
    height: 260,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  glow: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  particle: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  logoContainer: {
    width: 96,
    height: 96,
    borderRadius: RADIUS.xl,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  logoGlow: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: RADIUS.xl,
    opacity: 0.35,
  },
  logoInner: {
    width: 78,
    height: 78,
    borderRadius: RADIUS.lg,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  logoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 40,
    gap: 4,
  },
  logoCell: {
    width: 14,
    height: 14,
    borderRadius: 4,
    backgroundColor: C.orange,
    opacity: 0.85,
  },
  nodeWrap: {
    position: "absolute",
  },
  node: {
    alignItems: "center",
  },
  nodeIcon: { fontSize: 13 },
  nodeLabel: {
    fontSize: 9,
    color: C.textSecondary,
    marginTop: 2,
    fontWeight: "500",
  },
  connectionLine: {
    position: "absolute",
    height: 1,
    backgroundColor: C.border,
  },
});

// ─── Screen 2: Tasks ──────────────────────────────────────────────────────
function TasksIllustration() {
  const timeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.timing(timeAnim, { toValue: 1, duration: 4200, useNativeDriver: true })).start();
  }, [timeAnim]);

  const tasks = [
    { label: "Morning Review", time: "8:00 AM", done: true, priority: "high" as const },
    { label: "Team Sync", time: "10:30 AM", done: false, priority: "medium" as const },
    { label: "Design Review", time: "1:00 PM", done: false, priority: "low" as const },
    { label: "Code Review", time: "3:30 PM", done: false, priority: "high" as const },
  ];

  const priorityColor = { high: C.orange, medium: C.emerald, low: C.textMuted };

  return (
    <View style={tasksStyles.container}>
      <LinearGradient
        colors={[`${C.emerald}12`, `${C.orange}0C`, "transparent"]}
        style={tasksStyles.glow}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View style={tasksStyles.timeline}>
        <View style={tasksStyles.timelineLine} />
        {tasks.map((task, i) => (
          <Animated.View
            key={i}
            style={{
              transform: [
                {
                  translateX: timeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, (i % 2 === 0 ? 1 : -1) * 4],
                  }),
                },
              ],
            }}
          >
            <View style={tasksStyles.taskCard}>
              <View style={tasksStyles.taskLeft}>
                <View style={[tasksStyles.taskDot, task.done && tasksStyles.taskDotDone]} />
                <View>
                  <Text style={[tasksStyles.taskLabel, task.done && tasksStyles.taskLabelDone]}>
                    {task.label}
                  </Text>
                  <Text style={tasksStyles.taskTime}>{task.time}</Text>
                </View>
              </View>
              <View style={[tasksStyles.priorityBadge, { backgroundColor: priorityColor[task.priority] }]} />
            </View>
          </Animated.View>
        ))}
      </View>

      <GlassBadge style={[tasksStyles.notification, { right: 8, top: 14 }]}>
        <Text style={tasksStyles.notificationText}>3 tasks due today</Text>
      </GlassBadge>
      <GlassBadge style={[tasksStyles.notification, { right: 18, top: 62 }]}>
        <Text style={tasksStyles.notificationText}>Meeting in 15 min</Text>
      </GlassBadge>
    </View>
  );
}

const tasksStyles = StyleSheet.create({
  container: {
    width: 320,
    height: 270,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  glow: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
  },
  timeline: {
    width: "86%",
    paddingVertical: SPACING.sm,
  },
  timelineLine: {
    position: "absolute",
    left: 18,
    top: 18,
    bottom: 18,
    width: 2,
    backgroundColor: C.border,
  },
  taskCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.sm,
  },
  taskLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm + 2,
  },
  taskDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: C.textMuted,
  },
  taskDotDone: {
    backgroundColor: C.emerald,
    borderColor: C.emerald,
  },
  taskLabel: {
    fontSize: 13.5,
    color: C.textPrimary,
    fontWeight: "600",
  },
  taskLabelDone: {
    textDecorationLine: "line-through",
    opacity: 0.45,
  },
  taskTime: {
    fontSize: 10.5,
    color: C.textMuted,
    marginTop: 1,
  },
  priorityBadge: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  notification: {
    position: "absolute",
  },
  notificationText: {
    fontSize: 10.5,
    color: C.textSecondary,
    fontWeight: "500",
  },
});

// ─── Screen 3: Goals & Notes ──────────────────────────────────────────────
function GoalsNotesIllustration() {
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(progressAnim, { toValue: 1, duration: 2200, useNativeDriver: false }),
        Animated.timing(progressAnim, { toValue: 0, duration: 2200, useNativeDriver: false }),
      ])
    ).start();
  }, [progressAnim]);

  const goals = [
    { label: "Learn React Native", progress: 0.75, color: C.orange },
    { label: "Read 12 Books", progress: 0.45, color: C.emerald },
    { label: "Morning Routine", progress: 0.9, color: C.orangeLight },
  ];

  const notes = [
    { label: "Productivity Ideas", date: "Today, 2:30 PM", preview: "Focus on deep work…" },
    { label: "Weekly Review", date: "Yesterday, 8:15 PM", preview: "Progress on goals…" },
  ];

  return (
    <View style={gnStyles.container}>
      <LinearGradient
        colors={[`${C.orange}0F`, `${C.emerald}0F`, "transparent"]}
        style={gnStyles.glow}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View style={gnStyles.section}>
        <Text style={gnStyles.sectionTitle}>Goals</Text>
        {goals.map((goal, i) => (
          <View key={i} style={gnStyles.goalCard}>
            <View style={gnStyles.goalHeader}>
              <Text style={gnStyles.goalLabel}>{goal.label}</Text>
              <Text style={gnStyles.goalPercent}>{Math.round(goal.progress * 100)}%</Text>
            </View>
            <View style={gnStyles.progressBar}>
              <Animated.View
                style={[
                  gnStyles.progressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", `${goal.progress * 100}%`],
                    }),
                    backgroundColor: goal.color,
                  },
                ]}
              />
            </View>
          </View>
        ))}
      </View>

      <View style={gnStyles.section}>
        <Text style={gnStyles.sectionTitle}>Notes</Text>
        {notes.map((note, i) => (
          <View key={i} style={gnStyles.noteCard}>
            <View style={gnStyles.noteHeader}>
              <Text style={gnStyles.noteLabel}>{note.label}</Text>
              <Text style={gnStyles.noteDate}>{note.date}</Text>
            </View>
            <Text style={gnStyles.notePreview}>{note.preview}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const gnStyles = StyleSheet.create({
  container: {
    width: 320,
    height: 290,
    justifyContent: "center",
    gap: SPACING.lg,
    position: "relative",
  },
  glow: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
  },
  section: {
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: C.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  goalCard: {
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xs + 2,
  },
  goalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  goalLabel: {
    fontSize: 13.5,
    color: C.textPrimary,
    fontWeight: "600",
  },
  goalPercent: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: "600",
  },
  progressBar: {
    height: 5,
    backgroundColor: C.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  noteCard: {
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  noteHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  noteLabel: {
    fontSize: 13.5,
    color: C.textPrimary,
    fontWeight: "600",
  },
  noteDate: {
    fontSize: 10.5,
    color: C.textMuted,
  },
  notePreview: {
    fontSize: 12.5,
    color: C.textSecondary,
  },
});

// ─── Screen 4: AI Companion ──────────────────────────────────────────────
function AICompanionIllustration() {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 3200, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 3200, useNativeDriver: false }),
      ])
    ).start();
  }, [pulseAnim, glowAnim]);

  const scale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const glow = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.65] });

  const features = [
    { label: "Daily Review" },
    { label: "Insights" },
    { label: "Recommendations" },
    { label: "Reflections" },
  ];

  return (
    <View style={aiStyles.container}>
      <LinearGradient
        colors={[`${C.emerald}12`, `${C.orange}12`, "transparent"]}
        style={aiStyles.glow}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <Animated.View style={[aiStyles.avatarContainer, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={[C.orange, C.emerald]}
          style={aiStyles.avatarGlow}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={aiStyles.avatar}>
          <Text style={aiStyles.avatarEmoji}>🤖</Text>
        </View>
      </Animated.View>

      <View style={aiStyles.featureGrid}>
        {features.map((feature, i) => (
          <View key={i} style={aiStyles.featureCard}>
            <Text style={aiStyles.featureLabel}>{feature.label}</Text>
          </View>
        ))}
      </View>

      <Animated.View style={{ opacity: glow, position: "absolute", top: 14, right: 8 }}>
        <GlassBadge style={aiStyles.aiNotification}>
          <Text style={aiStyles.aiNotificationText}>Ready to optimize your day?</Text>
        </GlassBadge>
      </Animated.View>
      <Animated.View style={{ opacity: glow, position: "absolute", top: 66, right: 20 }}>
        <GlassBadge style={aiStyles.aiNotification}>
          <Text style={aiStyles.aiNotificationText}>Focus on your top 3 priorities</Text>
        </GlassBadge>
      </Animated.View>
      <Animated.View style={{ opacity: glow, position: "absolute", top: 118, right: 12 }}>
        <GlassBadge style={aiStyles.aiNotification}>
          <Text style={aiStyles.aiNotificationText}>20% more productive this week</Text>
        </GlassBadge>
      </Animated.View>
    </View>
  );
}

const aiStyles = StyleSheet.create({
  container: {
    width: 320,
    height: 290,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  glow: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
  },
  avatarContainer: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xl,
  },
  avatarGlow: {
    position: "absolute",
    width: 78,
    height: 78,
    borderRadius: 39,
    opacity: 0.35,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  avatarEmoji: {
    fontSize: 30,
  },
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: SPACING.sm,
    width: "100%",
    paddingHorizontal: SPACING.md,
  },
  featureCard: {
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: "center",
    minWidth: 84,
  },
  featureLabel: {
    fontSize: 11.5,
    color: C.textSecondary,
    fontWeight: "600",
  },
  aiNotification: {
    maxWidth: 152,
  },
  aiNotificationText: {
    fontSize: 10.5,
    color: C.textSecondary,
    fontWeight: "500",
  },
});

// ─── Shared slide content styles ─────────────────────────────────────────────
const slideStyles = StyleSheet.create({
  contentContainer: {
    alignItems: "center",
    paddingHorizontal: SPACING.xl + 4,
    width: "100%",
  },
  headline: {
    fontSize: 30,
    fontWeight: "800",
    color: C.textPrimary,
    letterSpacing: -0.6,
    textAlign: "center",
    marginBottom: SPACING.xs + 2,
  },
  subheadline: {
    fontSize: 15,
    fontWeight: "500",
    color: C.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.xl,
    opacity: 0.9,
  },

  // Founder card
  founderCard: {
    width: "100%",
    gap: SPACING.md,
  },
  founderHeader: {
    flexDirection: "row",
    gap: SPACING.md + 2,
    alignItems: "center",
  },
  founderImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  founderGlow: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    opacity: 0.4,
  },
  founderImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: C.borderStrong,
  },
  founderInfo: {
    flex: 1,
    gap: 2,
  },
  founderName: {
    fontSize: 16,
    fontWeight: "700",
    color: C.textPrimary,
    letterSpacing: -0.2,
  },
  // 1) Primary professional role — shown first
  founderRole: {
    fontSize: 12.5,
    fontWeight: "700",
    color: C.orangeLight,
    marginTop: 2,
  },
  // 2) Hobby / secondary skills — shown second
  founderHobby: {
    fontSize: 11.5,
    fontWeight: "500",
    color: C.textSecondary,
    marginTop: 1,
  },
  founderContact: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 2,
  },
  founderDivider: {
    height: 1,
    backgroundColor: C.border,
  },
  founderAbout: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 20,
  },
  founderTags: {
    flexDirection: "row",
    gap: SPACING.xs + 2,
    flexWrap: "wrap",
  },
  tag: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 1,
  },
  tagPrimary: {
    backgroundColor: `${C.orange}20`,
    borderColor: `${C.orange}55`,
  },
  tagText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: C.textSecondary,
  },
  tagTextPrimary: {
    color: C.orangeLight,
  },

  // Feature list (slide 2)
  featureList: {
    width: "100%",
    gap: SPACING.sm,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm + 2,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.md - 2,
  },
  featureDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  featureText: {
    fontSize: 14,
    color: C.textPrimary,
    fontWeight: "600",
  },

  // Split content (slide 3)
  splitContent: {
    flexDirection: "row",
    gap: SPACING.md,
    width: "100%",
    paddingVertical: SPACING.xs,
  },
  splitColumn: {
    flex: 1,
    gap: SPACING.xs + 2,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.md + 2,
  },
  splitTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: C.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  splitText: {
    fontSize: 12,
    color: C.textSecondary,
    lineHeight: 18,
  },

  // AI slide
  aiMessage: {
    fontSize: 15,
    color: C.textPrimary,
    textAlign: "center",
    fontStyle: "italic",
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
    lineHeight: 22,
    opacity: 0.9,
  },
  aiFeatures: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: SPACING.sm - 2,
  },
  aiFeatureTag: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md - 2,
    paddingVertical: SPACING.xs + 2,
  },
  aiFeatureText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.textSecondary,
  },
});

// ─── Slides ───────────────────────────────────────────────────────────────────
const SLIDES: Slide[] = [
  {
    id: "1",
    illustration: <WelcomeIllustration />,
    content: (
      <View style={slideStyles.contentContainer}>
        <Text style={slideStyles.headline}>Life OS</Text>
        <Text style={slideStyles.subheadline}>Your Intelligent Personal Operating System</Text>

        <GlassCard style={slideStyles.founderCard}>
          <View style={slideStyles.founderHeader}>
            <View style={slideStyles.founderImageContainer}>
              <LinearGradient
                colors={[C.orange, C.emerald]}
                style={slideStyles.founderGlow}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <Image source={FOUNDER_PHOTO} style={slideStyles.founderImage} />
            </View>
            <View style={slideStyles.founderInfo}>
              <Text style={slideStyles.founderName}>Pragateesh G</Text>
              {/* 1. Primary role first */}
              <Text style={slideStyles.founderRole}>Gen AI Engineer & Data Scientist</Text>
              {/* 2. Hobby / secondary skills second */}
              <Text style={slideStyles.founderHobby}>Full‑Stack & Android Developer (hobbyist)</Text>
              <Text style={slideStyles.founderContact}>haripragateesh7@gmail.com</Text>
            </View>
          </View>

          <View style={slideStyles.founderDivider} />

          <Text style={slideStyles.founderAbout}>
            Life OS was built from a passion for creating intelligent productivity tools that
            genuinely improve people's lives. Beyond Gen AI and data science, he also builds
            full‑stack and Android apps as a hobby, and works with Node.js and Spring Boot on
            the backend. Every feature — from task management and recurring reminders to
            AI‑powered insights and progress tracking — is designed to help you stay organized,
            consistent, and productive every day.
          </Text>

          <View style={slideStyles.founderTags}>
            <View style={[slideStyles.tag, slideStyles.tagPrimary]}>
              <Text style={[slideStyles.tagText, slideStyles.tagTextPrimary]}>AI / ML</Text>
            </View>
            <View style={[slideStyles.tag, slideStyles.tagPrimary]}>
              <Text style={[slideStyles.tagText, slideStyles.tagTextPrimary]}>Data Science</Text>
            </View>
            <View style={slideStyles.tag}>
              <Text style={slideStyles.tagText}>Full Stack</Text>
            </View>
            <View style={slideStyles.tag}>
              <Text style={slideStyles.tagText}>Android</Text>
            </View>
            <View style={slideStyles.tag}>
              <Text style={slideStyles.tagText}>Node.js</Text>
            </View>
            <View style={slideStyles.tag}>
              <Text style={slideStyles.tagText}>Spring Boot</Text>
            </View>
          </View>
        </GlassCard>
      </View>
    ),
  },
  {
    id: "2",
    illustration: <TasksIllustration />,
    content: (
      <View style={slideStyles.contentContainer}>
        <Text style={slideStyles.headline}>Intelligent Task Management</Text>
        <Text style={slideStyles.subheadline}>Organize your day effortlessly</Text>
        <View style={slideStyles.featureList}>
          {["Smart Scheduling", "Priority Levels", "Recurring Tasks", "Progress Tracking", "Smart Notifications"].map(
            (feature, i) => (
              <View key={i} style={slideStyles.featureItem}>
                <View style={[slideStyles.featureDot, { backgroundColor: i % 2 === 0 ? C.orange : C.emerald }]} />
                <Text style={slideStyles.featureText}>{feature}</Text>
              </View>
            )
          )}
        </View>
      </View>
    ),
  },
  {
    id: "3",
    illustration: <GoalsNotesIllustration />,
    content: (
      <View style={slideStyles.contentContainer}>
        <Text style={slideStyles.headline}>Goals & Notes</Text>
        <Text style={slideStyles.subheadline}>Track progress, capture ideas</Text>
        <View style={slideStyles.splitContent}>
          <View style={slideStyles.splitColumn}>
            <Text style={slideStyles.splitTitle}>Goals</Text>
            <Text style={slideStyles.splitText}>Create meaningful goals and track milestones</Text>
          </View>
          <View style={slideStyles.splitColumn}>
            <Text style={slideStyles.splitTitle}>Notes</Text>
            <Text style={slideStyles.splitText}>Capture ideas and daily reflections</Text>
          </View>
        </View>
      </View>
    ),
  },
  {
    id: "4",
    illustration: <AICompanionIllustration />,
    content: (
      <View style={slideStyles.contentContainer}>
        <Text style={slideStyles.headline}>AI Companion</Text>
        <Text style={slideStyles.subheadline}>Intelligent insights, smarter you</Text>
        <Text style={slideStyles.aiMessage}>
          "Everything works together to help you become more productive every single day."
        </Text>
        <View style={slideStyles.aiFeatures}>
          {["Daily Review", "Smart Insights", "Recommendations", "Reflection System"].map((feature, i) => (
            <View key={i} style={slideStyles.aiFeatureTag}>
              <Text style={slideStyles.aiFeatureText}>{feature}</Text>
            </View>
          ))}
        </View>
      </View>
    ),
  },
];

// ─── Dot Indicator ────────────────────────────────────────────────────────────
function Dots({ count, active }: { count: number; active: number }) {
  return (
    <View style={dotStyles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            dotStyles.dot,
            {
              width: i === active ? 24 : 7,
              backgroundColor: i === active ? C.orange : C.border,
            },
          ]}
        />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: SPACING.xs + 2,
    alignItems: "center",
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setActiveIndex(viewableItems[0].index as number);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const goNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    }
  };

  const goPrevious = () => {
    if (activeIndex > 0) {
      listRef.current?.scrollToIndex({ index: activeIndex - 1, animated: true });
    }
  };

  const handleGetStarted = async () => {
    try {
      await AsyncStorage.setItem("onboardingCompleted", "true");
    } catch {
      // non-fatal — user can still proceed
    }
    router.replace("/login");
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.root}>
        <LinearGradient
          colors={[`${C.orange}08`, `${C.emerald}08`, "transparent"]}
          style={styles.bgGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        <Animated.View style={[styles.topBar, { opacity: fadeAnim }]}>
          <Text style={styles.brandName}>Life OS</Text>
          <TouchableOpacity
            onPress={handleGetStarted}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </Animated.View>

        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item }) => (
            <View style={styles.slide}>
              <View style={styles.illustrationWrap}>{item.illustration}</View>
              {item.content}
            </View>
          )}
          style={styles.list}
        />

        <Animated.View style={[styles.bottomBar, { opacity: fadeAnim }]}>
          <TouchableOpacity
            style={[styles.btn, activeIndex === 0 && styles.btnHidden]}
            onPress={goPrevious}
            activeOpacity={0.8}
            disabled={activeIndex === 0}
          >
            <Text style={styles.btnText}>Previous</Text>
          </TouchableOpacity>

          <Dots count={SLIDES.length} active={activeIndex} />

          <TouchableOpacity
            onPress={isLast ? handleGetStarted : goNext}
            activeOpacity={0.85}
            style={styles.btnTouchable}
          >
            {isLast ? (
              <LinearGradient
                colors={[C.orange, C.orangeDark]}
                style={[styles.btn, styles.btnPrimary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={[styles.btnText, styles.btnTextPrimary]}>Get Started</Text>
              </LinearGradient>
            ) : (
              <View style={styles.btn}>
                <Text style={styles.btnText}>Next</Text>
                <View style={styles.arrow}>
                  <View style={styles.arrowLine} />
                  <View style={[styles.arrowLine, styles.arrowHead]} />
                </View>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  bgGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.xl + 4,
    paddingTop: Platform.OS === "ios" ? 56 : 48,
    paddingBottom: SPACING.sm,
  },
  brandName: {
    fontSize: 19,
    fontWeight: "700",
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  skipText: {
    fontSize: 14,
    color: C.textSecondary,
    fontWeight: "600",
  },

  list: { flex: 1 },
  slide: {
    width: W,
    flex: 1,
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.sm,
  },

  illustrationWrap: {
    alignItems: "center",
    justifyContent: "center",
    height: H * 0.36,
    marginBottom: SPACING.sm,
  },

  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.xl + 4,
    paddingBottom: Platform.OS === "ios" ? 44 : 24,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },

  btnTouchable: {
    borderRadius: RADIUS.md,
    overflow: "hidden",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs + 2,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md - 1,
    paddingHorizontal: SPACING.xl,
    minWidth: 84,
    justifyContent: "center",
  },
  btnHidden: {
    opacity: 0,
  },
  btnPrimary: {
    borderColor: "transparent",
    ...Platform.select({
      ios: {
        shadowColor: C.orange,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  btnText: {
    fontSize: 14,
    fontWeight: "700",
    color: C.textSecondary,
    letterSpacing: 0.2,
  },
  btnTextPrimary: {
    color: "#FFFFFF",
  },

  arrow: {
    flexDirection: "row",
    alignItems: "center",
    width: 14,
    justifyContent: "flex-end",
  },
  arrowLine: {
    width: 8,
    height: 1.5,
    backgroundColor: C.textSecondary,
    borderRadius: 1,
  },
  arrowHead: {
    width: 5,
    height: 5,
    borderRightWidth: 1.5,
    borderTopWidth: 1.5,
    borderColor: C.textSecondary,
    backgroundColor: "transparent",
    transform: [{ rotate: "45deg" }, { translateX: -4 }],
  },
});