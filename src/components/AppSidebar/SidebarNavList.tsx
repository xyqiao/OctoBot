import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import {
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { NavView } from "../../types";

type SidebarNavListProps = {
  view: NavView;
  onSelectView: (view: NavView) => void;
  onCreateChat: () => void;
};

export default function SidebarNavList({
  view,
  onSelectView,
  onCreateChat,
}: SidebarNavListProps) {
  const theme = useTheme();

  return (
    <List sx={{ py: 0 }}>
      <ListItemButton
        onClick={() => {
          onSelectView("chat");
          onCreateChat();
        }}
        sx={{
          borderRadius: 1.6,
          mb: 0.5,
          py: 1.05,
          color: "primary.main",
        }}
      >
        <ListItemIcon sx={{ minWidth: 38 }}>
          <AddRoundedIcon color="primary" />
        </ListItemIcon>
        <ListItemText primary="新对话" sx={{ fontWeight: 700, fontSize: 20 }} />
      </ListItemButton>

      <ListItemButton
        selected={view === "tasks"}
        onClick={() => onSelectView("tasks")}
        sx={{
          borderRadius: 1.6,
          mb: 0.5,
          py: 1.05,
          backgroundColor: view === "tasks" ? theme.appColors.sidebarSelected : "transparent",
        }}
      >
        <ListItemIcon sx={{ minWidth: 38 }}>
          <ChecklistRoundedIcon
            color={view === "tasks" ? "primary" : "action"}
          />
        </ListItemIcon>
        <ListItemText primary="任务" />
      </ListItemButton>

      <ListItemButton
        selected={view === "skills"}
        onClick={() => onSelectView("skills")}
        sx={{
          borderRadius: 1.6,
          mb: 0.5,
          py: 1.05,
          backgroundColor: view === "skills" ? theme.appColors.sidebarSelected : "transparent",
        }}
      >
        <ListItemIcon sx={{ minWidth: 38 }}>
          <ExtensionOutlinedIcon
            color={view === "skills" ? "primary" : "action"}
          />
        </ListItemIcon>
        <ListItemText primary="技能" />
      </ListItemButton>

      <ListItemButton
        selected={view === "settings"}
        onClick={() => onSelectView("settings")}
        sx={{
          borderRadius: 1.6,
          py: 1.05,
          backgroundColor: view === "settings" ? theme.appColors.sidebarSelected : "transparent",
        }}
      >
        <ListItemIcon sx={{ minWidth: 38 }}>
          <SettingsOutlinedIcon
            color={view === "settings" ? "primary" : "action"}
          />
        </ListItemIcon>
        <ListItemText primary="设置" />
      </ListItemButton>
    </List>
  );
}
