// The Mortar logo: the mark (a body of three bricks, the middle one slid out
// as it is edited) and the wordmark (Instrument Sans Bold, outlined, so no
// font loads). The bars and the wordmark take the text colour; the middle
// brick is the brand green. `faviconHref` is the mark alone as a data URL,
// with its own light and dark colours.
import styles from './Logo.module.css';

const WORDMARK =
  'M1.6 23.04V0H9.28L15.68 22.21H12.9L19.3 0H27.01V23.04H22.14V1.38H22.98L16.74 23.04H11.65L5.47 1.57H6.27V23.04Z M37.31 23.36Q34.62 23.36 32.59 22.29Q30.56 21.22 29.42 19.28Q28.29 17.34 28.29 14.82Q28.29 12.29 29.42 10.4Q30.56 8.51 32.59 7.46Q34.62 6.4 37.31 6.4Q40.03 6.4 42.06 7.46Q44.1 8.51 45.22 10.4Q46.34 12.29 46.34 14.82Q46.34 17.34 45.2 19.28Q44.06 21.22 42.03 22.29Q40 23.36 37.31 23.36ZM37.31 19.58Q38.43 19.58 39.34 19.01Q40.26 18.43 40.8 17.36Q41.34 16.29 41.34 14.78Q41.34 12.58 40.18 11.38Q39.01 10.18 37.31 10.18Q35.62 10.18 34.45 11.39Q33.28 12.61 33.28 14.78Q33.28 16.29 33.82 17.36Q34.37 18.43 35.28 19.01Q36.19 19.58 37.31 19.58Z M47.94 23.04V6.72H52.64V10.56H52.74V23.04ZM52.74 14.53 52.32 10.66Q52.9 8.58 54.21 7.49Q55.52 6.4 57.47 6.4Q58.08 6.4 58.37 6.53V11.01Q58.21 10.94 57.92 10.93Q57.63 10.91 57.22 10.91Q54.91 10.91 53.82 11.73Q52.74 12.54 52.74 14.53Z M67.46 23.39Q64.32 23.39 62.8 21.87Q61.28 20.35 61.28 17.25V3.07L66.08 1.28V17.41Q66.08 18.5 66.69 19.04Q67.3 19.58 68.58 19.58Q69.06 19.58 69.47 19.49Q69.89 19.39 70.3 19.26V22.91Q69.89 23.14 69.14 23.26Q68.38 23.39 67.46 23.39ZM58.24 10.37V6.72H70.3V10.37Z M82.5 23.04Q82.3 22.34 82.22 21.54Q82.14 20.74 82.14 19.68H82.02V11.97Q82.02 10.98 81.36 10.42Q80.7 9.86 79.42 9.86Q78.21 9.86 77.49 10.27Q76.77 10.69 76.54 11.49H71.97Q72.29 9.28 74.24 7.84Q76.19 6.4 79.58 6.4Q83.1 6.4 84.96 7.97Q86.82 9.54 86.82 12.48V19.68Q86.82 20.48 86.93 21.3Q87.04 22.11 87.3 23.04ZM76.8 23.36Q74.37 23.36 72.93 22.13Q71.49 20.9 71.49 18.85Q71.49 16.58 73.2 15.18Q74.91 13.79 77.98 13.38L82.75 12.7V15.49L78.78 16.1Q77.5 16.29 76.9 16.8Q76.29 17.31 76.29 18.21Q76.29 19.01 76.86 19.42Q77.44 19.84 78.4 19.84Q79.9 19.84 80.96 19.02Q82.02 18.21 82.02 17.12L82.46 19.68Q81.76 21.5 80.32 22.43Q78.88 23.36 76.8 23.36Z M89.54 23.04V6.72H94.24V10.56H94.34V23.04ZM94.34 14.53 93.92 10.66Q94.5 8.58 95.81 7.49Q97.12 6.4 99.07 6.4Q99.68 6.4 99.97 6.53V11.01Q99.81 10.94 99.52 10.93Q99.23 10.91 98.82 10.91Q96.51 10.91 95.42 11.73Q94.34 12.54 94.34 14.53Z';

/** The logo: mark and wordmark, labelled "Mortar". */
export function Logo() {
  return (
    <svg class={styles.logo} viewBox="3 3 133 26" role="img" aria-label="Mortar">
      <rect x="3" y="4" width="22" height="6.5" rx="2" />
      <rect class={styles.accent} x="7" y="12.75" width="22" height="6.5" rx="2" />
      <rect x="3" y="21.5" width="22" height="6.5" rx="2" />
      <path transform="translate(35.4 4.96)" d={WORDMARK} />
    </svg>
  );
}

const FAVICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<style>.a{fill:#1b1d22}.b{fill:#047857}@media (prefers-color-scheme:dark){.a{fill:#e7e9ee}.b{fill:#34d399}}</style>' +
  '<rect class="a" x="3" y="4" width="22" height="6.5" rx="2"/>' +
  '<rect class="b" x="7" y="12.75" width="22" height="6.5" rx="2"/>' +
  '<rect class="a" x="3" y="21.5" width="22" height="6.5" rx="2"/>' +
  '</svg>';

/** The mark as an SVG data URL for `<link rel="icon">`; it follows the system's light or dark mode. */
export const faviconHref = `data:image/svg+xml,${encodeURIComponent(FAVICON)}`;
