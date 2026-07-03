import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  Animated,
  FlatList,
  ViewToken,
  Easing,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: W } = Dimensions.get("window");

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#0A0A1A",
  surface: "#1A1A2E",
  surfaceAlt: "#2A2A4A",
  accent: "#FF6B6B",
  accentSoft: "#FF8E8E",
  accentSecondary: "#4ECDC4",
  accentTertiary: "#FFE66D",
  success: "#4ECDC4",
  textPrimary: "#FFFFFF",
  textSecondary: "#A0A0B8",
  border: "#2A2A4A",
  glow: "rgba(255,107,107,0.15)",
};

// ─── Slide Data ───────────────────────────────────────────────────────────────
interface Slide {
  id: string;
  headline: string;
  description: string;
  illustration: React.ReactNode;
}

// ─── SVG-like Illustrations using pure RN Views ───────────────────────────────

function IllustrationOrganize() {
  return (
    <View style={il.wrap}>
      <Animated.View style={[il.glow, { backgroundColor: C.glow }]} />

      <View style={[il.card, { width: 180, padding: 16 }]}>
        {[
          { done: true, width: 100 },
          { done: true, width: 130 },
          { done: false, width: 90 },
          { done: false, width: 115 },
        ].map((item, i) => (
          <View key={i} style={il.row}>
            <View
              style={[
                il.checkbox,
                item.done && { backgroundColor: C.accent, borderColor: C.accent },
              ]}
            >
              {item.done && <View style={il.checkMark} />}
            </View>
            <View
              style={[
                il.lineBar,
                { width: item.width, opacity: item.done ? 0.35 : 0.75 },
              ]}
            />
          </View>
        ))}
      </View>

      <View style={[il.pill, { top: 28, right: 28 }]}>
        <View style={[il.pillDot, { backgroundColor: C.success }]} />
        <View style={[il.lineBar, { width: 44, opacity: 0.6 }]} />
      </View>

      <View style={[il.miniCard, { bottom: 32, right: 16 }]}>
        <View style={[il.miniBar, { width: 28, backgroundColor: C.accent }]} />
        <View style={[il.miniBar, { width: 40, opacity: 0.4 }]} />
      </View>
    </View>
  );
}

function IllustrationProgress() {
  const bars = [0.4, 0.65, 0.5, 0.85, 0.7, 0.95];
  return (
    <View style={il.wrap}>
      <Animated.View style={[il.glow, { backgroundColor: C.glow }]} />

      <View style={[il.card, { width: 190, padding: 18, alignItems: "flex-end" }]}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, height: 80 }}>
          {bars.map((h, i) => (
            <View key={i} style={{ alignItems: "center", gap: 4 }}>
              <View
                style={{
                  width: 16,
                  height: 80 * h,
                  borderRadius: 5,
                  backgroundColor: i === 5 ? C.accent : i === 3 ? C.accentSoft : C.border,
                }}
              />
            </View>
          ))}
        </View>
        <View style={[il.lineBar, { width: "100%", opacity: 0.2, marginTop: 8 }]} />
      </View>

      <View style={[il.pill, { top: 24, left: 20 }]}>
        <View style={[il.pillDot, { backgroundColor: C.success }]} />
        <View style={[il.lineBar, { width: 38, opacity: 0.55 }]} />
      </View>

      <View
        style={[
          il.miniCard,
          { bottom: 28, left: 22, backgroundColor: C.accent + "22", borderColor: C.accent + "44" },
        ]}
      >
        <View style={[il.miniBar, { width: 36, backgroundColor: C.accent, opacity: 0.9 }]} />
        <View style={[il.miniBar, { width: 24, opacity: 0.3 }]} />
      </View>
    </View>
  );
}

function IllustrationGrowth() {
  return (
    <View style={il.wrap}>
      <Animated.View style={[il.glow, { backgroundColor: C.glow }]} />

      <View
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          borderWidth: 2,
          borderColor: C.accent + "55",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: C.surface,
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            borderWidth: 2,
            borderColor: C.accentSoft + "66",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: C.surfaceAlt,
          }}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: C.accent,
              opacity: 0.9,
            }}
          />
        </View>
      </View>

      {[
        { top: 10, left: 48, color: C.success },
        { top: 72, right: 12, color: C.accentSoft },
        { bottom: 16, left: 28, color: C.accent },
      ].map((node, i) => (
        <View
          key={i}
          style={[
            {
              position: "absolute",
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: node.color,
              opacity: 0.75,
            },
            node,
          ]}
        />
      ))}

      <View
        style={{
          position: "absolute",
          top: 16,
          left: 54,
          width: 1,
          height: 40,
          backgroundColor: C.accent + "33",
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 74,
          right: 32,
          width: 40,
          height: 1,
          backgroundColor: C.accentSoft + "33",
        }}
      />

      <View style={[il.card, { width: 150, padding: 12, bottom: 20, position: "absolute" }]}>
        <View style={[il.miniBar, { width: "100%", backgroundColor: C.success, opacity: 0.7 }]} />
        <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
          <View style={[il.miniBar, { flex: 1, opacity: 0.3 }]} />
          <View style={[il.miniBar, { flex: 2, opacity: 0.3 }]} />
        </View>
      </View>
    </View>
  );
}

