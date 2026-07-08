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
};

// ─── Google Sign-In Configuration ───────────────────────────────────────────
// Replace with your actual Web Client ID from Google Cloud Console.
GoogleSignin.configure({
  webClientId:
    "260015412456-k4nkvjb1hd0mabk5g362otqg3818l6nt.apps.googleusercontent.com",
  offlineAccess: true,
});

// Small helper so every error path prints a fully serialized, readable object
// to the console (Metro/dev-tools) instead of "[object Object]" or a crash.
const dumpError = (label: string, err: any) => {
  try {
    if (err === null || err === undefined) {
      console.error(`\n[${label}] ------------------------------`);
      console.error(`[${label}] Received a null/undefined error (no details available).`);
      console.error(`[${label}] ------------------------------\n`);
      return;
    }
    const safe = {
      message: err?.message,
      name: err?.name,
      code: err?.code,
      isAxiosError: err?.isAxiosError,
      response_status: err?.response?.status,
      response_data: err?.response?.data,
      response_headers: err?.response?.headers,
      request_present: !!err?.request,
      config_url: err?.config?.url,
      config_method: err?.config?.method,
      stack: err?.stack,
    };
    console.error(`\n[${label}] ------------------------------`);
    console.error(JSON.stringify(safe, null, 2));
    console.error(`[${label}] ------------------------------\n`);
  } catch (e) {
    console.error(`[${label}] (failed to serialize error)`, err);
  }
};

// Helper: pull a profile picture URL out of a backend response regardless of
// whether it comes back camelCase ("profilePicture") or snake_case straight
// from the `profile_picture` DB column ("profile_picture"). Falls back to "".
const extractProfilePicture = (data: any): string => {
  return data?.profilePicture ?? data?.profile_picture ?? "";
};

// ─── /auth/me fetch + storage ───────────────────────────────────────────────
// After we have an access token (from either email/password or Google login),
// we hit GET /api/auth/me with that token to get the canonical user profile,
// then persist everything EXCEPT the userId to AsyncStorage. The access
// token itself is what we use going forward to re-fetch /me whenever needed,
// so there's no need to keep the id around locally.
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
  console.log("accessToken and profile stored in AsyncStorage:", {
    accessToken,
    username: me.username,
    fullName: me.fullName,
    email: me.email,
    profilePicture: me.profilePicture,
    provider: me.provider,
  });
  return me;
};

