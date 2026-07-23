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
import axios, { AxiosError } from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";

// ─── Environment validation ─────────────────────────────────────────────────
// Read once at module load and validate before use. If either is missing,
// the corresponding auth flow fails safely with a user-facing message
// instead of throwing at request time or silently hitting a bad URL.
const RAW_API_URL = process.env.EXPO_PUBLIC_API_URL;
const RAW_GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

if (!RAW_API_URL) {
  console.error("[SignUp] Missing required environment variable: EXPO_PUBLIC_API_URL");
}
if (!RAW_GOOGLE_CLIENT_ID) {
  console.error("[SignUp] Missing required environment variable: EXPO_PUBLIC_GOOGLE_CLIENT_ID");
}

const ENV_READY = Boolean(RAW_API_URL);
const GOOGLE_ENV_READY = Boolean(RAW_GOOGLE_CLIENT_ID);

// Single source of truth for the API base — every request (email/password
// AND Google) goes through this, so no endpoint can drift out of sync with
// the others (this is what broke Google sign-up before: it was built from
// a different, prefix-less base than the manual sign-up call).
const BASE_URL = ENV_READY ? `${RAW_API_URL}/api` : "";
const GOOGLE_CLIENT_ID = RAW_GOOGLE_CLIENT_ID ?? "";

