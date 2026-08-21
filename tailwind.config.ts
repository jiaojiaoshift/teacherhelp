import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#112A3C",
        mist: "#E7F0EF",
        line: "#C7D5D9",
        edu: {
          50: "#eef8f6",
          100: "#d3eeea",
          200: "#a6ddd6",
          300: "#73c8bf",
          400: "#43afa6",
          500: "#1f928c",
          600: "#197672",
          700: "#165f5c",
          800: "#154c4b",
          900: "#153f3f"
        },
        sky: {
          50: "#eef7ff",
          100: "#d8ecff",
          200: "#baddff",
          300: "#8ac8ff",
          400: "#54a8ff",
          500: "#2d87ff",
          600: "#1d67f5",
          700: "#1a54e2",
          800: "#1d45b7",
          900: "#1d3d90"
        }
      },
      boxShadow: {
        panel: "0 18px 40px rgba(17, 42, 60, 0.08)",
        float: "0 12px 32px rgba(31, 146, 140, 0.16)"
      },
      borderRadius: {
        xl2: "1.25rem"
      }
    }
  },
  plugins: []
};

export default config;

