import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function Auth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo de volta!");
    navigate("/");
  }

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: String(fd.get("name")) },
      },
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Você já pode entrar.");
  }

  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      <div className="pointer-events-none absolute inset-0 bg-gradient-glow" />

      {/* Left brand panel */}
      <div className="relative hidden flex-col justify-between bg-gradient-primary p-10 lg:flex">
        <div className="flex items-center gap-3 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/20 backdrop-blur">
            <Flame className="h-6 w-6" />
          </div>
          <span className="text-lg font-semibold tracking-tight">MarketProAds</span>
        </div>
        <div className="space-y-4 text-white">
          <h1 className="text-4xl font-bold leading-tight">
            Gerencie suas campanhas Meta Ads como um profissional.
          </h1>
          <p className="text-white/80">
            Dashboards em tempo real, alertas inteligentes e drill-down completo de campanhas, conjuntos e anúncios.
          </p>
        </div>
        <div className="text-xs text-white/70">© 2026 MarketProAds</div>
      </div>

      {/* Right form */}
      <div className="relative flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary">
              <Flame className="h-5 w-5 text-white" />
            </div>
            <span className="font-semibold">MarketProAds</span>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6 space-y-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Bem-vindo de volta</h2>
                <p className="text-sm text-muted-foreground">Entre com seu email e senha.</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" name="email" type="email" required placeholder="voce@empresa.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input id="login-password" name="password" type="password" required minLength={6} />
                </div>
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6 space-y-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Criar conta</h2>
                <p className="text-sm text-muted-foreground">
                  O primeiro usuário cadastrado vira Owner da plataforma.
                </p>
              </div>
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nome completo</Label>
                  <Input id="signup-name" name="name" required placeholder="João Silva" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input id="signup-email" name="email" type="email" required placeholder="voce@empresa.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input id="signup-password" name="password" type="password" required minLength={6} />
                </div>
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? "Criando..." : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
