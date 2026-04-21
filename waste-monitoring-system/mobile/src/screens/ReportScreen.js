import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { usePreferences } from "../context/PreferencesContext";
import { submitDumpReport } from "../services/api";

const ISSUE_TYPES = [
  "Illegal Dumping",
  "Overflowing Bin",
  "Uncollected Waste",
  "Burning Trash",
  "Other",
];

let ImagePickerModule = null;
try {
  // Keep app stable even if expo-image-picker is not installed yet.
  // eslint-disable-next-line global-require
  ImagePickerModule = require("expo-image-picker");
} catch (error) {
  ImagePickerModule = null;
}

function toDataUriFromBase64(base64Payload, mimeType = "image/jpeg") {
  const normalizedBase64 = String(base64Payload || "").trim();
  if (!normalizedBase64) {
    return "";
  }

  const safeMimeType = String(mimeType || "image/jpeg").trim() || "image/jpeg";
  return `data:${safeMimeType};base64,${normalizedBase64}`;
}

function readFileUriAsDataUri(fileUri) {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(fileUri);
      const blob = await response.blob();
      const reader = new FileReader();

      reader.onerror = () => reject(new Error("Unable to read the selected image."));
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(blob);
    } catch (error) {
      reject(error);
    }
  });
}

export default function ReportScreen() {
  const { token, user, signOut } = useAuth();
  const { colors, isDarkMode } = usePreferences();
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(28)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0.94)).current;
  const badgeFloat = useRef(new Animated.Value(0)).current;
  const [issueType, setIssueType] = useState(ISSUE_TYPES[0]);
  const [contactNumber, setContactNumber] = useState("");
  const [pictureUri, setPictureUri] = useState("");
  const [picturePreviewUri, setPicturePreviewUri] = useState("");
  const [barangay, setBarangay] = useState("");
  const [street, setStreet] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [lastReportId, setLastReportId] = useState("");

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(cardTranslateY, {
        toValue: 0,
        damping: 18,
        stiffness: 150,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start();

    const floatAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(badgeFloat, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(badgeFloat, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    floatAnimation.start();
    return () => floatAnimation.stop();
  }, [badgeFloat, cardOpacity, cardTranslateY]);

  useEffect(() => {
    if (!lastReportId) {
      successOpacity.setValue(0);
      successScale.setValue(0.94);
      return;
    }

    successOpacity.setValue(0);
    successScale.setValue(0.94);

    Animated.parallel([
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(successScale, {
        toValue: 1,
        damping: 16,
        stiffness: 180,
        mass: 0.8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [lastReportId, successOpacity, successScale]);

  function handleAuthError(message) {
    if (message === "Authentication required" || message === "Invalid or expired session") {
      signOut();
      return true;
    }

    return false;
  }

  async function pickImageFromGallery() {
    if (!ImagePickerModule) {
      Alert.alert(
        "Photo feature unavailable",
        "Install expo-image-picker in mobile app dependencies to enable photo attachments."
      );
      return;
    }

    setPickingImage(true);

    try {
      const permission = await ImagePickerModule.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission needed", "Photo library permission is required to attach evidence.");
        return;
      }

      const result = await ImagePickerModule.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.75,
        base64: true,
      });

      if (result.canceled) {
        return;
      }

      const selectedAsset = result.assets?.[0] || null;
      const selectedUri = selectedAsset?.uri || "";
      const selectedMimeType = selectedAsset?.mimeType || "image/jpeg";
      const selectedBase64 = selectedAsset?.base64 || "";

      setPicturePreviewUri(selectedUri);

      if (selectedBase64) {
        setPictureUri(toDataUriFromBase64(selectedBase64, selectedMimeType));
        return;
      }

      if (selectedUri && !selectedUri.toLowerCase().startsWith("http")) {
        const encodedUri = await readFileUriAsDataUri(selectedUri);

        if (encodedUri) {
          setPictureUri(encodedUri);
          return;
        }
      }

      setPictureUri(selectedUri);
    } catch (error) {
      Alert.alert("Image error", error.message);
    } finally {
      setPickingImage(false);
    }
  }

  async function handleSubmit() {
    const trimmedIssueType = String(issueType || "").trim();
    const trimmedContact = String(contactNumber || "").trim();
    const trimmedPictureUri = String(pictureUri || "").trim();
    const trimmedBarangay = String(barangay || "").trim();
    const trimmedStreet = String(street || "").trim();
    const contactDigits = trimmedContact.replace(/\D/g, "");

    if (!trimmedIssueType) {
      Alert.alert("Missing issue type", "Please choose the type of issue.");
      return;
    }

    if (contactDigits.length < 7) {
      Alert.alert("Invalid contact number", "Please enter a valid contact number for follow-up.");
      return;
    }

    if (!trimmedPictureUri) {
      Alert.alert("Missing picture", "Please attach a picture of the reported issue.");
      return;
    }

    const lowerPictureUri = trimmedPictureUri.toLowerCase();
    if (
      lowerPictureUri.startsWith("file://") ||
      lowerPictureUri.startsWith("content://") ||
      lowerPictureUri.startsWith("ph://") ||
      lowerPictureUri.startsWith("assets-library://")
    ) {
      Alert.alert("Image upload issue", "Please pick the picture again so it can be uploaded properly.");
      return;
    }

    if (!trimmedBarangay || !trimmedStreet) {
      Alert.alert("Missing location", "Please select barangay and street.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await submitDumpReport(
        {
          issueType: trimmedIssueType,
          contactNumber: trimmedContact,
          pictureUri: trimmedPictureUri,
          location: {
            barangay: trimmedBarangay,
            street: trimmedStreet,
          },
        },
        token
      );

      setIssueType(ISSUE_TYPES[0]);
      setContactNumber("");
      setPictureUri("");
      setPicturePreviewUri("");
      setBarangay("");
      setStreet("");
      setLastReportId(response.report.id);
      Alert.alert("Report sent", `Submitted as ${response.report.reportedBy}.`);
    } catch (error) {
      if (!handleAuthError(error.message)) {
        Alert.alert("Submission failed", error.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.borderSoft,
          },
          {
            opacity: cardOpacity,
            transform: [{ translateY: cardTranslateY }],
          },
        ]}
      >


        <Text style={[styles.label, { color: colors.text }]}>Type of Issue</Text>
        <View style={styles.issueTypeRow}>
          {ISSUE_TYPES.map((type) => {
            const selected = issueType === type;
            return (
              <Pressable
                key={type}
                style={[
                  styles.issueTypeChip,
                  { backgroundColor: isDarkMode ? colors.cardMuted : "#e2e8f0" },
                  selected && [styles.issueTypeChipSelected, { backgroundColor: colors.overlay }],
                ]}
                onPress={() => setIssueType(type)}
              >
                <Text
                  style={[
                    styles.issueTypeText,
                    { color: colors.textSecondary },
                    selected && [styles.issueTypeTextSelected, { color: colors.primary }],
                  ]}
                >
                  {type}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Picture</Text>
        <Pressable
          style={[styles.secondaryButton, { borderColor: colors.primary, backgroundColor: colors.overlay }]}
          onPress={pickImageFromGallery}
          disabled={pickingImage}
        >
          {pickingImage ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
              {pictureUri ? "Change Picture" : "Attach Picture"}
            </Text>
          )}
        </Pressable>

        {pictureUri ? (
          <View style={[styles.imagePreviewWrap, { borderColor: colors.border }]}>
            <Image source={{ uri: picturePreviewUri || pictureUri }} style={styles.imagePreview} resizeMode="cover" />
          </View>
        ) : (
          <View style={[styles.imagePlaceholder, { borderColor: colors.borderSoft, backgroundColor: colors.cardMuted }]}>
            <Ionicons name="image-outline" size={18} color={colors.textMuted} />
            <Text style={[styles.imagePlaceholderText, { color: colors.textMuted }]}>No picture attached yet.</Text>
          </View>
        )}

        <Text style={[styles.label, { color: colors.text }]}>Contact Number (for follow-up)</Text>
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.cardMuted }]}
          placeholder="09xxxxxxxxx"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          value={contactNumber}
          onChangeText={setContactNumber}
        />

        <Text style={[styles.label, { color: colors.text }]}>Barangay</Text>
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.cardMuted }]}
          placeholder="Enter barangay"
          placeholderTextColor={colors.textMuted}
          value={barangay}
          onChangeText={setBarangay}
        />

        <Text style={[styles.label, { color: colors.text }]}>Street</Text>
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.cardMuted }]}
          placeholder="Enter street"
          placeholderTextColor={colors.textMuted}
          value={street}
          onChangeText={setStreet}
        />

        <Pressable style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Submit Report</Text>
          )}
        </Pressable>

        {lastReportId ? (
          <Animated.View
            style={[
              styles.successBox,
              {
                backgroundColor: colors.successSoft,
                borderColor: isDarkMode ? colors.primary : "#bbf7d0",
              },
              {
                opacity: successOpacity,
                transform: [{ scale: successScale }],
              },
            ]}
          >
            <Text style={[styles.successTitle, { color: colors.primary }]}>Latest report submitted</Text>
            <Text style={[styles.successMeta, { color: colors.textSecondary }]}>Reference: {lastReportId}</Text>
          </Animated.View>
        ) : null}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    backgroundColor: "#f3f7f6",
    flexGrow: 1,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  headerBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ccfbf1",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 14,
    color: "#475569",
    marginTop: 8,
    marginBottom: 18,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 8,
  },
  issueTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  issueTypeChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
    marginRight: 8,
    marginBottom: 8,
  },
  issueTypeChipSelected: {
    backgroundColor: "#ccfbf1",
  },
  issueTypeText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },
  issueTypeTextSelected: {
    color: "#0f766e",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
    marginBottom: 16,
  },
  imagePreviewWrap: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    marginBottom: 16,
  },
  imagePreview: {
    width: "100%",
    height: 180,
    backgroundColor: "#e2e8f0",
  },
  imagePlaceholder: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
    backgroundColor: "#f8fafc",
  },
  imagePlaceholderText: {
    marginLeft: 8,
    color: "#64748b",
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: "#0f766e",
    borderRadius: 14,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#0f766e",
    borderRadius: 14,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    backgroundColor: "#ecfeff",
  },
  secondaryButtonText: {
    color: "#0f766e",
    fontSize: 15,
    fontWeight: "700",
  },
  successBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  successTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#166534",
    marginBottom: 4,
  },
  successMeta: {
    fontSize: 13,
    color: "#166534",
  },
});




