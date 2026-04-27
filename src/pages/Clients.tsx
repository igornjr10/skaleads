import { useEffect, useState } from "react";
import { Plus, Link2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

interface Client {
  id: string;
  name: string;
  status: string;
  meta_ad_account_id: string | null;
  meta_connected_at: string | null;
  created_at: string;
}

export default function Clients() {
  const { role } = useAuth();
  const canManage = role === "owner" || role === "admin";
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setClients((data as Client[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("clients").insert({ name, status: "active" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Cliente criado");
    setName("");
    setOpen(false);
    load();
  }

  async function toggleStatus(c: Client) {
    const { error } = await supabase
      .from("clients")
      .update({ status: c.status === "active" ? "inactive" : "active" })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    load();
  }

  function connectMeta(c: Client) {
    toast.info(
      "Integração Meta OAuth em configuração. Cadastre o App ID/Secret nas configurações para ativar.",
      { description: `Cliente: ${c.name}` }
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">Gerencie as empresas anunciantes da sua plataforma</p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Novo cliente</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
              <form onSubmit={createClient} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do cliente</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex: Loja Aurora" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Criar"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Lista de clientes</CardTitle>
          <CardDescription>{clients.length} cliente(s) cadastrado(s)</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : clients.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado ainda.</p>
              {canManage && <p className="mt-1 text-xs text-muted-foreground">Clique em "Novo cliente" para começar.</p>}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Meta Ads</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={c.status === "active"}
                          onCheckedChange={() => canManage && toggleStatus(c)}
                          disabled={!canManage}
                        />
                        <span className="text-xs text-muted-foreground">
                          {c.status === "active" ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.meta_ad_account_id ? (
                        <span className="text-xs text-success">Conectado</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Não conectado</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(c.created_at), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && (
                        <Button variant="outline" size="sm" onClick={() => connectMeta(c)}>
                          <Link2 className="mr-2 h-3 w-3" />
                          Conectar Meta
                        </Button>
                      )}
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
