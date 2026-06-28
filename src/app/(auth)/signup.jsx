import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { router } from "expo-router";

const API_URL = "https://life-os-backend-1ozl.onrender.com/api";

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function getStrength(pwd) {
  if (!pwd.length) return { width: 0, color: "#e5e7eb", label: "" };
  const score = [
    pwd.length >= 8,
    /[A-Z]/.test(pwd),
    /[a-z]/.test(pwd),
    /[0-9]/.test(pwd),
    /[^A-Za-z0-9]/.test(pwd),
  ].filter(Boolean).length;
  if (score <= 2) return { width: 33, color: "#ef4444", label: "Weak" };
  if (score <= 3) return { width: 66, color: "#f59e0b", label: "Fair" };
  return { width: 100, color: "#10b981", label: "Strong" };
}

export default function SignUp() {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [errors, setErrors]     = useState({});

  const clearError = (key) => setErrors((e) => ({ ...e, [key]: "" }));

  const validate = () => {
    const e = {};
    if (!fullName.trim())                e.fullName = "Full name is required";
    if (!username.trim())                e.username = "Username is required";
    else if (username.trim().length < 3) e.username = "At least 3 characters";
    if (!email.trim())                   e.email = "Email is required";
    else if (!isEmail(email.trim()))     e.email = "Enter a valid email";
    if (!password)                       e.password = "Password is required";
    else if (password.length < 6)        e.password = "At least 6 characters";
    if (!confirm)                        e.confirm = "Please confirm your password";
    else if (password !== confirm)       e.confirm = "Passwords don't match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSignUp = async () => {
    if (!validate()) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Account Created", data.message || "You're all set.", [
          { text: "Sign In", onPress: () => router.replace("/login") },
        ]);
      } else {
        Alert.alert("Sign Up Failed", data.message || "Something went wrong.");
      }
    } catch {
      Alert.alert("Network Error", "Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const strength = getStrength(password);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Life-OS</Text>
          <Text style={styles.subtitle}>Create your account</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>

          {/* Full Name */}
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={[styles.input, !!errors.fullName && styles.inputError]}
            placeholder="Enter your full name"
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
            value={fullName}
            onChangeText={(t) => { setFullName(t); clearError("fullName"); }}
            editable={!loading}
          />
          {!!errors.fullName && <Text style={styles.errorText}>{errors.fullName}</Text>}

          {/* Username */}
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={[styles.input, !!errors.username && styles.inputError]}
            placeholder="Enter your username"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            value={username}
            onChangeText={(t) => { setUsername(t); clearError("username"); }}
            editable={!loading}
          />
          {!!errors.username && <Text style={styles.errorText}>{errors.username}</Text>}

          {/* Email */}
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, !!errors.email && styles.inputError]}
            placeholder="Enter your email"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={(t) => { setEmail(t); clearError("email"); }}
            editable={!loading}
          />
          {!!errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

          {/* Password */}
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.input, !!errors.password && styles.inputError]}
            placeholder="Enter your password"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            secureTextEntry
            value={password}
            onChangeText={(t) => { setPassword(t); clearError("password"); }}
            editable={!loading}
          />
          {!!errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

          {/* Strength bar */}
          {password.length > 0 && (
            <View style={styles.strengthContainer}>
              <View style={styles.strengthBarBg}>
                <View
                  style={[
                    styles.strengthBar,
                    { width: `${strength.width}%`, backgroundColor: strength.color },
                  ]}
                />
              </View>
              <Text style={[styles.strengthLabel, { color: strength.color }]}>
                {strength.label}
              </Text>
            </View>
          )}

          {/* Confirm Password */}
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={[styles.input, !!errors.confirm && styles.inputError]}
            placeholder="Confirm your password"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            secureTextEntry
            value={confirm}
            onChangeText={(t) => { setConfirm(t); clearError("confirm"); }}
            editable={!loading}
          />
          {!!errors.confirm && <Text style={styles.errorText}>{errors.confirm}</Text>}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#ffffff" />
              : <Text style={styles.buttonText}>Create Account</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Sign in link */}
        <View style={styles.signinContainer}>
          <Text style={styles.signinPrompt}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.replace("/login")} disabled={loading}>
            <Text style={styles.signinLink}>Sign in</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          By signing up you agree to our{" "}
          <Text style={styles.footerLink}>Terms</Text>
          {" & "}
          <Text style={styles.footerLink}>Privacy Policy</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: "#f9fafb" },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },

  header:   { alignItems: "center", marginBottom: 36 },
  title:    { fontSize: 36, fontWeight: "800", color: "#2563eb", letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: "#6b7280", marginTop: 6 },

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

  label:      { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 4,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  inputError:  { borderColor: "#ef4444" },
  errorText:   { fontSize: 12, color: "#ef4444", marginBottom: 10, marginLeft: 2 },

  strengthContainer: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12, marginTop: 4 },
  strengthBarBg:     { flex: 1, height: 4, backgroundColor: "#e5e7eb", borderRadius: 2, overflow: "hidden" },
  strengthBar:       { height: "100%", borderRadius: 2 },
  strengthLabel:     { fontSize: 12, fontWeight: "600", minWidth: 40 },

  button:         { backgroundColor: "#2563eb", paddingVertical: 15, borderRadius: 10, alignItems: "center", marginTop: 12 },
  buttonDisabled: { opacity: 0.7 },
  buttonText:     { color: "#ffffff", fontSize: 16, fontWeight: "700", letterSpacing: 0.2 },

  signinContainer: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 28 },
  signinPrompt:    { fontSize: 14, color: "#6b7280" },
  signinLink:      { fontSize: 14, color: "#2563eb", fontWeight: "600" },

  footer:     { fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 20, lineHeight: 16 },
  footerLink: { color: "#2563eb" },
});