import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import { List, ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
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
          backgroundColor: view === "tasks" ? "#edf2fb" : "transparent",
        }}
      >
        <ListItemIcon sx={{ minWidth: 38 }}>
          <ChecklistRoundedIcon color={view === "tasks" ? "primary" : "action"} />
        </ListItemIcon>
        <ListItemText primary="任务列表" />
      </ListItemButton>

      <ListItemButton sx={{ borderRadius: 2, py: 1.05 }}>
        <ListItemIcon sx={{ minWidth: 38 }}>
          <ExtensionOutlinedIcon color="action" />
        </ListItemIcon>
        <ListItemText primary="技能" />
      </ListItemButton>
    </List>
  );
}

