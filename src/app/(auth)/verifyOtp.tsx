import React, { useState, useEffect, useRef } from "react";
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

const BASE_URL =`${process.env.EXPO_PUBLIC_API_URL}/api`;

// ─── Theme Tokens (Claymorphism — same language as Login/SignUp/ForgotPassword) ─
// Near-black background, warm amber/orange accent, soft clay shadows.
// No blue, purple, violet, or pink anywhere in the palette.
const T = {
  bg: ["#0A0A0B", "#141210", "#1C1712"] as const,
  surface: "rgba(24, 24, 27, 0.85)",
  surfaceAlt: "rgba(255, 138, 61, 0.08)",
  accent: "#FF8A3D",
  accentGradient: ["#FF8A3D", "#FFB25E"] as const,
  textPrimary: "#F5F5F4",
  textSecondary: "rgba(245, 245, 244, 0.62)",
  textFaint: "rgba(245, 245, 244, 0.38)",
  border: "rgba(255, 138, 61, 0.18)",
  borderFocused: "#FF8A3D",
};

export default function VerifyOtp() {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);

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

  useEffect(() => {
    AsyncStorage.getItem("reset_email").then((v) => { if (v) setEmail(v); });
  }, []);

  const verifyOtp = async () => {
    if (otp.trim().length !== 6) {
      Alert.alert("Error", "Please enter the 6-digit OTP.");
      return;
    }

    try {
      setLoading(true);
      await axios.post(`${BASE_URL}/auth/verify-reset-otp`, { token: otp.trim() });

      // ✅ Store token — user never types it again
      await AsyncStorage.setItem("resetToken", otp.trim());

      Alert.alert("Verified", "OTP verified. Now set your new password.", [
        { text: "Continue", onPress: () => router.push("../resetPassword") },
      ]);
    } catch (error: any) {
      Alert.alert(
        "Verification Failed",
        error.response?.data || error.response?.data?.message || "Invalid or expired OTP."
      );
    } finally {
      setLoading(false);
    }
  };

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
                  <Feather name="shield" size={26} color="#1A120B" />
                </LinearGradient>
              </Animated.View>
              <Text style={styles.title}>Enter OTP</Text>
              <Text style={styles.subtitle}>
                We sent a 6-digit code to{"\n"}
                <Text style={styles.emailHighlight}>{email}</Text>
              </Text>
            </View>

            {/* Form Card */}
            <View style={styles.formWrap}>
              <View style={styles.form}>
                <Text style={styles.label}>Verification code</Text>
                <View style={[styles.otpWrap, focused && styles.otpWrapFocused]}>
                  <TextInput
                    style={styles.otpInput}
                    placeholder="000000"
                    placeholderTextColor={T.textFaint}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otp}
                    onChangeText={setOtp}
                    textAlign="center"
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    selectionColor={T.accent}
                    cursorColor={T.accent}
                    autoFocus
                  />
                </View>

                <View style={styles.banner}>
                  <Feather name="inbox" size={14} color={T.accent} style={styles.bannerIcon} />
                  <Text style={styles.bannerText}>
                    Can't find it? Check your spam or junk folder.
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.buttonOuter}
                  activeOpacity={0.85}
                  onPress={verifyOtp}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={loading ? ["#4A3A28", "#4A3A28"] : T.accentGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.button}
                  >
                    {loading ? (
                      <ActivityIndicator color="#1A120B" />
                    ) : (
                      <>
                        <Text style={styles.buttonText}>Verify OTP</Text>
                        <Feather name="arrow-right" size={18} color="#1A120B" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={styles.backLink} onPress={() => router.back()} hitSlop={8}>
                  <Feather name="arrow-left" size={14} color={T.accent} style={{ marginRight: 6 }} />
                  <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
              </View>
            </View>
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
    marginTop: 8,
    textAlign: "center",
    lineHeight: 19,
  },
  emailHighlight: {
    fontWeight: "800",
    color: T.accent,
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
    marginBottom: 10,
  },
  otpWrap: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 18,
    backgroundColor: T.surfaceAlt,
    marginBottom: 14,
  },
  otpWrapFocused: {
    borderColor: T.borderFocused,
    backgroundColor: "rgba(255, 138, 61, 0.14)",
  },
  otpInput: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 28,
    fontWeight: "800",
    color: T.textPrimary,
    letterSpacing: 10,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.accent + "28",
    backgroundColor: T.accent + "12",
    padding: 12,
    marginBottom: 6,
  },
  bannerIcon: { marginRight: 9, marginTop: 1 },
  bannerText: { fontSize: 12, flex: 1, lineHeight: 17, color: T.textSecondary },
  buttonOuter: {
    borderRadius: 18,
    overflow: "hidden",
    marginTop: 16,
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
    marginRight: 8,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginTop: 4,
  },
  backText: {
    fontSize: 13,
    color: T.accent,
    fontWeight: "700",
  },
});