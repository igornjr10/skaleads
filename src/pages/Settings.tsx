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

interface Member {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
}

const ROLES = ["owner", "admin", "analyst", "viewer"] as const;

export default function Settings() {
  const { user, role } = useAuth();
  const isOwner = role === "owner";
  const [members, setMembers] = useState<Member[]>([]);
  const [fullName, setFullName] = useState("");

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
          <CardTitle>Integração Meta Ads</CardTitle>
          <CardDescription>Configure o app Meta para conectar contas de anúncio</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Para ativar a conexão OAuth com o Facebook/Instagram, crie um app no{" "}
            <a href="https://developers.facebook.com/" target="_blank" rel="noreferrer" className="text-primary underline">
              Facebook Developers
            </a>
            , adicione o produto "Marketing API" e nos forneça o App ID e App Secret. Vamos te guiar nesse setup quando estiver pronto.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
