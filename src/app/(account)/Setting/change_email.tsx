import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, Animated, Pressable,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

const THEMES = {
  dark:   { sheet: "#1E293B", inputBg: "#0F172A", accent: "#6366F1", textPrimary: "#F8FAFC", textSecondary: "#94A3B8", border: "#334155", overlay: "rgba(0,0,0,0.6)" },
  bright: { sheet: "#FFFFFF", inputBg: "#F1F5F9", accent: "#6366F1", textPrimary: "#0F172A", textSecondary: "#64748B", border: "#E2E8F0", overlay: "rgba(0,0,0,0.3)" },
};

export default function ChangeEmailModal({ visible, onClose, theme }: { visible: boolean; onClose: () => void; theme: "dark" | "bright" }) {
  const [step, setStep]           = useState<"password" | "email">("password");
  const [password, setPassword]   = useState("");
  const [email, setEmail]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [pwVisible, setPwVisible] = useState(false);
  const scaleAnim   = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const C = THEMES[theme];

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim,   { toValue: 1,   useNativeDriver: true, damping: 18, stiffness: 220 }),
        Animated.timing(opacityAnim, { toValue: 1,   duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
      setPassword("");
      setEmail("");
      setStep("password");
      setPwVisible(false);
    }
  }, [visible]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(scaleAnim,   { toValue: 0.85, duration: 150, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0,    duration: 150, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const handleVerifyPassword = async () => {
    if (!password.trim()) {
      Alert.alert("Error", "Please enter your password");
      return;
    }
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      const response = await fetch("https://life-os-backend-1ozl.onrender.com/api/users/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (response.ok) {
        setStep("email");
      } else {
        Alert.alert("Error", data.message || "Incorrect password");
      }
    } catch {
      Alert.alert("Error", "Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter an email");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      const response = await fetch("https://life-os-backend-1ozl.onrender.com/api/users/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newEmail: email }),
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert("Email Updated", data.message || "Your email has been changed successfully.", [
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
        Alert.alert("Error", data.message || "Failed to update email");
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
            <Text style={[styles.title, { color: C.textPrimary }]}>
              {step === "password" ? "Verify Identity" : "Change Email"}
            </Text>
            <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          {step === "password" ? (
            <>
              <Text style={[styles.label, { color: C.textSecondary }]}>Current Password</Text>
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
                />
                <TouchableOpacity onPress={() => setPwVisible(v => !v)} style={styles.eyeBtn}>
                  <Ionicons name={pwVisible ? "eye-off-outline" : "eye-outline"} size={20} color={C.textSecondary} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: C.accent, opacity: loading ? 0.7 : 1 }]}
                onPress={handleVerifyPassword}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Verify →</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: C.textSecondary }]}>New Email</Text>
              <TextInput
                style={[styles.inputStandalone, { backgroundColor: C.inputBg, borderColor: C.border, color: C.textPrimary }]}
                placeholder="Enter new email"
                placeholderTextColor={C.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: C.accent, opacity: loading ? 0.7 : 1 }]}
                onPress={handleUpdateEmail}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save</Text>}
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
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title:           { fontSize: 17, fontWeight: "700" },
  divider:         { height: 1, marginBottom: 4 },
  label:           { fontSize: 12, fontWeight: "600", marginBottom: 6, marginTop: 14 },
  inputWrapper:    { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, minHeight: 48 },
  inputInner:      { flex: 1, paddingVertical: 12, fontSize: 15 },
  inputStandalone: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 48 },
  eyeBtn:          { paddingLeft: 8 },
  btn:             { borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 24 },
  btnText:         { color: "#fff", fontSize: 15, fontWeight: "700" },
});