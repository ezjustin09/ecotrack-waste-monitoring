import { DefaultTheme, DarkTheme } from "@react-navigation/native";

export const LIGHT_COLORS = {
  background: "#f3f7f6",
  card: "#ffffff",
  cardMuted: "#f8fafc",
  primary: "#0f766e",
  text: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  border: "#d1d5db",
  borderSoft: "#e2e8f0",
  danger: "#b91c1c",
  dangerSoft: "#fef2f2",
  successSoft: "#dcfce7",
  overlay: "#ecfeff",
};

export const DARK_COLORS = {
  background: "#0b1220",
  card: "#111827",
  cardMuted: "#1f2937",
  primary: "#34d399",
  text: "#f8fafc",
  textSecondary: "#cbd5e1",
  textMuted: "#94a3b8",
  border: "#334155",
  borderSoft: "#1e293b",
  danger: "#fca5a5",
  dangerSoft: "#3f1d24",
  successSoft: "#123524",
  overlay: "#0f2f2c",
};

export function buildNavigationTheme(isDarkMode) {
  const baseTheme = isDarkMode ? DarkTheme : DefaultTheme;
  const colors = isDarkMode ? DARK_COLORS : LIGHT_COLORS;

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      background: colors.background,
      card: colors.card,
      primary: colors.primary,
      text: colors.text,
      border: colors.border,
      notification: colors.primary,
    },
  };
}

export function getAppColors(isDarkMode) {
  return isDarkMode ? DARK_COLORS : LIGHT_COLORS;
}
