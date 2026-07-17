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

const BASE_URL = `${process.env.EXPO_PUBLIC_API_URL}/api`;

// ─── Theme Tokens (Claymorphism — same language as the rest of the auth flow) ─
// Near-black background, warm amber/orange accent, soft clay shadows.
// No blue, purple, violet, or pink anywhere in the palette.
const T = {
  bg: ["#0A0A0B", "#141210", "#1C1712"] as const,
  surface: "rgba(24, 24, 27, 0.85)",
  surfaceAlt: "rgba(255, 138, 61, 0.08)",
  accent: "#FF8A3D",
  accentGradient: ["#FF8A3D", "#FFB25E"] as const,
  success: "#3DD68C",
  danger: "#FF6B5B",
  textPrimary: "#F5F5F4",
  textSecondary: "rgba(245, 245, 244, 0.62)",
  textFaint: "rgba(245, 245, 244, 0.38)",
  border: "rgba(255, 138, 61, 0.18)",
  borderFocused: "#FF8A3D",
};

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [newVisible, setNewVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

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

  // ✅ Read stored token — user never sees or types it
  useEffect(() => {
    AsyncStorage.getItem("resetToken").then((t) => {
      if (!t) {
        Alert.alert("Session expired", "Please restart the forgot password process.", [
          { text: "OK", onPress: () => router.replace("/forgotPassword") },
        ]);
        return;
      }
      setToken(t);
    });
  }, []);

  const resetPassword = async () => {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert("Error", "Please fill in both fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }
    if (!token) {
      Alert.alert("Error", "Session expired. Please try again.");
      router.replace("/forgotPassword");
      return;
    }

    try {
      setLoading(true);
      await axios.post(`${BASE_URL}/auth/reset-password`, {
        token,             // ✅ from AsyncStorage, not from user input
        newPassword,
        confirmPassword,
      });

      // Clean up all reset-related storage
      await AsyncStorage.multiRemove([
        "resetToken",
        "reset_email",
        "otp_cooldown_until",
      ]);

      Alert.alert(
        "Password Reset",
        "Your password has been changed successfully. Please log in.",
        [{ text: "Go to Login", onPress: () => router.replace("/login") }]
      );
    } catch (error: any) {
      Alert.alert(
        "Reset Failed",
        error.response?.data || error.response?.data?.message || "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  };

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const buttonDisabled = loading || !token;

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
                  <Feather name="lock" size={26} color="#1A120B" />
                </LinearGradient>
              </Animated.View>
              <Text style={styles.title}>New Password</Text>
              <Text style={styles.subtitle}>Choose a strong password for your account</Text>
            </View>

            {/* Form Card */}
            <View style={styles.formWrap}>
              <View style={styles.form}>
                <Text style={styles.label}>New Password</Text>
                <View
                  style={[
                    styles.inputWrap,
                    focusedField === "new" && styles.inputWrapFocused,
                  ]}
                >
                  <View style={styles.inputIconWrap}>
                    <Feather name="lock" size={16} color={focusedField === "new" ? T.accent : T.textFaint} />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter new password"
                    placeholderTextColor={T.textFaint}
                    secureTextEntry={!newVisible}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    onFocus={() => setFocusedField("new")}
                    onBlur={() => setFocusedField(null)}
                    selectionColor={T.accent}
                    cursorColor={T.accent}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setNewVisible((v) => !v)} hitSlop={8}>
                    <Feather name={newVisible ? "eye-off" : "eye"} size={16} color={T.textFaint} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Confirm Password</Text>
                <View
                  style={[
                    styles.inputWrap,
                    focusedField === "confirm" && styles.inputWrapFocused,
                    passwordsMismatch && styles.inputWrapError,
                  ]}
                >
                  <View style={styles.inputIconWrap}>
                    <Feather name="lock" size={16} color={focusedField === "confirm" ? T.accent : T.textFaint} />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Re-enter new password"
                    placeholderTextColor={T.textFaint}
                    secureTextEntry={!confirmVisible}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => setFocusedField("confirm")}
                    onBlur={() => setFocusedField(null)}
                    selectionColor={T.accent}
                    cursorColor={T.accent}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setConfirmVisible((v) => !v)} hitSlop={8}>
                    <Feather name={confirmVisible ? "eye-off" : "eye"} size={16} color={T.textFaint} />
                  </TouchableOpacity>
                </View>

                {/* Live match indicator */}
                {confirmPassword.length > 0 && (
                  <View style={styles.matchRow}>
                    <Feather
                      name={passwordsMatch ? "check-circle" : "x-circle"}
                      size={13}
                      color={passwordsMatch ? T.success : T.danger}
                      style={styles.matchIcon}
                    />
                    <Text style={[styles.matchText, { color: passwordsMatch ? T.success : T.danger }]}>
                      {passwordsMatch ? "Passwords match" : "Passwords don't match"}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.buttonOuter}
                  activeOpacity={0.85}
                  onPress={resetPassword}
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
                      <>
                        <Text style={styles.buttonText}>Reset Password</Text>
                        <Feather name="arrow-right" size={18} color="#1A120B" />
                      </>
                    )}
                  </LinearGradient>
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
    marginTop: 4,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    backgroundColor: T.surfaceAlt,
    marginBottom: 14,
  },
  inputWrapFocused: {
    borderColor: T.borderFocused,
    backgroundColor: "rgba(255, 138, 61, 0.14)",
  },
  inputWrapError: {
    borderColor: T.danger,
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
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: -8,
    marginBottom: 16,
    marginLeft: 2,
  },
  matchIcon: { marginRight: 6 },
  matchText: { fontSize: 12, fontWeight: "700" },
  buttonOuter: {
    borderRadius: 18,
    overflow: "hidden",
    marginTop: 4,
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
});