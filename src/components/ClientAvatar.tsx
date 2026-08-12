import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

/**
 * Logo do cliente com queda para as iniciais.
 *
 * Boa parte dos logo_url vem da foto da Pagina do Facebook, e essa URL do
 * scontent.*.fbcdn.net e assinada: expira com o tempo e costuma recusar
 * hotlink de origem desconhecida. Com <img> puro isso vira o icone de imagem
 * quebrada; o AvatarImage do Radix so aparece quando a imagem carrega de fato,
 * entao o fallback assume sozinho. O referrerPolicy evita parte das recusas.
 */
export function ClientAvatar({
  name,
  logoUrl,
  className = "h-10 w-10",
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={`${className} shrink-0 border border-border/60`}>
      {logoUrl && <AvatarImage src={logoUrl} alt={name} referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
        {iniciais(name)}
      </AvatarFallback>
    </Avatar>
  );
}
