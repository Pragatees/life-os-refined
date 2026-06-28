import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const BASE_URL = "https://life-os-backend-1ozl.onrender.com/api";

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>New Password</Text>
        <Text style={styles.subtitle}>Choose a strong password for your account</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>New password</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter new password"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
        />

        <Text style={styles.label}>Confirm password</Text>
        <TextInput
          style={styles.input}
          placeholder="Re-enter new password"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        {/* Live match indicator */}
        {confirmPassword.length > 0 && (
          <Text style={[
            styles.matchText,
            newPassword === confirmPassword ? { color: "#16a34a" } : { color: "#dc2626" },
          ]}>
            {newPassword === confirmPassword ? "✓ Passwords match" : "✗ Passwords don't match"}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.button, (loading || !token) && styles.buttonDisabled]}
          onPress={resetPassword}
          disabled={loading || !token}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Reset Password</Text>
          )}
        </TouchableOpacity>
      </View>
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
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, marginBottom: 14,
    fontSize: 15, color: "#111827", backgroundColor: "#f9fafb",
  },
  matchText: { fontSize: 12, marginBottom: 16, marginTop: -8 },
  button: {
    backgroundColor: "#2563eb", paddingVertical: 15,
    borderRadius: 10, alignItems: "center", marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});