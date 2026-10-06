import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { MidsamLogo } from "@/components/MidsamLogo";

// Destino do link de confirmacao. Sem a variavel, quem cria conta rodando o
// app local manda para o proprio localhost — e o e-mail chega no usuario com um
// link que so abre na maquina de quem cadastrou.
const SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || window.location.origin;
const EMAIL_REDIRECT_TO = `${SITE_URL.replace(/\/$/, "")}/auth`;

// O convite ja cria a conta: quem foi convidado e usa "Criar conta" cai na
// confirmacao por e-mail em vez de entrar. O caminho certo e o link do ADM.
const CONVIDADO_USE_O_LINK =
  "Foi convidado pela sua empresa? Entre pelo link que o ADM te mandou. Se ele venceu, peça um novo em Equipe.";

export default function Auth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: String(fd.get("password")),
    });
    setSubmitting(false);
    if (error) {
      // O Supabase devolve "Email not confirmed" em ingles e sem saida — sem
      // tratar isso o usuario fica travado sem saber que falta confirmar.
      if (error.message.toLowerCase().includes("email not confirmed")) {
        setUnconfirmedEmail(email);
        return toast.error(CONVIDADO_USE_O_LINK);
      }
      return toast.error(error.message);
    }
    setUnconfirmedEmail(null);
    toast.success("Bem-vindo de volta!");
    navigate("/dashboard");
  }

  async function resendConfirmation() {
    if (!unconfirmedEmail) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: unconfirmedEmail,
      options: { emailRedirectTo: EMAIL_REDIRECT_TO },
    });
    setResending(false);
    if (error) return toast.error(error.message);
    toast.success(`Link de confirmacao reenviado para ${unconfirmedEmail}`);
  }

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const { data, error } = await supabase.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: EMAIL_REDIRECT_TO,
        data: { full_name: String(fd.get("name")) },
      },
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    // Com a confirmacao de e-mail desligada no projeto, o signUp ja devolve
    // sessao e o usuario entra direto — prometer um link que nunca chega deixa
    // ele esperando. So a ausencia de sessao significa que falta confirmar.
    if (data.session) {
      toast.success("Conta criada! Voce ja esta dentro.");
      return navigate("/dashboard");
    }
    toast.success("Conta criada! Confirme o link enviado para o seu e-mail antes de entrar.", {
      description: CONVIDADO_USE_O_LINK,
      duration: 12000,
    });
  }

  const inputCls =
    "bg-white/5 border-white/10 text-white placeholder:text-white/25 " +
    "focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 h-11 rounded-xl transition-colors";

  const labelCls = "text-[11px] uppercase tracking-widest text-white/50 font-semibold";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070707] flex flex-col items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_0%,rgba(59,130,246,0.22)_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_35%_at_50%_100%,rgba(59,130,246,0.08)_0%,transparent_70%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative w-full max-w-[400px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-blue-500/30 blur-xl scale-125" />
            <MidsamLogo
              size={76}
              className="relative rounded-3xl ring-1 ring-blue-500/40 shadow-[0_0_32px_rgba(59,130,246,0.3)]"
            />
          </div>
          <div className="flex flex-col items-center gap-1.5 leading-none">
            <span className="text-[26px] font-extrabold tracking-tight text-white">Midsam</span>
            <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-blue-500/80">Business</span>
          </div>
          <div className="h-px w-40 bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl ring-1 ring-inset ring-white/[0.03]">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-white/5 border border-white/10 rounded-xl p-1 mb-7 h-10">
              <TabsTrigger
                value="login"
                className="rounded-lg text-white/50 text-[13px] font-semibold transition-all duration-200 data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
              >
                Entrar
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="rounded-lg text-white/50 text-[13px] font-semibold transition-all duration-200 data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
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
                  className="w-full h-11 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-xl shadow-lg hover:shadow-blue-500/40 transition-all duration-200 mt-1"
                >
                  {submitting ? "Entrando..." : "Entrar"}
                </Button>
              </form>
              {unconfirmedEmail && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                  <p className="text-[13px] text-white/70">
                    O e-mail <strong className="text-white">{unconfirmedEmail}</strong> ainda nao foi confirmado.
                  </p>
                  <p className="text-[12px] text-white/50">{CONVIDADO_USE_O_LINK}</p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={resending}
                    onClick={resendConfirmation}
                    className="h-9 w-full rounded-lg border-emerald-500/40 bg-transparent text-[13px] text-emerald-200 hover:bg-emerald-500/15 hover:text-white"
                  >
                    {resending ? "Reenviando..." : "Reenviar link de confirmacao"}
                  </Button>
                </div>
              )}
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
                  className="w-full h-11 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-xl shadow-lg hover:shadow-blue-500/40 transition-all duration-200 mt-1"
                >
                  {submitting ? "Criando..." : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          Ao continuar voce concorda com os{" "}
          <Link to="/termos" className="underline underline-offset-4 transition-colors hover:text-white/70">Termos de Uso</Link>{" "}
          e a{" "}
          <Link to="/privacidade" className="underline underline-offset-4 transition-colors hover:text-white/70">Politica de Privacidade</Link>.
        </p>
        <p className="mt-3 text-center text-[11px] text-white/20">© {new Date().getFullYear()} Midsam Business</p>
      </div>
    </div>
  );
}
