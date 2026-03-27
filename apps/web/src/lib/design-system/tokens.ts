/**
 * FieldTrack 2.0 — Design System Tokens
 *
 * Brand identity extracted from logo:
 *  • Dark circular base  → deep navy-black background
 *  • White geometric "F" → foreground / structure color
 *  • Blue location pin   → primary action accent (#2F6FEB)
 *
 * Inspired by: Linear + Stripe + Vercel + Notion
 */

// ─── Primitive palette ───────────────────────────────────────────────────────

export const primitives = {
  // Blue accent — extracted from the logo's location pin
  blue: {
    50:  "#EEF4FF",
    100: "#DCE9FF",
    200: "#BACFFF",
    300: "#8AAFFF",
    400: "#5A8DF5",
    500: "#2F6FEB", // PRIMARY — exact brand blue
    600: "#1A5DD4",
    700: "#1249B3",
    800: "#0E3A8C",
    900: "#0B2E6E",
    950: "#071C44",
  },

  // Grayscale — blue-tinted to harmonize with brand
  slate: {
    50:  "#F4F6FB",
    100: "#E8EDF7",
    200: "#CDD5E8",
    300: "#A6B3CE",
    400: "#7A8BA0",
    500: "#586578",
    600: "#44505F",
    700: "#333D4D",
    800: "#232C3B",
    900: "#161D2E",
    950: "#0E1524",
  },

  // Near-black backgrounds — navy-tinted (logo base)
  ink: {
    50:  "#E8EEFF",
    100: "#B8C4E8",
    200: "#8898CC",
    300: "#5870B0",
    400: "#364E94",
    500: "#1E337A",
    600: "#152661",
    700: "#0E1B4A",
    800: "#091232",
    900: "#06091F", // darkest — sidebar bg
    950: "#03050F",
  },

  // Semantic
  green:  { 50: "#F0FDF4", 400: "#4ADE80", 500: "#22C55E", 600: "#16A34A", 900: "#14532D", 950: "#052E16" },
  red:    { 50: "#FFF1F2", 400: "#FB7185", 500: "#EF4444", 600: "#DC2626", 900: "#7F1D1D", 950: "#450A0A" },
  amber:  { 50: "#FFFBEB", 400: "#FBBF24", 500: "#F59E0B", 600: "#D97706", 900: "#78350F", 950: "#451A03" },
} as const;

// ─── Semantic tokens (light) ─────────────────────────────────────────────────

export const lightTokens = {
  background:        primitives.slate[50],          // #F4F6FB
  backgroundElevated: "#FFFFFF",
  backgroundGlass:   "rgba(255,255,255,0.85)",

  foreground:        primitives.slate[900],          // #161D2E
  foregroundSecondary: primitives.slate[600],        // #44505F
  foregroundMuted:   primitives.slate[400],          // #7A8BA0

  primary:           primitives.blue[500],           // #2F6FEB
  primaryHover:      primitives.blue[600],           // #1A5DD4
  primaryMuted:      primitives.blue[50],            // #EEF4FF
  primaryForeground: "#FFFFFF",

  border:            primitives.slate[200],          // #CDD5E8
  borderSubtle:      primitives.slate[100],          // #E8EDF7

  success:           primitives.green[500],
  successMuted:      primitives.green[50],
  error:             primitives.red[500],
  errorMuted:        primitives.red[50],
  warning:           primitives.amber[500],
  warningMuted:      primitives.amber[50],

  sidebar:           "#FFFFFF",
} as const;

// ─── Semantic tokens (dark — brand default) ──────────────────────────────────

export const darkTokens = {
  background:        "#0A0E1A",   // Deep navy-black (logo base)
  backgroundElevated: "#0F1525",  // Slightly lighter surface (cards)
  backgroundGlass:   "rgba(15,21,37,0.85)",

  foreground:        primitives.slate[50],           // #F4F6FB (nearly white text)
  foregroundSecondary: primitives.slate[300],        // #A6B3CE
  foregroundMuted:   primitives.slate[400],          // #7A8BA0

  primary:           "#4D8FF5",   // Slightly brighter blue for dark bg
  primaryHover:      "#6AA3F8",
  primaryMuted:      "rgba(79,143,245,0.12)",
  primaryForeground: "#FFFFFF",

  border:            "#1A2236",   // Subtle dark border
  borderSubtle:      "#141D2E",   // Very subtle

  success:           primitives.green[400],
  successMuted:      "rgba(74,222,128,0.1)",
  error:             primitives.red[400],
  errorMuted:        "rgba(251,113,133,0.1)",
  warning:           primitives.amber[400],
  warningMuted:      "rgba(251,191,36,0.1)",

  sidebar:           "#070A13",   // Darkest — sidebar darker than bg
} as const;

// ─── Elevation system ────────────────────────────────────────────────────────

export const elevation = {
  0: "none",                              // Flat — no shadow
  1: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)",         // Cards
  2: "0 4px 16px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.12)",         // Modals
  3: "0 8px 32px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.16)",       // Overlays
  // Brand-tinted (blue glow)
  brand: "0 4px 24px rgba(47,111,235,0.18), 0 1px 4px rgba(47,111,235,0.08)",
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────
// Strict 4px base grid

export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  6: "24px",
  8: "32px",
  12: "48px",
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

export const typography = {
  family: { sans: "Inter, system-ui, -apple-system, sans-serif" },
  scale: {
    h1: { size: "30px", weight: "700", lineHeight: "1.2" },
    h2: { size: "24px", weight: "600", lineHeight: "1.3" },
    h3: { size: "18px", weight: "600", lineHeight: "1.4" },
    body: { size: "14px", weight: "400", lineHeight: "1.5" },
    caption: { size: "12px", weight: "400", lineHeight: "1.4" },
    label: { size: "11px", weight: "600", lineHeight: "1.2", letterSpacing: "0.06em" },
  },
} as const;

// ─── Border radius ───────────────────────────────────────────────────────────

export const radius = {
  sm: "4px",
  DEFAULT: "8px",    // Base — slightly geometric, slightly round
  md: "10px",
  lg: "12px",
  xl: "16px",
  full: "9999px",
} as const;

// ─── Motion ──────────────────────────────────────────────────────────────────

export const motion = {
  duration: {
    fast: "100ms",
    base: "150ms",
    slow: "250ms",
    slower: "350ms",
  },
  easing: {
    base: "cubic-bezier(0.16, 1, 0.3, 1)",
    smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
} as const;
