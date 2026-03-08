import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ThemeProvider, createTheme, type Theme } from "@mui/material/styles";
import type { ThemeMode } from "./types";
import { getSettings, saveSettings } from "./utils/db";

type ThemeModeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  hydrated: boolean;
};

type AppColorTokens = {
  shell: string;
  shellElevated: string;
  sidebar: string;
  sidebarSelected: string;
  border: string;
  borderStrong: string;
  textMuted: string;
  textPrimary: string;
  panel: string;
  panelAlt: string;
  panelSoft: string;
  userBubble: string;
  userBubbleBorder: string;
  assistantBubble: string;
  assistantBubbleBorder: string;
  composer: string;
  composerBorder: string;
  consoleBg: string;
  consoleBorder: string;
  consoleText: string;
  avatarSolid: string;
  inputBg: string;
  overlay: string;
};

declare module "@mui/material/styles" {
  interface Theme {
    appColors: AppColorTokens;
  }
  interface ThemeOptions {
    appColors?: AppColorTokens;
  }
}

const THEME_STORAGE_KEY = "nexus-theme-mode";
const themeModeContext = createContext<ThemeModeContextValue | null>(null);

const lightColors: AppColorTokens = {
  shell: "#eef2f8",
  shellElevated: "#f2f5fb",
  sidebar: "#f7f9fd",
  sidebarSelected: "#edf2fb",
  border: "#dbe3f0",
  borderStrong: "#c2d3ea",
  textMuted: "#6d7f9c",
  textPrimary: "#172033",
  panel: "#f8fafc",
  panelAlt: "#f9fcff",
  panelSoft: "#f5f8ff",
  userBubble: "#1875e7",
  userBubbleBorder: "#1978e8",
  assistantBubble: "#f8fbff",
  assistantBubbleBorder: "#dce6f4",
  composer: "#fbfdff",
  composerBorder: "#3489f4",
  consoleBg: "#051537",
  consoleBorder: "#0e1d3f",
  consoleText: "#29c3ff",
  avatarSolid: "#1573e6",
  inputBg: "#ffffff",
  overlay: "rgba(18, 31, 56, 0.08)",
};

const darkColors: AppColorTokens = {
  shell: "#0b1220",
  shellElevated: "#11192a",
  sidebar: "#10192a",
  sidebarSelected: "#18253c",
  border: "#23324a",
  borderStrong: "#314564",
  textMuted: "#95a6c5",
  textPrimary: "#e8eef9",
  panel: "#121b2c",
  panelAlt: "#162235",
  panelSoft: "#19263d",
  userBubble: "#2d7ff9",
  userBubbleBorder: "#3c8cff",
  assistantBubble: "#162235",
  assistantBubbleBorder: "#263756",
  composer: "#142033",
  composerBorder: "#3b82f6",
  consoleBg: "#07111f",
  consoleBorder: "#112039",
  consoleText: "#63d2ff",
  avatarSolid: "#3b82f6",
  inputBg: "#0f1726",
  overlay: "rgba(5, 10, 20, 0.42)",
};

function themeColorsForMode(mode: ThemeMode) {
  return mode === "dark" ? darkColors : lightColors;
}

