import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, Animated, Pressable,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

// ─── Theme Tokens (Claymorphism — same language as the rest of the app) ────
// Dark = near-black with warm amber/orange accent.
// Bright = white / soft grey, same warm accent for consistency.
// No blue, purple, violet, or pink anywhere in the palette.
const THEMES = {
  dark: {
    sheet: "#18181B",
    surfaceAlt: "#212124",
    inputBg: "#212124",
    accent: "#FF8A3D",
    accentGradient: ["#FF8A3D", "#FFB25E"] as const,
    success: "#3DD68C",
    warning: "#FFC24B",
    danger: "#FF6B5B",
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
    accentGradient: ["#FF8A3D", "#FF6B1F"] as const,
    success: "#22B573",
    warning: "#F0A93B",
    danger: "#EF5A4C",
    textPrimary: "#1C1C1E",
    textSecondary: "#7A7A80",
    border: "#E6E6E9",
    overlay: "rgba(20,15,10,0.4)",
    shadowDark: "#B9B9C0",
  },
};

export default function ChangePasswordModal({ visible, onClose, theme }: { visible: boolean; onClose: () => void; theme: "dark" | "bright" }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading]                 = useState(false);
  const [currentVisible, setCurrentVisible]   = useState(false);
  const [newVisible, setNewVisible]           = useState(false);
  const [confirmVisible, setConfirmVisible]   = useState(false);
  const scaleAnim   = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const C = THEMES[theme];

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim,   { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setCurrentVisible(false);
      setNewVisible(false);
      setConfirmVisible(false);
    }
  }, [visible]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(scaleAnim,   { toValue: 0.85, duration: 150, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0,    duration: 150, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const calculateStrength = useCallback((password: string): { level: "weak" | "medium" | "strong"; width: number } => {
    if (!password) return { level: "weak", width: 0 };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;
    if (score <= 2) return { level: "weak", width: 33 };
    if (score <= 3) return { level: "medium", width: 66 };
    return { level: "strong", width: 100 };
  }, []);

  const getStrengthColor = (level: string) => {
    if (level === "weak") return C.danger;
    if (level === "medium") return C.warning;
    return C.success;
  };

  const getStrengthLabel = (level: string) => {
    if (level === "weak") return "Weak";
    if (level === "medium") return "Medium";
    return "Strong";
  };

  const strength = calculateStrength(newPassword);

  const handleSave = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert("Error", "Please fill all fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "New password and confirm password do not match");
      return;
    }
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/users/password`,  {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert("Password Updated", data.message || "Your password has been changed successfully.", [
          {
            text: "OK",
            onPress: async () => {
              await AsyncStorage.removeItem("token");
              dismiss();
              router.replace("/login");
            },
          },
        ]);
      } else {
        Alert.alert("Error", data.message || "Failed to update password");
      }
    } catch {
      Alert.alert("Error", "Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

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
              borderColor: C.border,
              shadowColor: C.shadowDark,
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Title row */}
          <View style={styles.titleRow}>
            <View style={styles.titleLeft}>
              <View style={[styles.titleIconWrap, { backgroundColor: C.accent + "1E", borderColor: C.accent + "35" }]}>
                <Ionicons name="lock-closed-outline" size={16} color={C.accent} />
              </View>
              <Text style={[styles.title, { color: C.textPrimary }]}>Change Password</Text>
            </View>
            <TouchableOpacity
              onPress={dismiss}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[styles.closeBtn, { backgroundColor: C.surfaceAlt }]}
            >
              <Ionicons name="close" size={17} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Current Password */}
          <Text style={[styles.label, { color: C.textSecondary }]}>Current Password</Text>
          <View style={[styles.inputWrapper, { backgroundColor: C.inputBg, borderColor: C.border }]}>
            <TextInput
              style={[styles.inputInner, { color: C.textPrimary }]}
              placeholder="Enter current password"
              placeholderTextColor={C.textSecondary}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!currentVisible}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              selectionColor={C.accent}
              cursorColor={C.accent}
            />
            <TouchableOpacity onPress={() => setCurrentVisible(v => !v)} style={styles.eyeBtn} hitSlop={8}>
              <Ionicons name={currentVisible ? "eye-off-outline" : "eye-outline"} size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* New Password */}
          <Text style={[styles.label, { color: C.textSecondary }]}>New Password</Text>
          <View style={[styles.inputWrapper, { backgroundColor: C.inputBg, borderColor: C.border }]}>
            <TextInput
              style={[styles.inputInner, { color: C.textPrimary }]}
              placeholder="Enter new password"
              placeholderTextColor={C.textSecondary}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!newVisible}
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor={C.accent}
              cursorColor={C.accent}
            />
            <TouchableOpacity onPress={() => setNewVisible(v => !v)} style={styles.eyeBtn} hitSlop={8}>
              <Ionicons name={newVisible ? "eye-off-outline" : "eye-outline"} size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Strength indicator */}
          {newPassword.length > 0 && (
            <View style={styles.strengthContainer}>
              <View style={[styles.strengthBarBg, { backgroundColor: C.border }]}>
                <View style={[styles.strengthBar, { width: `${strength.width}%` as any, backgroundColor: getStrengthColor(strength.level) }]} />
              </View>
              <Text style={[styles.strengthLabel, { color: C.textSecondary }]}>
                Password Strength:{" "}
                <Text style={{ color: getStrengthColor(strength.level), fontWeight: "700" }}>{getStrengthLabel(strength.level)}</Text>
              </Text>
            </View>
          )}

          {/* Confirm Password */}
          <Text style={[styles.label, { color: C.textSecondary }]}>Confirm Password</Text>
          <View style={[styles.inputWrapper, { backgroundColor: C.inputBg, borderColor: C.border }]}>
            <TextInput
              style={[styles.inputInner, { color: C.textPrimary }]}
              placeholder="Confirm new password"
              placeholderTextColor={C.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!confirmVisible}
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor={C.accent}
              cursorColor={C.accent}
            />
            <TouchableOpacity onPress={() => setConfirmVisible(v => !v)} style={styles.eyeBtn} hitSlop={8}>
              <Ionicons name={confirmVisible ? "eye-off-outline" : "eye-outline"} size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Security note */}
          <View style={[styles.securityCard, { backgroundColor: C.accent + "12", borderColor: C.accent + "28" }]}>
            <View style={[styles.securityIconWrap, { backgroundColor: C.accent + "1E" }]}>
              <Ionicons name="shield-checkmark-outline" size={15} color={C.accent} />
            </View>
            <Text style={[styles.securityText, { color: C.textSecondary }]}>
              For your security, updating your password will sign you out.
            </Text>
          </View>

          {/* Save button */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.85}
            style={loading ? styles.btnDisabled : undefined}
          >
            <LinearGradient
              colors={C.accentGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btn}
            >
              {loading ? <ActivityIndicator color="#1A120B" /> : <Text style={styles.btnText}>Update Password</Text>}
            </LinearGradient>
          </TouchableOpacity>
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
  titleRow:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  titleLeft:         { flexDirection: "row", alignItems: "center", gap: 10 },
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
  title:             { fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  label:             { fontSize: 10, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 8, marginTop: 4 },
  inputWrapper:      { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, minHeight: 50, marginBottom: 6 },
  inputInner:        { flex: 1, paddingVertical: 12, fontSize: 15 },
  eyeBtn:            { paddingLeft: 8 },
  strengthContainer: { marginTop: 6, marginBottom: 2 },
  strengthBarBg:     { height: 5, borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  strengthBar:       { height: "100%", borderRadius: 3 },
  strengthLabel:     { fontSize: 12, fontWeight: "500" },
  securityCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 15,
    borderWidth: 1,
    marginTop: 16,
    marginBottom: 4,
  },
  securityIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  securityText:      { fontSize: 12, flex: 1, lineHeight: 17 },
  btn:               { borderRadius: 16, paddingVertical: 15, alignItems: "center", justifyContent: "center", marginTop: 20 },
  btnDisabled:       { opacity: 0.7 },
  btnText:           { color: "#1A120B", fontSize: 14, fontWeight: "800" },
});