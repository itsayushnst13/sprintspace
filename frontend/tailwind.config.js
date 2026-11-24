/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        display: ["Manrope", "sans-serif"]
      },
      colors: {
        ink: "#151827",
        muted: "#777d91",
        brand: "#6558e8",
        canvas: "#f6f7fb"
      },
      boxShadow: {
        soft: "0 10px 35px rgba(23, 29, 54, 0.06)"
      }
    }
  },
  plugins: []
};
