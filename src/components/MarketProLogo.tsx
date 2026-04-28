export function MarketProLogo({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/Perfil-8.png"
      width={size}
      height={size}
      alt="MarketProAds"
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
