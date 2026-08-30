/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── MNC midnight theme ──────────────────────────────────
        mnc: {
          bg:       "#0a0a0a",   // deepest page background
          surface:  "#111111",   // card / surface
          elevated: "#1a1a1a",   // elevated surface
          border:   "#1f1f1f",   // subtle border
          border2:  "#2a2a2a",   // slightly visible border
          gold:     "#f59e0b",   // primary amber / gold
          goldHov:  "#d97706",   // gold hover
          goldDim:  "#f59e0b26", // gold at 15% opacity (glow / tint)
          orange:   "#f07020",   // warm orange accent
          muted:    "#6b6b6b",   // muted text
          sub:      "#9a9a9a",   // secondary text
          text:     "#e8e0d0",   // warm off-white body text
        },
        // ── Legacy cafe tokens (keep for existing components) ───
        cafe: {
          bg:     "#1a1a1a",
          card:   "#242424",
          border: "#2e2e2e",
          gold:   "#f5a623",
          amber:  "#e08a00",
          orange: "#f07020",
          muted:  "#9a9a9a",
          light:  "#f5f0e8",
        },
      },
      fontFamily: {
        sans:    ["Inter",  "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Inter",  "ui-sans-serif", "system-ui", "sans-serif"],
        cinzel:  ["Cinzel", "Georgia", "serif"],
      },
      backgroundImage: {
        "gold-radial":
          "radial-gradient(ellipse 60% 40% at 50% 0%, #f59e0b22 0%, transparent 70%)",
        "gold-radial-sm":
          "radial-gradient(ellipse 40% 30% at 50% 0%, #f59e0b18 0%, transparent 60%)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float":      "float 6s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-8px)" },
        },
      },
    },
  },
  plugins: [],
};
