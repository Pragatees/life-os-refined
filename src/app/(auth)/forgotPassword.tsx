import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const BASE_URL = "https://life-os-backend-1ozl.onrender.com/api";
const MAX_REQUESTS_PER_DAY = 3;
const COOLDOWN_SECONDS = 15 * 60; // 15 minutes

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  // Timer state
  const [cooldownRemaining, setCooldownRemaining] = useState(0); // seconds

  // Request count state
  const [requestsUsed, setRequestsUsed] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null); // timestamp ms

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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Forgot Password</Text>
        <Text style={styles.subtitle}>Enter your email to receive a reset code</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Email address</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your email"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        {/* Attempts indicator */}
        {!isBlocked && (
          <View style={styles.attemptsRow}>
            <Text style={[
              styles.attemptsText,
              attemptsLeft === 1 && { color: "#dc2626" },
              attemptsLeft === 2 && { color: "#d97706" },
            ]}>
              {attemptsLeft} of {MAX_REQUESTS_PER_DAY} requests remaining today
            </Text>
          </View>
        )}

        {/* 24h block warning */}
        {isBlocked && (
          <View style={styles.blockedBanner}>
            <Text style={styles.blockedText}>
              🚫 You've reached the daily limit (3 requests). Try again in {blockedHoursLeft} hour(s).
            </Text>
          </View>
        )}

        {/* 15-min cooldown timer */}
        {cooldownRemaining > 0 && !isBlocked && (
          <View style={styles.timerBanner}>
            <Text style={styles.timerText}>
              ⏱ Next OTP available in{" "}
              <Text style={styles.timerCount}>{formatTime(cooldownRemaining)}</Text>
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, buttonDisabled && styles.buttonDisabled]}
          onPress={sendOtp}
          disabled={buttonDisabled}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>
              {cooldownRemaining > 0 ? `Wait ${formatTime(cooldownRemaining)}` : "Send OTP"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Spam notice */}
        <View style={styles.spamNotice}>
          <Text style={styles.spamText}>
            📬 Check your spam or junk folder if you don't see the email within a minute.
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back to login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#f9fafb" },
  header: { alignItems: "center", marginBottom: 32 },
  title: { fontSize: 28, fontWeight: "800", color: "#2563eb", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: "#6b7280", marginTop: 6, textAlign: "center" },
  form: {
    backgroundColor: "#ffffff", borderRadius: 16, padding: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, marginBottom: 10,
    fontSize: 15, color: "#111827", backgroundColor: "#f9fafb",
  },
  attemptsRow: { marginBottom: 12 },
  attemptsText: { fontSize: 12, color: "#6b7280", textAlign: "right" },
  blockedBanner: {
    backgroundColor: "#fef2f2", borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: "#fca5a5", marginBottom: 16,
  },
  blockedText: { fontSize: 13, color: "#dc2626", lineHeight: 18 },
  timerBanner: {
    backgroundColor: "#fffbeb", borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: "#fcd34d", marginBottom: 16,
  },
  timerText: { fontSize: 13, color: "#92400e" },
  timerCount: { fontWeight: "700", fontSize: 15 },
  button: {
    backgroundColor: "#2563eb", paddingVertical: 15,
    borderRadius: 10, alignItems: "center", marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  spamNotice: {
    backgroundColor: "#eff6ff", borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: "#bfdbfe",
  },
  spamText: { fontSize: 12, color: "#1d4ed8", lineHeight: 18 },
  backLink: { alignItems: "center", marginTop: 24 },
  backText: { fontSize: 14, color: "#2563eb", fontWeight: "500" },
});