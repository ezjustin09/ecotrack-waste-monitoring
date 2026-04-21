import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const LOGO = require("../../assets/splash-logo.png");

const SLIDES = [
  {
    key: "map",
    accent: "#34d399",
    soft: "rgba(52, 211, 153, 0.16)",
    eyebrow: "Live tracking",
    title: "Watch collection trucks move in real time.",
    description: "See active routes and check nearby pickups without guessing.",
    icon: "navigate",
    chips: ["Live map", "Nearby alerts"],
    statLabel: "Active view",
    statValue: "24/7",
    panelTitle: "Route visibility",
    panelCopy: "Know which truck is near your area.",
  },
  {
    key: "report",
    accent: "#38bdf8",
    soft: "rgba(56, 189, 248, 0.16)",
    eyebrow: "Quick reports",
    title: "Send issues in a few taps.",
    description: "Attach a photo and report missed pickups or illegal dumping fast.",
    icon: "camera",
    chips: ["Photo proof", "Fast send"],
    statLabel: "Avg. steps",
    statValue: "3",
    panelTitle: "Resident reporting",
    panelCopy: "Clear details for faster response.",
  },
  {
    key: "alerts",
    accent: "#f59e0b",
    soft: "rgba(245, 158, 11, 0.18)",
    eyebrow: "Stay updated",
    title: "Get schedules, news, and alerts in one place.",
    description: "Open one app to check the next pickup and important updates.",
    icon: "notifications",
    chips: ["Schedules", "Announcements"],
    statLabel: "Daily access",
    statValue: "Easy",
    panelTitle: "One resident hub",
    panelCopy: "Everything important stays easy to find.",
  },
];

function ProgressPill({ active, color }) {
  return (
    <View
      style={[
        styles.progressPill,
        {
          width: active ? 26 : 8,
          opacity: active ? 1 : 0.42,
          backgroundColor: color,
        },
      ]}
    />
  );
}

