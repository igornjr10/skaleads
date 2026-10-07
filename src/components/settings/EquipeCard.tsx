import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, Link2, Loader2, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CampoBusca, casaBusca } from "@/components/CampoBusca";
import { useAuth } from "@/hooks/useAuth";
import { MODULOS, PAPEIS, modulosPadrao, rotuloPapel, veTodosOsClientes, type Modulo } from "@/lib/permissoes";

interface Membro {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  modulos: string[] | null;
  pendente: boolean;
  client_ids: string[];
}

interface ClienteResumo {
  id: string;
  name: string;
}

const SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || window.location.origin;

// FunctionsHttpError esconde o corpo — e nele que vem o motivo de verdade.
async function chamarEquipe<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("company-members", { body });
  if (error) {
    const detalhe = await (error as { context?: { json?: () => Promise<{ error?: string }> } })
      .context?.json?.().catch(() => null);
    throw new Error(detalhe?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

function ListaMarcavel<T extends string>({ itens, marcados, onChange }: {
  itens: { key: T; label: string }[];
  marcados: T[];
  onChange: (marcados: T[]) => void;
}) {
  const [busca, setBusca] = useState("");
  if (itens.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Nada para listar.</p>;
  const visiveis = itens.filter(item => casaBusca(busca, item.label));
  return (
    <div className="space-y-2">
    {itens.length > 8 && <CampoBusca value={busca} onChange={setBusca} />}
    <ScrollArea className="max-h-72 pr-3">
      <div className="space-y-1">
        {visiveis.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nada encontrado.</p>}
        {visiveis.map(item => {
          const ativo = marcados.includes(item.key);
          return (
            <label key={item.key} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
              <Checkbox
                checked={ativo}
                onCheckedChange={v => onChange(v ? [...marcados, item.key] : marcados.filter(m => m !== item.key))}
              />
              <span className="text-sm">{item.label}</span>
            </label>
          );
        })}
      </div>
    </ScrollArea>
    </div>
  );
}

type Edicao =
  | { tipo: "clientes"; membro: Membro; marcados: string[] }
  | { tipo: "modulos"; membro: Membro; marcados: Modulo[] };

export function EquipeCard() {
  const { user, empresa } = useAuth();
  const [membros, setMembros] = useState<Membro[] | null>(null);
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [remover, setRemover] = useState<Membro | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [busca, setBusca] = useState("");

  const [convidando, setConvidando] = useState(false);
  const [convite, setConvite] = useState({ full_name: "", email: "", role: "analyst", client_ids: [] as string[] });
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [novoLink, setNovoLink] = useState<{ membro: Membro; link: string } | null>(null);

  async function carregar() {
    try {
      const [{ members }, { data: cs }] = await Promise.all([
        chamarEquipe<{ members: Membro[] }>({ action: "list" }),
        empresa
          ? supabase.from("clients").select("id, name").eq("company_id", empresa.id).order("name")
          : Promise.resolve({ data: [] as ClienteResumo[] }),
      ]);
      setMembros(members);
      setClientes((cs as ClienteResumo[]) ?? []);
    } catch (err) {
      setMembros([]);
      toast.error(err instanceof Error ? err.message : "Erro ao carregar a equipe");
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [empresa?.id]);

  const itensClientes = useMemo(() => clientes.map(c => ({ key: c.id, label: c.name })), [clientes]);

  async function atualizar(membro: Membro, mudanca: Record<string, unknown>, sucesso: string) {
    setOcupado(true);
    try {
      await chamarEquipe({ action: "update", user_id: membro.user_id, ...mudanca });
      toast.success(sucesso);
      await carregar();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function salvarEdicao() {
    if (!edicao) return;
    const ok = edicao.tipo === "clientes"
      ? await atualizar(edicao.membro, { client_ids: edicao.marcados }, "Clientes atualizados")
      : await atualizar(edicao.membro, { modulos: edicao.marcados }, "Módulos atualizados");
    if (ok) setEdicao(null);
  }

  async function voltarAoPadrao(membro: Membro) {
    if (await atualizar(membro, { modulos: null }, "Módulos voltaram ao padrão do papel")) setEdicao(null);
  }

  async function confirmarRemocao() {
    if (!remover) return;
    setOcupado(true);
    try {
      await chamarEquipe({ action: "remove", user_id: remover.user_id });
      toast.success(`${remover.full_name || remover.email} saiu da equipe`);
      setRemover(null);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    } finally {
      setOcupado(false);
    }
  }

  async function enviarConvite(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      const resposta = await chamarEquipe<{ link: string | null; conta_existente: boolean }>({
        action: "invite",
        ...convite,
        client_ids: veTodosOsClientes(convite.role) ? [] : convite.client_ids,
        redirect_to: `${SITE_URL.replace(/\/$/, "")}/definir-senha`,
      });
      await carregar();
      if (resposta.link) {
        setLinkGerado(resposta.link);
      } else {
        toast.success("Conta existente adicionada à equipe. A pessoa entra com a senha que já usa.");
        fecharConvite();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao convidar");
    } finally {
      setOcupado(false);
    }
  }

  async function gerarNovoLink(membro: Membro) {
    setOcupado(true);
    try {
      const { link } = await chamarEquipe<{ link: string }>({
        action: "novo_link",
        user_id: membro.user_id,
        redirect_to: `${SITE_URL.replace(/\/$/, "")}/definir-senha`,
      });
      setNovoLink({ membro, link });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar o link");
    } finally {
      setOcupado(false);
    }
  }

  function fecharConvite() {
    setConvidando(false);
    setLinkGerado(null);
    setConvite({ full_name: "", email: "", role: "analyst", client_ids: [] });
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Link copiado");
    } catch {
      toast.error("Não consegui copiar. Selecione o link e copie manualmente.");
    }
  }

  function resumoClientes(m: Membro) {
    if (veTodosOsClientes(m.role)) return <span className="text-xs text-muted-foreground">Todos</span>;
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={m.user_id === user?.id}
        onClick={() => setEdicao({ tipo: "clientes", membro: m, marcados: m.client_ids })}
      >
        {m.client_ids.length === 0 ? "Nenhum" : `${m.client_ids.length} cliente${m.client_ids.length > 1 ? "s" : ""}`}
      </Button>
    );
  }

  function resumoModulos(m: Membro) {
    if (veTodosOsClientes(m.role)) return <span className="text-xs text-muted-foreground">Todos</span>;
    const efetivos = m.modulos ?? modulosPadrao(m.role);
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={m.user_id === user?.id}
        onClick={() => setEdicao({ tipo: "modulos", membro: m, marcados: efetivos.filter((k): k is Modulo => MODULOS.some(x => x.key === k)) })}
      >
        {efetivos.length} módulo{efetivos.length === 1 ? "" : "s"}
        {m.modulos && <Badge variant="secondary" className="ml-2">personalizado</Badge>}
      </Button>
    );
  }

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Equipe</CardTitle>
          <CardDescription>
            Quem acessa {empresa ? `a ${empresa.nome_exibicao || empresa.name}` : "a empresa"}, com qual papel,
            quais clientes e quais módulos.
          </CardDescription>
        </div>
        <Button onClick={() => setConvidando(true)} disabled={!empresa}>
          <UserPlus className="mr-2 h-4 w-4" /> Convidar
        </Button>
      </CardHeader>
      <CardContent className="px-0">
        {membros === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando equipe...
          </div>
        ) : (
          <div className="overflow-x-auto">
            {membros.length > 5 && (
              <div className="px-6 pb-3">
                <CampoBusca value={busca} onChange={setBusca} placeholder="Buscar por nome ou e-mail" className="max-w-sm" />
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Clientes</TableHead>
                  <TableHead>Módulos</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {membros.filter(m => casaBusca(busca, m.full_name, m.email)).map(m => {
                  const euMesmo = m.user_id === user?.id;
                  const bloqueado = euMesmo || m.role === "owner";
                  return (
                    <TableRow key={m.user_id}>
                      <TableCell>
                        <div className="font-medium">{m.full_name || "—"}{euMesmo && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}</div>
                        <div className="text-xs text-muted-foreground">{m.email}</div>
                        {m.pendente && !euMesmo && (
                          <div className="mt-1 flex items-center gap-2">
                            <Badge variant="outline" className="border-amber-500/40 text-amber-500">Ainda não entrou</Badge>
                            <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={ocupado} onClick={() => gerarNovoLink(m)}>
                              <Link2 className="mr-1 h-3 w-3" /> Novo link
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {bloqueado ? (
                          <span className="text-sm text-muted-foreground">{rotuloPapel(m.role)}</span>
                        ) : (
                          <Select
                            value={m.role ?? undefined}
                            onValueChange={v => atualizar(m, { role: v }, "Papel atualizado")}
                            disabled={ocupado}
                          >
                            <SelectTrigger className="w-44"><SelectValue placeholder="Sem papel" /></SelectTrigger>
                            <SelectContent>
                              {PAPEIS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>{resumoClientes(m)}</TableCell>
                      <TableCell>{resumoModulos(m)}</TableCell>
                      <TableCell>
                        {!bloqueado && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            title="Tirar da equipe"
                            onClick={() => setRemover(m)}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!edicao} onOpenChange={open => { if (!open) setEdicao(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edicao?.tipo === "clientes" ? "Clientes de " : "Módulos de "}
              {edicao?.membro.full_name || edicao?.membro.email}
            </DialogTitle>
            <DialogDescription>
              {edicao?.tipo === "clientes"
                ? "A pessoa só enxerga os clientes marcados, com as campanhas, relatórios e demandas deles."
                : `Padrão para ${rotuloPapel(edicao?.membro.role)}: ${modulosPadrao(edicao?.membro.role).length} módulos. Marque o que liberar.`}
            </DialogDescription>
          </DialogHeader>
          {edicao?.tipo === "clientes" && (
            <ListaMarcavel
              itens={itensClientes}
              marcados={edicao.marcados}
              onChange={marcados => setEdicao({ ...edicao, marcados })}
            />
          )}
          {edicao?.tipo === "modulos" && (
            <ListaMarcavel
              itens={MODULOS.map(m => ({ key: m.key, label: m.label }))}
              marcados={edicao.marcados}
              onChange={marcados => setEdicao({ ...edicao, marcados })}
            />
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {edicao?.tipo === "modulos" && edicao.membro.modulos ? (
              <Button variant="ghost" onClick={() => voltarAoPadrao(edicao.membro)} disabled={ocupado}>
                Voltar ao padrão do papel
              </Button>
            ) : <span />}
            <Button onClick={salvarEdicao} disabled={ocupado}>
              {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convidando} onOpenChange={open => { if (!open) fecharConvite(); }}>
        <DialogContent>
          {linkGerado ? (
            <>
              <DialogHeader>
                <DialogTitle>Convite criado</DialogTitle>
                <DialogDescription>
                  Mande este link para {convite.full_name || convite.email}. Ao abrir, a pessoa define a senha e já entra.
                  O link vale para um acesso só.
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2">
                <Input readOnly value={linkGerado} onFocus={e => e.currentTarget.select()} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => copiar(linkGerado)} title="Copiar link">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={fecharConvite}>Concluir</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={enviarConvite} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Convidar para a equipe</DialogTitle>
                <DialogDescription>Gera um link de acesso para você enviar à pessoa.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="convite-nome">Nome</Label>
                <Input id="convite-nome" value={convite.full_name} onChange={e => setConvite({ ...convite, full_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="convite-email">E-mail</Label>
                <Input id="convite-email" type="email" required value={convite.email} onChange={e => setConvite({ ...convite, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Papel</Label>
                <Select value={convite.role} onValueChange={role => setConvite({ ...convite, role })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAPEIS.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{PAPEIS.find(p => p.value === convite.role)?.descricao}</p>
              </div>
              {!veTodosOsClientes(convite.role) && (
                <div className="space-y-2">
                  <Label>Clientes que ele vai atender</Label>
                  <div className="rounded-lg border border-border p-1">
                    <ListaMarcavel
                      itens={itensClientes}
                      marcados={convite.client_ids}
                      onChange={client_ids => setConvite({ ...convite, client_ids })}
                    />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button type="submit" disabled={ocupado}>
                  {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Gerar convite
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!novoLink} onOpenChange={open => { if (!open) setNovoLink(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo link de acesso</DialogTitle>
            <DialogDescription>
              Mande para {novoLink?.membro.full_name || novoLink?.membro.email}. Ao abrir, a pessoa define a senha e já
              entra. O link vale para um acesso só e substitui o anterior.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={novoLink?.link ?? ""} onFocus={e => e.currentTarget.select()} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => novoLink && copiar(novoLink.link)} title="Copiar link">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNovoLink(null)}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!remover} onOpenChange={open => { if (!open) setRemover(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tirar {remover?.full_name || remover?.email} da equipe?</AlertDialogTitle>
            <AlertDialogDescription>
              A pessoa perde o acesso aos clientes e módulos da empresa na hora. A conta dela continua existindo e pode
              ser convidada de novo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarRemocao} disabled={ocupado}>Tirar da equipe</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
