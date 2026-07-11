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
import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";

const API_URL = "https://life-os-backend-1ozl.onrender.com/api";

// ─── Theme Tokens ───────────────────────────────────────────────────────────
const T = {
  bg: ["#0A0A0B", "#141210", "#1C1712"],
  surface: "rgba(24, 24, 27, 0.85)",
  surfaceAlt: "rgba(255, 138, 61, 0.08)",
  accent: "#FF8A3D",
  accentGradient: ["#FF8A3D", "#FFB25E"],
  success: "#3DD68C",
  warning: "#FFC24B",
  danger: "#FF6B5B",
  textPrimary: "#F5F5F4",
  textSecondary: "rgba(245, 245, 244, 0.62)",
  textFaint: "rgba(245, 245, 244, 0.38)",
  border: "rgba(255, 138, 61, 0.18)",
  borderFocused: "#FF8A3D",
};

// ─── Google Sign-In Configuration ───────────────────────────────────────────
GoogleSignin.configure({
  webClientId:
    "260015412456-k4nkvjb1hd0mabk5g362otqg3818l6nt.apps.googleusercontent.com",
  offlineAccess: true,
});

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function getStrength(pwd) {
  if (!pwd.length) return { width: 0, color: T.textFaint, label: "" };
  const score = [
    pwd.length >= 8,
    /[A-Z]/.test(pwd),
    /[a-z]/.test(pwd),
    /[0-9]/.test(pwd),
    /[^A-Za-z0-9]/.test(pwd),
  ].filter(Boolean).length;
  if (score <= 2) return { width: 33, color: T.danger, label: "Weak" };
  if (score <= 3) return { width: 66, color: T.warning, label: "Fair" };
  return { width: 100, color: T.success, label: "Strong" };
}

// ─── /users/me fetch + storage ──────────────────────────────────────────────
const fetchMeAndStore = async (accessToken) => {
  const meResponse = await axios.get(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });

  const me = meResponse.data ?? {};

  await AsyncStorage.multiSet([
    ["token", accessToken],
    ["username", me.username ?? ""],
    ["fullName", me.fullName ?? me.full_name ?? ""],
    ["email", me.email ?? ""],
    ["profilePicture", me.profilePicture ?? me.profile_picture ?? ""],
    ["provider", me.provider ?? ""],
    ["theme", "dark"],
  ]);
  return me;
};

/** Check if error is due to invalid credentials or conflict */
const isInvalidCredentialsError = (error) => {
  if (!error) return false;
  
  // Check for 400, 401, 409 status (conflict, invalid, etc.)
  if (error?.response?.status === 400 || 
      error?.response?.status === 401 || 
      error?.response?.status === 409) return true;
  
  // Check for specific message indicators
  const message = error?.response?.data?.message || 
                  (typeof error?.response?.data === "string" ? error.response.data : "") ||
                  error?.message || "";
  
  return message.toLowerCase().includes("already exists") ||
         message.toLowerCase().includes("taken") ||
         message.toLowerCase().includes("invalid") ||
         message.toLowerCase().includes("credentials") ||
         message.toLowerCase().includes("incorrect") ||
         message.toLowerCase().includes("not found") ||
         message.toLowerCase().includes("exists");
};

/** Check if error is network-related */
const isNetworkError = (error) => {
  return error?.code === "ERR_NETWORK" || 
         error?.code === "ECONNABORTED" ||
         error?.message?.includes("network") ||
         error?.message?.includes("timeout") ||
         error?.code === "ETIMEDOUT";
};

