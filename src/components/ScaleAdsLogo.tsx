import { useId } from "react";

type ScaleAdsLogoProps = {
  size?: number;
  className?: string;
  title?: string;
};

export function ScaleAdsLogo({ size = 36, className = "", title = "Scale Ads" }: ScaleAdsLogoProps) {
  const uid = useId().replace(/:/g, "");
  const tile = `tile-${uid}`;
  const sheen = `sheen-${uid}`;

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
        <linearGradient id={tile} x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2BE49B" />
          <stop offset="55%" stopColor="#12CD92" />
          <stop offset="100%" stopColor="#0B8F7E" />
        </linearGradient>
        <linearGradient id={sheen} x1="24" y1="0" x2="24" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="48" height="48" rx="13" fill={`url(#${tile})`} />
      <rect width="48" height="48" rx="13" fill={`url(#${sheen})`} />
      <rect x="0.6" y="0.6" width="46.8" height="46.8" rx="12.4" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="1.2" />

      <path
        d="M12 25.5 L21.5 19 L33.5 10.5"
        stroke="#FFFFFF"
        strokeOpacity="0.45"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="33.5" cy="10.5" r="2.6" fill="#FFFFFF" />

      <rect x="10.5" y="28" width="6.5" height="9.5" rx="3.25" fill="#FFFFFF" fillOpacity="0.55" />
      <rect x="20.75" y="22" width="6.5" height="15.5" rx="3.25" fill="#FFFFFF" fillOpacity="0.78" />
      <rect x="31" y="15.5" width="6.5" height="22" rx="3.25" fill="#FFFFFF" />
    </svg>
  );
}