const il = StyleSheet.create({
  wrap: {
    width: 220,
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  glow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: {
    width: 7,
    height: 4,
    borderBottomWidth: 1.5,
    borderLeftWidth: 1.5,
    borderColor: "#fff",
    transform: [{ rotate: "-45deg" }, { translateY: -1 }],
  },
  lineBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: C.textSecondary,
  },
  pill: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  miniCard: {
    position: "absolute",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  miniBar: {
    height: 7,
    borderRadius: 4,
    backgroundColor: C.textSecondary,
  },
});

// ─── Slides ───────────────────────────────────────────────────────────────────
const SLIDES: Slide[] = [
  {
    id: "1",
    headline: "Organize Your Life",
    description:
      "Capture tasks, build routines, and create structure in your daily life.",
    illustration: <IllustrationOrganize />,
  },
  {
    id: "2",
    headline: "Track Your Progress",
    description:
      "Monitor completed tasks, measure consistency, and celebrate small wins every day.",
    illustration: <IllustrationProgress />,
  },
  {
    id: "3",
    headline: "Become Your Best Self",
    description:
      "Life OS helps you stay focused, disciplined, and intentional with the life you want to build.",
    illustration: <IllustrationGrowth />,
  },
];

// ─── Logo Mark ────────────────────────────────────────────────────────────────
function LogoMark() {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View style={[lm.wrap, { transform: [{ rotate: spin }] }]}>
      <View style={lm.ring} />
      <View style={lm.inner}>
        <View style={[lm.dot, lm.dotPrimary]} />
        <View style={[lm.dot, lm.dotSecondary]} />
        <View style={[lm.dot, lm.dotTertiary]} />
      </View>
    </Animated.View>
  );
}

const lm = StyleSheet.create({
  wrap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: C.accentSoft,
    opacity: 0.5,
  },
  inner: {
    width: 28,
    height: 28,
    backgroundColor: C.surface,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotPrimary: {
    backgroundColor: C.accent,
  },
  dotSecondary: {
    backgroundColor: C.accentSecondary,
  },
  dotTertiary: {
    backgroundColor: C.accentTertiary,
  },
});

// ─── Dot Indicator ────────────────────────────────────────────────────────────
function Dots({ count, active }: { count: number; active: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 7, alignItems: "center" }}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View
          key={i}
          style={{
            width: i === active ? 22 : 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: i === active ? C.accent : C.border,
          }}
        />
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function StarterScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(1.2)),
      }),
    ]).start();
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const goNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    }
  };

  const handleGetStarted = async () => {
    try {
      await AsyncStorage.setItem("onboardingCompleted", "true");
    } catch {}
    router.replace("/login");
  };

  const handleSkip = async () => {
    try {
      await AsyncStorage.setItem("onboardingCompleted", "true");
    } catch {}
    router.replace("/login");
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.root}>
        {/* ── Top Bar ── */}
        <Animated.View
          style={[
            s.topBar,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={s.brand}>
            <LogoMark />
            <Text style={s.brandName}>Life OS</Text>
          </View>
          <TouchableOpacity
            onPress={handleSkip}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Carousel ── */}
        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item }) => (
            <SlideItem slide={item} fadeAnim={fadeAnim} slideAnim={slideAnim} />
          )}
          style={s.list}
        />

        {/* ── Bottom Bar ── */}
        <Animated.View
          style={[
            s.bottomBar,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Dots count={SLIDES.length} active={activeIndex} />

          <TouchableOpacity
            style={[s.btn, isLast && s.btnPrimary]}
            onPress={isLast ? handleGetStarted : goNext}
            activeOpacity={0.85}
          >
            <Text style={[s.btnText, isLast && s.btnTextPrimary]}>
              {isLast ? "Get Started" : "Next"}
            </Text>
            {!isLast && (
              <View style={s.arrow}>
                <View style={s.arrowLine} />
                <View style={[s.arrowLine, s.arrowHead]} />
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </>
  );
}

// ─── Slide Item ───────────────────────────────────────────────────────────────
function SlideItem({
  slide,
  fadeAnim,
  slideAnim,
}: {
  slide: Slide;
  fadeAnim: Animated.Value;
  slideAnim: Animated.Value;
}) {
  return (
    <Animated.View
      style={[
        s.slide,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={s.illustrationWrap}>{slide.illustration}</View>

      <View style={s.textWrap}>
        <Text style={s.headline}>{slide.headline}</Text>
        <Text style={s.description}>{slide.description}</Text>
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 16,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandName: {
    fontSize: 18,
    fontWeight: "700",
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  skipText: {
    fontSize: 14,
    color: C.textSecondary,
    fontWeight: "500",
  },

  list: { flex: 1 },
  slide: {
    width: W,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 24,
  },

  illustrationWrap: {
    width: 240,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 48,
  },

  textWrap: {
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 8,
  },
  headline: {
    fontSize: 28,
    fontWeight: "700",
    color: C.textPrimary,
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  description: {
    fontSize: 15,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    fontWeight: "400",
  },

  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingBottom: 44,
    paddingTop: 20,
  },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
  btnPrimary: {
    backgroundColor: C.accent,
    borderColor: C.accent,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.38,
    shadowRadius: 10,
    elevation: 6,
  },
  btnText: {
    fontSize: 15,
    fontWeight: "600",
    color: C.textSecondary,
    letterSpacing: 0.2,
  },
  btnTextPrimary: {
    color: "#FFFFFF",
  },

  arrow: {
    flexDirection: "row",
    alignItems: "center",
    width: 16,
    justifyContent: "flex-end",
  },
  arrowLine: {
    width: 10,
    height: 1.5,
    backgroundColor: C.textSecondary,
    borderRadius: 1,
  },
  arrowHead: {
    width: 6,
    height: 6,
    borderRightWidth: 1.5,
    borderTopWidth: 1.5,
    borderColor: C.textSecondary,
    backgroundColor: "transparent",
    transform: [{ rotate: "45deg" }, { translateX: -5 }],
  },
});