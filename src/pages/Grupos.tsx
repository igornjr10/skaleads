import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MessageSquare, RefreshCw, Clock, Link2, Search, CornerUpLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Pergunta {
  quem: string;
  texto: string;
  quando: string;
}

interface Triagem {
  id: string;
  client_id: string;
  dia: string;
  mensagens: number;
  participantes: number;
  ultima_mensagem: string | null;
  ultima_de: string | null;
  ultima_em: string | null;
  ultima_da_agencia: boolean;
  cobrancas: number;
  perguntas_abertas: Pergunta[];
  sinais: string[];
  horas_sem_resposta: number | null;
  atencao: "ok" | "atencao" | "urgente";
  gerado_em: string;
}

interface Cliente {
  id: string;
  name: string;
  whatsapp_group_jid: string | null;
}

interface Grupo {
  id: string;
  subject: string;
}

const TOM: Record<Triagem["atencao"], { rotulo: string; classe: string; peso: number }> = {
  urgente: { rotulo: "Urgente", classe: "border-rose-200 bg-rose-50 text-rose-700", peso: 0 },
  atencao: { rotulo: "Esperando", classe: "border-amber-200 bg-amber-50 text-amber-700", peso: 1 },
  ok: { rotulo: "Respondido", classe: "border-emerald-200 bg-emerald-50 text-emerald-700", peso: 2 },
};

