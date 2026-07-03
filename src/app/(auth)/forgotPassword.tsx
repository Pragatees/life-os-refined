import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Animated,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";

const BASE_URL = "https://life-os-backend-1ozl.onrender.com/api";
const MAX_REQUESTS_PER_DAY = 3;
const COOLDOWN_SECONDS = 15 * 60; // 15 minutes

// ─── Theme Tokens (Claymorphism — same language as Login/SignUp) ───────────
// Near-black background, warm amber/orange accent, soft clay shadows.
// No blue, purple, violet, or pink anywhere in the palette.
const T = {
  bg: ["#0A0A0B", "#141210", "#1C1712"] as const,
  surface: "rgba(24, 24, 27, 0.85)",
  surfaceAlt: "rgba(255, 138, 61, 0.08)",
  accent: "#FF8A3D",
  accentGradient: ["#FF8A3D", "#FFB25E"] as const,
  success: "#3DD68C",
  warning: "#FFC24B",
  danger: "#FF6B5B",
  textPrimary: "#F5F5F4",
  textSecondary: "rgba(245, 245, 244, 0.62)",
  textFaint: "rgba(245, 245, 244, 0.38)",
  border: "rgba(255, 138, 61, 0.18)",
  borderFocused: "#FF8A3D",
};

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  // Timer state
  const [cooldownRemaining, setCooldownRemaining] = useState(0); // seconds

  // Request count state
  const [requestsUsed, setRequestsUsed] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null); // timestamp ms

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }),
    ]).start();
  }, [fadeAnim, slideAnim, logoScale]);

  // Load persisted state on mount
  useEffect(() => {
    const loadState = async () => {
      const stored = await AsyncStorage.multiGet([
        "otp_requests_count",
        "otp_requests_date",
        "otp_blocked_until",
        "otp_cooldown_until",
      ]);
      const map = Object.fromEntries(stored.map(([k, v]) => [k, v]));

      const today = new Date().toDateString();
      const storedDate = map["otp_requests_date"];
      const count = storedDate === today ? parseInt(map["otp_requests_count"] || "0") : 0;
      setRequestsUsed(count);

      const blockedUntilTs = map["otp_blocked_until"]
        ? parseInt(map["otp_blocked_until"])
        : null;
      setBlockedUntil(blockedUntilTs);

      const cooldownUntilTs = map["otp_cooldown_until"]
        ? parseInt(map["otp_cooldown_until"])
        : null;
      if (cooldownUntilTs) {
        const remaining = Math.ceil((cooldownUntilTs - Date.now()) / 1000);
        if (remaining > 0) setCooldownRemaining(remaining);
      }
    };
    loadState();
  }, []);

  // Countdown tick
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const isBlocked = blockedUntil !== null && Date.now() < blockedUntil;
  const blockedHoursLeft = isBlocked
    ? Math.ceil((blockedUntil! - Date.now()) / 1000 / 60 / 60)
    : 0;

  const sendOtp = useCallback(async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email address.");
      return;
    }

    // 24-hour block check
    if (isBlocked) {
      Alert.alert(
        "Too many requests",
        `You've used all 3 attempts. Try again in ${blockedHoursLeft} hour(s).`
      );
      return;
    }

    // 15-min cooldown check
    if (cooldownRemaining > 0) {
      Alert.alert("Please wait", `You can request a new OTP in ${formatTime(cooldownRemaining)}.`);
      return;
    }

    try {
      setLoading(true);
      await axios.post(`${BASE_URL}/auth/forgot-password`, { email: email.trim() });

      // Update request count
      const today = new Date().toDateString();
      const newCount = requestsUsed + 1;
      setRequestsUsed(newCount);

      const updates: [string, string][] = [
        ["otp_requests_count", newCount.toString()],
        ["otp_requests_date", today],
      ];

      // If hit limit, set 24h block
      if (newCount >= MAX_REQUESTS_PER_DAY) {
        const blockTs = (Date.now() + 24 * 60 * 60 * 1000).toString();
        updates.push(["otp_blocked_until", blockTs]);
        setBlockedUntil(parseInt(blockTs));
      }

      // Set 15-min cooldown
      const cooldownUntilTs = (Date.now() + COOLDOWN_SECONDS * 1000).toString();
      updates.push(["otp_cooldown_until", cooldownUntilTs]);
      await AsyncStorage.multiSet(updates);
      setCooldownRemaining(COOLDOWN_SECONDS);

      // Store email for verify screen
      await AsyncStorage.setItem("reset_email", email.trim());

      Alert.alert(
        "OTP Sent",
        `A 6-digit code has been sent to ${email.trim()}.\n\n📬 Don't see it? Check your spam or junk folder.\n\nThe code is valid for 15 minutes.`,
        [{ text: "Enter OTP", onPress: () => router.push("../verifyOtp") }]
      );
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.response?.data?.message || "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [email, isBlocked, cooldownRemaining, requestsUsed]);

  const attemptsLeft = MAX_REQUESTS_PER_DAY - requestsUsed;
  const buttonDisabled = loading || cooldownRemaining > 0 || isBlocked;

  return (
    <LinearGradient
      colors={T.bg}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradientBackground}
    >
      {/* Static decorative clay blobs */}
      <View style={[styles.blob, styles.blobOne]} />
      <View style={[styles.blob, styles.blobTwo]} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {/* Header */}
            <View style={styles.header}>
              <Animated.View style={[styles.logoIconWrap, { transform: [{ scale: logoScale }] }]}>
                <LinearGradient
                  colors={T.accentGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.logoGradient}
                >
                  <Feather name="key" size={26} color="#1A120B" />
                </LinearGradient>
              </Animated.View>
              <Text style={styles.title}>Forgot Password</Text>
              <Text style={styles.subtitle}>Enter your email to receive a reset code</Text>
            </View>

            {/* Form Card */}
            <View style={styles.formWrap}>
              <View style={styles.form}>
                <Text style={styles.label}>Email address</Text>
                <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
                  <View style={styles.inputIconWrap}>
                    <Feather name="mail" size={16} color={focused ? T.accent : T.textFaint} />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your email"
                    placeholderTextColor={T.textFaint}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    selectionColor={T.accent}
                    cursorColor={T.accent}
                  />
                </View>

                {/* Attempts indicator */}
                {!isBlocked && (
                  <Text
                    style={[
                      styles.attemptsText,
                      attemptsLeft === 1 && { color: T.danger },
                      attemptsLeft === 2 && { color: T.warning },
                    ]}
                  >
                    {attemptsLeft} of {MAX_REQUESTS_PER_DAY} requests remaining today
                  </Text>
                )}

                {/* 24h block warning */}
                {isBlocked && (
                  <View style={[styles.banner, { backgroundColor: T.danger + "16", borderColor: T.danger + "35" }]}>
                    <Feather name="slash" size={14} color={T.danger} style={styles.bannerIcon} />
                    <Text style={[styles.bannerText, { color: T.danger }]}>
                      You've reached the daily limit (3 requests). Try again in {blockedHoursLeft} hour(s).
                    </Text>
                  </View>
                )}

                {/* 15-min cooldown timer */}
                {cooldownRemaining > 0 && !isBlocked && (
                  <View style={[styles.banner, { backgroundColor: T.warning + "16", borderColor: T.warning + "35" }]}>
                    <Feather name="clock" size={14} color={T.warning} style={styles.bannerIcon} />
                    <Text style={[styles.bannerText, { color: T.warning }]}>
                      Next OTP available in{" "}
                      <Text style={styles.timerCount}>{formatTime(cooldownRemaining)}</Text>
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.buttonOuter}
                  activeOpacity={0.85}
                  onPress={sendOtp}
                  disabled={buttonDisabled}
                >
                  <LinearGradient
                    colors={buttonDisabled ? ["#4A3A28", "#4A3A28"] : T.accentGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.button}
                  >
                    {loading ? (
                      <ActivityIndicator color="#1A120B" />
                    ) : (
                      <Text style={styles.buttonText}>
                        {cooldownRemaining > 0 ? `Wait ${formatTime(cooldownRemaining)}` : "Send OTP"}
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Spam notice */}
                <View style={[styles.banner, styles.spamNotice, { backgroundColor: T.accent + "12", borderColor: T.accent + "28" }]}>
                  <Feather name="inbox" size={14} color={T.accent} style={styles.bannerIcon} />
                  <Text style={[styles.bannerText, { color: T.textSecondary }]}>
                    Check your spam or junk folder if you don't see the email within a minute.
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.backLink} onPress={() => router.back()} hitSlop={8}>
              <Feather name="arrow-left" size={14} color={T.accent} style={{ marginRight: 6 }} />
              <Text style={styles.backText}>Back to login</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientBackground: {
    flex: 1,
    overflow: "hidden",
  },
  blob: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: T.accent,
    opacity: 0.1,
  },
  blobOne: {
    width: 260,
    height: 260,
    top: -70,
    left: -80,
  },
  blobTwo: {
    width: 220,
    height: 220,
    bottom: -60,
    right: -80,
    backgroundColor: "#FFB25E",
    opacity: 0.07,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 30,
  },
  logoIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 21,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  logoGradient: {
    width: 64,
    height: 64,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: T.textPrimary,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: T.textSecondary,
    marginTop: 6,
    textAlign: "center",
  },
  formWrap: {
    width: "100%",
  },
  form: {
    backgroundColor: T.surface,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: T.border,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 26,
    elevation: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: T.textSecondary,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    backgroundColor: T.surfaceAlt,
    marginBottom: 10,
  },
  inputWrapFocused: {
    borderColor: T.borderFocused,
    backgroundColor: "rgba(255, 138, 61, 0.14)",
  },
  inputIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: T.textPrimary,
  },
  attemptsText: {
    fontSize: 11,
    color: T.textSecondary,
    textAlign: "right",
    marginBottom: 4,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginTop: 10,
  },
  bannerIcon: { marginRight: 9, marginTop: 1 },
  bannerText: { fontSize: 12, flex: 1, lineHeight: 17 },
  timerCount: { fontWeight: "800", fontSize: 13 },
  buttonOuter: {
    borderRadius: 18,
    overflow: "hidden",
    marginTop: 18,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 18,
  },
  buttonText: {
    color: "#1A120B",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  spamNotice: {
    marginTop: 14,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 26,
  },
  backText: {
    fontSize: 13,
    color: T.accent,
    fontWeight: "700",
  },
});