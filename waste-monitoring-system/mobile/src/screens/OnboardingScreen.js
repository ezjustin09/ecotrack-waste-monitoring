import React, { useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SLIDES = [
  {
    key: "live-map",
    icon: "map",
    accent: "#0f766e",
    title: "Track Trucks Live",
    description: "See real-time garbage truck movement in Pateros directly on the map.",
  },
  {
    key: "report-fast",
    icon: "warning",
    accent: "#0ea5e9",
    title: "Report Issues Quickly",
    description: "Send reports with photo, barangay, street, and contact details.",
  },
  {
    key: "stay-updated",
    icon: "notifications",
    accent: "#f59e0b",
    title: "Stay Updated",
    description: "Get announcements, collection schedules, and nearby truck alerts in one app.",
  },
];

function Dot({ inputRange, scrollX, outputRange, activeColor = "#0f766e" }) {
  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: [0.35, 1, 0.35],
    extrapolate: "clamp",
  });

  const scale = scrollX.interpolate({
    inputRange,
    outputRange,
    extrapolate: "clamp",
  });

  return <Animated.View style={[styles.dot, { opacity, transform: [{ scale }], backgroundColor: activeColor }]} />;
}

export default function OnboardingScreen({ onComplete }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);

  const pulse = useRef(new Animated.Value(0)).current;
  const floatY = useMemo(
    () =>
      pulse.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, -8, 0],
      }),
    [pulse]
  );

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const currentSlide = SLIDES[activeIndex] || SLIDES[0];

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

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <Text style={styles.brand}>ECOTRACK</Text>
        <Pressable style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipButtonText}>Skip</Text>
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
        {SLIDES.map((slide) => (
          <View key={slide.key} style={[styles.slide, { width }]}>
            <Animated.View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: slide.accent,
                  transform: [{ translateY: floatY }],
                },
              ]}
            >
              <Ionicons name={slide.icon} size={46} color="#ffffff" />
            </Animated.View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.description}>{slide.description}</Text>
          </View>
        ))}
      </Animated.ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(34, insets.bottom + 18) }]}>
        <View style={styles.dotRow}>
          {SLIDES.map((slide, index) => {
            const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
            return (
              <Dot
                key={slide.key}
                inputRange={inputRange}
                outputRange={[1, 1.35, 1]}
                scrollX={scrollX}
                activeColor={currentSlide.accent}
              />
            );
          })}
        </View>

        <Pressable
          style={[styles.actionButton, { backgroundColor: currentSlide.accent }]}
          onPress={handleNext}
        >
          <Text style={styles.actionButtonText}>{activeIndex === SLIDES.length - 1 ? "Get Started" : "Next"}</Text>
          <Ionicons
            name={activeIndex === SLIDES.length - 1 ? "checkmark-circle" : "arrow-forward-circle"}
            size={21}
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
    backgroundColor: "#f3f7f6",
    paddingTop: 58,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 10,
  },
  brand: {
    fontSize: 15,
    letterSpacing: 2,
    fontWeight: "800",
    color: "#0f766e",
  },
  skipButton: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#dff5ef",
  },
  skipButtonText: {
    color: "#0f766e",
    fontWeight: "700",
    fontSize: 13,
  },
  slide: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  iconWrap: {
    width: 128,
    height: 128,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    color: "#0f172a",
    fontWeight: "800",
    textAlign: "center",
  },
  description: {
    marginTop: 16,
    fontSize: 18,
    lineHeight: 28,
    color: "#475569",
    textAlign: "center",
    maxWidth: 420,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 34,
    paddingTop: 16,
  },
  dotRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 99,
    marginHorizontal: 6,
  },
  actionButton: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
});
