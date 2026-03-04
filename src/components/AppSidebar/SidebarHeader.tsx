import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import { Avatar, Stack, Typography } from "@mui/material";

export default function SidebarHeader() {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="center"
      sx={{ mb: 3.2, px: 0.6 }}
    >
      <Avatar sx={{ bgcolor: "#1573e6", width: 48, height: 48 }}>
        <SmartToyRoundedIcon />
      </Avatar>
      <Typography variant="h5" sx={{ fontSize: 31, fontWeight: 700 }}>
        Nexus AI
      </Typography>
    </Stack>
  );
}

