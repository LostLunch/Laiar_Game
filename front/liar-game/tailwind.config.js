// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = { // CRA는 module.exports 문법을 사용하는 경우가 많습니다.
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // CRA의 표준 경로입니다.
    "./public/index.html",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
