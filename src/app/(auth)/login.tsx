import React, { useState, useRef, useEffect } from "react";
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
  Animated,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";

const BASE_URL = "https://life-os-backend-1ozl.onrender.com/api";

// ─── Theme Tokens (Claymorphism — same language as the rest of the app) ────
// Near-black background, warm amber/orange accent, soft clay shadows.
// No blue, purple, violet, or pink anywhere in the palette.
const T = {
  bg: ["#0A0A0B", "#141210", "#1C1712"] as const,
  surface: "rgba(24, 24, 27, 0.85)",
  surfaceAlt: "rgba(255, 138, 61, 0.08)",
  accent: "#FF8A3D",
  accentDeep: "#E86A1F",
  accentGradient: ["#FF8A3D", "#FFB25E"] as const,
  textPrimary: "#F5F5F4",
  textSecondary: "rgba(245, 245, 244, 0.62)",
  textFaint: "rgba(245, 245, 244, 0.38)",
  border: "rgba(255, 138, 61, 0.18)",
  borderFocused: "#FF8A3D",
};

export default function Login() {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }),
    ]).start();
  }, [fadeAnim, slideAnim, logoScale]);

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
        ["theme", "dark"],
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
    <LinearGradient
      colors={T.bg}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradientBackground}
    >
      {/* Static decorative clay blobs */}
      <View style={[styles.blob, styles.blobOne]} />
      <View style={[styles.blob, styles.blobTwo]} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {/* Header */}
            <View style={styles.header}>
              <Animated.View style={[styles.logoIconWrap, { transform: [{ scale: logoScale }] }]}>
                <LinearGradient
                  colors={T.accentGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.logoGradient}
                >
                  <Feather name="target" size={28} color="#1A120B" />
                </LinearGradient>
              </Animated.View>
              <Text style={styles.title}>Life-OS</Text>
              <Text style={styles.subtitle}>Sign in to your account</Text>
            </View>

            {/* Form Card */}
            <View style={styles.formWrap}>
              <View style={styles.form}>
                <Text style={styles.label}>Username or Email</Text>
                <View
                  style={[
                    styles.inputWrap,
                    focusedField === "user" && styles.inputWrapFocused,
                  ]}
                >
                  <View style={styles.inputIconWrap}>
                    <Feather
                      name="user"
                      size={16}
                      color={focusedField === "user" ? T.accent : T.textFaint}
                    />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your username or email"
                    placeholderTextColor={T.textFaint}
                    autoCapitalize="none"
                    value={usernameOrEmail}
                    onChangeText={setUsernameOrEmail}
                    onFocus={() => setFocusedField("user")}
                    onBlur={() => setFocusedField(null)}
                    selectionColor={T.accent}
                    cursorColor={T.accent}
                  />
                </View>

                <Text style={styles.label}>Password</Text>
                <View
                  style={[
                    styles.inputWrap,
                    focusedField === "pass" && styles.inputWrapFocused,
                  ]}
                >
                  <View style={styles.inputIconWrap}>
                    <Feather
                      name="lock"
                      size={16}
                      color={focusedField === "pass" ? T.accent : T.textFaint}
                    />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor={T.textFaint}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField("pass")}
                    onBlur={() => setFocusedField(null)}
                    selectionColor={T.accent}
                    cursorColor={T.accent}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather
                      name={showPassword ? "eye-off" : "eye"}
                      size={16}
                      color={T.textFaint}
                    />
                  </TouchableOpacity>
                </View>

                {/* Forgot Password */}
                <TouchableOpacity
                  style={styles.forgotPasswordContainer}
                  onPress={() => router.push("/forgotPassword")}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                </TouchableOpacity>

                {/* Login Button */}
                <TouchableOpacity
                  style={styles.buttonOuter}
                  activeOpacity={0.85}
                  onPress={login}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={loading ? ["#4A3A28", "#4A3A28"] : T.accentGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.button}
                  >
                    {loading ? (
                      <ActivityIndicator color="#1A120B" />
                    ) : (
                      <>
                        <Text style={styles.buttonText}>Sign In</Text>
                        <Feather name="arrow-right" size={18} color="#1A120B" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>

            {/* Sign Up Link */}
            <View style={styles.signupContainer}>
              <Text style={styles.signupPrompt}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push("/signup")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.signupLink}>Sign up</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientBackground: {
    flex: 1,
    overflow: "hidden",
  },
  blob: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: T.accent,
    opacity: 0.1,
  },
  blobOne: {
    width: 260,
    height: 260,
    top: -70,
    left: -80,
  },
  blobTwo: {
    width: 220,
    height: 220,
    bottom: -60,
    right: -80,
    backgroundColor: "#FFB25E",
    opacity: 0.07,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 22,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  logoGradient: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: T.textPrimary,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 14,
    color: T.textSecondary,
    marginTop: 6,
  },
  formWrap: {
    width: "100%",
  },
  form: {
    backgroundColor: T.surface,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: T.border,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 26,
    elevation: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: T.textSecondary,
    marginBottom: 8,
    marginTop: 4,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    backgroundColor: T.surfaceAlt,
    marginBottom: 16,
  },
  inputWrapFocused: {
    borderColor: T.borderFocused,
    backgroundColor: "rgba(255, 138, 61, 0.14)",
  },
  inputIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: T.textPrimary,
  },
  forgotPasswordContainer: {
    alignSelf: "flex-end",
    marginBottom: 20,
    marginTop: -6,
  },
  forgotPasswordText: {
    fontSize: 13,
    color: T.accent,
    fontWeight: "700",
  },
  buttonOuter: {
    borderRadius: 18,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 18,
  },
  buttonText: {
    color: "#1A120B",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
    marginRight: 8,
  },
  signupContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
  },
  signupPrompt: {
    fontSize: 14,
    color: T.textSecondary,
  },
  signupLink: {
    fontSize: 14,
    color: T.accent,
    fontWeight: "800",
  },
});