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
import { submitDumpReport } from "../services/api";

const ISSUE_TYPES = [
  "Illegal Dumping",
  "Overflowing Bin",
  "Uncollected Waste",
  "Burning Trash",
  "Other",
];

const BARANGAY_STREETS = {
  Aguho: ["M. Almeda Street", "Aguho Street", "Sto. Nino Street", "San Roque Street"],
  Magtanggol: ["Magtanggol Street", "A. Bonifacio Street", "Mabini Street", "Rizal Extension"],
  "Martires del 96": ["Martires Street", "General Luna Street", "P. Herrera Street", "J. Santos Street"],
  Poblacion: ["M. H. Del Pilar Street", "Pateros Municipal Road", "B. Morcilla Street", "A. Mabini Street"],
  "San Pedro": ["San Pedro Street", "P. Rosales Street", "F. Manalo Street", "P. Rosales Extension"],
  "Santa Ana": ["Sta. Ana Street", "F. Ponce Street", "A. Arnaiz Street", "Bayanihan Street"],
  "Santo Rosario-Kanluran": ["S. Rosario West Road", "C. Raymundo Street", "M. Cruz Street", "Ilaya Street"],
  "Santo Rosario-Silangan": ["S. Rosario East Road", "M. Santos Street", "Bagong Ilog Road", "P. Tuazon Street"],
  Tabacalera: ["Tabacalera Street", "Riverbank Road", "M. Alonzo Street", "Kalayaan Street"],
};

const BARANGAY_OPTIONS = Object.keys(BARANGAY_STREETS);

let ImagePickerModule = null;
try {
  // Keep app stable even if expo-image-picker is not installed yet.
  // eslint-disable-next-line global-require
  ImagePickerModule = require("expo-image-picker");
} catch (error) {
  ImagePickerModule = null;
}

function DropdownField({ label, value, placeholder, options, open, onToggle, onSelect, disabled = false }) {
  return (
    <View style={styles.dropdownBlock}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={[styles.dropdownTrigger, disabled && styles.dropdownTriggerDisabled]}
        onPress={onToggle}
        disabled={disabled}
      >
        <Text style={[styles.dropdownValue, !value && styles.dropdownValuePlaceholder]}>
          {value || placeholder}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={disabled ? "#94a3b8" : "#475569"} />
      </Pressable>

      {open && !disabled ? (
        <View style={styles.dropdownList}>
          {options.map((option) => (
            <Pressable key={option} style={styles.dropdownItem} onPress={() => onSelect(option)}>
              <Text style={styles.dropdownItemText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
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
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(28)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0.94)).current;
  const badgeFloat = useRef(new Animated.Value(0)).current;
  const [issueType, setIssueType] = useState(ISSUE_TYPES[0]);
  const [contactNumber, setContactNumber] = useState("");
  const [pictureUri, setPictureUri] = useState("");
  const [picturePreviewUri, setPicturePreviewUri] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [selectedStreet, setSelectedStreet] = useState("");
  const [isBarangayOpen, setIsBarangayOpen] = useState(false);
  const [isStreetOpen, setIsStreetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [lastReportId, setLastReportId] = useState("");

  const streetOptions = selectedBarangay ? BARANGAY_STREETS[selectedBarangay] || [] : [];

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
    const trimmedBarangay = String(selectedBarangay || "").trim();
    const trimmedStreet = String(selectedStreet || "").trim();
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
      setSelectedBarangay("");
      setSelectedStreet("");
      setIsBarangayOpen(false);
      setIsStreetOpen(false);
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

  function toggleBarangayDropdown() {
    setIsBarangayOpen((current) => !current);
    setIsStreetOpen(false);
  }

  function toggleStreetDropdown() {
    if (!selectedBarangay) {
      return;
    }

    setIsStreetOpen((current) => !current);
    setIsBarangayOpen(false);
  }

  function handleBarangaySelect(nextBarangay) {
    setSelectedBarangay(nextBarangay);
    setSelectedStreet("");
    setIsBarangayOpen(false);
    setIsStreetOpen(false);
  }

  function handleStreetSelect(nextStreet) {
    setSelectedStreet(nextStreet);
    setIsStreetOpen(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Animated.View
        style={[
          styles.card,
          {
            opacity: cardOpacity,
            transform: [{ translateY: cardTranslateY }],
          },
        ]}
      >
      

        <Text style={styles.label}>Type of Issue</Text>
        <View style={styles.issueTypeRow}>
          {ISSUE_TYPES.map((type) => {
            const selected = issueType === type;
            return (
              <Pressable
                key={type}
                style={[styles.issueTypeChip, selected && styles.issueTypeChipSelected]}
                onPress={() => setIssueType(type)}
              >
                <Text style={[styles.issueTypeText, selected && styles.issueTypeTextSelected]}>{type}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Picture</Text>
        <Pressable style={styles.secondaryButton} onPress={pickImageFromGallery} disabled={pickingImage}>
          {pickingImage ? (
            <ActivityIndicator color="#0f766e" />
          ) : (
            <Text style={styles.secondaryButtonText}>{pictureUri ? "Change Picture" : "Attach Picture"}</Text>
          )}
        </Pressable>

        {pictureUri ? (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: picturePreviewUri || pictureUri }} style={styles.imagePreview} resizeMode="cover" />
          </View>
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={18} color="#64748b" />
            <Text style={styles.imagePlaceholderText}>No picture attached yet.</Text>
          </View>
        )}

        <Text style={styles.label}>Contact Number (for follow-up)</Text>
        <TextInput
          style={styles.input}
          placeholder="09xxxxxxxxx"
          placeholderTextColor="#94a3b8"
          keyboardType="phone-pad"
          value={contactNumber}
          onChangeText={setContactNumber}
        />

        <DropdownField
          label="Barangay"
          value={selectedBarangay}
          placeholder="Select barangay"
          options={BARANGAY_OPTIONS}
          open={isBarangayOpen}
          onToggle={toggleBarangayDropdown}
          onSelect={handleBarangaySelect}
        />

        <DropdownField
          label="Street"
          value={selectedStreet}
          placeholder={selectedBarangay ? "Select street" : "Select barangay first"}
          options={streetOptions}
          open={isStreetOpen}
          onToggle={toggleStreetDropdown}
          onSelect={handleStreetSelect}
          disabled={!selectedBarangay}
        />

        <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={submitting}>
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
                opacity: successOpacity,
                transform: [{ scale: successScale }],
              },
            ]}
          >
            <Text style={styles.successTitle}>Latest report submitted</Text>
            <Text style={styles.successMeta}>Reference: {lastReportId}</Text>
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
  dropdownBlock: {
    marginBottom: 14,
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
  },
  dropdownTriggerDisabled: {
    opacity: 0.7,
  },
  dropdownValue: {
    color: "#0f172a",
    fontSize: 15,
    flex: 1,
    paddingRight: 8,
  },
  dropdownValuePlaceholder: {
    color: "#94a3b8",
  },
  dropdownList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  dropdownItemText: {
    fontSize: 14,
    color: "#0f172a",
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




