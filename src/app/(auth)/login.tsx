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
  warning: "#FFB25E",
  warningBg: "rgba(255, 138, 61, 0.12)",
  warningBorder: "rgba(255, 138, 61, 0.35)",
};

// ─── Google Sign-In Configuration ───────────────────────────────────────────
GoogleSignin.configure({
  webClientId:
    "260015412456-k4nkvjb1hd0mabk5g362otqg3818l6nt.apps.googleusercontent.com",
  offlineAccess: true,
});

// Helper: pull a profile picture URL out of a backend response
const extractProfilePicture = (data: any): string => {
  return data?.profilePicture ?? data?.profile_picture ?? "";
};

// ─── /auth/me fetch + storage ───────────────────────────────────────────────
type MeResponse = {
  id?: number | string;
  username?: string;
  fullName?: string;
  full_name?: string;
  email?: string;
  profilePicture?: string;
  profile_picture?: string;
  provider?: string;
};

const fetchMeAndStore = async (accessToken: string): Promise<MeResponse> => {
  const meResponse = await axios.get(`${BASE_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });

  const me: MeResponse = meResponse.data ?? {};

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

// ─── Retry / lockout tracking ────────────────────────────────────────────────
const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 60 * 1000; // 1 minute
const KEY_LOGIN_ATTEMPTS = "loginAttemptCount";
const KEY_LOGIN_LOCKOUT_UNTIL = "loginLockoutUntil";

const formatCountdown = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const recordFailedLoginAttempt = async (reason: string): Promise<{ status: string; lockoutUntil: number }> => {
  const raw = await AsyncStorage.getItem(KEY_LOGIN_ATTEMPTS);
  const currentCount = raw ? parseInt(raw, 10) : 0;
  const nextCount = currentCount + 1;

  if (nextCount >= MAX_ATTEMPTS) {
    const until = Date.now() + LOCKOUT_DURATION_MS;
    await AsyncStorage.multiSet([
      [KEY_LOGIN_ATTEMPTS, "0"],
      [KEY_LOGIN_LOCKOUT_UNTIL, String(until)],
    ]);
    return {
      status: `Too many failed attempts. Please wait 1 minute before trying again.`,
      lockoutUntil: until,
    };
  }

  await AsyncStorage.setItem(KEY_LOGIN_ATTEMPTS, String(nextCount));
  return {
    status: `${reason} (Attempt ${nextCount} of ${MAX_ATTEMPTS})`,
    lockoutUntil: 0,
  };
};

const clearLoginAttempts = async (): Promise<void> => {
  await AsyncStorage.multiRemove([KEY_LOGIN_ATTEMPTS, KEY_LOGIN_LOCKOUT_UNTIL]);
};

/** Determines if an error is due to invalid credentials (username/password/email) */
const isInvalidCredentialsError = (error: any): boolean => {
  if (!error?.response) return false;
  const status = error.response.status;
  const message = error.response.data?.message || 
                  (typeof error.response.data === "string" ? error.response.data : "");
  // 401 Unauthorized or 400 Bad Request with invalid credentials message
  if (status === 401) return true;
  if (status === 400) {
    const lowerMsg = message.toLowerCase();
    return lowerMsg.includes("invalid") || 
           lowerMsg.includes("incorrect") || 
           lowerMsg.includes("not found") ||
           lowerMsg.includes("does not exist");
  }
  return false;
};

/** Turns a caught axios/native error into a user-safe status line */
const describeLoginError = (error: any): string => {
  if (!error) {
    return "An unknown error occurred. Please wait 1 minute and try again.";
  }
  
  // Check if it's an invalid credentials error first
  if (isInvalidCredentialsError(error)) {
    const status = error.response.status;
    const serverMsg = error.response.data?.message ||
                      (typeof error.response.data === "string" ? error.response.data : "");
    return serverMsg || "Invalid username/email or password.";
  }
  
  // For any other error (network, server down, DB issues, etc.) - generic message
  return "Please wait 1 minute before trying again.";
};

export default function Login() {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lockoutUntil, setLockoutUntil] = useState<number>(0);
  const [nowTick, setNowTick] = useState<number>(Date.now());

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

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(KEY_LOGIN_LOCKOUT_UNTIL);
      const until = raw ? parseInt(raw, 10) : 0;
      if (until > Date.now()) {
        setLockoutUntil(until);
      }
    })();
  }, []);

  useEffect(() => {
    if (!lockoutUntil) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockoutUntil]);

  const lockoutRemainingMs = lockoutUntil ? Math.max(0, lockoutUntil - nowTick) : 0;
  const isLockedOut = lockoutRemainingMs > 0;

  useEffect(() => {
    if (lockoutUntil && lockoutRemainingMs === 0) {
      clearLoginAttempts();
      setLockoutUntil(0);
      setStatusMessage(null);
    }
  }, [lockoutRemainingMs, lockoutUntil]);

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

  // ─── Email / Password Login ─────────────────────────────────────────────
  const login = async () => {
    if (isLockedOut) {
      setStatusMessage(`Too many failed attempts. Try again in ${formatCountdown(lockoutRemainingMs)}.`);
      return;
    }

    if (!usernameOrEmail.trim() || !password.trim()) {
      setStatusMessage("Please enter username/email and password.");
      return;
    }

    setStatusMessage(null);

    try {
      setLoading(true);
      const response = await axios.post(
        `${BASE_URL}/auth/login`,
        { usernameOrEmail, password },
        { timeout: 15000 }
      );

      const data = response.data;

      if (!data?.accessToken) {
        const { status, lockoutUntil: newLockout } = await recordFailedLoginAttempt(
          "Server did not return an access token."
        );
        setStatusMessage(status);
        if (newLockout) setLockoutUntil(newLockout);
        return;
      }

      let me: MeResponse = {};
      try {
        me = await fetchMeAndStore(data.accessToken);
      } catch (meError: any) {
        const { status, lockoutUntil: newLockout } = await recordFailedLoginAttempt(
          "Signed in, but couldn't load your profile."
        );
        setStatusMessage(status);
        if (newLockout) setLockoutUntil(newLockout);
        return;
      }

      await clearLoginAttempts();
      setStatusMessage(null);

      Alert.alert("Login Successful", `Welcome ${me.fullName ?? me.full_name ?? ""}`, [
        {
          text: "OK",
          onPress: () => router.replace("/(tabs)/dashboard"),
        },
      ]);
    } catch (error: any) {
      const reason = describeLoginError(error);
      
      // Only count invalid credentials as attempts
      if (isInvalidCredentialsError(error)) {
        const { status, lockoutUntil: newLockout } = await recordFailedLoginAttempt(reason);
        setStatusMessage(status);
        if (newLockout) setLockoutUntil(newLockout);
      } else {
        // For any other error (network, server issues), show the generic message
        setStatusMessage(reason);
        // Don't count these toward lockout attempts
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Google Sign-In Handler ────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    if (googleLoading || loading) return;

    if (isLockedOut) {
      setStatusMessage(`Too many failed attempts. Try again in ${formatCountdown(lockoutRemainingMs)}.`);
      return;
    }

    setStatusMessage(null);

    try {
      setGoogleLoading(true);

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      try {
        await GoogleSignin.signOut();
      } catch (signOutErr) {
        // Safe to ignore
      }

      const response = await GoogleSignin.signIn();

      if (!isSuccessResponse(response)) {
        setGoogleLoading(false);
        return;
      }

      const idToken = response.data?.idToken;

      if (!idToken) {
        const { status, lockoutUntil: newLockout } = await recordFailedLoginAttempt(
          "Google didn't return an ID token."
        );
        setStatusMessage(status);
        if (newLockout) setLockoutUntil(newLockout);
        setGoogleLoading(false);
        return;
      }

      let backendResponse;
      try {
        backendResponse = await axios.post(
          `${BASE_URL}/auth/google/login`,
          { idToken },
          { timeout: 15000 }
        );
      } catch (backendErr: any) {
        throw backendErr;
      }

      const data = backendResponse.data;

      if (!data?.accessToken) {
        const { status, lockoutUntil: newLockout } = await recordFailedLoginAttempt(
          "Server did not return an access token."
        );
        setStatusMessage(status);
        if (newLockout) setLockoutUntil(newLockout);
        return;
      }

      let me: MeResponse = {};
      try {
        me = await fetchMeAndStore(data.accessToken);
      } catch (meError: any) {
        const { status, lockoutUntil: newLockout } = await recordFailedLoginAttempt(
          "Signed in, but couldn't load your profile."
        );
        setStatusMessage(status);
        if (newLockout) setLockoutUntil(newLockout);
        return;
      }

      await clearLoginAttempts();
      setStatusMessage(null);

      Alert.alert("Login Successful", `Welcome ${me.fullName ?? me.full_name ?? ""}`, [
        {
          text: "OK",
          onPress: () => router.replace("/(tabs)/dashboard"),
        },
      ]);
    } catch (error: any) {
      if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled - do nothing
      } else if (isErrorWithCode(error) && error.code === statusCodes.IN_PROGRESS) {
        setStatusMessage("A sign-in attempt is already in progress.");
      } else {
        let reason: string;
        if (isErrorWithCode(error)) {
          reason = error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE
            ? "Please wait 1 minute before trying again."
            : "Please wait 1 minute before trying again.";
        } else {
          reason = describeLoginError(error);
        }
        
        // For Google sign-in, check if it's an auth error from the backend
        if (error?.response && isInvalidCredentialsError(error)) {
          const { status, lockoutUntil: newLockout } = await recordFailedLoginAttempt(reason);
          setStatusMessage(status);
          if (newLockout) setLockoutUntil(newLockout);
        } else {
          setStatusMessage(reason);
        }
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={T.bg}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradientBackground}
    >
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

            {/* Status / retry / lockout banner */}
            {statusMessage && (
              <View style={styles.statusBanner}>
                <Feather
                  name={isLockedOut ? "clock" : "alert-triangle"}
                  size={15}
                  color={T.warning}
                />
                <Text style={styles.statusBannerText}>
                  {isLockedOut
                    ? `Too many failed attempts. Try again in ${formatCountdown(lockoutRemainingMs)}.`
                    : statusMessage}
                </Text>
              </View>
            )}

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
                    onChangeText={(t) => {
                      setUsernameOrEmail(t);
                      if (!isLockedOut) setStatusMessage(null);
                    }}
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
                    onChangeText={(t) => {
                      setPassword(t);
                      if (!isLockedOut) setStatusMessage(null);
                    }}
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
                  disabled={loading || isLockedOut}
                >
                  <LinearGradient
                    colors={loading || isLockedOut ? ["#4A3A28", "#4A3A28"] : T.accentGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.button}
                  >
                    {loading ? (
                      <ActivityIndicator color="#1A120B" />
                    ) : isLockedOut ? (
                      <Text style={styles.buttonText}>Wait {formatCountdown(lockoutRemainingMs)}</Text>
                    ) : (
                      <>
                        <Text style={styles.buttonText}>Sign In</Text>
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

                {/* Google Sign-In Button */}
                <Animated.View style={{ transform: [{ scale: googleButtonScale }] }}>
                  <TouchableOpacity
                    style={styles.googleButtonOuter}
                    activeOpacity={0.85}
                    onPress={handleGoogleLogin}
                    onPressIn={animateGooglePressIn}
                    onPressOut={animateGooglePressOut}
                    disabled={googleLoading || loading || isLockedOut}
                  >
                    <View style={styles.googleButton}>
                      {googleLoading ? (
                        <ActivityIndicator color={T.accent} />
                      ) : (
                        <>
                          <View style={styles.googleIconWrap}>
                            <Feather name="chrome" size={16} color={T.accent} />
                          </View>
                          <Text style={styles.googleButtonText}>Login with Google</Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                </Animated.View>
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
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: T.warningBg,
    borderWidth: 1,
    borderColor: T.warningBorder,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  statusBannerText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 12.5,
    lineHeight: 17,
    color: T.textPrimary,
    fontWeight: "600",
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
});