# MaggieMix 🥘

**188 Pakistani, Indian & South Asian home recipes — bilingual (Urdu + English), built for my mom.**

Live at **[maggiemix.com](https://maggiemix.com)**.

MaggieMix exists to answer the eternal question: *"aaj kya banayein?"* (what should we cook today?). Karahi, biryani, nihari, chaat, mithai, chai. Filter by how much effort you have left in you, search for what's in the fridge, or hit **Pick For Me** and let the app decide dinner.

## Features

- **188 curated recipes** from genuine desi home cooks, each with ingredients and cook's notes
- **Bilingual** — Urdu and English, with proper Nastaliq typography
- **Filter by protein, type and effort** — quick weeknight daal vs. weekend nihari
- **Search** — by name (English or Urdu), description or ingredient (`?q=haleem` works too)
- **Pick For Me** — one tap picks dinner for you
- **Save favourites** — starred recipes live in your browser, no account needed
- **Share & print** — every recipe has a link (`maggiemix.com/#chicken-karahi`), a share button (WhatsApp-friendly on phones) and a clean print layout
- **Works offline** — installable PWA with a service worker; after one visit it loads with no signal
- **Accessible** — keyboard navigable, screen-reader friendly, honours reduced-motion

## Tech

A deliberately simple static site: hand-written HTML, CSS and JavaScript. No framework, no bundler, no server. Open `index.html` straight from disk and it runs.

```
index.html          markup
css/styles.css      hand-written styles (components, animations, print, reduced motion)
css/tailwind.css    static Tailwind build — generated, do not edit (see below)
js/recipes.js       the recipe data (plain JS so it works from file:// and can carry comments)
js/app.js           all behaviour: filtering, search, favourites, detail panel / bottom sheet, sharing
sw.js               service worker: network-first with offline fallback
manifest.json       PWA manifest · icons/ · robots.txt · sitemap.xml
vercel.json         response headers (CSP, caching) for the Vercel deployment
```

### Editing recipes

Everything lives in `js/recipes.js`. Add an object with the fields documented at the top of that file, then run:

```sh
npm run validate      # checks ids, enums, required fields, time formats
```

Keep each recipe's `id` stable once published — it is what favourites, share links and search engines key on.

### Changing styles

Utility classes come from a **static Tailwind v3 build** committed as `css/tailwind.css` (about 18 KB) instead of the runtime Tailwind CDN. If you add or change a utility class in `index.html` or `js/app.js`, regenerate it:

```sh
npm install           # once
npm run build:css     # regenerate css/tailwind.css (CI fails if it is stale)
npm run watch:css     # or rebuild on every save while you work
```

Anything that isn't a utility class goes in `css/styles.css` and needs no build.

### Running locally and testing

```sh
npm run serve         # http://localhost:8080 with the same headers as production
npm test              # end-to-end smoke tests in headless Chromium (Playwright)
```

The tests cover rendering, filters, search, favourites (including migration from the old name-based format), keyboard access, the mobile sheet, deep links, offline loading via the service worker, running from `file://`, structured data and a zero-console-error check under the production Content Security Policy. CI runs them on every push.

Part of the projects at [annasrahman.com](https://annasrahman.com).
