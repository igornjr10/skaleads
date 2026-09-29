import { MarketProLogo } from "./MarketProLogo";
import { useAuth } from "@/hooks/useAuth";

/** Logo da empresa do usuario; sem logo cadastrado, o da plataforma. */
export function LogoEmpresa({ size = 36, className = "" }: { size?: number; className?: string }) {
  const { empresa } = useAuth();
  if (!empresa?.logo_url) return <MarketProLogo size={size} className={className} />;
  return (
    <img
      src={empresa.logo_url}
      alt={nomeDaMarca(empresa)}
      width={size}
      height={size}
      className={`object-contain bg-white/[0.04] ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function nomeDaMarca(empresa: { nome_exibicao: string | null; name: string } | null): string {
  return empresa?.nome_exibicao?.trim() || empresa?.name || "Scale Ads";
}
