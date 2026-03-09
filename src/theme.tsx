import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ThemeProvider, alpha, createTheme, type Theme } from "@mui/material/styles";
import type { ThemeMode } from "./types";
import { getSettings } from "./utils/db";

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
  shell: "#17181b",
  shellElevated: "#1c1d21",
  sidebar: "#1d1f24",
  sidebarSelected: "#2a2d33",
  border: "#353941",
  borderStrong: "#4a505a",
  textMuted: "#a3a7af",
  textPrimary: "#eceef2",
  panel: "#23252a",
  panelAlt: "#272a30",
  panelSoft: "#2d3037",
  userBubble: "#69717d",
  userBubbleBorder: "#818c9a",
  assistantBubble: "#2a2c31",
  assistantBubbleBorder: "#3a3e46",
  composer: "#23262c",
  composerBorder: "#737d89",
  consoleBg: "#16181d",
  consoleBorder: "#2f333b",
  consoleText: "#c6d6e4",
  avatarSolid: "#7d8fa6",
  inputBg: "#202329",
  overlay: "rgba(0, 0, 0, 0.22)",
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
        main: mode === "dark" ? "#93a4b8" : "#1573e6",
      },
      success: {
        main: mode === "dark" ? "#8fa78c" : "#2e7d32",
      },
      warning: {
        main: mode === "dark" ? "#c4a97d" : "#ed6c02",
      },
      error: {
        main: mode === "dark" ? "#c28e8e" : "#d32f2f",
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
            "--aui-primary": mode === "dark" ? "214 16% 66%" : "211 83% 50%",
            "--aui-primary-foreground": "0 0% 100%",
            "--aui-ring": mode === "dark" ? "214 16% 66%" : "211 83% 50%",
            "--aui-border": mode === "dark" ? "220 6% 28%" : "214 35% 88%",
            "--aui-input": mode === "dark" ? "220 6% 28%" : "214 35% 88%",
            "--aui-muted": mode === "dark" ? "220 4% 20%" : "216 36% 95%",
            "--aui-muted-foreground": mode === "dark" ? "220 7% 72%" : "216 21% 46%",
            "--aui-background": mode === "dark" ? "220 6% 16%" : "220 63% 98%",
            "--aui-foreground": mode === "dark" ? "220 10% 92%" : "224 34% 17%",
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
            color: colors.textPrimary,
            borderRadius: 12,
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: colors.border,
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: colors.borderStrong,
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: mode === "dark" ? "#8d98a6" : undefined,
              borderWidth: 1,
            },
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
      MuiInputLabel: {
        styleOverrides: {
          root: {
            color: colors.textMuted,
            '&.Mui-focused': {
              color: mode === "dark" ? "#b5bcc5" : undefined,
            },
          },
        },
      },
      MuiFormHelperText: {
        styleOverrides: {
          root: {
            color: mode === "dark" ? "#b1b5bd" : colors.textMuted,
            marginLeft: 2,
            marginRight: 2,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: "outlined",
        },
      },
      MuiSwitch: {
        styleOverrides: {
          track: {
            backgroundColor: mode === "dark" ? "#5c6470" : "#9ebbe6",
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            boxShadow: "none",
          },
          contained: {
            boxShadow: "none",
            color: mode === "dark" ? "#101114" : "#ffffff",
            backgroundColor: mode === "dark" ? "#a0acb9" : undefined,
            '&:hover': {
              boxShadow: "none",
              backgroundColor: mode === "dark" ? "#b1bac4" : undefined,
            },
          },
          outlined: {
            borderColor: colors.borderStrong,
            backgroundColor: mode === "dark" ? alpha(colors.panelSoft, 0.35) : "transparent",
            '&:hover': {
              borderColor: colors.textMuted,
              backgroundColor: alpha(colors.panelSoft, mode === "dark" ? 0.72 : 0.6),
            },
          },
          text: {
            color: mode === "dark" ? colors.textPrimary : undefined,
            '&:hover': {
              backgroundColor: alpha(colors.panelSoft, mode === "dark" ? 0.9 : 0.75),
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 700,
          },
          filled: {
            backgroundColor: colors.panelSoft,
            color: colors.textPrimary,
          },
          outlined: {
            borderColor: colors.borderStrong,
            color: colors.textMuted,
            backgroundColor: mode === "dark" ? alpha(colors.panelSoft, 0.45) : "transparent",
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            backgroundColor: colors.borderStrong,
          },
          bar: {
            backgroundColor: mode === "dark" ? "#98a5b4" : undefined,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundColor: colors.panel,
            border: `1px solid ${colors.border}`,
          },
          list: {
            paddingTop: 4,
            paddingBottom: 4,
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: "2px 6px",
            '&:hover': {
              backgroundColor: alpha(colors.panelSoft, mode === "dark" ? 0.92 : 0.7),
            },
            '&.Mui-selected': {
              backgroundColor: alpha(colors.panelSoft, mode === "dark" ? 0.96 : 0.8),
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: alpha(colors.panelSoft, mode === "dark" ? 0.88 : 0.72),
            },
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
