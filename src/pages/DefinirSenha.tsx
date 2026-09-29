import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { LogoEmpresa, nomeDaMarca } from "@/components/MarcaEmpresa";

const MINIMO = 8;

// Destino do link de convite. Quem chega aqui ja esta logado: o supabase-js le
// o token do link sozinho. Falta so escolher a senha para os proximos acessos.
export default function DefinirSenha() {
  const { user, empresa, loading } = useAuth();
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (loading) return null;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-semibold">Link inválido ou expirado</h1>
          <p className="text-sm text-muted-foreground">
            Peça ao ADM da sua empresa um convite novo. Se você já definiu sua senha, é só entrar.
          </p>
          <Button asChild variant="outline"><Link to="/auth">Ir para o login</Link></Button>
        </div>
      </div>
    );
  }

  const erro =
    senha.length > 0 && senha.length < MINIMO ? `A senha precisa de pelo menos ${MINIMO} caracteres`
    : confirmacao.length > 0 && confirmacao !== senha ? "As senhas não conferem"
    : null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (erro || senha.length < MINIMO || senha !== confirmacao) return;
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Senha definida. Bem-vindo!");
    navigate("/dashboard", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form onSubmit={salvar} className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="flex flex-col items-center gap-3 text-center">
          <LogoEmpresa size={48} className="rounded-xl" />
          <div>
            <h1 className="text-lg font-semibold">Defina sua senha</h1>
            <p className="text-sm text-muted-foreground">
              {user.email} · {nomeDaMarca(empresa)}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="senha">Senha</Label>
          <Input id="senha" type="password" autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmacao">Repita a senha</Label>
          <Input id="confirmacao" type="password" autoComplete="new-password" value={confirmacao} onChange={e => setConfirmacao(e.target.value)} />
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <Button type="submit" className="w-full" disabled={salvando || !!erro || senha.length < MINIMO || senha !== confirmacao}>
          {salvando ? "Salvando..." : "Salvar e entrar"}
        </Button>
      </form>
    </div>
  );
}
