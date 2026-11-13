export default function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="var(--logo-bg)" />
      <path
        d="M14 40c4-14 14-22 26-22 6 0 10 3 10 8 0 6-6 9-12 7 3-1 5-3 5-6 0-3-3-4-6-4-9 0-16 7-19 17z"
        fill="var(--accent)"
      />
      <path
        d="M12 46c8 3 14-3 20 0s12 3 20 0"
        stroke="var(--accent-soft)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}
