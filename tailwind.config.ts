import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#08080A",
          900: "#0C0C10",
          800: "#15151B",
          700: "#1F1F26",
          600: "#2A2A33",
        },
        accent: {
          cyan: "#22D3EE",
          amber: "#FBBF24",
          emerald: "#34D399",
          rose: "#FB7185",
          violet: "#A78BFA",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "display-1": ["clamp(3rem, 8vw, 6.5rem)", { lineHeight: "0.95", letterSpacing: "-0.04em" }],
        "display-2": ["clamp(2rem, 5vw, 3.5rem)", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
      },
      backgroundImage: {
        "grain": "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.04 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      },
      boxShadow: {
        "glow-cyan": "0 0 0 1px rgba(34, 211, 238, 0.2), 0 8px 32px -8px rgba(34, 211, 238, 0.4)",
        "glow-amber": "0 0 0 1px rgba(251, 191, 36, 0.2), 0 8px 32px -8px rgba(251, 191, 36, 0.4)",
      },
      animation: {
        "shimmer": "shimmer 2.4s linear infinite",
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
