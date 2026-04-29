import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { BarChart3, Bell, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const features = [
  { icon: BarChart3, text: "Dashboards em tempo real" },
  { icon: Bell, text: "Alertas inteligentes automaticos" },
  { icon: Zap, text: "Drill-down completo de campanhas" },
  { icon: Shield, text: "Auditoria avancada de conta Meta" },
];

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
    toast.success("Conta criada! Voce ja pode entrar.");
  }

  const inputCls =
    "bg-white/5 border-white/10 text-white placeholder:text-white/25 " +
    "focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/30 h-11 rounded-xl transition-colors";

  const labelCls = "text-[11px] uppercase tracking-widest text-white/50 font-semibold";

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#080808]">
      <div className="relative flex flex-col justify-between p-12 lg:w-1/2 xl:w-[55%] overflow-hidden min-h-[420px] lg:min-h-screen">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_25%_65%,rgba(249,115,22,0.13)_0%,transparent_70%)]" />

        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="absolute right-0 inset-y-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

        <div className="relative flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-orange-500/30 blur-md scale-110" />
            <img
              src="/Perfil-8.png"
              width={46}
              height={46}
              alt="MarketProAds"
              className="relative rounded-2xl ring-1 ring-orange-500/30"
            />
          </div>
          <div className="flex flex-col leading-none gap-0.5">
            <span className="text-white font-extrabold text-[17px] tracking-tight">
              MarketPro<span className="text-orange-400">Ads</span>
            </span>
            <span className="text-[10px] tracking-[0.22em] uppercase font-semibold text-orange-500/60">
              Manager
            </span>
          </div>
        </div>

        <div className="relative space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-[11px] text-orange-400 font-semibold tracking-wide">
              Meta Ads Manager Profissional
            </span>
          </div>

          <h1 className="text-[32px] font-extrabold text-white leading-[1.2] tracking-tight">
            Gerencie suas campanhas
            <br />
            Meta Ads
            <br />
            <span className="text-orange-400">como um profissional.</span>
          </h1>

          <div className="space-y-3">
            {features.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <Icon className="h-3.5 w-3.5 text-orange-400" />
                </div>
                <span className="text-[13px] text-white/55 font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] text-white/25">© 2026 MarketProAds</p>
      </div>

      <div className="relative flex flex-1 flex-col justify-center items-center p-10 bg-[#0c0c0c]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_40%,rgba(249,115,22,0.05)_0%,transparent_70%)]" />

        <div className="relative w-full max-w-[360px]">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-white/5 border border-white/10 rounded-xl p-1 mb-7 h-10">
              <TabsTrigger
                value="login"
                className="rounded-lg text-white/50 text-[13px] font-semibold transition-all duration-200 data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
              >
                Entrar
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="rounded-lg text-white/50 text-[13px] font-semibold transition-all duration-200 data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
              >
                Criar conta
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-0 space-y-5">
              <div className="space-y-1">
                <h2 className="text-[22px] font-bold text-white tracking-tight">Bem-vindo de volta</h2>
                <p className="text-[13px] text-white/35">Entre com suas credenciais para continuar.</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email" className={labelCls}>Email</Label>
                  <Input
                    id="login-email"
                    name="email"
                    type="email"
                    required
                    placeholder="voce@empresa.com"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password" className={labelCls}>Senha</Label>
                  <Input
                    id="login-password"
                    name="password"
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    className={inputCls}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-11 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl shadow-lg hover:shadow-orange-500/40 transition-all duration-200 mt-1"
                >
                  {submitting ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-0 space-y-5">
              <div className="space-y-1">
                <h2 className="text-[22px] font-bold text-white tracking-tight">Criar conta</h2>
                <p className="text-[13px] text-white/35">O primeiro usuario cadastrado vira Owner da plataforma.</p>
              </div>
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="signup-name" className={labelCls}>Nome completo</Label>
                  <Input
                    id="signup-name"
                    name="name"
                    required
                    placeholder="Joao Silva"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email" className={labelCls}>Email</Label>
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    required
                    placeholder="voce@empresa.com"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-password" className={labelCls}>Senha</Label>
                  <Input
                    id="signup-password"
                    name="password"
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    className={inputCls}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-11 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl shadow-lg hover:shadow-orange-500/40 transition-all duration-200 mt-1"
                >
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
