import { useEffect, useState } from "react";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  Paper,
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

  async function persistSettings() {
    if (!settings) return;

    try {
      await saveSettings(settings);
      setMode(settings.themeMode);
      const latest = await getSettings();
      setSettings(latest);

      if (latest.desktopNotifications) {
        await window.desktopApi?.notify("Nexus AI", "Configurations saved.");
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      await window.desktopApi?.notify(
        "Nexus AI",
        "Failed to save configurations.",
      );
    }
  }

  async function restoreSettings() {
    const next = await getSettings();
    setSettings(next);
    setMode(next.themeMode);
  }

  if (loading || !settings) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", height: "100%" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const update = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    setSettings((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: value };
    });
  };

  const sectionSx = {
    p: 3,
    border: `1px solid ${theme.appColors.border}`,
    backgroundColor: theme.appColors.panelAlt,
  };

  return (
    <Box sx={{ p: 3.4, overflowY: "auto", height: "100%" }}>
      <Stack spacing={2.6} sx={{ maxWidth: 1120, mx: "auto" }}>
        <Box>
          <Typography variant="h3" sx={{ fontSize: 74 / 2.3, fontWeight: 700 }}>
            个人设置
          </Typography>
        </Box>

        <Paper elevation={0} sx={sectionSx}>
          <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2.2 }}>
            <PersonOutlineRoundedIcon color="primary" />
            <Typography variant="h5" sx={{ fontSize: 42 / 2.4, fontWeight: 700 }}>
              账户信息
            </Typography>
          </Stack>

          <Stack direction="row" spacing={2.2}>
            <Avatar
              sx={{
                width: 90,
                height: 90,
                bgcolor: theme.appColors.avatarSolid,
                fontSize: 42,
              }}
            >
              {settings.displayName.slice(0, 2).toUpperCase()}
            </Avatar>
            <Stack spacing={1.8} sx={{ flex: 1 }}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.8}>
                <TextField
                  label="Display Name"
                  value={settings.displayName}
                  fullWidth
                  onChange={(event) => update("displayName", event.target.value)}
                />
                <TextField
                  label="Email Address"
                  value={settings.email}
                  fullWidth
                  onChange={(event) => update("email", event.target.value)}
                />
              </Stack>
              <TextField
                label="Role/Designation"
                value={settings.role}
                fullWidth
                onChange={(event) => update("role", event.target.value)}
              />
            </Stack>
          </Stack>
        </Paper>

        <Paper elevation={0} sx={sectionSx}>
          <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1.8 }}>
            <KeyRoundedIcon color="primary" />
            <Typography variant="h5" sx={{ fontSize: 42 / 2.4, fontWeight: 700 }}>
              模型配置
            </Typography>
          </Stack>

          <Stack spacing={1.8}>
            <TextField
              label="模型名称"
              value={settings.modelName}
              onChange={(event) => update("modelName", event.target.value)}
              helperText="例如：gpt-4o-mini / gpt-4.1-mini"
              fullWidth
            />

            <TextField
              label="网关地址"
              value={settings.baseUrl}
              onChange={(event) => update("baseUrl", event.target.value)}
              placeholder="https://api.openai.com/v1"
              helperText="可选，兼容 OpenAI API 的网关地址。留空使用默认地址。"
              fullWidth
            />

            <TextField
              label="API Key"
              type="password"
              value={settings.apiKey}
              onChange={(event) => update("apiKey", event.target.value)}
              helperText="用于 LangChain + LangGraph 推理。"
              fullWidth
            />
          </Stack>
        </Paper>

        <Paper elevation={0} sx={sectionSx}>
          <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1.8 }}>
            <ShieldOutlinedIcon color="primary" />
            <Typography variant="h5" sx={{ fontSize: 42 / 2.4, fontWeight: 700 }}>
              系统偏好设置
            </Typography>
          </Stack>

          <Stack spacing={0.2}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.themeMode === "dark"}
                  onChange={(_event, checked) => {
                    const nextMode = checked ? "dark" : "light";
                    update("themeMode", nextMode);
                    setMode(nextMode);
                  }}
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  {settings.themeMode === "dark" ? (
                    <DarkModeRoundedIcon fontSize="small" color="primary" />
                  ) : (
                    <LightModeRoundedIcon fontSize="small" color="primary" />
                  )}
                  <Typography>
                    {settings.themeMode === "dark" ? "深色模式" : "浅色模式"}
                  </Typography>
                </Stack>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.desktopNotifications}
                  onChange={(_event, checked) => update("desktopNotifications", checked)}
                />
              }
              label="允许桌面通知"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.developerLogging}
                  onChange={(_event, checked) => update("developerLogging", checked)}
                />
              }
              label="开发者日志模式"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.dataTelemetry}
                  onChange={(_event, checked) => update("dataTelemetry", checked)}
                />
              }
              label="数据遥测 (帮助提高模型准确性)"
            />
          </Stack>
        </Paper>

        <Stack direction="row" justifyContent="center" spacing={1.6}>
          <Button
            variant="outlined"
            onClick={() => void restoreSettings()}
            sx={{ textTransform: "none", px: 3.4, py: 1.3, borderRadius: 1.5, fontWeight: 700 }}
          >
            还原
          </Button>
          <Button
            variant="contained"
            onClick={() => void persistSettings()}
            sx={{ textTransform: "none", px: 3.4, py: 1.3, borderRadius: 1.5, fontWeight: 700 }}
          >
            保存
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
