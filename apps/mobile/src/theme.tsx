import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

export type ThemeMode = "light" | "dark";
export type PrimaryColor = "emerald" | "blue" | "violet" | "coral";

export interface ThemeColors {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  ink: string;
  muted: string;
  border: string;
  mint: string;
  mintDark: string;
  mintSoft: string;
  onPrimary: string;
  sage: string;
  coral: string;
  amber: string;
  navySoft: string;
  dangerSoft: string;
  backdrop: string;
}

interface ThemePreferences {
  mode: ThemeMode;
  primary: PrimaryColor;
}

interface ThemeContextValue extends ThemePreferences {
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  setPrimary: (primary: PrimaryColor) => void;
}

const STORAGE_KEY = "budgetia.appearance.v1";

export const primaryChoices: Array<{
  id: PrimaryColor;
  label: string;
  color: string;
}> = [
  { id: "emerald", label: "Émeraude", color: "#169B68" },
  { id: "blue", label: "Bleu", color: "#3478F6" },
  { id: "violet", label: "Violet", color: "#7C5CE7" },
  { id: "coral", label: "Corail", color: "#E85D4A" },
];

const accents: Record<
  PrimaryColor,
  { primary: string; strong: string; darkStrong: string; soft: string; darkSoft: string }
> = {
  emerald: {
    primary: "#169B68",
    strong: "#087A51",
    darkStrong: "#57D4A4",
    soft: "#E4F4EC",
    darkSoft: "#17382D",
  },
  blue: {
    primary: "#3478F6",
    strong: "#1E5CC7",
    darkStrong: "#79A7FF",
    soft: "#E8F0FF",
    darkSoft: "#182D52",
  },
  violet: {
    primary: "#7C5CE7",
    strong: "#6042C8",
    darkStrong: "#A892FF",
    soft: "#EEE9FF",
    darkSoft: "#2C2450",
  },
  coral: {
    primary: "#E85D4A",
    strong: "#C43F31",
    darkStrong: "#FF8A78",
    soft: "#FDEAE7",
    darkSoft: "#462621",
  },
};

function makeColors(mode: ThemeMode, primary: PrimaryColor): ThemeColors {
  const accent = accents[primary];
  const dark = mode === "dark";
  return {
    canvas: dark ? "#0B1117" : "#FBFCFB",
    surface: dark ? "#111B24" : "#FFFFFF",
    surfaceRaised: dark ? "#17232D" : "#FFFFFF",
    ink: dark ? "#F4F7F6" : "#071421",
    muted: dark ? "#9BA9B6" : "#697386",
    border: dark ? "#2A3946" : "#DCE2E0",
    mint: accent.primary,
    mintDark: dark ? accent.darkStrong : accent.strong,
    mintSoft: dark ? accent.darkSoft : accent.soft,
    onPrimary: dark ? "#071421" : "#FFFFFF",
    sage: dark ? "#A8C3AE" : "#93B29A",
    coral: dark ? "#FF8578" : "#F46F61",
    amber: dark ? "#F8CB72" : "#F2C15D",
    navySoft: dark ? "#91A7C0" : "#26364D",
    dangerSoft: dark ? "#472522" : "#FFE9E6",
    backdrop: dark ? "rgba(0,0,0,0.68)" : "rgba(7,20,33,0.42)",
  };
}

const defaultPreferences: ThemePreferences = { mode: "light", primary: "emerald" };
const ThemeContext = createContext<ThemeContextValue | null>(null);

function isMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

function isPrimary(value: unknown): value is PrimaryColor {
  return primaryChoices.some((choice) => choice.id === value);
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState<ThemePreferences>(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!active || !value) return;
        const parsed = JSON.parse(value) as Partial<ThemePreferences>;
        setPreferences({
          mode: isMode(parsed.mode) ? parsed.mode : defaultPreferences.mode,
          primary: isPrimary(parsed.primary)
            ? parsed.primary
            : defaultPreferences.primary,
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [hydrated, preferences]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...preferences,
      colors: makeColors(preferences.mode, preferences.primary),
      setMode: (mode) => setPreferences((current) => ({ ...current, mode })),
      setPrimary: (primary) =>
        setPreferences((current) => ({ ...current, primary })),
    }),
    [preferences],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}

export function useThemeStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  round: 999,
} as const;
