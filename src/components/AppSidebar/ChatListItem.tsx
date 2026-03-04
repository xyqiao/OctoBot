import TextsmsOutlinedIcon from "@mui/icons-material/TextsmsOutlined";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import {
  Box,
  IconButton,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import type { MouseEvent } from "react";
import type { ChatSession } from "../../types";

type ChatListItemProps = {
  chat: ChatSession;
  selected: boolean;
  showMenuButton: boolean;
  onSelect: (chatId: string) => void;
  onHoverStart: (chatId: string) => void;
  onHoverEnd: (chatId: string) => void;
  onMenuButtonClick: (
    event: MouseEvent<HTMLButtonElement>,
    chatId: string,
  ) => void;
};

export default function ChatListItem({
  chat,
  selected,
  showMenuButton,
  onSelect,
  onHoverStart,
  onHoverEnd,
  onMenuButtonClick,
}: ChatListItemProps) {
  return (
    <Box
      className="nexus-chat-list-item"
      onMouseEnter={() => onHoverStart(chat.id)}
      onMouseLeave={() => onHoverEnd(chat.id)}
      sx={{
        position: "relative",
        mb: 0.5,
      }}
    >
      <ListItemButton
        selected={selected}
        onClick={() => onSelect(chat.id)}
        sx={{
          borderRadius: 1.6,
          py: 1.05,
          pr: 5.5,
          backgroundColor: selected ? "#edf2fb" : "transparent",
        }}
      >
        <ListItemIcon sx={{ minWidth: 38 }}>
          <TextsmsOutlinedIcon color={selected ? "primary" : "action"} />
        </ListItemIcon>
        <ListItemText
          sx={{ minWidth: 0, overflow: "hidden" }}
          primary={chat.title}
          primaryTypographyProps={{
            noWrap: true,
            title: chat.title,
            fontSize: 30 / 2.3,
            fontWeight: selected ? 700 : 500,
            color: selected ? "#1573e6" : "inherit",
          }}
        />
      </ListItemButton>

      <IconButton
        className="nexus-chat-item-menu-btn"
        size="small"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onMenuButtonClick(event, chat.id);
        }}
        sx={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          transition: "opacity 120ms ease",
          opacity: showMenuButton ? 1 : 0,
        }}
      >
        <MoreHorizRoundedIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
