import typography from "@tailwindcss/typography";
import containerQueries from "@tailwindcss/container-queries";
import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["index.html", "src/**/*.{js,ts,jsx,tsx,html,css}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "oklch(var(--border))",
        input: "oklch(var(--input))",
        ring: "oklch(var(--ring) / <alpha-value>)",
        background: "oklch(var(--background))",
        foreground: "oklch(var(--foreground))",
        primary: {
          DEFAULT: "oklch(var(--primary) / <alpha-value>)",
          foreground: "oklch(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "oklch(var(--secondary) / <alpha-value>)",
          foreground: "oklch(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "oklch(var(--destructive) / <alpha-value>)",
          foreground: "oklch(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "oklch(var(--success) / <alpha-value>)",
          foreground: "oklch(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "oklch(var(--warning) / <alpha-value>)",
          foreground: "oklch(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "oklch(var(--info) / <alpha-value>)",
          foreground: "oklch(var(--info-foreground))",
        },
        muted: {
          DEFAULT: "oklch(var(--muted) / <alpha-value>)",
          foreground: "oklch(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "oklch(var(--accent) / <alpha-value>)",
          foreground: "oklch(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "oklch(var(--popover))",
          foreground: "oklch(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "oklch(var(--card))",
          foreground: "oklch(var(--card-foreground))",
        },
        chart: {
          1: "oklch(var(--chart-1))",
          2: "oklch(var(--chart-2))",
          3: "oklch(var(--chart-3))",
          4: "oklch(var(--chart-4))",
          5: "oklch(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "oklch(var(--sidebar))",
          foreground: "oklch(var(--sidebar-foreground))",
          primary: "oklch(var(--sidebar-primary))",
          "primary-foreground": "oklch(var(--sidebar-primary-foreground))",
          accent: "oklch(var(--sidebar-accent))",
          "accent-foreground": "oklch(var(--sidebar-accent-foreground))",
          border: "oklch(var(--sidebar-border))",
          ring: "oklch(var(--sidebar-ring))",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 oklch(0.3 0.04 50 / 0.06)",
        subtle: "0 1px 2px 0 oklch(0.3 0.04 50 / 0.05), 0 1px 1px 0 oklch(0.3 0.04 50 / 0.03)",
        panel: "0 1px 2px 0 oklch(0.3 0.04 50 / 0.05), 0 2px 6px -2px oklch(0.3 0.04 50 / 0.06)",
        "panel-hover": "0 6px 18px -6px oklch(0.3 0.04 50 / 0.14), 0 2px 4px -1px oklch(0.3 0.04 50 / 0.06)",
        elevated: "0 12px 32px -10px oklch(0.3 0.04 50 / 0.18), 0 3px 8px -3px oklch(0.3 0.04 50 / 0.08)",
        qr: "0 14px 40px -12px oklch(0.47 0.14 31 / 0.28), 0 4px 12px -4px oklch(0.3 0.04 50 / 0.1)",
        bar: "0 -4px 16px -6px oklch(0.3 0.04 50 / 0.12)",
        cta: "0 6px 16px -6px oklch(0.47 0.14 31 / 0.45)",
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
        "fade-rise": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.02)" },
        },
        "otp-shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-6px)" },
          "40%": { transform: "translateX(6px)" },
          "60%": { transform: "translateX(-4px)" },
          "80%": { transform: "translateX(4px)" },
        },
        "order-flow-pulse": {
          "0%, 82%, 100%": { transform: "scale(1)", boxShadow: "0 0 0 0 transparent" },
          "8%": { transform: "scale(1.16)", boxShadow: "0 0 0 5px color-mix(in oklch, currentColor 18%, transparent)" },
          "16%": { transform: "scale(1)", boxShadow: "0 0 0 0 transparent" },
        },
        "order-flow-run": {
          "0%": { left: "0%", opacity: "0" },
          "4%": { opacity: "1" },
          "96%": { opacity: "1" },
          "100%": { left: "100%", opacity: "0" },
        },
        "order-flow-label-fade": {
          "0%": { opacity: "0", transform: "translateY(3px)" },
          "4%": { opacity: "1", transform: "translateY(0)" },
          "16%": { opacity: "1", transform: "translateY(0)" },
          "20%": { opacity: "0", transform: "translateY(-3px)" },
          "100%": { opacity: "0" },
        },
        "kpi-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "row-in": {
          from: { opacity: "0", transform: "translateY(3px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "promo-marquee": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(-100%)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "sheet-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-rise": "fade-rise 0.2s ease-out",
        "pulse-soft": "pulse-soft 0.6s ease-in-out",
        "otp-shake": "otp-shake 0.4s ease-in-out",
        "order-flow-pulse": "order-flow-pulse 10s ease-in-out infinite",
        "order-flow-run": "order-flow-run 10s linear infinite",
        "order-flow-label-fade": "order-flow-label-fade 10s ease-in-out infinite",
        "kpi-in": "kpi-in 0.3s ease-out",
        "row-in": "row-in 0.25s ease-out",
        "promo-marquee": "promo-marquee 30s linear infinite",
        shimmer: "shimmer 1.4s ease-in-out infinite",
        "sheet-up": "sheet-up 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  },
  plugins: [typography, containerQueries, animate],
};
