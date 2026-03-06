import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import InstallDesktopRoundedIcon from "@mui/icons-material/InstallDesktopRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  disableSkill,
  enableSkill,
  installSkill,
  listSkills,
  refreshSkillsCatalog,
} from "../utils/db";
import type { SkillDescriptor } from "../types";

function toFileUrl(filePath?: string | null) {
  if (!filePath) {
    return undefined;
  }
  return `file://${filePath.replace(/\\/g, "/")}`;
}

function sourceLabel(source: SkillDescriptor["source"]) {
  return source === "builtin" ? "内置" : "本地上传";
}

function SkillCard(props: {
  skill: SkillDescriptor;
  pending: boolean;
  onInstall: (skillId: string) => void;
  onToggleEnabled: (skill: SkillDescriptor, checked: boolean) => void;
}) {
  const { skill, pending, onInstall, onToggleEnabled } = props;
  const installed = skill.installStatus === "installed";
  const iconSrc = toFileUrl(skill.iconPath);

  return (
    <Card
      elevation={0}
      sx={{
        border: "1px solid #d8e1ef",
        borderRadius: 2,
        backgroundColor: "#fbfdff",
      }}
    >
      <CardContent sx={{ p: 2 }}>
        <Stack spacing={1.6}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Avatar
              src={iconSrc}
              sx={{ width: 42, height: 42, bgcolor: "#1573e6", fontSize: 16 }}
            >
              {skill.displayName.slice(0, 1).toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>
                {skill.displayName}
              </Typography>
              <Typography
                sx={{
                  color: "#6e7f9b",
                  fontSize: 12,
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                {skill.name}
              </Typography>
            </Box>
          </Stack>

          <Typography
            sx={{
              minHeight: 40,
              color: "#4b5f82",
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            {skill.description}
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip size="small" label={sourceLabel(skill.source)} />
            {skill.version && <Chip size="small" variant="outlined" label={`v${skill.version}`} />}
          </Stack>

          {!installed ? (
            <Button
              variant="contained"
              startIcon={<InstallDesktopRoundedIcon />}
              onClick={() => onInstall(skill.id)}
              disabled={pending}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              安装
            </Button>
          ) : (
            <FormControlLabel
              control={
                <Switch
                  checked={skill.enabled}
                  onChange={(_event, checked) => onToggleEnabled(skill, checked)}
                  disabled={pending}
                />
              }
              label={skill.enabled ? "已开启" : "已关闭"}
              sx={{ m: 0 }}
            />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPendingId, setActionPendingId] = useState("");
  const [uploadPending, setUploadPending] = useState(false);
  const [errorText, setErrorText] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const installedSkills = useMemo(
    () => skills.filter((item) => item.installStatus === "installed"),
    [skills],
  );
  const uninstalledSkills = useMemo(
    () => skills.filter((item) => item.installStatus !== "installed"),
    [skills],
  );

  const loadSkills = useCallback(async () => {
    const loaded = await listSkills();
    setSkills(loaded);
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    setErrorText("");
    try {
      await loadSkills();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [loadSkills]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  async function handleRefresh() {
    setErrorText("");
    try {
      const loaded = await refreshSkillsCatalog();
      setSkills(loaded);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleInstall(skillId: string) {
    setActionPendingId(skillId);
    setErrorText("");
    try {
      await installSkill({ skillId });
      await loadSkills();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setActionPendingId("");
    }
  }

  async function handleToggleEnabled(skill: SkillDescriptor, checked: boolean) {
    setActionPendingId(skill.id);
    setErrorText("");
    try {
      if (checked) {
        await enableSkill(skill.id);
      } else {
        await disableSkill(skill.id);
      }
      await loadSkills();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setActionPendingId("");
    }
  }

  async function handleUpload(file: File) {
    setUploadPending(true);
    setErrorText("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await installSkill({
        archiveBytes: Array.from(bytes),
        fileName: file.name,
      });
      await loadSkills();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setUploadPending(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", height: "100%" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, overflowY: "auto", height: "100%" }}>
      <Stack spacing={2.4}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1.2} alignItems="center">
            <ExtensionOutlinedIcon color="primary" />
            <Typography sx={{ fontSize: 28, fontWeight: 700 }}>技能</Typography>
          </Stack>

          <Stack direction="row" spacing={1.2}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleUpload(file);
                }
              }}
            />
            <Button
              variant="outlined"
              startIcon={<UploadFileRoundedIcon />}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadPending}
              sx={{ textTransform: "none" }}
            >
              上传技能包
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshRoundedIcon />}
              onClick={() => {
                void handleRefresh();
              }}
              sx={{ textTransform: "none" }}
            >
              刷新
            </Button>
          </Stack>
        </Stack>

        {errorText && (
          <Typography sx={{ color: "error.main", fontSize: 13 }}>{errorText}</Typography>
        )}

        <Divider />

        <Box>
          <Typography sx={{ fontWeight: 700, mb: 1.2 }}>已安装技能</Typography>
          {installedSkills.length === 0 ? (
            <Typography sx={{ color: "#6e809e", fontSize: 14 }}>
              暂无已安装技能。
            </Typography>
          ) : (
            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))",
              }}
            >
              {installedSkills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  pending={actionPendingId === skill.id || uploadPending}
                  onInstall={handleInstall}
                  onToggleEnabled={handleToggleEnabled}
                />
              ))}
            </Box>
          )}
        </Box>

        <Divider />

        <Box>
          <Typography sx={{ fontWeight: 700, mb: 1.2 }}>未安装技能</Typography>
          {uninstalledSkills.length === 0 ? (
            <Typography sx={{ color: "#6e809e", fontSize: 14 }}>
              暂无可安装技能。
            </Typography>
          ) : (
            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))",
              }}
            >
              {uninstalledSkills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  pending={actionPendingId === skill.id || uploadPending}
                  onInstall={handleInstall}
                  onToggleEnabled={handleToggleEnabled}
                />
              ))}
            </Box>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
