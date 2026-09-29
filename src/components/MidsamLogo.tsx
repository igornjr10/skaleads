import { useId } from "react";

type MidsamLogoProps = {
  size?: number;
  className?: string;
  title?: string;
};

export function MidsamLogo({ size = 36, className = "", title = "Midsam Business" }: MidsamLogoProps) {
  const uid = useId().replace(/:/g, "");
  const tile = `tile-${uid}`;
  const orbitMask = `orbit-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient id={tile} x1="6" y1="0" x2="42" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#004BB0" />
          <stop offset="55%" stopColor="#013A8A" />
          <stop offset="100%" stopColor="#01224F" />
        </linearGradient>
        {/* a orbita passa por tras da elipse principal: recorta ela com folga */}
        <mask id={orbitMask} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="#FFFFFF" />
          <ellipse cx="0" cy="0" rx="16.4" ry="8.7" fill="#000000" transform="translate(24 24) rotate(45)" />
        </mask>
      </defs>

      <rect width="48" height="48" rx="11" fill={`url(#${tile})`} />

      <g transform="translate(24 24) scale(0.84) translate(-24 -24)">
      <g stroke="#DCE8FA" strokeWidth="2.4" fill="none">
        <g mask={`url(#${orbitMask})`}>
          <ellipse cx="24" cy="24" rx="9.8" ry="15.2" transform="rotate(45 24 24)" />
        </g>
        <g transform="translate(24 24) rotate(45)">
          <ellipse cx="0" cy="0" rx="14.2" ry="6.5" />
          <path d="M -5 -3.4 Q -6.4 0 -5 3.4" />
          <path d="M 5 -3.4 Q 6.4 0 5 3.4" />
        </g>
      </g>

      <path
        d="M24 20.6 Q24.6 23.4 27.4 24 Q24.6 24.6 24 27.4 Q23.4 24.6 20.6 24 Q23.4 23.4 24 20.6 Z"
        fill="#DCE8FA"
      />
      </g>
    </svg>
  );
}
