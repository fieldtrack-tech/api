import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border:     "hsl(var(--border))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          muted:      "hsl(var(--primary-muted))",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar:            "hsl(var(--sidebar))",
        "surface-elevated": "hsl(var(--surface-elevated))",
        "border-subtle":    "hsl(var(--border-subtle))",
      },
      borderRadius: {
        sm:    "4px",
        DEFAULT: "var(--radius)",
        md:    "calc(var(--radius) + 2px)",
        lg:    "calc(var(--radius) + 4px)",
        xl:    "calc(var(--radius) + 8px)",
        "2xl": "calc(var(--radius) + 12px)",
        full:  "9999px",
      },
      boxShadow: {
        none:       "none",
        sm:         "0 1px 3px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)",
        DEFAULT:    "0 1px 4px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
        md:         "0 4px 16px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
        lg:         "0 8px 32px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.14)",
        xl:         "0 16px 48px rgba(0,0,0,0.28), 0 8px 24px rgba(0,0,0,0.18)",
        brand:      "0 4px 24px rgba(47,111,235,0.20), 0 1px 6px rgba(47,111,235,0.10)",
        "brand-lg": "0 8px 40px rgba(47,111,235,0.28), 0 2px 12px rgba(47,111,235,0.14)",
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "1.4", letterSpacing: "0.04em" }],
        xs:    ["12px", { lineHeight: "1.4" }],
        sm:    ["13px", { lineHeight: "1.5" }],
        base:  ["14px", { lineHeight: "1.5" }],
        md:    ["15px", { lineHeight: "1.5" }],
        lg:    ["16px", { lineHeight: "1.5" }],
        xl:    ["18px", { lineHeight: "1.4" }],
        "2xl": ["20px", { lineHeight: "1.4" }],
        "3xl": ["24px", { lineHeight: "1.3" }],
        "4xl": ["28px", { lineHeight: "1.2" }],
        "5xl": ["32px", { lineHeight: "1.2" }],
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up":   { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "fade-in":        { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-in-up":     { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-in-left":  { from: { opacity: "0", transform: "translateX(-8px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "scale-in":       { from: { opacity: "0", transform: "scale(0.95)" }, to: { opacity: "1", transform: "scale(1)" } },
        shimmer:          { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
        "fade-in":        "fade-in 0.2s ease-out",
        "fade-in-up":     "fade-in-up 0.25s ease-out",
        "slide-in-left":  "slide-in-left 0.2s ease-out",
        "scale-in":       "scale-in 0.15s ease-out",
        shimmer:          "shimmer 2s linear infinite",
      },
      backdropBlur: {
        xs:      "2px",
        sm:      "4px",
        DEFAULT: "8px",
        md:      "12px",
        lg:      "16px",
        xl:      "24px",
      },
    },
  },
  plugins: [],
};

export default config;
