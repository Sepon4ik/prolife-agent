/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#c41e3a",
          50: "#fef2f4",
          100: "#fde6e9",
          200: "#fbd0d7",
          300: "#f7aab7",
          400: "#f17a91",
          500: "#e54d6b",
          600: "#c41e3a",
          700: "#a91a33",
          800: "#8d1830",
          900: "#79192f",
        },
        dark: {
          DEFAULT: "#0a0a0f",
          secondary: "#1a1a24",
          tertiary: "#2a2a35",
        },
      },
    },
  },
  plugins: [],
};
