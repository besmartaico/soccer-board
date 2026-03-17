import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        maroon: {
          50:  '#fdf2f2',
          100: '#fce4e4',
          200: '#f9c5c5',
          300: '#f49898',
          400: '#ec5f5f',
          500: '#de3333',
          600: '#cc1a1a',
          700: '#a81212',
          800: '#800000',
          900: '#6b0000',
          950: '#3d0000',
        },
        dark: {
          50:  '#f5f5f5',
          100: '#e0e0e0',
          200: '#bdbdbd',
          300: '#9e9e9e',
          400: '#757575',
          500: '#616161',
          600: '#424242',
          700: '#303030',
          800: '#1e1e1e',
          900: '#121212',
          950: '#0a0a0a',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
