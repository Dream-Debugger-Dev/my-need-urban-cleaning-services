# Themes

## `original/` — the permanent brand theme (Navy · Electric Blue · Orange)

`original/style.css` and `original/animations.css` are **byte-identical, pristine copies** of the
site's core stylesheets, kept as a safety net. Nothing references them at runtime — they exist so the
original look can always be restored.

## How theming works

The core stylesheets (`css/style.css`, `css/animations.css`) are **never modified** by a seasonal
theme. Seasonal themes are **additive override layers** scoped to a `data-theme` attribute on `<html>`:

```html
<html data-theme="independence">   <!-- tricolour theme active -->
<html data-theme="original">       <!-- default brand theme    -->
```

Every rule in `independence.css` is scoped under `[data-theme="independence"]`, so with the attribute
absent or set to `original` the site renders exactly as it always has.

The theme is remembered in `localStorage` under the key `mnu-theme`, and users can switch with the
floating tricolour toggle (bottom-right, above the WhatsApp button).

## Restoring the original theme

Pick whichever applies:

1. **Just switch it off (no code change)** — click the theme toggle, or run in the console:
   ```js
   localStorage.setItem('mnu-theme', 'original'); location.reload();
   ```

2. **Make original the default for everyone** — in `index.html`, change the `<html>` tag to
   `data-theme="original"`. The festive layer stays available but is off by default.

3. **Remove the seasonal theme entirely** (e.g. after 15 August) — delete these lines from
   `index.html`:
   ```html
   <link rel="stylesheet" href="css/independence.css" />
   <script src="js/independence.js" defer></script>
   ```
   plus the `<div id="idBanner">`, `<canvas id="idCanvas">` and `#idThemeToggle` blocks. Then
   optionally delete `css/independence.css` and `js/independence.js`.

4. **Nuclear option** — copy `original/style.css` and `original/animations.css` back over
   `css/style.css` and `css/animations.css`.

Because the core files are untouched, option 1 or 2 is normally all you need.
