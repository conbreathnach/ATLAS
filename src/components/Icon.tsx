const PATHS: Record<string, string> = {
  search: "m20 20-4.3-4.3m1.3-5.2a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z",
  models:
    "M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v13A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5v-13ZM9 7h6m-6 4h6m-6 4h3",
  plus: "M12 5v14M5 12h14",
  send: "M12 19V5m0 0-6 6m6-6 6 6",
  spark: "m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Z",
  trash:
    "M3 6h18M8 6v-1.2c0-.9.7-1.8 1.8-1.8h4.4c1.1 0 1.8.9 1.8 1.8V6m-1 0v13c0 1.1-.9 2-2 2H11c-1.1 0-2-.9-2-2V6m2 4v7m4-7v7",
  stop: "M7 7h10v10H7z",
  copy: "M8 8h10v12H8zM6 16H4V4h12v2",
  check: "m4 12.5 5 5L20 6.5",
  refresh: "M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.5-3a7.5 7.5 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5L9 5.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.7 7.7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.5 2.6h5l.5-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2Z",
  pencil: "M4 20h4l11-11-4-4L4 16v4Zm13.5-14.5 1.5 1.5",
  close: "M6 6l12 12M18 6 6 18",
  chevron: "m9 6 6 6-6 6",
  cpu: "M9 9h6v6H9zM4 4h16v16H4zM9 1v3m6-3v3M9 20v3m6-3v3M1 9h3m-3 6h3m16-6h3m-3 6h3",
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
