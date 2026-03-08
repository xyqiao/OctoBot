import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { List, ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { NavView } from "../../types";

type SidebarFooterProps = {
  view: NavView;
  onSelectView: (view: NavView) => void;
};

export default function SidebarFooter({ view, onSelectView }: SidebarFooterProps) {
  const theme = useTheme();

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
              ? `1px solid ${theme.appColors.borderStrong}`
              : "1px solid transparent",
          backgroundColor: view === "settings" ? theme.appColors.sidebarSelected : "transparent",
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
            color: view === "settings" ? theme.palette.primary.main : "inherit",
          }}
        />
      </ListItemButton>
    </List>
  );
}

