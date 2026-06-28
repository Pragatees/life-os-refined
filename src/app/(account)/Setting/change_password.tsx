import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, Animated, Pressable, ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

const THEMES = {
  dark:   { sheet: "#1E293B", inputBg: "#0F172A", accent: "#6366F1", textPrimary: "#F8FAFC", textSecondary: "#94A3B8", border: "#334155", overlay: "rgba(0,0,0,0.6)" },
  bright: { sheet: "#FFFFFF", inputBg: "#F1F5F9", accent: "#6366F1", textPrimary: "#0F172A", textSecondary: "#64748B", border: "#E2E8F0", overlay: "rgba(0,0,0,0.3)" },
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
    if (level === "weak") return "#EF4444";
    if (level === "medium") return "#F59E0B";
    return "#10B981";
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
      const response = await fetch("https://life-os-backend-1ozl.onrender.com/api/users/password", {
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
            { backgroundColor: C.sheet, opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
          ]}
        >
          {/* Title row */}
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: C.textPrimary }]}>Change Password</Text>
            <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.divider, { backgroundColor: C.border }]} />

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
            />
            <TouchableOpacity onPress={() => setCurrentVisible(v => !v)} style={styles.eyeBtn}>
              <Ionicons name={currentVisible ? "eye-off-outline" : "eye-outline"} size={20} color={C.textSecondary} />
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
            />
            <TouchableOpacity onPress={() => setNewVisible(v => !v)} style={styles.eyeBtn}>
              <Ionicons name={newVisible ? "eye-off-outline" : "eye-outline"} size={20} color={C.textSecondary} />
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
                <Text style={{ color: getStrengthColor(strength.level) }}>{getStrengthLabel(strength.level)}</Text>
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
            />
            <TouchableOpacity onPress={() => setConfirmVisible(v => !v)} style={styles.eyeBtn}>
              <Ionicons name={confirmVisible ? "eye-off-outline" : "eye-outline"} size={20} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Security note */}
          <View style={[styles.securityCard, { borderColor: "rgba(99,102,241,0.2)" }]}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#6366F1" />
            <Text style={[styles.securityText, { color: C.textSecondary }]}>
              For your security, updating your password will sign you out.
            </Text>
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: C.accent, opacity: loading ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Update Password</Text>}
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
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  titleRow:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title:             { fontSize: 17, fontWeight: "700" },
  divider:           { height: 1, marginBottom: 4 },
  label:             { fontSize: 12, fontWeight: "600", marginBottom: 6, marginTop: 14 },
  inputWrapper:      { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, minHeight: 48 },
  inputInner:        { flex: 1, paddingVertical: 12, fontSize: 15 },
  eyeBtn:            { paddingLeft: 8 },
  strengthContainer: { marginTop: 8, marginBottom: 4 },
  strengthBarBg:     { height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 6 },
  strengthBar:       { height: "100%", borderRadius: 2 },
  strengthLabel:     { fontSize: 12, fontWeight: "500" },
  securityCard:      { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(99,102,241,0.08)", padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 16, marginBottom: 4 },
  securityText:      { fontSize: 13, marginLeft: 10, flex: 1, lineHeight: 18 },
  btn:               { borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  btnText:           { color: "#fff", fontSize: 15, fontWeight: "700" },
});