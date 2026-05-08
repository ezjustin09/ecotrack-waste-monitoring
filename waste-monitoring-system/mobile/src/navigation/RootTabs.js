import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HomeScreen from "../screens/HomeScreen";
import MapScreen from "../screens/MapScreen";
import DriverScreen from "../screens/DriverScreen";
import ReportScreen from "../screens/ReportScreen";
import ScheduleScreen from "../screens/ScheduleScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { useAuth } from "../context/AuthContext";
import { usePreferences } from "../context/PreferencesContext";
import { updateProfilePicture, updateUserBarangay } from "../services/api";
import { BARANGAY_OPTIONS } from "../constants/barangays";

const Tab = createBottomTabNavigator();
const PROFILE_IMAGE_STORAGE_PREFIX = "ecotrack:profile-image:";
const PROFILE_IMAGE_MAX_LENGTH = 3 * 1024 * 1024;
let AsyncStorageModule = null;
let ImagePickerModule = null;

try {
  // Keep the app usable if an old development binary does not include these native modules yet.
  // eslint-disable-next-line global-require
  AsyncStorageModule = require("@react-native-async-storage/async-storage").default;
} catch (error) {
  AsyncStorageModule = null;
}

try {
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

const iconMap = {
  Home: "home",
  "Live Map": "map",
  "Driver GPS": "navigate",
  Schedule: "calendar",
  Report: "warning",
};

function getTabLabel(route, descriptor) {
  const tabBarLabel = descriptor?.options?.tabBarLabel;

  if (typeof tabBarLabel === "string") {
    return tabBarLabel;
  }

  if (typeof descriptor?.options?.title === "string") {
    return descriptor.options.title;
  }

  return route.name;
}

function AnimatedTabItem({
  label,
  iconName,
  focused,
  colors,
  isDarkMode,
  onPress,
  onLongPress,
  accessibilityState,
  accessibilityLabel,
  testID,
}) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const activeBubbleScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  useEffect(() => {
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 120,
    }).start();
  }, [focused, progress]);

  const iconTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });
  const iconScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.14],
  });
  const labelOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const labelTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });
  const inactiveIconOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const activeIconOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={styles.tabItem}
    >
      <Animated.View
        style={[
          styles.activeIconBubble,
          {
            backgroundColor: colors.primary,
            borderColor: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)",
            opacity: activeIconOpacity,
            transform: [{ translateY: iconTranslateY }, { scale: Animated.multiply(iconScale, activeBubbleScale) }],
          },
        ]}
      >
        <Ionicons name={iconName} size={20} color="#ffffff" />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.inactiveIconShell,
          {
            opacity: inactiveIconOpacity,
            transform: [{ translateY: iconTranslateY }, { scale: iconScale }],
          },
        ]}
      >
        <Ionicons name={iconName} size={21} color={colors.textMuted} />
      </Animated.View>
      <Animated.Text
        style={[
          styles.tabLabel,
          {
            color: focused ? colors.primary : colors.textMuted,
            opacity: labelOpacity,
            transform: [{ translateY: labelTranslateY }],
          },
        ]}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
}

