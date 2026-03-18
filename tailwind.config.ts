import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    // Dark backgrounds
    "bg-dark-950", "bg-dark-900", "bg-dark-800", "bg-dark-700", "bg-dark-600", "bg-dark-500",
    "hover:bg-dark-700", "hover:bg-dark-600", "hover:bg-dark-500",
    // Dark text
    "text-dark-100", "text-dark-200", "text-dark-300", "text-dark-400", "text-dark-500",
    // Dark borders
    "border-dark-700", "border-dark-600", "border-dark-500",
    // Maroon backgrounds
    "bg-maroon-950", "bg-maroon-900", "bg-maroon-800", "bg-maroon-700", "bg-maroon-600",
    "hover:bg-maroon-800", "hover:bg-maroon-700", "hover:bg-maroon-600",
    // Maroon text & border
    "text-maroon-400", "text-maroon-300",
    "border-maroon-800", "border-maroon-700", "border-maroon-600",
    "focus:border-maroon-600",
    // Placeholder
    "placeholder-dark-400",
  ],
  theme: {
    extend: {
      colors: {
        maroon: {
          50:  "#fdf2f2",
          100: "#fce4e4",
          200: "#f9c5c5",
          300: "#f49898",
          400: "#ec5f5f",
          500: "#de3333",
          600: "#cc1a1a",
          700: "#a81212",
          800: "#800000",
          900: "#6b0000",
          950: "#3d0000",
        },
        dark: {
          50:  "#f5f5f5",
          100: "#e0e0e0",
          200: "#bdbdbd",
          300: "#9e9e9e",
          400: "#757575",
          500: "#616161",
          600: "#3a3a3a",
          700: "#2a2a2a",
          800: "#1e1e1e",
          900: "#121212",
          950: "#0a0a0a",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
