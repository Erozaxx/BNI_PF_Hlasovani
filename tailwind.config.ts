import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#cf2e2e",
          hover: "#b02626",
          light: "#f9e6e6",
        },
        gold: {
          DEFAULT: "#C69E63",
          light: "#f5eddc",
        },
        navy: {
          DEFAULT: "#605BE5",
          light: "#eeeeff",
        },
        surface: "#FFFFFF",
        background: "#F7F7F7",
        border: "#E8E8E8",
        "border-strong": "#D0D0D0",
        "text-main": "#333333",
        "text-muted": "#888888",
        "text-disabled": "#BBBBBB",
        success: {
          DEFAULT: "#2d7a3a",
          light: "#e6f4e8",
        },
        warning: {
          DEFAULT: "#b07d00",
          light: "#fdf5dc",
        },
        danger: {
          DEFAULT: "#cf2e2e",
          light: "#f9e6e6",
        },
        info: {
          DEFAULT: "#605BE5",
          light: "#eeeeff",
        },
      },
      fontFamily: {
        sans: [
          "Poppins",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
      },
      borderRadius: {
        btn: "30px",
        card: "12px",
        modal: "16px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.05)",
        card: "0 4px 6px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05)",
        lg: "0 10px 15px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.04)",
        xl: "0 20px 25px rgba(0,0,0,0.10), 0 10px 10px rgba(0,0,0,0.04)",
        focus: "0 0 0 3px rgba(207,46,46,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
