import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, Animated, Pressable, Keyboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

// ─── Theme Tokens (Claymorphism — same language as the rest of the app) ────
// Dark = near-black with warm amber/orange accent + coral danger.
// Bright = white / soft grey, same coral danger for consistency.
// No blue, purple, violet, or pink anywhere in the palette.
const THEMES = {
  dark: {
    sheet: "#18181B",
    surfaceAlt: "#212124",
    inputBg: "#212124",
    accent: "#FF8A3D",
    danger: "#FF6B5B",
    dangerDeep: "#E14A3B",
    textPrimary: "#F5F5F4",
    textSecondary: "#9B9B9F",
    border: "#28282C",
    overlay: "rgba(0,0,0,0.65)",
    shadowDark: "#000000",
  },
  bright: {
    sheet: "#FFFFFF",
    surfaceAlt: "#EDEDEF",
    inputBg: "#F4F4F5",
    accent: "#FF7A2F",
    danger: "#EF5A4C",
    dangerDeep: "#D8402F",
    textPrimary: "#1C1C1E",
    textSecondary: "#7A7A80",
    border: "#E6E6E9",
    overlay: "rgba(20,15,10,0.4)",
    shadowDark: "#B9B9C0",
  },
};

const API_BASE = "https://life-os-backend-1ozl.onrender.com/api/users";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Steps:
// "confirm"  -> initial warning screen
// "password" -> local (username/password) users confirm with password
// "email"    -> google users enter/confirm the email to receive the OTP
// "otp"      -> google users confirm with emailed OTP
type Step = "confirm" | "password" | "email" | "otp";