function AnimatedTabBar({ state, descriptors, navigation, colors, isDarkMode, tabBarBottomPadding }) {
  const { width } = useWindowDimensions();
  const routeCount = Math.max(state.routes.length, 1);
  const barWidth = Math.min(width - 24, 480);
  const itemWidth = barWidth / routeCount;
  const indicatorInset = 10;
  const indicatorWidth = Math.max(itemWidth - indicatorInset * 2, 0);
  const indicatorTranslateX = useRef(new Animated.Value(state.index * itemWidth + indicatorInset)).current;

  useEffect(() => {
    Animated.spring(indicatorTranslateX, {
      toValue: state.index * itemWidth + indicatorInset,
      useNativeDriver: true,
      friction: 10,
      tension: 140,
    }).start();
  }, [indicatorInset, indicatorTranslateX, itemWidth, state.index]);

  return (
    <View style={[styles.tabBarShell, { paddingBottom: tabBarBottomPadding, backgroundColor: colors.background }]}>
      <View
        style={[
          styles.tabBarFrame,
          {
            width: barWidth,
            backgroundColor: isDarkMode ? "#0f172a" : colors.card,
            borderColor: isDarkMode ? colors.borderSoft : "rgba(15, 23, 42, 0.06)",
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeTabBackdrop,
            {
              width: indicatorWidth,
              transform: [{ translateX: indicatorTranslateX }],
              backgroundColor: isDarkMode ? "rgba(52, 211, 153, 0.14)" : colors.overlay,
              borderColor: isDarkMode ? "rgba(52, 211, 153, 0.22)" : "rgba(15, 118, 110, 0.08)",
            },
          ]}
        />

        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const descriptor = descriptors[route.key];
          const label = getTabLabel(route, descriptor);

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <AnimatedTabItem
              key={route.key}
              label={label}
              iconName={iconMap[route.name]}
              focused={focused}
              colors={colors}
              isDarkMode={isDarkMode}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={descriptor.options.tabBarAccessibilityLabel}
              testID={descriptor.options.tabBarButtonTestID}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function RootTabs({ onSignOut, user }) {
  const insets = useSafeAreaInsets();
  const { token, setSession } = useAuth();
  const { colors, isDarkMode } = usePreferences();
  const isDriver = user?.role === "driver";
  const tabBarBottomPadding = Math.max(insets.bottom, 10);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isProfileVisible, setIsProfileVisible] = useState(false);
  const [isBarangayPickerVisible, setIsBarangayPickerVisible] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState("");
  const [isUpdatingProfileImage, setIsUpdatingProfileImage] = useState(false);
  const [isUpdatingBarangay, setIsUpdatingBarangay] = useState(false);
  const displayName = String(user?.name || user?.email || "Resident User").trim();
  const displayEmail = String(user?.email || "No email available").trim();
  const designatedBarangay = String(user?.barangay || "").trim();
  const profileInitial = displayName.charAt(0).toUpperCase() || "R";
  const roleLabel = isDriver ? "Driver" : "Resident";
  const profileStorageKey = `${PROFILE_IMAGE_STORAGE_PREFIX}${user?.id || user?.email || "guest"}`;

  useEffect(() => {
    let isMounted = true;

    async function loadProfileImage() {
      const fallbackAvatar = String(user?.avatarUrl || "").trim();

      if (!AsyncStorageModule?.getItem) {
        if (isMounted) {
          setProfileImageUri(fallbackAvatar);
        }
        return;
      }

      try {
        const savedUri = await AsyncStorageModule.getItem(profileStorageKey);
        if (isMounted) {
          setProfileImageUri(savedUri || fallbackAvatar);
        }
      } catch (error) {
        if (isMounted) {
          setProfileImageUri(fallbackAvatar);
        }
      }
    }

    loadProfileImage();

    return () => {
      isMounted = false;
    };
  }, [profileStorageKey, user?.avatarUrl]);

  function openSettingsFromMenu() {
    setIsMenuVisible(false);
    setIsSettingsVisible(true);
  }

  function openProfileFromMenu() {
    setIsMenuVisible(false);
    setIsProfileVisible(true);
  }

  function handleMenuSignOut() {
    setIsMenuVisible(false);
    setIsProfileVisible(false);
    setIsSettingsVisible(false);
    setIsBarangayPickerVisible(false);
    onSignOut?.();
  }

  async function handleChangeProfilePicture() {
    if (!ImagePickerModule) {
      Alert.alert("Profile photo unavailable", "Image picker is not available in this app build yet.");
      return;
    }

    if (isUpdatingProfileImage) {
      return;
    }

    setIsUpdatingProfileImage(true);

    try {
      const permission = await ImagePickerModule.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission needed", "Please allow photo access so you can choose a profile picture.");
        return;
      }

      const result = await ImagePickerModule.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.65,
        base64: true,
      });

      if (result.canceled) {
        return;
      }

      const selectedAsset = result.assets?.[0] || null;
      const selectedUri = selectedAsset?.uri || "";
      const selectedMimeType = selectedAsset?.mimeType || "image/jpeg";
      const selectedBase64 = selectedAsset?.base64 || "";
      let nextUri = selectedBase64 ? toDataUriFromBase64(selectedBase64, selectedMimeType) : "";

      if (!nextUri && selectedUri && !selectedUri.toLowerCase().startsWith("http")) {
        nextUri = await readFileUriAsDataUri(selectedUri);
      }

      if (!nextUri) {
        nextUri = selectedUri;
      }

      if (!nextUri) {
        Alert.alert("Photo unavailable", "Please choose another image.");
        return;
      }

      if (nextUri.length > PROFILE_IMAGE_MAX_LENGTH) {
        Alert.alert("Photo too large", "Please choose a smaller profile picture.");
        return;
      }

      setProfileImageUri(nextUri);

      if (AsyncStorageModule?.setItem) {
        try {
          await AsyncStorageModule.setItem(profileStorageKey, nextUri);
        } catch (storageError) {
          console.warn("Unable to save profile picture locally:", storageError?.message || storageError);
        }
      }

      if (token) {
        const response = await updateProfilePicture(nextUri, token);

        if (response.user) {
          setSession({
            token,
            user: response.user,
          });
        }
      }
    } catch (error) {
      if (error?.message === "Authentication required" || error?.message === "Invalid or expired session") {
        handleMenuSignOut();
        return;
      }

      Alert.alert("Unable to update photo", error?.message || "Please try again.");
    } finally {
      setIsUpdatingProfileImage(false);
    }
  }

  async function handleSelectBarangay(nextBarangay) {
    if (!token || isDriver || isUpdatingBarangay || !nextBarangay || nextBarangay === designatedBarangay) {
      setIsBarangayPickerVisible(false);
      return;
    }

    setIsUpdatingBarangay(true);

    try {
      const response = await updateUserBarangay(nextBarangay, token);

      if (response.user) {
        setSession({
          token,
          user: response.user,
        });
      }

      setIsBarangayPickerVisible(false);
    } catch (error) {
      if (error?.message === "Authentication required" || error?.message === "Invalid or expired session") {
        handleMenuSignOut();
        return;
      }

      Alert.alert("Unable to update barangay", error?.message || "Please try again.");
    } finally {
      setIsUpdatingBarangay(false);
    }
  }

  return (
    <>
      <Tab.Navigator
        tabBar={(props) => (
          <AnimatedTabBar
            {...props}
            colors={colors}
            isDarkMode={isDarkMode}
            tabBarBottomPadding={tabBarBottomPadding}
          />
        )}
        screenOptions={({ route }) => ({
          sceneStyle: {
            backgroundColor: colors.background,
          },
          headerStyle: {
            backgroundColor: colors.card,
          },
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: "700",
            color: colors.text,
          },
          headerRight: () => (
            <Pressable
              onPress={() => setIsMenuVisible(true)}
              style={[styles.headerMenuButton, { backgroundColor: colors.overlay }]}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
            >
              <Ionicons name="menu-outline" size={24} color={colors.primary} />
            </Pressable>
          ),
          headerShadowVisible: !isDarkMode,
          tabBarHideOnKeyboard: true,
          tabBarShowLabel: false,
        })}
      >
        {isDriver ? (
          <>
            <Tab.Screen name="Driver GPS" component={DriverScreen} />
          </>
        ) : (
          <>
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Live Map" component={MapScreen} />
            <Tab.Screen name="Schedule" component={ScheduleScreen} />
            <Tab.Screen name="Report" component={ReportScreen} />
          </>
        )}
      </Tab.Navigator>

      <Modal
        visible={isMenuVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setIsMenuVisible(false)}>
          <View
            style={[
              styles.menuCard,
              {
                top: Math.max(insets.top, 12) + 46,
                backgroundColor: colors.card,
                borderColor: colors.borderSoft,
              },
            ]}
          >
            <View style={styles.menuProfileRow}>
              <View style={[styles.profileAvatarSmall, { backgroundColor: colors.primary }]}>
                {profileImageUri ? (
                  <Image source={{ uri: profileImageUri }} style={styles.profileAvatarImageSmall} />
                ) : (
                  <Text style={styles.profileAvatarTextSmall}>{profileInitial}</Text>
                )}
              </View>
              <View style={styles.menuProfileText}>
                <Text style={[styles.menuProfileName, { color: colors.text }]} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={[styles.menuProfileRole, { color: colors.textMuted }]}>{roleLabel}</Text>
              </View>
            </View>

            <Pressable style={styles.menuItem} onPress={openProfileFromMenu}>
              <Ionicons name="person-circle-outline" size={22} color={colors.primary} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Profile</Text>
            </Pressable>

            <Pressable style={styles.menuItem} onPress={openSettingsFromMenu}>
              <Ionicons name="settings-outline" size={22} color={colors.primary} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Settings</Text>
            </Pressable>

            <Pressable style={[styles.menuItem, styles.menuDangerItem]} onPress={handleMenuSignOut}>
              <Ionicons name="log-out-outline" size={22} color="#ef4444" />
              <Text style={[styles.menuItemText, { color: "#ef4444" }]}>Log out</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={isProfileVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsProfileVisible(false)}
      >
        <ScrollView
          style={[
            styles.profileModal,
            {
              backgroundColor: colors.background,
              paddingTop: Math.max(insets.top, 12),
            },
          ]}
          contentContainerStyle={styles.profileModalContent}
        >
          <View
            style={[
              styles.settingsHeader,
              {
                backgroundColor: colors.card,
                borderBottomColor: colors.borderSoft,
              },
            ]}
          >
            <Text style={[styles.settingsTitle, { color: colors.text }]}>Profile</Text>
            <Pressable
              onPress={() => setIsProfileVisible(false)}
              style={[styles.headerMenuButton, { backgroundColor: colors.overlay }]}
              accessibilityRole="button"
              accessibilityLabel="Close profile"
            >
              <Ionicons name="close-outline" size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.borderSoft }]}>
            <Pressable
              style={[
                styles.profileAvatarLarge,
                { backgroundColor: colors.primary },
                isUpdatingProfileImage && styles.profileImageUpdating,
              ]}
              onPress={handleChangeProfilePicture}
              disabled={isUpdatingProfileImage}
              accessibilityRole="button"
              accessibilityLabel="Change profile picture"
            >
              {profileImageUri ? (
                <Image source={{ uri: profileImageUri }} style={styles.profileAvatarImageLarge} />
              ) : (
                <Text style={styles.profileAvatarTextLarge}>{profileInitial}</Text>
              )}
              <View style={styles.profileAvatarEditBadge}>
                {isUpdatingProfileImage ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="camera" size={15} color="#ffffff" />
                )}
              </View>
            </Pressable>
            <Pressable
              style={[
                styles.changePhotoButton,
                { backgroundColor: colors.overlay },
                isUpdatingProfileImage && styles.profileImageUpdating,
              ]}
              onPress={handleChangeProfilePicture}
              disabled={isUpdatingProfileImage}
            >
              {isUpdatingProfileImage ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="camera-outline" size={16} color={colors.primary} />
              )}
              <Text style={[styles.changePhotoText, { color: colors.primary }]}>Change photo</Text>
            </Pressable>
            <Text style={[styles.profileName, { color: colors.text }]}>{displayName}</Text>
            <Text style={[styles.profileEmail, { color: colors.textMuted }]}>{displayEmail}</Text>
            <View style={[styles.profileBadge, { backgroundColor: colors.overlay }]}>
              <Ionicons name={isDriver ? "navigate-outline" : "person-outline"} size={16} color={colors.primary} />
              <Text style={[styles.profileBadgeText, { color: colors.primary }]}>{roleLabel}</Text>
            </View>
          </View>

          <View style={[styles.profileDetailsCard, { backgroundColor: colors.card, borderColor: colors.borderSoft }]}>
            <View style={styles.profileDetailRow}>
              <Text style={[styles.profileDetailLabel, { color: colors.textMuted }]}>User ID</Text>
              <Text style={[styles.profileDetailValue, { color: colors.text }]}>{user?.id || "-"}</Text>
            </View>
            <View style={styles.profileDetailRow}>
              <Text style={[styles.profileDetailLabel, { color: colors.textMuted }]}>Account Type</Text>
              <Text style={[styles.profileDetailValue, { color: colors.text }]}>{roleLabel}</Text>
            </View>
            {!isDriver ? (
              <View style={styles.profileDetailRow}>
                <Text style={[styles.profileDetailLabel, { color: colors.textMuted }]}>Designated Barangay</Text>
                <Text style={[styles.profileDetailValue, { color: colors.text }]}>
                  {designatedBarangay || "Not set"}
                </Text>
                <Pressable
                  style={[
                    styles.changePhotoButton,
                    { backgroundColor: colors.overlay, alignSelf: "flex-start", marginBottom: 0 },
                    isUpdatingBarangay && styles.profileImageUpdating,
                  ]}
                  onPress={() => setIsBarangayPickerVisible(true)}
                  disabled={isUpdatingBarangay}
                >
                  {isUpdatingBarangay ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="location-outline" size={16} color={colors.primary} />
                  )}
                  <Text style={[styles.changePhotoText, { color: colors.primary }]}>
                    {designatedBarangay ? "Change barangay" : "Set barangay"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {user?.truckId ? (
              <View style={styles.profileDetailRow}>
                <Text style={[styles.profileDetailLabel, { color: colors.textMuted }]}>Truck ID</Text>
                <Text style={[styles.profileDetailValue, { color: colors.text }]}>{user.truckId}</Text>
              </View>
            ) : null}
            {user?.authProvider ? (
              <View style={styles.profileDetailRow}>
                <Text style={[styles.profileDetailLabel, { color: colors.textMuted }]}>Login Method</Text>
                <Text style={[styles.profileDetailValue, { color: colors.text }]}>{user.authProvider}</Text>
              </View>
            ) : null}
          </View>

          <Pressable style={styles.profileSignOutButton} onPress={handleMenuSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#ffffff" />
            <Text style={styles.profileSignOutText}>Log out</Text>
          </Pressable>
        </ScrollView>
      </Modal>

      <Modal
        visible={isBarangayPickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsBarangayPickerVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setIsBarangayPickerVisible(false)}>
          <View
            style={[
              styles.barangayPickerCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.borderSoft,
              },
            ]}
          >
            <Text style={[styles.barangayPickerTitle, { color: colors.text }]}>Choose designated barangay</Text>
            <ScrollView style={styles.barangayPickerList} showsVerticalScrollIndicator={false}>
              {BARANGAY_OPTIONS.map((barangayOption) => {
                const isSelected = designatedBarangay === barangayOption;

                return (
                  <Pressable
                    key={barangayOption}
                    style={[
                      styles.barangayPickerOption,
                      { borderColor: colors.borderSoft },
                      isSelected && { backgroundColor: colors.overlay, borderColor: colors.primary },
                    ]}
                    onPress={() => handleSelectBarangay(barangayOption)}
                    disabled={isUpdatingBarangay}
                  >
                    <Text
                      style={[
                        styles.barangayPickerOptionText,
                        { color: isSelected ? colors.primary : colors.text },
                      ]}
                    >
                      {barangayOption}
                    </Text>
                    {isSelected ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={isSettingsVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsSettingsVisible(false)}
      >
        <View
          style={[
            styles.settingsModal,
            {
              backgroundColor: colors.background,
              paddingTop: Math.max(insets.top, 12),
            },
          ]}
        >
          <View
            style={[
              styles.settingsHeader,
              {
                backgroundColor: colors.card,
                borderBottomColor: colors.borderSoft,
              },
            ]}
          >
            <Text style={[styles.settingsTitle, { color: colors.text }]}>Settings</Text>
            <Pressable
              onPress={() => setIsSettingsVisible(false)}
              style={[styles.headerMenuButton, { backgroundColor: colors.overlay }]}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <Ionicons name="close-outline" size={22} color={colors.text} />
            </Pressable>
          </View>
          <SettingsScreen />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerMenuButton: {
    marginRight: 16,
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.18)",
  },
  menuCard: {
    position: "absolute",
    right: 14,
    width: 238,
    borderRadius: 22,
    borderWidth: 1,
    padding: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 14,
    },
    elevation: 14,
  },
  menuProfileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    marginBottom: 4,
  },
  profileAvatarSmall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profileAvatarImageSmall: {
    width: "100%",
    height: "100%",
  },
  profileAvatarTextSmall: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  menuProfileText: {
    flex: 1,
  },
  menuProfileName: {
    fontSize: 14,
    fontWeight: "800",
  },
  menuProfileRole: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  menuItem: {
    minHeight: 48,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
  },
  menuDangerItem: {
    marginTop: 2,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: "800",
  },
  profileModal: {
    flex: 1,
    paddingHorizontal: 18,
  },
  profileModalContent: {
    paddingBottom: 28,
  },
  profileCard: {
    alignItems: "center",
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    marginTop: 18,
  },
  profileAvatarLarge: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    overflow: "hidden",
  },
  profileAvatarImageLarge: {
    width: "100%",
    height: "100%",
  },
  profileImageUpdating: {
    opacity: 0.72,
  },
  profileAvatarEditBadge: {
    position: "absolute",
    right: 0,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  profileAvatarTextLarge: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "900",
  },
  changePhotoButton: {
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  changePhotoText: {
    fontSize: 13,
    fontWeight: "900",
  },
  profileName: {
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  profileEmail: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  profileBadge: {
    marginTop: 16,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  profileBadgeText: {
    fontSize: 13,
    fontWeight: "900",
  },
  profileDetailsCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginTop: 14,
  },
  profileDetailRow: {
    gap: 4,
    paddingVertical: 10,
  },
  profileDetailLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  profileDetailValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  profileSignOutButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: "#ef4444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
  },
  profileSignOutText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  barangayPickerCard: {
    marginHorizontal: 20,
    marginTop: 120,
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    maxHeight: 420,
  },
  barangayPickerTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12,
  },
  barangayPickerList: {
    maxHeight: 320,
  },
  barangayPickerOption: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  barangayPickerOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    paddingRight: 12,
  },
  tabBarShell: {
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  tabBarFrame: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 28,
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 12,
    borderWidth: 1,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 12,
  },
  activeTabBackdrop: {
    position: "absolute",
    top: 8,
    bottom: 10,
    left: 0,
    borderRadius: 22,
    borderWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 68,
    zIndex: 1,
  },
  activeIconBubble: {
    position: "absolute",
    top: 6,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 8,
  },
  inactiveIconShell: {
    position: "absolute",
    top: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 34,
  },
  settingsModal: {
    flex: 1,
  },
  settingsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
});
