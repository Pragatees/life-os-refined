import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";

const BASE_URL = "https://life-os-backend-1ozl.onrender.com/api";

// ─── Theme Tokens (same as Login.tsx) ───────────────────────────────────
const T = {
  bg: ["#0A0A0B", "#141210", "#1C1712"] as const,
  surface: "rgba(24, 24, 27, 0.85)",
  surfaceAlt: "rgba(255, 138, 61, 0.08)",
  accent: "#FF8A3D",
  accentGradient: ["#FF8A3D", "#FFB25E"] as const,
  textPrimary: "#F5F5F4",
  textSecondary: "rgba(245, 245, 244, 0.62)",
  textFaint: "rgba(245, 245, 244, 0.38)",
  border: "rgba(255, 138, 61, 0.18)",
};

const dumpError = (label: string, err: any) => {
  try {
    const safe = {
      message: err?.message,
      response_status: err?.response?.status,
      response_data: err?.response?.data,
    };
    console.error(`[${label}]`, JSON.stringify(safe, null, 2));
  } catch {
    console.error(`[${label}] (failed to serialize)`, err);
  }
};

export default function ProfilePictureUpdater() {
  const [profilePicture, setProfilePicture] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  // Load whatever was stored at login, so the screen shows the current pic
  useEffect(() => {
    AsyncStorage.getItem("profilePicture").then((val) => {
      if (val) setProfilePicture(val);
    });
  }, []);

  const pickAndUpdateProfilePicture = async () => {
    // 1. Get the access token that was stored at login
    const token = await AsyncStorage.getItem("token");
    if (!token) {
      Alert.alert("Not signed in", "Please log in again.");
      return;
    }

    // 2. Ask permission + open picker
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "We need access to your photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled) return;
    const asset = result.assets[0];

    // 3. Build form-data exactly like your Postman request (key: "image")
    const formData = new FormData();
    formData.append("image", {
      uri: asset.uri,
      name: asset.fileName || "profile.jpg",
      type: asset.mimeType || "image/jpeg",
    } as any);

    try {
      setUploading(true);

      const response = await axios.post(
        `${BASE_URL}/users/profile-picture`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
          timeout: 120000, // Render cold start can take ~90s, give it room
        }
      );

      const data = response.data;
      const newUrl = data?.profilePicture ?? data?.profile_picture ?? "";

      if (!newUrl) {
        Alert.alert("Upload issue", "Server didn't return a new image URL.");
        return;
      }

      // 4. Overwrite the stored profilePicture with the new Cloudinary URL
      await AsyncStorage.setItem("profilePicture", newUrl);

      // 5. Reflect it immediately in the UI
      setProfilePicture(newUrl);

      Alert.alert("Success", data?.message ?? "Profile picture updated successfully");
    } catch (error: any) {
      dumpError("Profile Picture Upload Error", error);
      const serverMsg = error?.response?.data?.message;
      Alert.alert(
        "Upload Failed",
        serverMsg || error?.message || "Could not update profile picture."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <LinearGradient
      colors={T.bg}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <TouchableOpacity
        style={styles.avatarWrap}
        activeOpacity={0.85}
        onPress={pickAndUpdateProfilePicture}
        disabled={uploading}
      >
        {profilePicture ? (
          <Image source={{ uri: profilePicture }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Feather name="user" size={36} color={T.textFaint} />
          </View>
        )}

        <View style={styles.editBadge}>
          {uploading ? (
            <ActivityIndicator size="small" color="#1A120B" />
          ) : (
            <Feather name="camera" size={14} color="#1A120B" />
          )}
        </View>
      </TouchableOpacity>

      <Text style={styles.hint}>
        {uploading ? "Uploading..." : "Tap to change profile picture"}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  avatarWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    position: "relative",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: T.border,
  },
  avatarPlaceholder: {
    backgroundColor: T.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  editBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: T.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0A0A0B",
  },
  hint: {
    marginTop: 14,
    fontSize: 13,
    color: T.textSecondary,
  },
});