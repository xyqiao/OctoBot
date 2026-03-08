import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import { Avatar, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export default function SidebarHeader() {
  const theme = useTheme();

  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="center"
      sx={{ mb: 3.2, px: 0.6 }}
    >
      <Avatar sx={{ bgcolor: theme.appColors.avatarSolid, width: 48, height: 48 }}>
        <SmartToyRoundedIcon />
      </Avatar>
      <Typography variant="h5" sx={{ fontSize: 31, fontWeight: 700 }}>
        Nexus AI
      </Typography>
    </Stack>
  );
}

