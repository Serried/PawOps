const PATHS = {
  paw: (
    <>
      <circle cx="5.2" cy="10.2" r="1.9" />
      <circle cx="9.2" cy="5.8" r="1.9" />
      <circle cx="14.8" cy="5.8" r="1.9" />
      <circle cx="18.8" cy="10.2" r="1.9" />
      <path d="M12 11.5c-3 0-5.6 3.6-5.6 6.2 0 1.8 1.4 2.5 3 2.1 1-.3 1.7-.5 2.6-.5s1.6.2 2.6.5c1.6.4 3-.3 3-2.1 0-2.6-2.6-6.2-5.6-6.2Z" />
    </>
  ),
  'paw-solid': (
    <>
      <circle cx="4.8" cy="10" r="2.3" />
      <circle cx="9" cy="5.2" r="2.3" />
      <circle cx="15" cy="5.2" r="2.3" />
      <circle cx="19.2" cy="10" r="2.3" />
      <path d="M12 10.8c-3.3 0-6.2 4-6.2 6.9 0 2 1.6 2.8 3.4 2.3 1.1-.3 1.9-.5 2.8-.5s1.7.2 2.8.5c1.8.5 3.4-.3 3.4-2.3 0-2.9-2.9-6.9-6.2-6.9Z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="m15 18-6-6 6-6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.3 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4M12 17h.01" />
    </>
  ),
  upload: <path d="M12 16V5m0 0-4 4m4-4 4 4M5 19h14" />,
  feeding: (
    <>
      <path d="M4 12h16a8 8 0 0 1-16 0Z" />
      <path d="M9 5.5c0 1 .8 1.5.8 2.5M13 5.5c0 1 .8 1.5.8 2.5" />
    </>
  ),
  water: <path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5Z" />,
  walk: (
    <>
      <path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  medication: (
    <>
      <rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 12)" />
      <path d="m9.5 9.5 5 5" />
    </>
  ),
  vet_visit: (
    <>
      <path d="M6 4v5a4 4 0 0 0 8 0V4" />
      <path d="M10 13v2a4 4 0 0 0 8 0v-1.5" />
      <circle cx="18" cy="11.5" r="2" />
    </>
  ),
  grooming: (
    <>
      <circle cx="6.5" cy="7" r="2.5" />
      <circle cx="6.5" cy="17" r="2.5" />
      <path d="M8.6 8.4 19 16M8.6 15.6 19 8" />
    </>
  ),
}

export function Icon({ name, size = 18, className = '', title }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === 'paw-solid' ? 'currentColor' : 'none'}
      stroke={name === 'paw-solid' ? 'none' : 'currentColor'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {PATHS[name] ?? PATHS.paw}
    </svg>
  )
}
