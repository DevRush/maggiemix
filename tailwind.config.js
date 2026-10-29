/** @type {import('tailwindcss').Config} */
// Static Tailwind build. Run `npm run build:css` after changing any utility
// class in index.html or js/app.js, and commit the regenerated css/tailwind.css.
//
// Palette ("Dastarkhwan"): deep green ground, saffron + rani pink accents,
// cream paper. Component colours live in css/styles.css as CSS variables too.
module.exports = {
  content: ['./index.html', './js/app.js'],
  theme: {
    extend: {
      colors: {
        cream:   { 50: '#FFFDF7', 100: '#FBF5E6', 200: '#F3E9D2', 300: '#E6D8B8' },
        ink:     { DEFAULT: '#1C1A17', 700: '#3D352C', 500: '#6B5E4F' },
        pak:     { 900: '#11402A', 800: '#17533A', 100: '#DCEBE2' },
        zafran:  { 300: '#F2B64A', 500: '#D98B0B', 800: '#8A5607' },
        rani:    { 500: '#B3245E', 700: '#8E1C4A', 900: '#7A1740' },
        mehndi:  { 500: '#2E7D4F', 700: '#205C39' },
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        body: ['Manrope', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
