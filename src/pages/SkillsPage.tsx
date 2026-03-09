import InstallDesktopRoundedIcon from "@mui/icons-material/InstallDesktopRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  disableSkill,
  enableSkill,
  installSkill,
  listSkills,
  refreshSkillsCatalog,
  uninstallSkill,
} from "../utils/db";
import type { SkillDescriptor } from "../types";

function toFileUrl(filePath?: string | null) {
  if (!filePath) {
    return undefined;
  }
  return `file://${filePath.replace(/\\/g, "/")}`;
}

function SkillCard(props: {
  skill: SkillDescriptor;
  variant: "installed" | "recommended";
  pending: boolean;
  onInstall: (skillId: string) => void;
  onToggleEnabled: (skill: SkillDescriptor, checked: boolean) => void;
  onOpenMenu: (event: MouseEvent<HTMLElement>, skill: SkillDescriptor) => void;
}) {
  const theme = useTheme();
  const { skill, variant, pending, onInstall, onToggleEnabled, onOpenMenu } =
    props;
  const installed = skill.installStatus === "installed";
  const iconSrc = toFileUrl(skill.iconPath);

  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        border: `1px solid ${theme.appColors.border}`,
        borderRadius: 3,
        backgroundColor: theme.appColors.panelAlt,
        boxShadow: `0 14px 30px ${theme.appColors.overlay}`,
      }}
    >
      <CardContent
        sx={{
          p: 2,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 1.6,
          "&:last-child": { pb: 2 },
        }}
      >
        <Stack
          direction="row"
          spacing={1.2}
          alignItems="center"
          sx={{ minWidth: 0 }}
        >
          {iconSrc ? (
            <Box
              component="img"
              src={iconSrc}
              alt={skill.displayName}
              sx={{
                width: 40,
                height: 40,
                flexShrink: 0,
                objectFit: "contain",
              }}
            />
          ) : (
            <Box
              sx={{
                width: 40,
                height: 40,
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
                color: theme.appColors.textMuted,
                fontSize: 22,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {skill.displayName.slice(0, 1).toUpperCase()}
            </Box>
          )}

          <Typography
            sx={{
              minWidth: 0,
              fontWeight: 700,
              fontSize: 16,
              lineHeight: 1.35,
              color: theme.appColors.textPrimary,
            }}
          >
            {skill.displayName}
          </Typography>
        </Stack>

        <Typography
          sx={{
            minHeight: "2.9em",
            color: theme.palette.text.secondary,
            fontSize: 13,
            lineHeight: 1.45,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {skill.description}
        </Typography>

        <Box sx={{ flex: 1 }} />

        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
        >
          {variant === "installed" ? (
            <Stack direction="row" alignItems="center" spacing={1}>
              <Switch
                checked={skill.enabled}
                onChange={(_event, checked) => onToggleEnabled(skill, checked)}
                disabled={pending}
              />
              <Typography
                sx={{ color: theme.appColors.textMuted, fontSize: 13 }}
              >
                {skill.enabled ? "已开启" : "已关闭"}
              </Typography>
            </Stack>
          ) : (
            <Button
              variant={installed ? "outlined" : "contained"}
              startIcon={installed ? undefined : <InstallDesktopRoundedIcon />}
              onClick={() => onInstall(skill.id)}
              disabled={pending || installed}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              {installed ? "已安装" : "安装"}
            </Button>
          )}

          {variant === "installed" ? (
            <IconButton
              onClick={(event) => onOpenMenu(event, skill)}
              disabled={pending}
              size="small"
              sx={{
                color: theme.appColors.textMuted,
                borderRadius: 2,
              }}
            >
              <MoreHorizRoundedIcon fontSize="small" />
            </IconButton>
          ) : (
            <Box sx={{ width: 32, height: 32 }} />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function SkillsPage() {
  const theme = useTheme();
  const [skills, setSkills] = useState<SkillDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPendingId, setActionPendingId] = useState("");
  const [uploadPending, setUploadPending] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [menuSkill, setMenuSkill] = useState<SkillDescriptor | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const installedSkills = useMemo(
    () => skills.filter((item) => item.installStatus === "installed"),
    [skills],
  );
  const recommendedSkills = useMemo(() => skills, [skills]);

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

  function closeMenu() {
    setMenuAnchorEl(null);
    setMenuSkill(null);
  }

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

  async function handleUninstall(skill: SkillDescriptor) {
    closeMenu();
    setActionPendingId(skill.id);
    setErrorText("");
    try {
      await uninstallSkill(skill.id);
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
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Stack direction="row" spacing={1.2} alignItems="center">
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
              导入
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
          <Typography sx={{ color: "error.main", fontSize: 13 }}>
            {errorText}
          </Typography>
        )}

        <Divider />

        <Box>
          <Typography sx={{ fontWeight: 700, mb: 1.2 }}>已安装</Typography>
          {installedSkills.length === 0 ? (
            <Typography sx={{ color: theme.appColors.textMuted, fontSize: 14 }}>
              暂无已安装技能。
            </Typography>
          ) : (
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              }}
            >
              {installedSkills.map((skill) => (
                <SkillCard
                  key={`installed:${skill.id}`}
                  skill={skill}
                  variant="installed"
                  pending={actionPendingId === skill.id || uploadPending}
                  onInstall={handleInstall}
                  onToggleEnabled={handleToggleEnabled}
                  onOpenMenu={(event, targetSkill) => {
                    setMenuAnchorEl(event.currentTarget);
                    setMenuSkill(targetSkill);
                  }}
                />
              ))}
            </Box>
          )}
        </Box>

        <Divider />

        <Box>
          <Typography sx={{ fontWeight: 700, mb: 1.2 }}>推荐</Typography>
          {recommendedSkills.length === 0 ? (
            <Typography sx={{ color: theme.appColors.textMuted, fontSize: 14 }}>
              暂无推荐技能。
            </Typography>
          ) : (
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              }}
            >
              {recommendedSkills.map((skill) => (
                <SkillCard
                  key={`recommended:${skill.id}`}
                  skill={skill}
                  variant="recommended"
                  pending={actionPendingId === skill.id || uploadPending}
                  onInstall={handleInstall}
                  onToggleEnabled={handleToggleEnabled}
                  onOpenMenu={() => undefined}
                />
              ))}
            </Box>
          )}
        </Box>
      </Stack>

      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl && menuSkill)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem
          disabled={!menuSkill || actionPendingId === menuSkill?.id}
          onClick={() => {
            if (menuSkill) {
              void handleUninstall(menuSkill);
            }
          }}
        >
          卸载
        </MenuItem>
      </Menu>
    </Box>
  );
}