export default function DeleteAccountModal({ visible, onClose, theme }: { visible: boolean; onClose: () => void; theme: "dark" | "bright" }) {
  const [step, setStep]           = useState<Step>("confirm");
  const [password, setPassword]   = useState("");
  const [otp, setOtp]             = useState("");
  const [email, setEmail]         = useState("");
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [pwVisible, setPwVisible] = useState(false);
  const scaleAnim   = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const C = THEMES[theme];

  useEffect(() => {
    if (visible) {
      (async () => {
        const [storedEmail, storedProvider] = await Promise.all([
          AsyncStorage.getItem("email"),
          AsyncStorage.getItem("provider"),
        ]);
        setEmail(storedEmail ?? "");
        setIsGoogleUser((storedProvider ?? "").toLowerCase() === "google");
      })();

      Animated.parallel([
        Animated.spring(scaleAnim,   { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
      setPassword("");
      setOtp("");
      setStep("confirm");
      setPwVisible(false);
    }
  }, [visible]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(scaleAnim,   { toValue: 0.85, duration: 150, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0,    duration: 150, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  // ── Step 1: confirm intent, then branch by provider ─────────────────────
  const handleDeletePress = () => {
    Alert.alert(
      "Delete Account",
      "This action cannot be undone. All your tasks and account data will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (isGoogleUser) {
              setStep("email");
            } else {
              setStep("password");
            }
          },
        },
      ]
    );
  };

  // ── Google users: send OTP to the email they typed/confirmed ─────────────
  const handleSendOtp = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email address");
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }
    try {
      setSendingOtp(true);

      const token = await AsyncStorage.getItem("token");

      const response = await fetch(`${API_BASE}/delete-account/send-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      // Read as text first — response body may not always be valid JSON
      // (e.g. a proxy/server error page), so this avoids a hard crash.
      const responseText = await response.text();

      let data: { message?: string } = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        // Not JSON — fall back to the generic status-based message below.
      }

      if (response.ok) {
        setStep("otp");
        Keyboard.dismiss();
      } else {
        Alert.alert("Error", data.message || `Request failed (${response.status})`);
      }
    } catch (error) {
      Alert.alert(
        "Network Error",
        error instanceof Error ? error.message : "Something went wrong. Try again."
      );
    } finally {
      setSendingOtp(false);
    }
  };

  // ── Google users: verify OTP and complete deletion ───────────────────────
  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      Alert.alert("Error", "Please enter the verification code");
      return;
    }
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      const response = await fetch(`${API_BASE}/delete-account/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token: otp }),
      });
      const data = await response.json();
      if (response.ok) {
        await completeLogoutAndRedirect(data.message || "Your account has been deleted successfully.");
      } else {
        Alert.alert("Error", data.message || "Invalid or expired verification code");
      }
    } catch {
      Alert.alert("Error", "Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Local users: verify password and delete directly ─────────────────────
  const handleConfirmDelete = async () => {
    if (!password.trim()) {
      Alert.alert("Error", "Please enter your password");
      return;
    }
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      const response = await fetch(`${API_BASE}/account`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (response.ok) {
        await completeLogoutAndRedirect(data.message || "Your account has been deleted successfully.");
      } else {
        Alert.alert("Error", data.message || "Failed to delete account");
      }
    } catch {
      Alert.alert("Error", "Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Shared: clear session, close modal, redirect ──────────────────────────
  const completeLogoutAndRedirect = async (message: string) => {
    Alert.alert("Account Deleted", message, [
      {
        text: "OK",
        onPress: async () => {
          await AsyncStorage.multiRemove([
            "token", "username", "fullName", "email", "profilePicture", "provider",
          ]);
          dismiss();
          router.replace("/");
        },
      },
    ]);
  };

  const stepIcon = step === "confirm"
    ? "trash-outline"
    : step === "email"
      ? "at-outline"
      : step === "otp"
        ? "mail-outline"
        : "shield-checkmark-outline";

  const stepTitle = step === "confirm"
    ? "Delete Account"
    : step === "email"
      ? "Confirm Your Email"
      : step === "otp"
        ? "Verify Your Email"
        : "Verify Identity";

  const warningMessage = step === "confirm"
    ? "All your tasks, projects, and account data will be permanently deleted."
    : step === "email"
      ? "Enter the email address linked to your account. We'll send a verification code to confirm permanent account deletion."
      : step === "otp"
        ? `Enter the verification code sent to ${email || "your email"} to confirm permanent account deletion.`
        : "Enter your password to confirm permanent account deletion.";

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss}>
      {/* Dimmed backdrop */}
      <Pressable style={[styles.overlay, { backgroundColor: C.overlay }]} onPress={dismiss} />

      {/* Centered popup */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.centeredWrapper}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.popup,
            {
              backgroundColor: C.sheet,
              borderColor: C.danger + "30",
              shadowColor: C.shadowDark,
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Title row */}
          <View style={styles.titleRow}>
            <View style={styles.titleLeft}>
              <View style={[styles.titleIconWrap, { backgroundColor: C.danger + "1E", borderColor: C.danger + "38" }]}>
                <Ionicons name={stepIcon as any} size={16} color={C.danger} />
              </View>
              <Text style={[styles.title, { color: C.danger }]}>{stepTitle}</Text>
            </View>
            <TouchableOpacity
              onPress={dismiss}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[styles.closeBtn, { backgroundColor: C.surfaceAlt }]}
            >
              <Ionicons name="close" size={17} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Warning card */}
          <View style={[styles.warningCard, { backgroundColor: C.danger + "14", borderColor: C.danger + "30" }]}>
            <View style={[styles.warningIconWrap, { backgroundColor: C.danger + "1E" }]}>
              <Ionicons name="warning-outline" size={16} color={C.danger} />
            </View>
            <Text style={[styles.warningText, { color: C.textPrimary }]}>{warningMessage}</Text>
          </View>

          {step === "confirm" && (
            <>
              <Text style={[styles.description, { color: C.textSecondary }]}>
                This action is permanent and cannot be undone. Please make sure you want to proceed before continuing.
              </Text>
              <TouchableOpacity onPress={handleDeletePress} activeOpacity={0.85}>
                <View style={[styles.deleteBtn, { backgroundColor: C.danger, shadowColor: C.danger }]}>
                  <Ionicons name="trash-outline" size={16} color="#FFF" style={styles.deleteBtnIcon} />
                  <Text style={styles.deleteBtnText}>Delete My Account</Text>
                </View>
              </TouchableOpacity>
            </>
          )}

          {step === "password" && (
            <>
              <Text style={[styles.label, { color: C.textSecondary }]}>Password</Text>
              <View style={[styles.inputWrapper, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                <TextInput
                  style={[styles.inputInner, { color: C.textPrimary }]}
                  placeholder="Enter your password"
                  placeholderTextColor={C.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!pwVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleConfirmDelete}
                  selectionColor={C.danger}
                  cursorColor={C.danger}
                />
                <TouchableOpacity onPress={() => setPwVisible(v => !v)} style={styles.eyeBtn} hitSlop={8}>
                  <Ionicons name={pwVisible ? "eye-off-outline" : "eye-outline"} size={18} color={C.textSecondary} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={handleConfirmDelete}
                disabled={loading}
                activeOpacity={0.85}
                style={loading ? styles.btnDisabled : undefined}
              >
                <View style={[styles.deleteBtn, { backgroundColor: C.danger, shadowColor: C.danger }]}>
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" style={styles.deleteBtnIcon} />
                        <Text style={styles.deleteBtnText}>Confirm Delete</Text>
                      </>
                    )}
                </View>
              </TouchableOpacity>
            </>
          )}

          {step === "email" && (
            <>
              <Text style={[styles.label, { color: C.textSecondary }]}>Email Address</Text>
              <View style={[styles.inputWrapper, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                <TextInput
                  style={[styles.inputInner, { color: C.textPrimary }]}
                  placeholder="Enter your email"
                  placeholderTextColor={C.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleSendOtp}
                  selectionColor={C.danger}
                  cursorColor={C.danger}
                />
              </View>
              <TouchableOpacity
                onPress={handleSendOtp}
                disabled={sendingOtp}
                activeOpacity={0.85}
                style={sendingOtp ? styles.btnDisabled : undefined}
              >
                <View style={[styles.deleteBtn, { backgroundColor: C.danger, shadowColor: C.danger }]}>
                  {sendingOtp
                    ? <ActivityIndicator color="#fff" />
                    : (
                      <>
                        <Ionicons name="paper-plane-outline" size={16} color="#FFF" style={styles.deleteBtnIcon} />
                        <Text style={styles.deleteBtnText}>Send Verification Code</Text>
                      </>
                    )}
                </View>
              </TouchableOpacity>
            </>
          )}

          {step === "otp" && (
            <>
              <Text style={[styles.label, { color: C.textSecondary }]}>Verification Code</Text>
              <View style={[styles.inputWrapper, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                <TextInput
                  style={[styles.inputInner, { color: C.textPrimary, letterSpacing: 4 }]}
                  placeholder="6-digit code"
                  placeholderTextColor={C.textSecondary}
                  value={otp}
                  onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleVerifyOtp}
                  selectionColor={C.danger}
                  cursorColor={C.danger}
                  maxLength={6}
                />
              </View>

              <TouchableOpacity onPress={handleSendOtp} disabled={sendingOtp} style={styles.resendWrap}>
                <Text style={[styles.resendText, { color: C.accent }]}>
                  {sendingOtp ? "Resending..." : "Didn't get a code? Resend"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleVerifyOtp}
                disabled={loading}
                activeOpacity={0.85}
                style={loading ? styles.btnDisabled : undefined}
              >
                <View style={[styles.deleteBtn, { backgroundColor: C.danger, shadowColor: C.danger }]}>
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" style={styles.deleteBtnIcon} />
                        <Text style={styles.deleteBtnText}>Confirm Delete</Text>
                      </>
                    )}
                </View>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
  },
  centeredWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  popup: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    elevation: 16,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 26,
  },
  titleRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  titleLeft:     { flexDirection: "row", alignItems: "center", gap: 10 },
  titleIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title:         { fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 15,
    borderWidth: 1,
    marginBottom: 16,
  },
  warningIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  warningText:   { fontSize: 13, flex: 1, lineHeight: 18, fontWeight: "500" },
  description:   { fontSize: 13, lineHeight: 19, marginBottom: 22 },
  label:         { fontSize: 10, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 8, marginTop: 4 },
  inputWrapper:  { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, minHeight: 50 },
  inputInner:    { flex: 1, paddingVertical: 12, fontSize: 15 },
  eyeBtn:        { paddingLeft: 8 },
  resendWrap:    { alignSelf: "flex-start", marginTop: 10 },
  resendText:    { fontSize: 12, fontWeight: "700" },
  deleteBtn: {
    flexDirection: "row",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  deleteBtnIcon: { marginRight: 7 },
  deleteBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  btnDisabled:   { opacity: 0.7 },
});