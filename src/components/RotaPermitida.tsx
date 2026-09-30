import { Link, Navigate, useLocation } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { MODULOS, moduloDaRota } from "@/lib/permissoes";

/**
 * Esconder o item do menu nao basta: link direto ou favorito abririam a tela.
 * O dado em si ja e barrado pela RLS; isto evita a tela quebrada/vazia.
 */
export function RotaPermitida({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { role, modulos, pode } = useAuth();
  const modulo = moduloDaRota(pathname);

  // Papel ainda chegando logo depois do login: nao julgar antes da resposta.
  if (role === null) return null;
  if (!modulo || pode(modulo)) return <>{children}</>;

  const destino = MODULOS.find(m => modulos.includes(m.key))?.rotas[0] ?? "/settings";

  // O login sempre manda para /dashboard; quem nao tem o modulo (designer,
  // SDR) vai direto para a primeira area dele em vez de ver o cadeado.
  if (pathname === "/dashboard") return <Navigate to={destino} replace />;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted/40">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Sem acesso a esta área</h1>
        <p className="text-sm text-muted-foreground">
          Este módulo não está liberado para o seu perfil. Peça ao ADM da sua empresa para liberar.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to={destino}>Voltar</Link>
      </Button>
    </div>
  );
}
