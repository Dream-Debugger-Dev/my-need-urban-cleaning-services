# MyNeedUrban Cleaning Services — Website

Modern, single-page marketing site built with plain HTML, CSS and JavaScript.

## Structure

```
myneedurban/
├── index.html          # All page sections
├── css/
│   └── style.css       # All styles (modern teal/mint palette)
├── js/
│   └── main.js         # Scrollspy, reveal animations, before/after slider, form
└── README.md
```

## Run locally

Just open `index.html` in a browser. No build step required.

Or, from the project folder, serve it with any static server, e.g.:

```bash
# Python 3
python -m http.server 5173

# or Node (npx)
npx serve .
```

Then visit http://localhost:5173

## What's included

- Sticky, blur-glass header with mobile nav
- Hero with trust strip and call/quote CTAs
- About, Services (12 cards), Pricing (3 packages), Why Choose Us
- Draggable Before/After gallery
- Team, Reviews, FAQ
- Contact form + Google Maps embed (Nanakramguda, 15 km service area)
- Footer with social placeholders
- Floating WhatsApp button
- Scrollspy + reveal animations
- Basic SEO meta + LocalBusiness JSON-LD schema

## Things to replace when ready

- Swap the stock Unsplash image URLs for your own photos
- Replace the `MNU` text mark in the header/footer with a real logo file
- Update social URLs in the footer (`#` placeholders)
- Wire `contactForm` in `js/main.js` to a real backend (Formspree, your API, etc.)
