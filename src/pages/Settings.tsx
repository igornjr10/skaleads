import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Copy, Loader2, RefreshCw, Users } from "lucide-react";

interface Member {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
}

interface WhatsAppGroup {
  id: string;
  subject: string;
  size: number;
  pictureUrl: string | null;
}

const ROLES = ["owner", "admin", "analyst", "viewer"] as const;

export default function Settings() {
  const { user, role } = useAuth();
  const isOwner = role === "owner";
  const [members, setMembers] = useState<Member[]>([]);
  const [fullName, setFullName] = useState("");
  const [whatsappGroups, setWhatsappGroups] = useState<WhatsAppGroup[] | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);

  async function load() {
    const { data: profiles } = await supabase.from("profiles").select("id, email, full_name");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const merged: Member[] = (profiles ?? []).map((p) => ({
      user_id: p.id,
      email: p.email,
      full_name: p.full_name,
      role: roles?.find((r) => r.user_id === p.id)?.role ?? "viewer",
    }));
    setMembers(merged);

    const me = profiles?.find((p) => p.id === user?.id);
    setFullName(me?.full_name ?? "");
  }

  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user?.id]);

  async function saveProfile() {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
  }

  async function loadWhatsappGroups() {
    setLoadingGroups(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-whatsapp-groups");
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setWhatsappGroups(data.groups ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar grupos");
    } finally {
      setLoadingGroups(false);
    }
  }

  function copyGroupId(id: string) {
    navigator.clipboard.writeText(id);
    toast.success("JID do grupo copiado");
  }

  async function changeRole(userId: string, newRole: string) {
    // Remove existing roles, insert new one
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole as typeof ROLES[number] });
    if (error) return toast.error(error.message);
    toast.success("Papel atualizado");
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil e os membros da plataforma</p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Seu perfil</CardTitle>
          <CardDescription>Informações da sua conta</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-2">
            <Label>Nome completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <Button onClick={saveProfile}>Salvar</Button>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Membros</CardTitle>
          <CardDescription>
            {isOwner ? "Gerencie os papéis dos membros da plataforma" : "Apenas Owners podem alterar papéis"}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Papel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell className="font-medium">{m.full_name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                  <TableCell>
                    {isOwner && m.user_id !== user?.id ? (
                      <Select value={m.role} onValueChange={(v) => changeRole(m.user_id, v)}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs uppercase text-muted-foreground">{m.role}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Integração Meta Ads — App configurado</CardTitle>
          <CardDescription>App ID: 2156684861751630</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm text-muted-foreground">

          <div className="space-y-2">
            <p className="font-medium text-foreground">1. Configurar o App no Meta Developers</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Acesse{" "}
                <a href="https://developers.facebook.com/apps/2156684861751630/settings/basic/" target="_blank" rel="noreferrer" className="text-primary underline">
                  developers.facebook.com → seu App
                </a>
              </li>
              <li>Em <strong className="text-foreground">Configurações → Básico</strong>, adicione em <em>Domínios do App</em> o domínio onde o app estará hospedado (ex: <code className="rounded bg-muted px-1 font-mono text-xs">localhost</code> para dev)</li>
              <li>Em <strong className="text-foreground">Facebook Login → Configurações</strong>, adicione nas <em>URIs de redirecionamento OAuth válidas</em>: <code className="rounded bg-muted px-1 font-mono text-xs">https://ad-campaign-hub-one.vercel.app/</code> e <code className="rounded bg-muted px-1 font-mono text-xs">http://localhost:5173</code></li>
              <li>Certifique-se de que o produto <strong className="text-foreground">Marketing API</strong> está adicionado ao App</li>
            </ol>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-foreground">2. Implantar a Edge Function no Supabase</p>
            <p>A Edge Function <code className="rounded bg-muted px-1 font-mono text-xs">meta-exchange-token</code> faz a troca segura do token (sem expor o App Secret no frontend). Para implantá-la:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Acesse{" "}
                <a href="https://supabase.com/dashboard/project/npfcxgijwrxrssinpkdw/functions" target="_blank" rel="noreferrer" className="text-primary underline">
                  Supabase → Edge Functions
                </a>
                {" "}e crie uma nova função chamada <code className="rounded bg-muted px-1 font-mono text-xs">meta-exchange-token</code>
              </li>
              <li>Cole o conteúdo de <code className="rounded bg-muted px-1 font-mono text-xs">supabase/functions/meta-exchange-token/index.ts</code></li>
              <li>
                Em{" "}
                <a href="https://supabase.com/dashboard/project/npfcxgijwrxrssinpkdw/settings/vault" target="_blank" rel="noreferrer" className="text-primary underline">
                  Supabase → Settings → Edge Function Secrets
                </a>
                , adicione as variáveis:
                <br />
                <code className="rounded bg-muted px-1 font-mono text-xs">META_APP_ID</code> = <code className="rounded bg-muted px-1 font-mono text-xs">2156684861751630</code>
                <br />
                <code className="rounded bg-muted px-1 font-mono text-xs">META_APP_SECRET</code> = (sua chave secreta)
              </li>
            </ol>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-foreground">3. Conectar clientes</p>
            <p>
              Com a Edge Function implantada, vá em{" "}
              <strong className="text-foreground">Clientes → Conectar Meta → aba "Via Facebook"</strong>{" "}
              para conectar cada cliente via popup OAuth. O fluxo manual (token de sistema) também continua disponível na aba "Token manual".
            </p>
          </div>

        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>WhatsApp — Grupos (Evolution API)</CardTitle>
          <CardDescription>
            Grupos ativos no número conectado à instância Evolution. Copie o JID para usar como destino de alertas/relatórios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={loadWhatsappGroups} disabled={loadingGroups} variant="outline" size="sm">
            {loadingGroups ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {whatsappGroups ? "Atualizar grupos" : "Carregar grupos"}
          </Button>

          {whatsappGroups && whatsappGroups.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum grupo encontrado nesse número.</p>
          )}

          {whatsappGroups && whatsappGroups.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Membros</TableHead>
                  <TableHead>JID</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {whatsappGroups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.subject}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{g.size}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{g.id}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyGroupId(g.id)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
