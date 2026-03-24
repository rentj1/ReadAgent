/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Book-scroll dark palette
        ink: {
          950: "#1a0e05",
          900: "#231307",
          800: "#2d1a08",
          700: "#3d2510",
          600: "#5a3820",
        },
        gold: {
          DEFAULT: "#c9a96e",
          light: "#e0c898",
          dark: "#a07840",
          muted: "rgba(201,169,110,0.15)",
        },
        parchment: {
          DEFAULT: "#f5ebe0",
          muted: "#d4c4b0",
          dim: "#9b8a79",
        },
      },
      fontFamily: {
        serif: ["Noto Serif SC", "serif"],
        sans: ["Noto Sans SC", "sans-serif"],
      },
      backgroundImage: {
        "ink-gradient": "linear-gradient(160deg, #1a0e05 0%, #2d1a08 50%, #1a0e05 100%)",
        "gold-shimmer":
          "linear-gradient(90deg, transparent, rgba(201,169,110,0.3), transparent)",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "card-flip": "cardFlip 0.6s ease-in-out",
        shimmer: "shimmer 2s infinite",
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: "translateY(16px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        cardFlip: {
          "0%": { transform: "rotateY(0deg)" },
          "100%": { transform: "rotateY(180deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
