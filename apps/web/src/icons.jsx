import React from "react";
const paths = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  courses:
    "M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z M20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h3z",
  calendar: "M5 5h14v16H5z M8 2v6 M16 2v6 M5 10h14 M9 14h2 M14 14h2 M9 17h2",
  records: "M5 3h14v18H5z M9 8h6 M9 12h6 M9 16h4",
  profile: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2",
  research: "M9 3h6 M10 3v7L4 20h16l-6-10V3 M7 15h10",
  services: "M4 7h16v14H4z M8 7V3h8v4 M4 12h16 M10 11v3h4v-3",
  ai: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M15 15l6 6",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  external: "M14 3h7v7 M21 3l-9 9 M10 4H4v16h16v-6",
  link: "M10 13a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-3 3 M14 11a4 4 0 0 0-6 0l-4 4a4 4 0 0 0 6 6l3-3",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  check: "M4 12l5 5L20 6",
  logout: "M9 3H4v18h5 M10 12h11 M16 7l5 5-5 5",
  clock: "M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  eyeOff:
    "M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9 M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2",
  chevron: "M6 9l6 6 6-6",
  help: "M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
};
export function Icon({ name, size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.records} />
    </svg>
  );
}