export function createAppTheme(mode: ThemeMode): Theme {
  const colors = themeColorsForMode(mode);

  return createTheme({
    palette: {
      mode,
      primary: {
        main: mode === "dark" ? "#60a5fa" : "#1573e6",
      },
      background: {
        default: colors.shell,
        paper: colors.panel,
      },
      text: {
        primary: colors.textPrimary,
        secondary: colors.textMuted,
      },
      divider: colors.border,
    },
    appColors: colors,
    shape: {
      borderRadius: 14,
    },
    typography: {
      fontFamily: '"Segoe UI", "SF Pro Text", "PingFang SC", sans-serif',
      h3: {
        fontSize: "2.2rem",
        fontWeight: 700,
      },
      h4: {
        fontSize: "2rem",
        fontWeight: 700,
      },
      h5: {
        fontSize: "1.8rem",
        fontWeight: 700,
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": {
            colorScheme: mode,
            "--app-shell": colors.shell,
            "--app-shell-elevated": colors.shellElevated,
            "--app-panel": colors.panel,
            "--app-panel-alt": colors.panelAlt,
            "--app-panel-soft": colors.panelSoft,
            "--app-sidebar": colors.sidebar,
            "--app-sidebar-selected": colors.sidebarSelected,
            "--app-border": colors.border,
            "--app-border-strong": colors.borderStrong,
            "--app-text-muted": colors.textMuted,
            "--app-text-primary": colors.textPrimary,
            "--app-user-bubble": colors.userBubble,
            "--app-user-bubble-border": colors.userBubbleBorder,
            "--app-assistant-bubble": colors.assistantBubble,
            "--app-assistant-bubble-border": colors.assistantBubbleBorder,
            "--app-composer": colors.composer,
            "--app-composer-border": colors.composerBorder,
            "--app-console-bg": colors.consoleBg,
            "--app-console-border": colors.consoleBorder,
            "--app-console-text": colors.consoleText,
            "--app-avatar-solid": colors.avatarSolid,
            "--app-input-bg": colors.inputBg,
            "--aui-primary": mode === "dark" ? "213 94% 68%" : "211 83% 50%",
            "--aui-primary-foreground": "0 0% 100%",
            "--aui-ring": mode === "dark" ? "213 94% 68%" : "211 83% 50%",
            "--aui-border": mode === "dark" ? "217 30% 28%" : "214 35% 88%",
            "--aui-input": mode === "dark" ? "217 30% 28%" : "214 35% 88%",
            "--aui-muted": mode === "dark" ? "216 22% 18%" : "216 36% 95%",
            "--aui-muted-foreground": mode === "dark" ? "216 22% 70%" : "216 21% 46%",
            "--aui-background": mode === "dark" ? "222 34% 12%" : "220 63% 98%",
            "--aui-foreground": mode === "dark" ? "220 35% 96%" : "224 34% 17%",
          },
          body: {
            background: `linear-gradient(180deg, ${colors.shellElevated} 0%, ${colors.shell} 82%)`,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            backgroundImage: "none",
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: colors.inputBg,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: colors.panel,
            border: `1px solid ${colors.border}`,
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          track: {
            backgroundColor: mode === "dark" ? "#36527d" : "#9ebbe6",
          },
        },
      },
    },
  });
}

function readStoredThemeMode(): ThemeMode | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredThemeMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Ignore localStorage failures.
  }
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredThemeMode() || "light");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const settings = await getSettings();
        if (!active) {
          return;
        }
        const nextMode = settings.themeMode === "dark" ? "dark" : "light";
        setModeState(nextMode);
        writeStoredThemeMode(nextMode);
      } catch {
        const storedMode = readStoredThemeMode();
        if (active && storedMode) {
          setModeState(storedMode);
        }
      } finally {
        if (active) {
          setHydrated(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const persistMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    writeStoredThemeMode(nextMode);

    void (async () => {
      try {
        const settings = await getSettings();
        await saveSettings({
          ...settings,
          themeMode: nextMode,
        });
      } catch {
        // Ignore settings persistence failures.
      }
    })();
  }, []);

  const toggleMode = useCallback(() => {
    persistMode(mode === "dark" ? "light" : "dark");
  }, [mode, persistMode]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const value = useMemo(
    () => ({ mode, setMode: persistMode, toggleMode, hydrated }),
    [hydrated, mode, persistMode, toggleMode],
  );

  return (
    <themeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </themeModeContext.Provider>
  );
}

export function useAppThemeMode() {
  const value = useContext(themeModeContext);
  if (!value) {
    throw new Error("useAppThemeMode must be used within AppThemeProvider.");
  }
  return value;
}
