import type { Icon } from '@epam/uui-core';

/**
 * Inline SVG icon components compatible with the UUI `Icon` type (`React.FC<any>`).
 *
 * These replace the third-party icons previously used across the desktop app.
 * Each icon accepts optional `style` props and renders an SVG at 1em × 1em,
 * matching UUI's expectation for icon components.
 */

export const SearchIcon: Icon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx={11} cy={11} r={8} />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const FolderOpenIcon: Icon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
  </svg>
);

export const ArrowLeftIcon: Icon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
);

export const SunIcon: Icon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 17c-1.383 0-2.563-.488-3.537-1.463C7.488 14.563 7 13.383 7 12s.487-2.563 1.463-3.537C9.438 7.488 10.617 7 12 7s2.563.487 3.537 1.463C16.512 9.438 17 10.617 17 12s-.488 2.563-1.463 3.537C14.563 16.512 13.383 17 12 17zm-7-4H1v-2h4v2zm18 0h-4v-2h4v2zM11 5V1h2v4h-2zm0 18v-4h2v4h-2zM6.4 7.75L3.875 5.325 5.3 3.85l2.4 2.5-1.3 1.4zm12.3 12.4l-2.425-2.525L17.6 16.25l2.525 2.425L18.7 20.15zM16.25 6.4l2.425-2.525L20.15 5.3l-2.5 2.4-1.4-1.3zM3.85 18.7l2.525-2.425L7.75 17.6l-2.425 2.525L3.85 18.7z" />
  </svg>
);

export const MoonIcon: Icon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 21c-2.5 0-4.625-.875-6.375-2.625S3 14.5 3 12s.875-4.625 2.625-6.375S9.5 3 12 3a9.304 9.304 0 011.35.1 5.292 5.292 0 00-1.637 1.887A5.31 5.31 0 0011.1 7.5c0 1.5.525 2.775 1.575 3.825C13.725 12.375 15 12.9 16.5 12.9a5.28 5.28 0 002.525-.613A5.322 5.322 0 0020.9 10.65 8.505 8.505 0 0121 12c0 2.5-.875 4.625-2.625 6.375S14.5 21 12 21z" />
  </svg>
);