// ─── Theme Tokens ───────────────────────────────────────────────────────────
const T = {
  bg: ["#0A0A0B", "#141210", "#1C1712"] as const,
  surface: "rgba(24, 24, 27, 0.85)",
  surfaceAlt: "rgba(255, 138, 61, 0.08)",
  accent: "#FF8A3D",
  accentGradient: ["#FF8A3D", "#FFB25E"] as const,
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
// Configured lazily (once, only if a client ID is present) rather than as a
// module-level side effect, so a missing env var never crashes import.
let googleSignInConfigured = false;

const configureGoogleSignInOnce = (): void => {
  if (googleSignInConfigured || !GOOGLE_ENV_READY) {
    return;
  }
  GoogleSignin.configure({
    webClientId: GOOGLE_CLIENT_ID,
    offlineAccess: true,
  });
  googleSignInConfigured = true;
};

// ─── Storage keys (centralized) ─────────────────────────────────────────────
const StorageKeys = {
  TOKEN: "token",
  USERNAME: "username",
  FULL_NAME: "fullName",
  EMAIL: "email",
  PROFILE_PICTURE: "profilePicture",
  PROVIDER: "provider",
  THEME: "theme",
} as const;

const SESSION_STORAGE_KEYS: string[] = [
  StorageKeys.TOKEN,
  StorageKeys.USERNAME,
  StorageKeys.FULL_NAME,
  StorageKeys.EMAIL,
  StorageKeys.PROFILE_PICTURE,
  StorageKeys.PROVIDER,
  StorageKeys.THEME,
];

// ─── Safe AsyncStorage helpers (every call wrapped in try/catch) ───────────
const safeMultiSet = async (pairs: [string, string][]): Promise<boolean> => {
  try {
    await AsyncStorage.multiSet(pairs);
    return true;
  } catch (err) {
    console.error("[SignUp] Failed to write session data to AsyncStorage", err);
    return false;
  }
};

const safeMultiRemove = async (keys: string[]): Promise<void> => {
  try {
    await AsyncStorage.multiRemove(keys);
  } catch (err) {
    console.error("[SignUp] Failed to clear AsyncStorage keys", err);
  }
};

// Thrown internally when a successful auth response can't be persisted.
class SessionStorageError extends Error {
  constructor() {
    super("SESSION_STORAGE_FAILED");
    this.name = "SessionStorageError";
  }
}

// ─── Types ───────────────────────────────────────────────────────────────
interface MeResponse {
  id?: number | string;
  username?: string;
  fullName?: string;
  full_name?: string;
  email?: string;
  profilePicture?: string;
  profile_picture?: string;
  provider?: string;
}

interface SignUpApiResponse {
  message?: string;
}

interface GoogleLoginApiResponse {
  accessToken?: string;
}

interface ApiErrorPayload {
  message?: string;
}

type FieldErrors = Partial<
  Record<"fullName" | "username" | "email" | "password" | "confirm", string>
>;

// Helper: pull a profile picture URL out of a backend response
const extractProfilePicture = (data: MeResponse | undefined): string => {
  return data?.profilePicture ?? data?.profile_picture ?? "";
};

// ─── /users/me fetch + storage ──────────────────────────────────────────────
const fetchMeAndStore = async (
  accessToken: string,
  signal?: AbortSignal
): Promise<MeResponse> => {
  const meResponse = await axios.get<MeResponse>(`${BASE_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
    signal,
  });

  const me: MeResponse = meResponse.data ?? {};

  const stored = await safeMultiSet([
    [StorageKeys.TOKEN, accessToken],
    [StorageKeys.USERNAME, me.username ?? ""],
    [StorageKeys.FULL_NAME, me.fullName ?? me.full_name ?? ""],
    [StorageKeys.EMAIL, me.email ?? ""],
    [StorageKeys.PROFILE_PICTURE, extractProfilePicture(me)],
    [StorageKeys.PROVIDER, me.provider ?? ""],
    [StorageKeys.THEME, "dark"],
  ]);

  if (!stored) {
    await safeMultiRemove(SESSION_STORAGE_KEYS);
    throw new SessionStorageError();
  }

  return me;
};

/** Determines if an error is due to invalid/conflicting sign-up data. */
const isInvalidCredentialsError = (error: unknown): boolean => {
  if (!axios.isAxiosError(error)) return false;
  const axiosError = error as AxiosError<ApiErrorPayload | string>;
  const status = axiosError.response?.status;
  if (status === undefined) return false;

  if (status === 400 || status === 401 || status === 409) return true;

  const data = axiosError.response?.data;
  const message = typeof data === "string" ? data : data?.message ?? "";
  const lowerMsg = message.toLowerCase();
  return (
    lowerMsg.includes("already exists") ||
    lowerMsg.includes("taken") ||
    lowerMsg.includes("invalid") ||
    lowerMsg.includes("credentials") ||
    lowerMsg.includes("incorrect") ||
    lowerMsg.includes("not found") ||
    lowerMsg.includes("exists")
  );
};

/** Was this error a request abort (e.g. component unmounted mid-request)? */
const isAbortError = (error: unknown): boolean => {
  if (axios.isCancel(error)) return true;
  if (axios.isAxiosError(error) && error.code === "ERR_CANCELED") return true;
  return false;
};

/** Turns a caught axios/native error into a user-safe status line. */
const describeSignUpError = (error: unknown): string => {
  if (!error) {
    return "An unknown error occurred. Please wait 1 minute and try again.";
  }

  if (isInvalidCredentialsError(error)) {
    const axiosError = error as AxiosError<ApiErrorPayload | string>;
    const status = axiosError.response?.status;
    const data = axiosError.response?.data;
    const serverMsg = typeof data === "string" ? data : data?.message;

    if (status === 409) {
      return serverMsg || "Username or email already exists.";
    }
    return serverMsg || "Invalid information provided.";
  }

  return "Please wait 1 minute before trying again.";
};

// ─── Rate limiting ───────────────────────────────────────────────────────────
const MAX_ATTEMPTS = 3;
const BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

interface RateLimitState {
  attemptCount: number;
  isBlocked: boolean;
  blockedUntil: number | null;
}

export default function SignUp() {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [rateLimit, setRateLimit] = useState<RateLimitState>({
    attemptCount: 0,
    isBlocked: false,
    blockedUntil: null,
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const googleButtonScale = useRef(new Animated.Value(1)).current;

  // Guards against duplicate submissions (covers rapid/double taps that
  // could race ahead of the `loading` state update).
  const isSubmittingRef = useRef(false);
  const isMountedRef = useRef(true);
  const signUpAbortControllerRef = useRef<AbortController | null>(null);
  const googleAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }),
    ]).start();
  }, [fadeAnim, slideAnim, logoScale]);

  // Configure Google Sign-In exactly once, only if the client ID is valid.
  useEffect(() => {
    configureGoogleSignInOnce();
  }, []);

  // Abort any in-flight requests and mark unmounted on teardown.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      signUpAbortControllerRef.current?.abort();
      googleAbortControllerRef.current?.abort();
    };
  }, []);

  const clearError = (key: keyof FieldErrors) =>
    setErrors((e) => ({ ...e, [key]: undefined }));

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!fullName.trim()) e.fullName = "Full name is required";
    if (!username.trim()) e.username = "Username is required";
    else if (username.trim().length < 3) e.username = "At least 3 characters";
    if (!email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Enter a valid email";
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

  /** Returns true if the request may proceed; false (with an alert) if blocked. */
  const checkRateLimit = (): boolean => {
    if (rateLimit.isBlocked && rateLimit.blockedUntil) {
      const remainingMs = rateLimit.blockedUntil - Date.now();
      if (remainingMs > 0) {
        Alert.alert(
          "Too Many Attempts",
          `Please wait ${Math.ceil(remainingMs / 60000)} minute(s) before trying again.`
        );
        return false;
      }
      // Block window has passed — reset.
      setRateLimit({ attemptCount: 0, isBlocked: false, blockedUntil: null });
    }
    return true;
  };

  /** Records a failed attempt; returns false if this attempt tripped the block. */
  const registerFailedAttempt = (): void => {
    setRateLimit((prev) => {
      const nextCount = prev.attemptCount + 1;
      if (nextCount >= MAX_ATTEMPTS) {
        Alert.alert(
          "Too Many Attempts",
          "You've exceeded the maximum attempts. Please wait 5 minutes before trying again."
        );
        return {
          attemptCount: nextCount,
          isBlocked: true,
          blockedUntil: Date.now() + BLOCK_DURATION_MS,
        };
      }
      return { ...prev, attemptCount: nextCount };
    });
  };

  const resetRateLimit = () =>
    setRateLimit({ attemptCount: 0, isBlocked: false, blockedUntil: null });

  // ─── Email / Password Sign Up ───────────────────────────────────────────
  const handleSignUp = async () => {
    if (isSubmittingRef.current || loading) return;
    if (!validate()) return;
    if (!checkRateLimit()) return;

    if (!ENV_READY) {
      Alert.alert("Sign Up Failed", "App is not configured correctly. Please contact support.");
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);

    const controller = new AbortController();
    signUpAbortControllerRef.current = controller;

    try {
      const response = await axios.post<SignUpApiResponse>(
        `${BASE_URL}/auth/signup`,
        {
          username: username.trim(),
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        },
        { timeout: 15000, signal: controller.signal }
      );

      if (!isMountedRef.current) return;

      const data = response.data;
      resetRateLimit();
      setPassword("");
      setConfirm("");

      Alert.alert("Account Created", data.message || "You're all set.", [
        { text: "Sign In", onPress: () => router.replace("/login") },
      ]);
    } catch (error: unknown) {
      if (isAbortError(error)) return;
      if (!isMountedRef.current) return;

      registerFailedAttempt();

      if (isInvalidCredentialsError(error)) {
        const axiosError = error as AxiosError<ApiErrorPayload | string>;
        const data = axiosError.response?.data;
        const message =
          (typeof data === "string" ? data : data?.message) ||
          "Username or email already exists.";
        Alert.alert("Sign Up Failed", message);
      } else {
        Alert.alert("Sign Up Failed", describeSignUpError(error));
      }
    } finally {
      isSubmittingRef.current = false;
      signUpAbortControllerRef.current = null;
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // ─── Google Sign-Up Handler ──────────────────────────────────────────────
  const handleGoogleSignUp = async () => {
    if (isSubmittingRef.current || googleLoading || loading) return;
    if (!checkRateLimit()) return;

    if (!GOOGLE_ENV_READY) {
      Alert.alert("Sign Up Failed", "Google sign-in is not configured correctly. Please contact support.");
      return;
    }
    if (!ENV_READY) {
      Alert.alert("Sign Up Failed", "App is not configured correctly. Please contact support.");
      return;
    }

    configureGoogleSignInOnce();

    isSubmittingRef.current = true;
    setGoogleLoading(true);

    const controller = new AbortController();
    googleAbortControllerRef.current = controller;

    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      try {
        await GoogleSignin.signOut();
      } catch (signOutErr) {
        // Safe to ignore
      }

      const response = await GoogleSignin.signIn();

      if (!isSuccessResponse(response)) {
        return;
      }

      const idToken = response.data?.idToken;

      if (!idToken) {
        Alert.alert("Sign Up Failed", "Google didn't return an ID token. Please try again.");
        registerFailedAttempt();
        return;
      }

      // Fixed: was previously hitting `${API_URL}/auth/google/login`
      // (missing the `/api` prefix used by the manual sign-up endpoint),
      // which caused this request to 404 against a mismatched route.
      const backendResponse = await axios.post<GoogleLoginApiResponse>(
        `${BASE_URL}/auth/google/login`,
        { idToken },
        { timeout: 15000, signal: controller.signal }
      );

      if (!isMountedRef.current) return;

      const data = backendResponse.data;

      if (!data?.accessToken) {
        Alert.alert("Sign Up Failed", "Server did not return an access token. Please wait 1 minute and try again.");
        registerFailedAttempt();
        return;
      }

      let me: MeResponse = {};
      try {
        me = await fetchMeAndStore(data.accessToken, controller.signal);
      } catch (meError: unknown) {
        if (!isMountedRef.current) return;
        if (meError instanceof SessionStorageError) {
          Alert.alert("Sign Up Failed", "Signed in, but we couldn't save your session. Please try again.");
        } else {
          Alert.alert("Sign Up Failed", "Signed in, but couldn't load your profile. Please wait 1 minute and try again.");
        }
        return;
      }

      if (!isMountedRef.current) return;
      resetRateLimit();

      Alert.alert("Account Created", `Welcome ${me.fullName ?? me.full_name ?? ""}`, [
        { text: "OK", onPress: () => router.replace("/(tabs)/dashboard") },
      ]);
    } catch (error: unknown) {
      if (isAbortError(error)) return;
      if (!isMountedRef.current) return;

      if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled, do nothing
      } else if (isErrorWithCode(error) && error.code === statusCodes.IN_PROGRESS) {
        Alert.alert("Sign Up Failed", "A sign-in attempt is already in progress.");
      } else if (isErrorWithCode(error) && error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert("Sign Up Failed", "Google Play Services unavailable. Please update and try again.");
      } else {
        registerFailedAttempt();
        if (axios.isAxiosError(error) && isInvalidCredentialsError(error)) {
          const axiosError = error as AxiosError<ApiErrorPayload | string>;
          const data = axiosError.response?.data;
          const message =
            (typeof data === "string" ? data : data?.message) || "Sign up failed. Please try again.";
          Alert.alert("Sign Up Failed", message);
        } else {
          Alert.alert("Sign Up Failed", describeSignUpError(error));
        }
      }
    } finally {
      isSubmittingRef.current = false;
      googleAbortControllerRef.current = null;
      if (isMountedRef.current) {
        setGoogleLoading(false);
      }
    }
  };

  const getStrength = (pwd: string) => {
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
  };

  const strength = getStrength(password);

  type FieldKey = "fullName" | "username" | "email" | "password" | "confirm";

  const renderField = (opts: {
    field: FieldKey;
    label: string;
    icon: keyof typeof Feather.glyphMap;
    value: string;
    onChangeText: (t: string) => void;
    placeholder: string;
    secure?: boolean;
    toggleSecure?: () => void;
    secureVisible?: boolean;
    keyboardType?: "default" | "email-address";
    autoCapitalize?: "none" | "words" | "sentences" | "characters";
  }) => {
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