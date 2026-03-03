import {
  Avatar,
  Box,
  Button,
  ClickAwayListener,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuList,
  MenuItem,
  Paper,
  Popper,
  Stack,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import { useMemo, useState } from "react";
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
  onCreateChat: () => void;
  onRenameChat: (chat: ChatSession) => void;
  onDeleteChat: (chat: ChatSession) => void;
};

export default function AppSidebar({
  chats,
  view,
  selectedChatId,
  onSelectChat,
  onSelectView,
  onCreateChat,
  onRenameChat,
  onDeleteChat,
}: AppSidebarProps) {
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [menuChatId, setMenuChatId] = useState<string>("");
  const [hoveredChatId, setHoveredChatId] = useState<string>("");
  const menuOpen = Boolean(menuAnchorEl && menuChatId);
  const menuChat = useMemo(() => chats.find((chat) => chat.id === menuChatId) ?? null, [chats, menuChatId]);

  function closeMenu() {
    setMenuAnchorEl(null);
    setMenuChatId("");
  }

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
        variant="text"
        startIcon={<AddRoundedIcon />}
        onClick={() => {
          onSelectView("chat");
          onCreateChat();
        }}
        sx={{
          py: 1.2,
          px: 1.2,
          borderRadius: 1.6,
          textTransform: "none",
          fontSize: 29 / 2.2,
          mb: 3,
          fontWeight: 600,
          justifyContent: "flex-start",
          color: "primary.main",
          "&:hover": {
            backgroundColor: "#eaf1fb",
          },
        }}
      >
        新建对话
      </Button>

      <Typography sx={{ fontWeight: 700, color: "#6b7b97", fontSize: 15, mb: 1.1 }}>对话记录</Typography>
      <List sx={{ py: 0 }}>
        {chats.map((chat) => (
          <Box
            key={chat.id}
            className="nexus-chat-list-item"
            onMouseEnter={() => {
              setHoveredChatId(chat.id);
            }}
            onMouseLeave={() => {
              setHoveredChatId((current) => (current === chat.id ? "" : current));
            }}
            sx={{
              position: "relative",
              mb: 0.5,
            }}
          >
            <ListItemButton
              selected={view === "chat" && selectedChatId === chat.id}
              onClick={() => {
                onSelectView("chat");
                onSelectChat(chat.id);
              }}
              sx={{
                borderRadius: 1.6,
                py: 1.05,
                pr: 5.5,
                backgroundColor: view === "chat" && selectedChatId === chat.id ? "#edf2fb" : "transparent",
              }}
            >
              <ListItemIcon sx={{ minWidth: 38 }}>
                <ChatBubbleOutlineRoundedIcon color={view === "chat" && selectedChatId === chat.id ? "primary" : "action"} />
              </ListItemIcon>
              <ListItemText
                sx={{ minWidth: 0, overflow: "hidden" }}
                primary={chat.title}
                primaryTypographyProps={{
                  noWrap: true,
                  title: chat.title,
                  fontSize: 30 / 2.3,
                  fontWeight: view === "chat" && selectedChatId === chat.id ? 700 : 500,
                  color: view === "chat" && selectedChatId === chat.id ? "#1573e6" : "inherit",
                }}
              />
            </ListItemButton>

            <IconButton
              className="nexus-chat-item-menu-btn"
              size="small"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (menuOpen && menuChatId === chat.id) {
                  closeMenu();
                  return;
                }
                setMenuAnchorEl(event.currentTarget);
                setMenuChatId(chat.id);
              }}
              sx={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                transition: "opacity 120ms ease",
                opacity: hoveredChatId === chat.id || menuChatId === chat.id ? 1 : 0,
              }}
            >
              <MoreHorizRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </List>

      <Popper
        anchorEl={menuAnchorEl}
        open={menuOpen}
        placement="bottom-end"
        sx={{
          zIndex: 1400,
        }}
      >
        <ClickAwayListener onClickAway={closeMenu}>
          <Paper
            elevation={4}
            sx={{ mt: 0.4, borderRadius: 0.8, overflow: "hidden", border: "1px solid #d7e1f1" }}
          >
            <MenuList dense onClick={(event) => event.stopPropagation()}>
              <MenuItem
                onClick={() => {
                  if (menuChat) {
                    onRenameChat(menuChat);
                  }
                  closeMenu();
                }}
              >
                重命名
              </MenuItem>
              <MenuItem
                onClick={() => {
                  if (menuChat) {
                    onDeleteChat(menuChat);
                  }
                  closeMenu();
                }}
              >
                删除
              </MenuItem>
            </MenuList>
          </Paper>
        </ClickAwayListener>
      </Popper>

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