export default function Login() {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

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
    if (!usernameOrEmail.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter username/email and password.");
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post(
        `${BASE_URL}/auth/login`,
        { usernameOrEmail, password },
        { timeout: 15000 }
      );

      const data = response.data;
      console.log(data);

      if (!data?.accessToken) {
        Alert.alert("Login Failed", "Server did not return an access token.");
        return;
      }

      let me: MeResponse = {};
      try {
        me = await fetchMeAndStore(data.accessToken);
      } catch (meError: any) {
        dumpError("Fetch /users/me Error (login)", meError);
        Alert.alert(
          "Login Failed",
          "Signed in, but couldn't load your profile. Please try again."
        );
        return;
      }

      Alert.alert("Login Successful", `Welcome ${me.fullName ?? me.full_name ?? ""}`, [
        {
          text: "OK",
          onPress: () => router.replace("/(tabs)/dashboard"),
        },
      ]);
    } catch (error: any) {
      dumpError("Login Error", error);

      if (!error) {
        Alert.alert("Unexpected Error", "An unknown error occurred. Please try again.");
      } else if (error?.response) {
        // Server responded with a non-2xx status
        const status = error.response.status;
        const serverMsg =
          error.response.data?.message ||
          (typeof error.response.data === "string"
            ? error.response.data
            : JSON.stringify(error.response.data));
        Alert.alert(
          `Login Failed (${status})`,
          serverMsg || "Invalid username/email or password."
        );
      } else if (error?.request) {
        // Request was made but no response received
        Alert.alert(
          "Network Error",
          `No response from server.\nURL: ${BASE_URL}/auth/login\n${error?.message ?? "Unknown network error"}`
        );
      } else {
        // Something else went wrong setting up the request
        Alert.alert("Unexpected Error", error?.message || "An unknown error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Google Sign-In Handler ────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    if (googleLoading || loading) return;

    try {
      setGoogleLoading(true);

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Clear any cached Google session first. Without this, signIn() will
      // silently reuse the last-used account instead of showing the account
      // picker — which is exactly the "always logs into the same account"
      // behavior we want to avoid.
      try {
        await GoogleSignin.signOut();
      } catch (signOutErr) {
        // Safe to ignore — this just means there was no active session to
        // clear (e.g. very first sign-in ever on this device).
        console.log("[Google Sign-In] signOut before signIn skipped:", signOutErr);
      }

      const response = await GoogleSignin.signIn();
      console.log("[Google Sign-In] Raw response:", JSON.stringify(response, null, 2));

      if (!isSuccessResponse(response)) {
        // User cancelled the sign-in flow.
        console.log("[Google Sign-In] Not a success response (likely cancelled).");
        setGoogleLoading(false);
        return;
      }

      const idToken = response.data?.idToken;

      if (!idToken) {
        console.error(
          "[Google Sign-In] No ID token received. Full response:",
          JSON.stringify(response, null, 2)
        );
        Alert.alert(
          "Google Sign-In Failed",
          "No ID token was returned by Google. This usually means webClientId in GoogleSignin.configure() is not a 'Web application' OAuth client ID, or it doesn't match the backend's expected audience."
        );
        setGoogleLoading(false);
        return;
      }

      console.log("[Google Sign-In] Got idToken, length:", idToken.length);

      // Isolate the backend call so we know for certain whether the failure
      // is Google's SDK or our own server rejecting the token.
      let backendResponse;
      try {
        backendResponse = await axios.post(
          `${BASE_URL}/auth/google/login`,
          { idToken },
          { timeout: 15000 }
        );
      } catch (backendErr: any) {
        dumpError("Google Backend Call Error", backendErr);
        throw backendErr; // handled by outer catch below
      }

      const data = backendResponse.data;

      if (!data?.accessToken) {
        Alert.alert("Google Sign-In Failed", "Server did not return an access token.");
        return;
      }

      let me: MeResponse = {};
      try {
        me = await fetchMeAndStore(data.accessToken);
      } catch (meError: any) {
        dumpError("Fetch /auth/me Error (google login)", meError);
        Alert.alert(
          "Google Sign-In Failed",
          "Signed in, but couldn't load your profile. Please try again."
        );
        return;
      }

      Alert.alert("Login Successful", `Welcome ${me.fullName ?? me.full_name ?? ""}`, [
        {
          text: "OK",
          onPress: () => router.replace("/(tabs)/dashboard"),
        },
      ]);
    } catch (error: any) {
      dumpError("Google Login Error", error);

      if (!error) {
        // Some native rejections come back with no error object at all.
        Alert.alert(
          "Google Sign-In Failed",
          "An unknown error occurred (no error details were provided). Please try again."
        );
      } else if (isErrorWithCode(error)) {
        // Native Google Sign-In SDK error
        switch (error.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            console.log("[Google Sign-In] User cancelled.");
            break;
          case statusCodes.IN_PROGRESS:
            Alert.alert("Please Wait", "A sign-in attempt is already in progress.");
            break;
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            Alert.alert(
              "Google Play Services Unavailable",
              "Please update Google Play Services and try again."
            );
            break;
          default:
            Alert.alert(
              "Google Sign-In Failed",
              `Native error code: ${error.code}\nMessage: ${error?.message || "unknown"}\n\n` +
                `If this is code 10 (DEVELOPER_ERROR), your app's SHA-1 fingerprint or package name ` +
                `is not correctly registered against the Android OAuth client in Google Cloud Console.`
            );
            break;
        }
      } else if (error?.response) {
        // Backend rejected the idToken or request
        const status = error.response.status;
        const serverMsg =
          error.response.data?.message ||
          (typeof error.response.data === "string"
            ? error.response.data
            : JSON.stringify(error.response.data));
        Alert.alert(
          `Google Login Failed (${status})`,
          serverMsg || "Invalid or expired Google token."
        );
      } else if (error?.request) {
        Alert.alert(
          "Network Error",
          `No response from server.\nURL: ${BASE_URL}/auth/google/login\n${error?.message ?? "Unknown network error"}`
        );
      } else {
        Alert.alert("Google Sign-In Failed", error?.message || "An unknown error occurred.");
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
                          <Text style={styles.googleButtonText}>Continue with Google</Text>
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