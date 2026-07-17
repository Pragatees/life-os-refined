import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Animated, Pressable } from "react-native";
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
    textPrimary: "#1C1C1E",
    textSecondary: "#7A7A80",
    border: "#E6E6E9",
    overlay: "rgba(20,15,10,0.4)",
    shadowDark: "#B9B9C0",
  },
};

export default function ChangeUsernameModal({ visible, onClose, theme }: { visible: boolean; onClose: () => void; theme: "dark" | "bright" }) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading]   = useState(false);
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
      setUsername("");
      setFullName("");
    }
  }, [visible]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(scaleAnim,   { toValue: 0.85, duration: 150, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0,    duration: 150, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const handleSave = async () => {
    if (!username.trim() || !fullName.trim()) { Alert.alert("Error", "Please fill all fields"); return; }
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/users/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username, fullName }),
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert("Success", data.message || "Profile updated. Please login again.", [{
          text: "OK", onPress: async () => { await AsyncStorage.removeItem("token"); dismiss(); router.replace("/login" as any); },
        }]);
      } else { Alert.alert("Error", data.message || "Failed to update"); }
    } catch { Alert.alert("Error", "Network error. Try again."); }
    finally { setLoading(false); }
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
                <Ionicons name="at-outline" size={16} color={C.accent} />
              </View>
              <Text style={[styles.title, { color: C.textPrimary }]}>Change Username</Text>
            </View>
            <TouchableOpacity
              onPress={dismiss}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[styles.closeBtn, { backgroundColor: C.surfaceAlt }]}
            >
              <Ionicons name="close" size={17} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: C.textSecondary }]}>Username</Text>
          <View style={[styles.inputWrapper, { backgroundColor: C.inputBg, borderColor: C.border }]}>
            <TextInput
              style={[styles.inputInner, { color: C.textPrimary }]}
              placeholder="New username"
              placeholderTextColor={C.textSecondary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              selectionColor={C.accent}
              cursorColor={C.accent}
            />
          </View>

          <Text style={[styles.label, { color: C.textSecondary }]}>Full Name</Text>
          <View style={[styles.inputWrapper, { backgroundColor: C.inputBg, borderColor: C.border }]}>
            <TextInput
              style={[styles.inputInner, { color: C.textPrimary }]}
              placeholder="Full name"
              placeholderTextColor={C.textSecondary}
              value={fullName}
              onChangeText={setFullName}
              selectionColor={C.accent}
              cursorColor={C.accent}
            />
          </View>

          <View style={[styles.noteRow, { backgroundColor: C.accent + "12", borderColor: C.accent + "28" }]}>
            <Ionicons name="information-circle-outline" size={14} color={C.accent} style={styles.noteIcon} />
            <Text style={[styles.note, { color: C.textSecondary }]}>You'll be signed out after saving.</Text>
          </View>

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
              {loading ? <ActivityIndicator color="#1A120B" /> : <Text style={styles.btnText}>Save</Text>}
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
  titleRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  titleLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
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
  title:        { fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  label:        { fontSize: 10, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 8, marginTop: 4 },
  inputWrapper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, minHeight: 50, marginBottom: 6 },
  inputInner:   { flex: 1, paddingVertical: 12, fontSize: 15 },
  noteRow:      { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10 },
  noteIcon:     { marginRight: 8 },
  note:         { fontSize: 12, flex: 1 },
  btn:          { borderRadius: 16, paddingVertical: 15, alignItems: "center", justifyContent: "center", marginTop: 20 },
  btnDisabled:  { opacity: 0.7 },
  btnText:      { color: "#1A120B", fontSize: 14, fontWeight: "800" },
});