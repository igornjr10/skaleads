export function MarketProLogo({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="100" height="100" rx="18" fill="#F97316" />

      {/* Main eagle silhouette */}
      <path
        fill="#111"
        d="
          M 50,10
          L 62,12 L 70,18 L 80,20
          L 90,30 L 84,40
          L 93,37 L 85,50
          L 74,57 L 62,66
          L 52,82 L 38,90
          L 26,86 L 20,72
          L 14,59 L 21,46
          L 12,36 L 22,26
          L 32,16 L 42,11
          Z
        "
      />

      {/* Crest highlight — angular feather break */}
      <path
        fill="#F97316"
        opacity="0.85"
        d="M 42,11 L 52,10 L 48,22 L 38,24 Z"
      />

      {/* Eye */}
      <path
        fill="#F97316"
        d="M 74,24 L 81,20 L 83,30 L 76,34 Z"
      />

      {/* Beak gap detail */}
      <path
        fill="#F97316"
        opacity="0.7"
        d="M 84,40 L 93,37 L 90,46 L 82,46 Z"
      />
    </svg>
  );
}
