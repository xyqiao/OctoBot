import { createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1573e6",
    },
    background: {
      default: "#eef2f8",
      paper: "#f8fafc",
    },
    text: {
      primary: "#172033",
      secondary: "#60708d",
    },
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: "\"Segoe UI\", \"SF Pro Text\", \"PingFang SC\", sans-serif",
    h3: {
      fontSize: "2.2rem",
      fontWeight: 700,
    },
    h4: {
      fontSize: "2rem",
      fontWeight: 700,
    },
    h5: {
      fontSize: "1.8rem",
      fontWeight: 700,
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 0,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#ffffff",
        },
      },
    },
  },
});
