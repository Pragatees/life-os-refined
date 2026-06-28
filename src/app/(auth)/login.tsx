import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const BASE_URL = "https://life-os-backend-1ozl.onrender.com/api";

export default function Login() {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!usernameOrEmail.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter username/email and password.");
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post(`${BASE_URL}/auth/login`, {
        usernameOrEmail,
        password,
      });

      const data = response.data;

      await AsyncStorage.multiSet([
        ["token", data.accessToken],
        ["userId", data.userId],
        ["username", data.username],
        ["fullName", data.fullName],
        ["email", data.email],
        ["theme", "bright"],
      ]);

      Alert.alert("Login Successful", `Welcome ${data.fullName}`, [
        {
          text: "OK",
          onPress: () => router.replace("/(tabs)/dashboard"),
        },
      ]);
    } catch (error: any) {
      if (error.response) {
        Alert.alert(
          "Login Failed",
          error.response.data?.message || "Invalid username/email or password."
        );
      } else {
        Alert.alert("Network Error", "Unable to connect to the server.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Life-OS</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>
      </View>

      {/* Form */}
      <View style={styles.form}>
        <Text style={styles.label}>Username or Email</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your username or email"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          value={usernameOrEmail}
          onChangeText={setUsernameOrEmail}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your password"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {/* Forgot Password */}
        <TouchableOpacity
          style={styles.forgotPasswordContainer}
          onPress={() => router.push("/forgotPassword")}
        >
          <Text style={styles.forgotPasswordText}>Forgot password?</Text>
        </TouchableOpacity>

        {/* Login Button */}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={login}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Sign Up Link */}
      <View style={styles.signupContainer}>
        <Text style={styles.signupPrompt}>Don't have an account? </Text>
        <TouchableOpacity onPress={() => router.push("/signup")}>
          <Text style={styles.signupLink}>Sign up</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f9fafb",
  },
  header: {
    alignItems: "center",
    marginBottom: 36,
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    color: "#2563eb",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "#6b7280",
    marginTop: 6,
  },
  form: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 14,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  forgotPasswordContainer: {
    alignSelf: "flex-end",
    marginBottom: 20,
    marginTop: -6,
  },
  forgotPasswordText: {
    fontSize: 13,
    color: "#2563eb",
    fontWeight: "500",
  },
  button: {
    backgroundColor: "#2563eb",
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  signupContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
  },
  signupPrompt: {
    fontSize: 14,
    color: "#6b7280",
  },
  signupLink: {
    fontSize: 14,
    color: "#2563eb",
    fontWeight: "600",
  },
});