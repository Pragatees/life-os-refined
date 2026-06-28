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
  dark:   { sheet: "#1E293B", inputBg: "#0F172A", accent: "#EF4444", textPrimary: "#F8FAFC", textSecondary: "#94A3B8", border: "#334155", overlay: "rgba(0,0,0,0.6)" },
  bright: { sheet: "#FFFFFF", inputBg: "#F1F5F9", accent: "#EF4444", textPrimary: "#0F172A", textSecondary: "#64748B", border: "#E2E8F0", overlay: "rgba(0,0,0,0.3)" },
};

export default function DeleteAccountModal({ visible, onClose, theme }: { visible: boolean; onClose: () => void; theme: "dark" | "bright" }) {
  const [step, setStep]           = useState<"confirm" | "password">("confirm");
  const [password, setPassword]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [pwVisible, setPwVisible] = useState(false);
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
      setPassword("");
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

  const handleDeletePress = () => {
    Alert.alert(
      "Delete Account",
      "This action cannot be undone. All your tasks and account data will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => setStep("password") },
      ]
    );
  };

  const handleConfirmDelete = async () => {
    if (!password.trim()) {
      Alert.alert("Error", "Please enter your password");
      return;
    }
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      const response = await fetch("https://life-os-backend-1ozl.onrender.com/api/users/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert("Account Deleted", data.message || "Your account has been deleted successfully.", [
          {
            text: "OK",
            onPress: async () => {
              await AsyncStorage.removeItem("token");
              dismiss();
              router.replace("/");
            },
          },
        ]);
      } else {
        Alert.alert("Error", data.message || "Failed to delete account");
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
            <Text style={[styles.title, { color: "#EF4444" }]}>
              {step === "confirm" ? "Delete Account" : "Verify Identity"}
            </Text>
            <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          {/* Warning card */}
          <View style={styles.warningCard}>
            <Ionicons name="warning-outline" size={20} color="#EF4444" />
            <Text style={[styles.warningText, { color: C.textPrimary }]}>
              {step === "confirm"
                ? "All your tasks, projects, and account data will be permanently deleted."
                : "Enter your password to confirm permanent account deletion."}
            </Text>
          </View>

          {step === "confirm" ? (
            <>
              <Text style={[styles.description, { color: C.textSecondary }]}>
                This action is permanent and cannot be undone. Please make sure you want to proceed before continuing.
              </Text>
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDeletePress} activeOpacity={0.85}>
                <Text style={styles.deleteBtnText}>Delete My Account</Text>
              </TouchableOpacity>
            </>
          ) : (
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
                />
                <TouchableOpacity onPress={() => setPwVisible(v => !v)} style={styles.eyeBtn}>
                  <Ionicons name={pwVisible ? "eye-off-outline" : "eye-outline"} size={20} color={C.textSecondary} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.deleteBtn, loading && styles.btnDisabled]}
                onPress={handleConfirmDelete}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.deleteBtnText}>Confirm Delete</Text>}
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
  titleRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title:         { fontSize: 17, fontWeight: "700" },
  divider:       { height: 1, marginBottom: 16 },
  warningCard:   { flexDirection: "row", alignItems: "flex-start", backgroundColor: "rgba(239,68,68,0.08)", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", marginBottom: 16 },
  warningText:   { fontSize: 13, marginLeft: 10, flex: 1, lineHeight: 18, fontWeight: "500" },
  description:   { fontSize: 14, lineHeight: 20, marginBottom: 24 },
  label:         { fontSize: 12, fontWeight: "600", marginBottom: 6, marginTop: 4 },
  inputWrapper:  { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, minHeight: 48 },
  inputInner:    { flex: 1, paddingVertical: 12, fontSize: 15 },
  eyeBtn:        { paddingLeft: 8 },
  deleteBtn:     { backgroundColor: "#EF4444", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  deleteBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  btnDisabled:   { opacity: 0.7 },
});