function quando(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const hoje = new Date().toDateString() === d.toDateString();
  return hoje
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** "3,5h" para esperas curtas, "2 dias" quando passa disso. */
function espera(horas: number) {
  if (horas < 24) return `${horas.toString().replace(".", ",")}h`;
  const dias = Math.floor(horas / 24);
  return `${dias} dia${dias > 1 ? "s" : ""}`;
}

export default function Grupos() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [triagens, setTriagens] = useState<Triagem[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"esperando" | "todos">("esperando");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    const [c, t] = await Promise.all([
      supabase.from("clients").select("id, name, whatsapp_group_jid").eq("status", "active").order("name"),
      supabase.from("grupo_resumos").select("*").order("dia", { ascending: false }),
    ]);
    setClientes((c.data as Cliente[]) ?? []);

    // Uma linha por cliente por dia; a tela mostra o estado mais recente de cada.
    const maisRecente = new Map<string, Triagem>();
    for (const linha of ((t.data as unknown as Triagem[]) ?? [])) {
      if (!maisRecente.has(linha.client_id)) maisRecente.set(linha.client_id, linha);
    }
    setTriagens([...maisRecente.values()]);
    setCarregando(false);
  }

  async function carregarGrupos() {
    if (grupos.length) return;
    const { data, error } = await supabase.functions.invoke("list-whatsapp-groups");
    if (error) { toast.error("Não consegui listar os grupos"); return; }
    setGrupos(data?.groups ?? []);
  }

  async function vincular(clientId: string, jid: string) {
    const { error } = await supabase.from("clients").update({ whatsapp_group_jid: jid }).eq("id", clientId);
    if (error) { toast.error(error.message); return; }
    setClientes(prev => prev.map(c => (c.id === clientId ? { ...c, whatsapp_group_jid: jid } : c)));
    toast.success("Grupo vinculado");
  }

  async function atualizar(clientId?: string) {
    setAtualizando(clientId ?? "todos");
    try {
      const { data, error } = await supabase.functions.invoke("resumir-grupos", {
        body: clientId ? { clientId } : {},
      });
      if (error) throw new Error(error.message);
      if (data?.erros?.length) throw new Error(data.erros[0]);
      toast.success(clientId ? "Grupo atualizado" : `${data?.analisados ?? 0} grupo(s) atualizados`);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    } finally {
      setAtualizando(null);
    }
  }

  const porCliente = useMemo(() => new Map(triagens.map(t => [t.client_id, t])), [triagens]);

  const vinculados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return clientes
      .filter(c => c.whatsapp_group_jid)
      .filter(c => !termo || c.name.toLowerCase().includes(termo))
      .filter(c => filtro === "todos" || porCliente.get(c.id)?.horas_sem_resposta != null)
      .sort((a, b) => {
        const ta = porCliente.get(a.id);
        const tb = porCliente.get(b.id);
        // Sem triagem vai para o fim: ausencia de dado nao e sinal de calma.
        const pa = ta ? TOM[ta.atencao].peso : 3;
        const pb = tb ? TOM[tb.atencao].peso : 3;
        if (pa !== pb) return pa - pb;
        return (tb?.horas_sem_resposta ?? 0) - (ta?.horas_sem_resposta ?? 0);
      });
  }, [clientes, porCliente, busca, filtro]);

  const semGrupo = clientes.filter(c => !c.whatsapp_group_jid);
  const esperando = triagens.filter(t => t.horas_sem_resposta != null).length;

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Grupos</h1>
          <p className="text-sm text-muted-foreground">
            {esperando > 0
              ? `${esperando} cliente(s) esperando resposta`
              : "Nenhum cliente esperando resposta"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar cliente"
              className="h-9 w-44 pl-8 text-sm"
            />
          </div>
          <Select value={filtro} onValueChange={v => setFiltro(v as typeof filtro)}>
            <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="esperando">Esperando resposta</SelectItem>
              <SelectItem value="todos">Todos os grupos</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => atualizar()} disabled={!!atualizando}>
            {atualizando === "todos"
              ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
            Atualizar tudo
          </Button>
        </div>
      </div>

      {vinculados.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filtro === "esperando"
              ? "Ninguém esperando resposta. Troque o filtro para ver todos os grupos."
              : "Nenhum grupo vinculado ainda."}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {vinculados.map(cliente => {
          const t = porCliente.get(cliente.id);
          const tom = t ? TOM[t.atencao] : null;
          return (
            <Card key={cliente.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{cliente.name}</CardTitle>
                    {tom && (
                      <Badge variant="outline" className={`text-[10px] ${tom.classe}`}>{tom.rotulo}</Badge>
                    )}
                    {t?.horas_sem_resposta != null && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-amber-700">
                        <Clock className="h-3 w-3" />
                        {espera(t.horas_sem_resposta)}
                      </span>
                    )}
                    {t?.sinais?.map(s => (
                      <Badge key={s} variant="outline" className="border-rose-200 bg-rose-50 text-[10px] text-rose-700">
                        {s}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => atualizar(cliente.id)}
                    disabled={!!atualizando}
                  >
                    {atualizando === cliente.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pt-0">
                {!t && <p className="text-sm text-muted-foreground">Ainda sem leitura deste grupo.</p>}

                {t?.ultima_mensagem && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {t.ultima_da_agencia && <CornerUpLeft className="h-3 w-3" />}
                      {t.ultima_da_agencia ? "Agência respondeu por último" : "Última, do cliente"}
                      {" · "}
                      {t.ultima_de} · {quando(t.ultima_em)}
                    </p>
                    <p className="text-sm">{t.ultima_mensagem}</p>
                  </div>
                )}

                {!!t?.perguntas_abertas?.length && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                      Perguntou e não foi respondido
                    </p>
                    <ul className="space-y-1">
                      {t.perguntas_abertas.map((p, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="text-muted-foreground">•</span>
                          <span>
                            {p.texto}
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              — {p.quem}, {quando(p.quando)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {t && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {t.mensagens} hoje · {t.participantes} pessoa(s)
                    </span>
                    {t.cobrancas > 1 && (
                      <span className="font-medium text-rose-700">
                        {t.cobrancas} mensagens sem resposta no meio
                      </span>
                    )}
                    <span>lido {quando(t.gerado_em)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {semGrupo.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Link2 className="h-4 w-4" />
              Sem grupo vinculado ({semGrupo.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              O vínculo automático só casa nome idêntico. Estes precisam da sua escolha —
              chutar por semelhança já mandou dois clientes para o mesmo grupo.
            </p>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {semGrupo.map(c => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="w-40 shrink-0 truncate text-sm">{c.name}</span>
                <Select onValueChange={jid => vincular(c.id, jid)} onOpenChange={o => o && carregarGrupos()}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Escolher grupo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {grupos.map(g => (
                      <SelectItem key={g.id} value={g.id} className="text-xs">{g.subject}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