/** Turns a caught axios/native error into a user-safe status line. */
const describeSignUpError = (error) => {
  if (!error) {
    return "An unknown error occurred. Please wait 1 minute and try again.";
  }
  
  // Check if it's an invalid credentials/conflict error first
  if (isInvalidCredentialsError(error)) {
    const status = error.response?.status;
    const serverMsg = error.response?.data?.message ||
                      (typeof error.response?.data === "string" ? error.response.data : "");
    
    if (status === 409) {
      return serverMsg || "Username or email already exists.";
    }
    return serverMsg || "Invalid information provided.";
  }
  
  // For any other error (network, server down, DB issues, etc.) - generic message
  if (isNetworkError(error)) {
    return "Unable to connect to server. Please wait 1 minute and try again.";
  }
  
  return "Please wait 1 minute before trying again.";
};

export default function SignUp() {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const googleButtonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }),
    ]).start();
  }, [fadeAnim, slideAnim, logoScale]);

  const clearError = (key) =>
    setErrors((e) => ({ ...e, [key]: undefined }));

  const validate = () => {
    const e = {};
    if (!fullName.trim()) e.fullName = "Full name is required";
    if (!username.trim()) e.username = "Username is required";
    else if (username.trim().length < 3) e.username = "At least 3 characters";
    if (!email.trim()) e.email = "Email is required";
    else if (!isEmail(email.trim())) e.email = "Enter a valid email";
    if (!password) e.password = "Password is required";
    else if (password.length < 6) e.password = "At least 6 characters";
    if (!confirm) e.confirm = "Please confirm your password";
    else if (password !== confirm) e.confirm = "Passwords don't match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const animateGooglePressIn = () => {
    Animated.spring(googleButtonScale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  };

  const animateGooglePressOut = () => {
    Animated.spring(googleButtonScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  };

  // ─── Email / Password Sign Up ───────────────────────────────────────────
  const handleSignUp = async () => {
    if (!validate()) return;
    
    try {
      setLoading(true);
      const response = await axios.post(
        `${API_URL}/auth/signup`,
        {
          username: username.trim(),
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        },
        { timeout: 15000 }
      );
      
      const data = response.data;
      
      Alert.alert("Account Created", data.message || "You're all set.", [
        { text: "Sign In", onPress: () => router.replace("/login") },
      ]);
    } catch (error) {
      // Check if this is an invalid credentials/conflict error
      if (isInvalidCredentialsError(error)) {
        const message = error?.response?.data?.message || 
                        (typeof error?.response?.data === "string" ? error.response.data : "") ||
                        "Username or email already exists.";
        Alert.alert("Sign Up Failed", message);
      } else {
        // Network or server error - show wait message
        const message = describeSignUpError(error);
        Alert.alert("Sign Up Failed", message);
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Google Sign-Up Handler ──────────────────────────────────────────────
  const handleGoogleSignUp = async () => {
    if (googleLoading || loading) return;

    try {
      setGoogleLoading(true);

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Clear any cached Google session first
      try {
        await GoogleSignin.signOut();
      } catch (signOutErr) {
        // Safe to ignore
      }

      const response = await GoogleSignin.signIn();

      if (!isSuccessResponse(response)) {
        // User cancelled the sign-in flow
        setGoogleLoading(false);
        return;
      }

      const idToken = response.data?.idToken;

      if (!idToken) {
        Alert.alert("Sign Up Failed", "Google didn't return an ID token. Please try again.");
        setGoogleLoading(false);
        return;
      }

      // Isolate the backend call
      let backendResponse;
      try {
        backendResponse = await axios.post(
          `${API_URL}/auth/google/login`,
          { idToken },
          { timeout: 15000 }
        );
      } catch (backendErr) {
        throw backendErr;
      }

      const data = backendResponse.data;

      if (!data?.accessToken) {
        Alert.alert("Sign Up Failed", "Server did not return an access token. Please wait 1 minute and try again.");
        return;
      }

      let me = {};
      try {
        me = await fetchMeAndStore(data.accessToken);
      } catch (meError) {
        Alert.alert("Sign Up Failed", "Signed in, but couldn't load your profile. Please wait 1 minute and try again.");
        return;
      }

      Alert.alert("Account Created", `Welcome ${me.fullName ?? me.full_name ?? ""}`, [
        {
          text: "OK",
          onPress: () => router.replace("/(tabs)/dashboard"),
        },
      ]);
    } catch (error) {
      if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled, do nothing
      } else if (isErrorWithCode(error) && error.code === statusCodes.IN_PROGRESS) {
        Alert.alert("Sign Up Failed", "A sign-in attempt is already in progress.");
      } else if (isErrorWithCode(error) && error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert("Sign Up Failed", "Google Play Services unavailable. Please update and try again.");
      } else {
        // Check if it's an invalid credentials/conflict error from Google
        if (isInvalidCredentialsError(error)) {
          const message = error?.response?.data?.message || 
                          (typeof error?.response?.data === "string" ? error.response.data : "") ||
                          "Sign up failed. Please try again.";
          Alert.alert("Sign Up Failed", message);
        } else {
          // Network or server error
          const message = describeSignUpError(error);
          Alert.alert("Sign Up Failed", message);
        }
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const strength = getStrength(password);

  const renderField = (opts) => {
    const {
      field, label, icon, value, onChangeText, placeholder,
      secure, toggleSecure, secureVisible, keyboardType, autoCapitalize,
    } = opts;
    const focused = focusedField === field;
    const hasError = !!errors[field];

    return (
      <>
        <Text style={styles.label}>{label}</Text>
        <View
          style={[
            styles.inputWrap,
            focused && styles.inputWrapFocused,
            hasError && styles.inputWrapError,
          ]}
        >
          <View style={styles.inputIconWrap}>
            <Feather
              name={icon}
              size={16}
              color={focused ? T.accent : T.textFaint}
            />
          </View>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={T.textFaint}
            autoCapitalize={autoCapitalize ?? "none"}
            keyboardType={keyboardType ?? "default"}
            secureTextEntry={secure ? !secureVisible : false}
            value={value}
            editable={!loading && !googleLoading}
            onChangeText={(t) => {
              onChangeText(t);
              clearError(field);
            }}
            onFocus={() => setFocusedField(field)}
            onBlur={() => setFocusedField(null)}
            selectionColor={T.accent}
            cursorColor={T.accent}
          />
          {secure && toggleSecure && (
            <TouchableOpacity onPress={toggleSecure} hitSlop={8}>
              <Feather
                name={secureVisible ? "eye-off" : "eye"}
                size={16}
                color={T.textFaint}
              />
            </TouchableOpacity>
          )}
        </View>
        {hasError && (
          <View style={styles.errorRow}>
            <Feather name="alert-circle" size={11} color={T.danger} style={styles.errorIcon} />
            <Text style={styles.errorText}>{errors[field]}</Text>
          </View>
        )}
        {!hasError && <View style={styles.fieldSpacer} />}
      </>
    );
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
        style={styles.flex}
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
                  <Feather name="user-plus" size={26} color="#1A120B" />
                </LinearGradient>
              </Animated.View>
              <Text style={styles.title}>Life-OS</Text>
              <Text style={styles.subtitle}>Create your account</Text>
            </View>

            {/* Form Card */}
            <View style={styles.formWrap}>
              <View style={styles.form}>
                {renderField({
                  field: "fullName",
                  label: "Full Name",
                  icon: "user",
                  value: fullName,
                  onChangeText: setFullName,
                  placeholder: "Enter your full name",
                  autoCapitalize: "words",
                })}

                {renderField({
                  field: "username",
                  label: "Username",
                  icon: "at-sign",
                  value: username,
                  onChangeText: setUsername,
                  placeholder: "Enter your username",
                })}

                {renderField({
                  field: "email",
                  label: "Email",
                  icon: "mail",
                  value: email,
                  onChangeText: setEmail,
                  placeholder: "Enter your email",
                  keyboardType: "email-address",
                })}

                {renderField({
                  field: "password",
                  label: "Password",
                  icon: "lock",
                  value: password,
                  onChangeText: setPassword,
                  placeholder: "Enter your password",
                  secure: true,
                  secureVisible: showPassword,
                  toggleSecure: () => setShowPassword((s) => !s),
                })}

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

                {renderField({
                  field: "confirm",
                  label: "Confirm Password",
                  icon: "lock",
                  value: confirm,
                  onChangeText: setConfirm,
                  placeholder: "Confirm your password",
                  secure: true,
                  secureVisible: showConfirm,
                  toggleSecure: () => setShowConfirm((s) => !s),
                })}

                {/* Submit */}
                <TouchableOpacity
                  style={styles.buttonOuter}
                  activeOpacity={0.85}
                  onPress={handleSignUp}
                  disabled={loading || googleLoading}
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
                        <Text style={styles.buttonText}>Create Account</Text>
                        <Feather name="arrow-right" size={18} color="#1A120B" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Google Sign-Up Button */}
                <Animated.View style={{ transform: [{ scale: googleButtonScale }] }}>
                  <TouchableOpacity
                    style={styles.googleButtonOuter}
                    activeOpacity={0.85}
                    onPress={handleGoogleSignUp}
                    onPressIn={animateGooglePressIn}
                    onPressOut={animateGooglePressOut}
                    disabled={googleLoading || loading}
                  >
                    <View style={styles.googleButton}>
                      {googleLoading ? (
                        <ActivityIndicator color={T.accent} />
                      ) : (
                        <>
                          <View style={styles.googleIconWrap}>
                            <Feather name="chrome" size={16} color={T.accent} />
                          </View>
                          <Text style={styles.googleButtonText}>Sign up with Google</Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            </View>

            {/* Sign in link */}
            <View style={styles.signupContainer}>
              <Text style={styles.signupPrompt}>Already have an account? </Text>
              <TouchableOpacity onPress={() => router.replace("/login")} disabled={loading || googleLoading} hitSlop={8}>
                <Text style={styles.signupLink}>Sign in</Text>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <Text style={styles.footer}>
              By signing up you agree to our{" "}
              <Text style={styles.footerLink}>Terms</Text>
              {" & "}
              <Text style={styles.footerLink}>Privacy Policy</Text>
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
    paddingTop: 56,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  logoGradient: {
    width: 62,
    height: 62,
    borderRadius: 20,
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
  },
  inputWrapFocused: {
    borderColor: T.borderFocused,
    backgroundColor: "rgba(255, 138, 61, 0.14)",
  },
  inputWrapError: {
    borderColor: T.danger,
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
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 10,
    marginLeft: 2,
  },
  errorIcon: {
    marginRight: 5,
  },
  errorText: {
    fontSize: 12,
    color: T.danger,
    fontWeight: "600",
  },
  fieldSpacer: {
    height: 16,
  },
  strengthContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    marginTop: -6,
  },
  strengthBarBg: {
    flex: 1,
    height: 5,
    backgroundColor: "rgba(245, 245, 244, 0.12)",
    borderRadius: 3,
    overflow: "hidden",
  },
  strengthBar: {
    height: "100%",
    borderRadius: 3,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: "700",
    minWidth: 40,
  },
  buttonOuter: {
    borderRadius: 18,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    marginTop: 8,
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
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 22,
    marginBottom: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: T.border,
  },
  dividerText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: T.textFaint,
    marginHorizontal: 12,
  },
  googleButtonOuter: {
    borderRadius: 18,
    overflow: "hidden",
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
  },
  googleIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor: "rgba(255, 138, 61, 0.12)",
  },
  googleButtonText: {
    color: T.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.1,
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
  footer: {
    fontSize: 11,
    color: T.textFaint,
    textAlign: "center",
    marginTop: 20,
    lineHeight: 16,
  },
  footerLink: {
    color: T.accent,
  },
});