export default function OnboardingScreen({ onComplete }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;

  const floatY = useMemo(
    () =>
      pulse.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, -10, 0],
      }),
    [pulse]
  );

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [pulse]);

  function handleScrollEnd(event) {
    const x = Number(event?.nativeEvent?.contentOffset?.x || 0);
    const nextIndex = Math.round(x / Math.max(width, 1));
    setActiveIndex(Math.max(0, Math.min(SLIDES.length - 1, nextIndex)));
  }

  function handleSkip() {
    onComplete?.();
  }

  function handleNext() {
    if (activeIndex >= SLIDES.length - 1) {
      onComplete?.();
      return;
    }

    const nextIndex = activeIndex + 1;
    scrollRef.current?.scrollTo({
      x: nextIndex * width,
      animated: true,
    });
    setActiveIndex(nextIndex);
  }

  const currentSlide = SLIDES[activeIndex] || SLIDES[0];
  const visualHeight = Math.max(300, Math.min(height * 0.42, 400));

  return (
    <View style={styles.screen}>
      <View style={[styles.safeTop, { height: Math.max(insets.top, 20) }]} />
      <View style={[styles.backgroundOrb, styles.backgroundOrbOne, { backgroundColor: currentSlide.soft }]} />
      <View style={[styles.backgroundOrb, styles.backgroundOrbTwo, { backgroundColor: currentSlide.soft }]} />

      <View style={styles.header}>
        <View style={styles.brandWrap}>
          <Image source={LOGO} style={styles.brandLogo} resizeMode="contain" />
          <View>
            <Text style={styles.brandTitle}>EcoTrack</Text>
            <Text style={styles.brandSubtitle}>Pateros waste monitoring</Text>
          </View>
        </View>

        <Pressable style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, index) => {
          const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
          const cardTranslateY = scrollX.interpolate({
            inputRange,
            outputRange: [24, 0, 24],
            extrapolate: "clamp",
          });
          const cardOpacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.5, 1, 0.5],
            extrapolate: "clamp",
          });
          const cardScale = scrollX.interpolate({
            inputRange,
            outputRange: [0.92, 1, 0.92],
            extrapolate: "clamp",
          });
          const textTranslateY = scrollX.interpolate({
            inputRange,
            outputRange: [30, 0, 30],
            extrapolate: "clamp",
          });
          const textOpacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.18, 1, 0.18],
            extrapolate: "clamp",
          });

          return (
            <View key={slide.key} style={[styles.slide, { width }]}>
              <View style={[styles.visualStage, { height: visualHeight }]}>
                <Animated.View
                  style={[
                    styles.glowRing,
                    {
                      borderColor: slide.soft,
                      opacity: cardOpacity,
                      transform: [{ scale: cardScale }],
                    },
                  ]}
                />

                <Animated.View
                  style={[
                    styles.deviceShell,
                    {
                      transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
                      opacity: cardOpacity,
                    },
                  ]}
                >
                  <Animated.View style={[styles.deviceCard, { transform: [{ translateY: floatY }] }]}>
                    <View style={[styles.deviceTopBar, { backgroundColor: slide.soft }]}>
                      <View style={[styles.deviceIconBubble, { backgroundColor: slide.accent }]}>
                        <Ionicons name={slide.icon} size={24} color="#ffffff" />
                      </View>
                      <Text style={styles.deviceTopText}>{slide.panelTitle}</Text>
                    </View>

                    <View style={styles.deviceContent}>
                      <View style={[styles.deviceMetricCard, { borderColor: slide.soft }]}>
                        <Text style={styles.deviceMetricValue}>{slide.statValue}</Text>
                        <Text style={styles.deviceMetricLabel}>{slide.statLabel}</Text>
                      </View>

                      <View style={styles.featureStack}>
                        {slide.chips.map((chip) => (
                          <View key={chip} style={[styles.featureChip, { backgroundColor: slide.soft }]}>
                            <Text style={[styles.featureChipText, { color: slide.accent }]}>{chip}</Text>
                          </View>
                        ))}
                      </View>

                      <View style={styles.deviceMessageCard}>
                        <Text style={styles.deviceMessageTitle}>{slide.panelCopy}</Text>
                        <View style={styles.deviceMessageRow}>
                          <View style={[styles.deviceMessageDot, { backgroundColor: slide.accent }]} />
                          <Text style={styles.deviceMessageMeta}>Made for residents</Text>
                        </View>
                      </View>
                    </View>
                  </Animated.View>
                </Animated.View>
              </View>

              <Animated.View
                style={[
                  styles.contentCard,
                  {
                    transform: [{ translateY: textTranslateY }],
                    opacity: textOpacity,
                  },
                ]}
              >
                <Text style={[styles.eyebrow, { color: slide.accent }]}>{slide.eyebrow}</Text>
                <Text style={styles.title}>{slide.title}</Text>
                <Text style={styles.description}>{slide.description}</Text>
              </Animated.View>
            </View>
          );
        })}
      </Animated.ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(24, insets.bottom + 12) }]}>
        <View style={styles.progressRow}>
          <Text style={styles.progressCount}>
            {activeIndex + 1}/{SLIDES.length}
          </Text>
          <View style={styles.progressTrack}>
            {SLIDES.map((slide, index) => (
              <ProgressPill key={slide.key} active={index === activeIndex} color={currentSlide.accent} />
            ))}
          </View>
        </View>

        <Pressable style={[styles.actionButton, { backgroundColor: currentSlide.accent }]} onPress={handleNext}>
          <Text style={styles.actionButtonText}>
            {activeIndex === SLIDES.length - 1 ? "Get Started" : "Continue"}
          </Text>
          <Ionicons
            name={activeIndex === SLIDES.length - 1 ? "checkmark-circle" : "arrow-forward-circle"}
            size={22}
            color="#ffffff"
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#07111f",
  },
  safeTop: {
    backgroundColor: "#07111f",
  },
  backgroundOrb: {
    position: "absolute",
    borderRadius: 999,
  },
  backgroundOrbOne: {
    width: 260,
    height: 260,
    top: 56,
    right: -60,
  },
  backgroundOrbTwo: {
    width: 220,
    height: 220,
    bottom: 180,
    left: -80,
    opacity: 0.6,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandLogo: {
    width: 42,
    height: 42,
    marginRight: 12,
  },
  brandTitle: {
    color: "#f8fafc",
    fontSize: 19,
    fontWeight: "800",
  },
  brandSubtitle: {
    marginTop: 2,
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
  skipButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.14)",
  },
  skipText: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "700",
  },
  slide: {
    paddingHorizontal: 24,
  },
  visualStage: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  glowRing: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 999,
    borderWidth: 24,
  },
  deviceShell: {
    width: "100%",
    alignItems: "center",
  },
  deviceCard: {
    width: "86%",
    maxWidth: 340,
    borderRadius: 34,
    padding: 16,
    backgroundColor: "#f8fafc",
    shadowColor: "#020617",
    shadowOpacity: 0.26,
    shadowRadius: 28,
    shadowOffset: {
      width: 0,
      height: 18,
    },
    elevation: 16,
  },
  deviceTopBar: {
    borderRadius: 24,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  deviceIconBubble: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  deviceTopText: {
    flex: 1,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "800",
  },
  deviceContent: {
    marginTop: 14,
  },
  deviceMetricCard: {
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#ffffff",
  },
  deviceMetricValue: {
    color: "#0f172a",
    fontSize: 28,
    fontWeight: "800",
  },
  deviceMetricLabel: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600",
  },
  featureStack: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
  },
  featureChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  featureChipText: {
    fontSize: 12,
    fontWeight: "800",
  },
  deviceMessageCard: {
    marginTop: 6,
    borderRadius: 20,
    backgroundColor: "#eef2f7",
    padding: 14,
  },
  deviceMessageTitle: {
    color: "#0f172a",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  deviceMessageRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  deviceMessageDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  deviceMessageMeta: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
  contentCard: {
    marginTop: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 12,
    color: "#f8fafc",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
  },
  description: {
    marginTop: 14,
    color: "#cbd5e1",
    fontSize: 17,
    lineHeight: 27,
    maxWidth: 520,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  progressCount: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "700",
  },
  progressTrack: {
    flexDirection: "row",
    alignItems: "center",
  },
  progressPill: {
    height: 8,
    borderRadius: 999,
    marginLeft: 8,
  },
  actionButton: {
    height: 60,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
    marginRight: 10,
  },
});
