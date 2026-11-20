// Ekpoma Life chess pieces: our own flat SVG set (45×45). Colours come from CSS variables
// (--pf fill, --ps outline, --ph highlight) so one set serves both sides and both themes.
const A = 'fill="var(--pf)" stroke="var(--ps)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"'
const L = 'fill="none" stroke="var(--ph)" stroke-width="1.4" stroke-linecap="round"'

const BASE = `<path ${A} d="M10.5 40.5h24v-3.2c0-1.4-1-2.3-2.3-2.3h-19.4c-1.3 0-2.3.9-2.3 2.3z"/>`

const BODY = {
  p: `<circle ${A} cx="22.5" cy="12.5" r="5.6"/>
      <path ${A} d="M16 21.5h13c.4 3.4 2.6 6 4.4 9.5H11.6c1.8-3.5 4-6.1 4.4-9.5z"/>
      <path ${A} d="M12 31h21v4H12z"/>
      <path ${L} d="M20 11.2c.6-1.4 1.8-2 3-1.9"/>`,
  r: `<path ${A} d="M12 10h4.4v3h3.2v-3h5.8v3h3.2v-3H33v7.5H12z"/>
      <path ${A} d="M14.5 17.5h16l1 12.5h-18z"/>
      <path ${A} d="M12 30h21v5H12z"/>
      <path ${L} d="M17 21v7"/>`,
  n: `<path ${A} d="M12.5 35c-.6-9 2-14.5 8.7-18.4-1.4-1-2.2-2.8-1.9-5 2.1.8 3.4.8 4.6-.2 1.6-1.9 3.4-2.9 5.3-3 .5 3 1.7 4.2 3 8.3 1.3 4.1 1.6 10.5 1.4 18.3z"/>
      <path ${A} d="M20.4 16.5c-3.2 1.8-6.9 4-8.1 8.1 2.4.6 4.1-.7 5.3-2.4"/>
      <circle cx="25.3" cy="13.2" r="1.3" fill="var(--ps)"/>
      <path ${L} d="M29 17.5c1 2.5 1.2 6 .8 10"/>`,
  b: `<circle ${A} cx="22.5" cy="8.6" r="2.4"/>
      <path ${A} d="M22.5 11c-5.2 3.8-8.6 8.3-8.6 13.6 0 3 1.7 5.2 3.7 6.4h9.8c2-1.2 3.7-3.4 3.7-6.4 0-5.3-3.4-9.8-8.6-13.6z"/>
      <path ${A} d="M13.5 31h18v4h-18z"/>
      <path d="M19.4 19.2l6.2 6.2" stroke="var(--ps)" stroke-width="1.7" stroke-linecap="round"/>`,
  q: `<path ${A} d="M9.5 15.5l5.2 14.5h15.6l5.2-14.5-7.6 8-5.4-12-5.4 12z"/>
      <circle ${A} cx="9.5" cy="13.5" r="2.5"/><circle ${A} cx="16.5" cy="9.5" r="2.5"/><circle ${A} cx="22.5" cy="8" r="2.5"/><circle ${A} cx="28.5" cy="9.5" r="2.5"/><circle ${A} cx="35.5" cy="13.5" r="2.5"/>
      <path ${A} d="M13.5 30h18v5h-18z"/>
      <path ${L} d="M18 27h9"/>`,
  k: `<path ${A} d="M21 3.4h3v3h3v3h-3v3h-3v-3h-3v-3h3z"/>
      <path ${A} d="M22.5 13c-6.6 0-11 4.2-11 9.8 0 4.2 2.7 6.4 3.6 8.2h14.8c.9-1.8 3.6-4 3.6-8.2 0-5.6-4.4-9.8-11-9.8z"/>
      <path ${A} d="M13.5 31h18v4h-18z"/>
      <path ${L} d="M17.5 21.5c1.2-2 3-3 5-3"/>`,
}

/** Markup for one piece. type: p n b r q k, color: w b. */
export function pieceSvg(type, color, cls = 'pc') {
  return `<svg class="${cls} ${color}" viewBox="0 0 45 45" aria-hidden="true">${BODY[type]}${BASE.replace('M10.5 40.5', 'M10.5 40.5')}</svg>`
}
