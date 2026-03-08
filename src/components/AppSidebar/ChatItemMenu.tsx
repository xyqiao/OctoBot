import {
  ClickAwayListener,
  MenuItem,
  MenuList,
  Paper,
  Popper,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { ChatSession } from "../../types";

type ChatItemMenuProps = {
  anchorEl: HTMLElement | null;
  open: boolean;
  chat: ChatSession | null;
  onClose: () => void;
  onRenameChat: (chat: ChatSession) => void;
  onDeleteChat: (chat: ChatSession) => void;
};

export default function ChatItemMenu({
  anchorEl,
  open,
  chat,
  onClose,
  onRenameChat,
  onDeleteChat,
}: ChatItemMenuProps) {
  const theme = useTheme();

  return (
    <Popper
      anchorEl={anchorEl}
      open={open}
      placement="bottom-end"
      sx={{
        zIndex: 1400,
      }}
    >
      <ClickAwayListener onClickAway={onClose}>
        <Paper
          elevation={4}
          sx={{
            mt: 0.4,
            borderRadius: 0.8,
            overflow: "hidden",
            border: `1px solid ${theme.appColors.border}`,
          }}
        >
          <MenuList dense onClick={(event) => event.stopPropagation()}>
            <MenuItem
              onClick={() => {
                if (chat) {
                  onRenameChat(chat);
                }
                onClose();
              }}
            >
              重命名
            </MenuItem>
            <MenuItem
              onClick={() => {
                if (chat) {
                  onDeleteChat(chat);
                }
                onClose();
              }}
            >
              删除
            </MenuItem>
          </MenuList>
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}

