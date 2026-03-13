import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  Box,
  CircularProgress,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { getSettings, saveSettings } from "../utils/db";
import { useAppThemeMode } from "../theme";
import type { UserSettings } from "../types";

export default function SettingsPage() {
  const theme = useTheme();
  const { setMode } = useAppThemeMode();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const enterCommitRef = useRef<{
    key: keyof UserSettings;
    value: UserSettings[keyof UserSettings];
  } | null>(null);
  const dirtyRef = useRef<Partial<Record<keyof UserSettings, boolean>>>({});

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const loaded = await getSettings();
      if (!cancelled) {
        setSettings(loaded);
        setLoading(false);
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

  async function persistSettings(nextSettings: UserSettings) {
    try {
      await saveSettings(nextSettings);
      setMode(nextSettings.themeMode);
      const latest = await getSettings();
      setSettings(latest);
    } catch (error) {
      console.error("Failed to save settings:", error);
      await window.desktopApi?.notify(
        "Nexus AI",
        "Failed to save configurations.",
      );
    }
  }

  if (loading || !settings) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", height: "100%" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const updateDraft = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    setSettings((prev) => {
      if (!prev) return prev;
      if (prev[key] === value) return prev;
      dirtyRef.current[key] = true;
      return { ...prev, [key]: value };
    });
  };

  const commitSetting = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const hasDirty = dirtyRef.current[key] === true;
      const unchanged = prev[key] === value;
      if (unchanged && !hasDirty) return prev;
      const next = unchanged ? prev : { ...prev, [key]: value };
      dirtyRef.current[key] = false;
      void persistSettings(next);
      return next;
    });
  };

  const handleBlurCommit = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    const lastCommit = enterCommitRef.current;
    if (lastCommit && lastCommit.key === key && lastCommit.value === value) {
      enterCommitRef.current = null;
      return;
    }
    commitSetting(key, value);
  };

  const handleEnterCommit = <K extends keyof UserSettings>(
    key: K,
    event: KeyboardEvent<HTMLElement>,
  ) => {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target || typeof target.value !== "string") return;
    event.preventDefault();
    const value = target.value as UserSettings[K];
    enterCommitRef.current = { key, value };
    commitSetting(key, value);
    target.blur();
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          px: 3,
          py: 3,
        }}
      >
        <Stack spacing={2.4}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Stack direction="row" spacing={1.2} alignItems="center">
              <Typography sx={{ fontSize: 28, fontWeight: 700 }}>设置</Typography>
            </Stack>
          </Stack>
          <Divider />
        </Stack>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 3 }}>
        <Stack spacing={3.6} sx={{ width: 800, maxWidth: "100%", mx: "auto" }}>
          <Box>
            <Typography variant="h5" sx={{ fontSize: 18, fontWeight: 700 }}>
              模型配置
            </Typography>
            <Stack spacing={2.4} sx={{ mt: 2.2 }}>
              <TextField
                label="模型名称"
                value={settings.modelName}
                onChange={(event) => updateDraft("modelName", event.target.value)}
                onBlur={(event) =>
                  handleBlurCommit("modelName", event.target.value)
                }
                onKeyDown={(event) =>
                  handleEnterCommit("modelName", event)
                }
                helperText="例如：gpt-4o-mini / gpt-4.1-mini"
                fullWidth
                size="small"
                sx={{ width: 500, maxWidth: "100%" }}
              />

              <TextField
                label="网关地址"
                value={settings.baseUrl}
                onChange={(event) => updateDraft("baseUrl", event.target.value)}
                onBlur={(event) =>
                  handleBlurCommit("baseUrl", event.target.value)
                }
                onKeyDown={(event) =>
                  handleEnterCommit("baseUrl", event)
                }
                placeholder="https://api.openai.com/v1"
                helperText="可选，兼容 OpenAI API 的网关地址。留空使用默认地址。"
                fullWidth
                size="small"
                sx={{ width: 500, maxWidth: "100%" }}
              />

              <TextField
                label="API Key"
                type="password"
                value={settings.apiKey}
                onChange={(event) => updateDraft("apiKey", event.target.value)}
                onBlur={(event) =>
                  handleBlurCommit("apiKey", event.target.value)
                }
                onKeyDown={(event) =>
                  handleEnterCommit("apiKey", event)
                }
                helperText="你的apiKey"
                fullWidth
                size="small"
                sx={{ width: 500, maxWidth: "100%" }}
              />
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="h5" sx={{ fontSize: 18, fontWeight: 700 }}>
              LangSmith 监控
            </Typography>
            <Stack spacing={2.4} sx={{ mt: 2.2 }}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={settings.langsmithEnabled}
                    onChange={(_event, checked) =>
                      commitSetting("langsmithEnabled", checked)
                    }
                  />
                }
                label="启用 LangSmith 追踪（上报对话内容 + 工具输入输出）"
              />
              <TextField
                label="LangSmith API Key"
                type="password"
                value={settings.langsmithApiKey}
                onChange={(event) =>
                  updateDraft("langsmithApiKey", event.target.value)
                }
                onBlur={(event) =>
                  handleBlurCommit("langsmithApiKey", event.target.value)
                }
                onKeyDown={(event) =>
                  handleEnterCommit("langsmithApiKey", event)
                }
                helperText="启用后用于追踪上报"
                fullWidth
                size="small"
                sx={{ width: 500, maxWidth: "100%" }}
                disabled={!settings.langsmithEnabled}
              />
              <TextField
                label="LangSmith Project"
                value={settings.langsmithProject}
                onChange={(event) =>
                  updateDraft("langsmithProject", event.target.value)
                }
                onBlur={(event) =>
                  handleBlurCommit("langsmithProject", event.target.value)
                }
                onKeyDown={(event) =>
                  handleEnterCommit("langsmithProject", event)
                }
                helperText="可选，用于区分环境或实验"
                fullWidth
                size="small"
                sx={{ width: 500, maxWidth: "100%" }}
                disabled={!settings.langsmithEnabled}
              />
              <TextField
                label="LangSmith Endpoint"
                value={settings.langsmithEndpoint}
                onChange={(event) =>
                  updateDraft("langsmithEndpoint", event.target.value)
                }
                onBlur={(event) =>
                  handleBlurCommit("langsmithEndpoint", event.target.value)
                }
                onKeyDown={(event) =>
                  handleEnterCommit("langsmithEndpoint", event)
                }
                helperText="可选，自托管或地区专用地址"
                fullWidth
                size="small"
                sx={{ width: 500, maxWidth: "100%" }}
                disabled={!settings.langsmithEnabled}
              />
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="h5" sx={{ fontSize: 18, fontWeight: 700 }}>
              系统偏好设置
            </Typography>
            <Stack spacing={2.4} sx={{ mt: 2.2 }}>
              <Box>
                <Typography sx={{ fontSize: 14, mb: 1, color: theme.appColors.textMuted }}>
                  颜色模式
                </Typography>
                <Stack direction="row" spacing={1.2}>
                  {[
                    {
                      value: "light" as const,
                      label: "浅色模式",
                      previewBg: "linear-gradient(135deg, #ffffff 0%, #e8edf6 100%)",
                      previewBorder: "1px solid #d7dfea",
                    },
                    {
                      value: "dark" as const,
                      label: "深色模式",
                      previewBg: "linear-gradient(135deg, #1f2530 0%, #0f1218 100%)",
                      previewBorder: "1px solid #2c3340",
                    },
                  ].map((mode) => {
                    const selected = settings.themeMode === mode.value;
                    return (
                      <Box
                        key={mode.value}
                        role="button"
                        onClick={() => commitSetting("themeMode", mode.value)}
                        sx={{
                          width: 120,
                          borderRadius: 1.6,
                          border: `1px solid ${
                            selected ? theme.palette.primary.main : theme.appColors.border
                          }`,
                          p: 1.2,
                          cursor: "pointer",
                          backgroundColor: selected
                            ? theme.palette.action.hover
                            : "transparent",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <Box
                          sx={{
                            height: 54,
                            borderRadius: 1.1,
                            background: mode.previewBg,
                            border: mode.previewBorder,
                            boxShadow: selected
                              ? `0 0 0 1px ${theme.palette.primary.main}`
                              : "none",
                          }}
                        />
                        <Typography
                          sx={{
                            mt: 1,
                            fontSize: 13,
                            fontWeight: selected ? 700 : 500,
                          }}
                        >
                          {mode.label}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>

              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={settings.desktopNotifications}
                    onChange={(_event, checked) =>
                      commitSetting("desktopNotifications", checked)
                    }
                  />
                }
                label="允许桌面通知"
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={settings.developerLogging}
                    onChange={(_event, checked) =>
                      commitSetting("developerLogging", checked)
                    }
                  />
                }
                label="开发者日志模式"
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={settings.dataTelemetry}
                    onChange={(_event, checked) =>
                      commitSetting("dataTelemetry", checked)
                    }
                  />
                }
                label="数据遥测 (帮助提高模型准确性)"
              />
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
