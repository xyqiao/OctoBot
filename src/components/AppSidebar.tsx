import {
  Avatar,
  Button,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import type { ChatSession, NavView } from "../types";

const sidebarStyle = {
  width: 340,
  borderRadius: 0,
  p: 2.3,
  borderRight: "1px solid #dbe3f0",
  backgroundColor: "#f7f9fd",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};

type AppSidebarProps = {
  chats: ChatSession[];
  view: NavView;
  selectedChatId: string;
  onSelectChat: (chatId: string) => void;
  onSelectView: (view: NavView) => void;
};

export default function AppSidebar({
  chats,
  view,
  selectedChatId,
  onSelectChat,
  onSelectView,
}: AppSidebarProps) {
  return (
    <Paper elevation={0} sx={sidebarStyle}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3.2, px: 0.6 }}>
        <Avatar sx={{ bgcolor: "#1573e6", width: 48, height: 48 }}>
          <SmartToyRoundedIcon />
        </Avatar>
        <Typography variant="h5" sx={{ fontSize: 31, fontWeight: 700 }}>
          Nexus AI
        </Typography>
      </Stack>

      <Button
        variant="contained"
        startIcon={<AddRoundedIcon />}
        sx={{ py: 1.4, borderRadius: 1.6, textTransform: "none", fontSize: 29 / 2.2, mb: 3, fontWeight: 700 }}
      >
        新建对话
      </Button>

      <Typography sx={{ fontWeight: 700, color: "#6b7b97", fontSize: 15, mb: 1.1 }}>对话记录</Typography>
      <List sx={{ py: 0 }}>
        {chats.map((chat) => (
          <ListItemButton
            key={chat.id}
            selected={view === "chat" && selectedChatId === chat.id}
            onClick={() => {
              onSelectView("chat");
              onSelectChat(chat.id);
            }}
            sx={{
              borderRadius: 1.6,
              mb: 0.5,
              py: 1.05,
              borderRight: view === "chat" && selectedChatId === chat.id ? "4px solid #1674e6" : "4px solid transparent",
              backgroundColor: view === "chat" && selectedChatId === chat.id ? "#edf2fb" : "transparent",
            }}
          >
            <ListItemIcon sx={{ minWidth: 38 }}>
              <ChatBubbleOutlineRoundedIcon color={view === "chat" && selectedChatId === chat.id ? "primary" : "action"} />
            </ListItemIcon>
            <ListItemText
              primary={chat.title}
              primaryTypographyProps={{
                fontSize: 30 / 2.3,
                fontWeight: view === "chat" && selectedChatId === chat.id ? 700 : 500,
                color: view === "chat" && selectedChatId === chat.id ? "#1573e6" : "inherit",
              }}
            />
          </ListItemButton>
        ))}
      </List>

      <Divider sx={{ my: 2 }} />

      <Typography sx={{ fontWeight: 700, color: "#6b7b97", fontSize: 15, mb: 1.1 }}>工作空间</Typography>
      <List sx={{ py: 0, flex: 1 }}>
        <ListItemButton
          selected={view === "tasks"}
          onClick={() => onSelectView("tasks")}
          sx={{
            borderRadius: 1.6,
            mb: 0.5,
            py: 1.05,
            borderRight: view === "tasks" ? "4px solid #1674e6" : "4px solid transparent",
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
            <ExtensionOutlinedIcon color="disabled" />
          </ListItemIcon>
          <ListItemText primary="技能" />
        </ListItemButton>
      </List>

      <List sx={{ py: 0, mt: "auto" }}>
        <ListItemButton
          selected={view === "settings"}
          onClick={() => onSelectView("settings")}
          sx={{
            borderRadius: 1.8,
            py: 1.2,
            border: view === "settings" ? "1px solid #9dc4fb" : "1px solid transparent",
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
    </Paper>
  );
}
