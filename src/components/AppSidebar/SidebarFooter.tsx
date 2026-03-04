import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { List, ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import type { NavView } from "../../types";

type SidebarFooterProps = {
  view: NavView;
  onSelectView: (view: NavView) => void;
};

export default function SidebarFooter({ view, onSelectView }: SidebarFooterProps) {
  return (
    <List sx={{ py: 0, mt: "auto" }}>
      <ListItemButton
        selected={view === "settings"}
        onClick={() => onSelectView("settings")}
        sx={{
          borderRadius: 1.8,
          py: 1.2,
          border:
            view === "settings"
              ? "1px solid #9dc4fb"
              : "1px solid transparent",
          backgroundColor: view === "settings" ? "#edf4ff" : "transparent",
        }}
      >
        <ListItemIcon sx={{ minWidth: 38 }}>
          <SettingsOutlinedIcon color={view === "settings" ? "primary" : "action"} />
        </ListItemIcon>
        <ListItemText
          primary="个人设置"
          primaryTypographyProps={{
            fontSize: 30 / 2.3,
            fontWeight: view === "settings" ? 700 : 500,
            color: view === "settings" ? "#1573e6" : "inherit",
          }}
        />
      </ListItemButton>
    </List>
  );
}

