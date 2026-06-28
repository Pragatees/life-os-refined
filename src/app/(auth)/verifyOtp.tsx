import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const BASE_URL = "https://life-os-backend-1ozl.onrender.com/api";

export default function VerifyOtp() {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");

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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Enter OTP</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to{"\n"}
          <Text style={styles.emailHighlight}>{email}</Text>
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Verification code</Text>
        <TextInput
          style={styles.otpInput}
          placeholder="000000"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
          maxLength={6}
          value={otp}
          onChangeText={setOtp}
          textAlign="center"
        />

        <View style={styles.spamNotice}>
          <Text style={styles.spamText}>
            📬 Can't find it? Check your spam or junk folder.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={verifyOtp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Verify OTP</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#f9fafb" },
  header: { alignItems: "center", marginBottom: 32 },
  title: { fontSize: 28, fontWeight: "800", color: "#2563eb", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: "#6b7280", marginTop: 6, textAlign: "center", lineHeight: 20 },
  emailHighlight: { fontWeight: "700", color: "#111827" },
  form: {
    backgroundColor: "#ffffff", borderRadius: 16, padding: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 },
  otpInput: {
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 16, marginBottom: 16,
    fontSize: 28, fontWeight: "700", color: "#111827",
    backgroundColor: "#f9fafb", letterSpacing: 8,
  },
  spamNotice: {
    backgroundColor: "#eff6ff", borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: "#bfdbfe", marginBottom: 16,
  },
  spamText: { fontSize: 12, color: "#1d4ed8", lineHeight: 18 },
  button: {
    backgroundColor: "#2563eb", paddingVertical: 15,
    borderRadius: 10, alignItems: "center", marginBottom: 12,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  backLink: { alignItems: "center", paddingVertical: 8 },
  backText: { fontSize: 14, color: "#2563eb", fontWeight: "500" },
});