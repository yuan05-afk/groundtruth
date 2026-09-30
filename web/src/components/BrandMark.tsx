/** Survey crosshair: claim baseline vs ground pin. Black/white only. */
export function BrandMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="30" height="30" stroke="currentColor" strokeWidth="1.5" />
      <line x1="16" y1="4" x2="16" y2="28" stroke="currentColor" strokeWidth="1.25" />
      <line x1="4" y1="16" x2="28" y2="16" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="16" cy="16" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
    </svg>
  )
}
