import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { sm: "640px", md: "768px", lg: "1024px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          // gradient-end for warm CTA / wordmark
          glow: "hsl(var(--primary-glow))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        // Body text — Be Vietnam Pro (VI diacritics).
        sans: ["var(--font-body)", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        // Display — Fredoka, rounded friendly for hero/wordmark.
        display: ["var(--font-display)", "var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        // Soft bento shadows — warm tinted for food/cream context.
        "soft-sm": "0 1px 2px rgba(24, 14, 8, 0.05)",
        "soft":    "0 4px 12px rgba(234, 88, 12, 0.08), 0 1px 3px rgba(24, 14, 8, 0.04)",
        "soft-lg": "0 8px 24px rgba(234, 88, 12, 0.10), 0 2px 6px rgba(24, 14, 8, 0.05)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Typing-indicator dot — bouncing wave kiểu ChatGPT/iMessage classic.
        // 3 dots stagger 0/150/300ms, mỗi dot translateY(-4px) + opacity surge.
        // 0.6s cycle → dots "nhảy" liên tục rõ rệt, không nằm yên.
        "pulse-dot": {
          "0%, 80%, 100%": { transform: "translateY(0)",     opacity: "0.3" },
          "40%":           { transform: "translateY(-4px)", opacity: "1"   },
        },
        // Messages + card entrance — soft rise.
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        // Onboarding modal + delightful reveal.
        "pop": {
          from: { opacity: "0", transform: "scale(0.94)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
        // Skeleton shimmer sweep.
        "shimmer": {
          from: { transform: "translateX(-100%)" },
          to:   { transform: "translateX(100%)" },
        },
        // Subtle ambient pulse for hero accents.
        "breath": {
          "0%, 100%": { transform: "scale(1)" },
          "50%":       { transform: "scale(1.03)" },
        },
        // Indeterminate progress bar — slide across track.
        "indeterminate": {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
        // ChatGPT-style streaming cursor blink — sharp on/off, không fade mượt.
        "cursor-blink": {
          "0%, 49%":   { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
        // Hero bowl float — subtle bobbing up/down, gives 3D-feel "alive".
        "float": {
          "0%, 100%": { transform: "translateY(0) rotate(-1deg)" },
          "50%":      { transform: "translateY(-6px) rotate(1deg)" },
        },
        // Glow halo expand/fade — ambient ring behind hero bowl.
        "glow-pulse": {
          "0%, 100%": { transform: "scale(0.92)", opacity: "0.4" },
          "50%":      { transform: "scale(1.05)", opacity: "0.7" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
        "pulse-dot":      "pulse-dot 0.7s ease-in-out infinite",
        "fade-up":        "fade-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pop":            "pop 0.24s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "shimmer":        "shimmer 1.6s linear infinite",
        "breath":         "breath 2.4s ease-in-out infinite",
        "indeterminate":  "indeterminate 1.6s ease-in-out infinite",
        "cursor-blink":   "cursor-blink 1s steps(2) infinite",
        "float":          "float 4s ease-in-out infinite",
        "glow-pulse":     "glow-pulse 3s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
