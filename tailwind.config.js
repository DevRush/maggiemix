/** @type {import('tailwindcss').Config} */
// Static Tailwind build. Run `npm run build:css` after changing any utility
// class in index.html or js/app.js, and commit the regenerated css/tailwind.css.
module.exports = {
  content: ['./index.html', './js/app.js'],
  theme: {
    extend: {
      colors: {
        saffron:  { 50:'#fff8ed', 100:'#fff0d4', 200:'#ffdda8', 300:'#ffc370', 400:'#ff9f37', 500:'#ff8310', 600:'#f66a06', 700:'#cc4e07', 800:'#a13d0e', 900:'#843410' },
        henna:    { 50:'#fdf3f3', 100:'#fce4e4', 200:'#fbcdcd', 300:'#f6a8a8', 400:'#ef7676', 500:'#e44d4d', 600:'#cf2f2f', 700:'#a82424', 800:'#8c2121', 900:'#7c2222' },
        pakgreen: { 50:'#f0fdf1', 100:'#dbfcdf', 200:'#baf7c1', 300:'#88ef94', 400:'#50de5f', 500:'#28c63a', 600:'#15a328', 700:'#148024', 800:'#156521', 900:'#13531e' },
        cardamom: { 50:'#f6f7f0', 100:'#eaecda', 200:'#d7dbb8', 300:'#bcc28e', 400:'#a3aa6a', 500:'#8a914f', 600:'#6e733c', 700:'#575a31', 800:'#47492b', 900:'#3d3f28' },
      },
      fontFamily: {
        display: ['Playfair Display', 'serif'],
        body: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
