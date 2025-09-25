module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        border: "#e5e7eb", // same as Tailwind's gray-200
        background: "#ffffff",
        foreground: "#111827",
      },
    },
  },
  plugins: [],
};