import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRightLeft, Building2, Instagram, Loader2, MessageCircle, Phone, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ChatThread } from "@/components/whatsapp/ChatThread";
import { useAuth } from "@/hooks/useAuth";
import type { Pessoa } from "@/hooks/useDemandas";
import { errorMessage } from "@/lib/utils";
import { rotuloPapel, veTodosOsClientes } from "@/lib/permissoes";
import {
  CANAIS_CONTATO, CANAIS_LEAD, MOTIVOS_PERDA, TIPOS_ATIVIDADE,
  type Atividade, type Etapa, type Lead, rotuloAtividade,
} from "@/lib/comercial";

const SEM = "sem";

/** datetime-local fala horario local sem fuso; o banco guarda timestamptz. */
function paraInputLocal(iso: string | null) {
  return iso ? format(parseISO(iso), "yyyy-MM-dd'T'HH:mm") : "";
}
function doInputLocal(valor: string) {
  return valor ? new Date(valor).toISOString() : null;
}

function soDigitos(v: string | null) {
  return (v ?? "").replace(/\D/g, "");
}

export function LeadDetalhe({ lead, etapas, pessoas, pessoaPorId, onClose, onChange, onDelete, onAtividade, perderPara }: {
  lead: Lead | null;
  /** Veio de um arraste para a coluna de perdido: abre ja pedindo o motivo. */
  perderPara?: string | null;
  etapas: Etapa[];
  pessoas: Pessoa[];
  pessoaPorId: Map<string, Pessoa>;
  onClose: () => void;
  onChange: (l: Lead) => void;
  onDelete: (id: string) => void;
  onAtividade: (a: Atividade) => void;
}) {
  const { user, role } = useAuth();
  const isAdmin = veTodosOsClientes(role);
  const [rascunho, setRascunho] = useState<Lead | null>(lead);
  const [historico, setHistorico] = useState<Atividade[]>([]);
  const [registro, setRegistro] = useState({ tipo: "mensagem", canal: "whatsapp", descricao: "", proximo: "" });
  const [salvando, setSalvando] = useState(false);
  const [perda, setPerda] = useState<{ etapaId: string; motivo: string } | null>(null);
  const [sequencias, setSequencias] = useState<{ id: string; nome: string }[]>([]);
  const [sequencia, setSequencia] = useState("");

  useEffect(() => {
    supabase.from("wa_sequencias").select("id, nome").eq("ativa", true).order("nome")
      .then(({ data }) => setSequencias((data ?? []) as { id: string; nome: string }[]));
  }, []);

  const id = lead?.id;
  useEffect(() => {
    setRascunho(lead);
    setPerda(perderPara ? { etapaId: perderPara, motivo: lead?.motivo_perda ?? MOTIVOS_PERDA[0] } : null);
    setRegistro({ tipo: "mensagem", canal: "whatsapp", descricao: "", proximo: "" });
    if (!id) return;
    supabase
      .from("crm_atividades")
      .select("id, lead_id, autor_id, tipo, canal, descricao, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setHistorico((data ?? []) as Atividade[]));
    // Recarrega so quando troca de lead (ou chega um pedido de perda novo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, perderPara]);

  if (!lead || !rascunho) return null;

  const etapasDoFunil = etapas.filter(e => e.funil_id === lead.funil_id).sort((a, b) => a.posicao - b.posicao);
  const etapaAtual = etapasDoFunil.find(e => e.id === lead.etapa_id);
  const nome = (uid: string | null) => (uid ? pessoaPorId.get(uid)?.nome ?? "Alguém" : "Sistema");
  const podeApagar = isAdmin || lead.created_by === user?.id;
  const podeConverter = isAdmin && !lead.client_id && !lead.convertido_client_id;

  async function gravar(mudanca: Partial<Omit<Lead, "wa_chave">>, sucesso?: string) {
    const { data, error } = await supabase.from("crm_leads").update(mudanca).eq("id", lead!.id).select("*").single();
    if (error) {
      toast.error(errorMessage(error, "Não foi possível salvar"));
      return null;
    }
    const atualizado = data as Lead;
    onChange(atualizado);
    setRascunho(r => (r ? { ...r, ...mudanca, ganho_em: atualizado.ganho_em, perdido_em: atualizado.perdido_em } : r));
    if (sucesso) toast.success(sucesso);
    if ("etapa_id" in mudanca) {
      const { data: h } = await supabase
        .from("crm_atividades").select("id, lead_id, autor_id, tipo, canal, descricao, created_at")
        .eq("lead_id", lead!.id).order("created_at", { ascending: false });
      setHistorico((h ?? []) as Atividade[]);
    }
    return atualizado;
  }

  function mudarEtapa(etapaId: string) {
    const destino = etapasDoFunil.find(e => e.id === etapaId);
    // Perdido sem motivo nao ensina nada: o motivo e o que alimenta o dashboard.
    if (destino?.tipo === "perdido") return setPerda({ etapaId, motivo: lead!.motivo_perda ?? MOTIVOS_PERDA[0] });
    gravar({ etapa_id: etapaId });
  }

  async function salvarCampos() {
    if (!rascunho!.contato_nome.trim()) return toast.error("O lead precisa de um nome de contato");
    setSalvando(true);
    const r = rascunho!;
    await gravar({
      empresa: r.empresa?.trim() || null,
      contato_nome: r.contato_nome.trim(),
      cargo: r.cargo || null,
      telefone: r.telefone || null,
      whatsapp: r.whatsapp || null,
      instagram: r.instagram?.replace(/^@/, "") || null,
      email: r.email || null,
      segmento: r.segmento || null,
      cidade: r.cidade || null,
      origem: r.origem || null,
      canal: r.canal,
      valor_estimado: r.valor_estimado,
      observacoes: r.observacoes || null,
      responsavel_id: r.responsavel_id,
      closer_id: r.closer_id,
      proximo_contato_em: r.proximo_contato_em,
      reuniao_em: r.reuniao_em,
    }, "Lead atualizado");
    setSalvando(false);
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { data, error } = await supabase
      .from("crm_atividades")
      .insert({
        lead_id: lead!.id,
        autor_id: user.id,
        tipo: registro.tipo,
        canal: registro.tipo === "nota" ? null : registro.canal,
        descricao: registro.descricao.trim() || null,
      })
      .select("id, lead_id, autor_id, tipo, canal, descricao, created_at")
      .single();
    if (error) return toast.error(errorMessage(error, "Não foi possível registrar"));
    const a = data as Atividade;
    setHistorico(h => [a, ...h]);
    onAtividade(a);
    // O proximo passo nasce junto com o registro: sem data, o lead some da fila.
    if (registro.proximo) await gravar({ proximo_contato_em: doInputLocal(registro.proximo) });
    setRegistro(r => ({ ...r, descricao: "", proximo: "" }));
    toast.success("Registrado");
  }

  async function converter() {
    const { data, error } = await supabase.rpc("converter_lead_em_cliente", { _lead_id: lead!.id });
    if (error) return toast.error(errorMessage(error, "Não foi possível converter"));
    const { data: atualizado } = await supabase.from("crm_leads").select("*").eq("id", lead!.id).single();
    if (atualizado) {
      onChange(atualizado as Lead);
      setRascunho(atualizado as Lead);
    }
    toast.success("Cliente criado a partir do lead");
    return data;
  }

  async function inscrever() {
    if (!sequencia) return;
    const { data, error } = await supabase.rpc("inscrever_em_sequencia", { _sequencia_id: sequencia, _lead_ids: [lead!.id] });
    if (error) return toast.error(errorMessage(error, "Não foi possível inscrever"));
    toast.success(data ? "Lead inscrito: a primeira mensagem entrou na fila" : "Este lead já está nessa sequência");
    setSequencia("");
  }

  async function apagar() {
    const { error } = await supabase.from("crm_leads").delete().eq("id", lead!.id);
    if (error) return toast.error(errorMessage(error, "Não foi possível apagar"));
    onDelete(lead!.id);
  }

  const zap = soDigitos(lead.whatsapp || lead.telefone);
  const campo = (chave: keyof Lead, rotulo: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div>
      <Label>{rotulo}</Label>
      <Input
        value={(rascunho[chave] as string | null) ?? ""}
        onChange={e => setRascunho({ ...rascunho, [chave]: e.target.value })}
        {...props}
      />
    </div>
  );

  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="space-y-2 text-left">
          <SheetTitle className="pr-6">{lead.empresa || lead.contato_nome}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              {lead.empresa && <span>{lead.contato_nome}{lead.cargo ? ` · ${lead.cargo}` : ""}</span>}
              {lead.ganho_em && <Badge className="bg-emerald-500/15 text-emerald-300">Ganho</Badge>}
              {lead.perdido_em && <Badge variant="destructive">Perdido{lead.motivo_perda ? `: ${lead.motivo_perda}` : ""}</Badge>}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap gap-2">
          {zap && (
            <Button asChild size="sm" variant="outline">
              <a href={`https://wa.me/${zap.length <= 11 ? `55${zap}` : zap}`} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
              </a>
            </Button>
          )}
          {lead.telefone && (
            <Button asChild size="sm" variant="outline">
              <a href={`tel:${soDigitos(lead.telefone)}`}><Phone className="mr-1.5 h-4 w-4" /> Ligar</a>
            </Button>
          )}
          {lead.instagram && (
            <Button asChild size="sm" variant="outline">
              <a href={`https://instagram.com/${lead.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">
                <Instagram className="mr-1.5 h-4 w-4" /> @{lead.instagram.replace(/^@/, "")}
              </a>
            </Button>
          )}
          {lead.convertido_client_id && (
            <Button asChild size="sm" variant="outline">
              <Link to={`/clients/${lead.convertido_client_id}`}><Building2 className="mr-1.5 h-4 w-4" /> Ver cliente</Link>
            </Button>
          )}
          {podeConverter && (
            <Button size="sm" onClick={converter}><UserCheck className="mr-1.5 h-4 w-4" /> Virar cliente</Button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Etapa</Label>
            <Select value={lead.etapa_id} onValueChange={mudarEtapa}>
              <SelectTrigger><SelectValue placeholder={etapaAtual?.nome} /></SelectTrigger>
              <SelectContent>
                {etapasDoFunil.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {perda && (
            <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 sm:col-span-2">
              <Label>Por que perdeu?</Label>
              <Select value={perda.motivo} onValueChange={motivo => setPerda({ ...perda, motivo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MOTIVOS_PERDA.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPerda(null)}>Cancelar</Button>
                <Button size="sm" variant="destructive" onClick={async () => {
                  if (await gravar({ etapa_id: perda.etapaId, motivo_perda: perda.motivo })) setPerda(null);
                }}>Marcar como perdido</Button>
              </div>
            </div>
          )}
        </div>

        <Tabs defaultValue="historico" className="mt-4">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="historico">Histórico ({historico.length})</TabsTrigger>
            {lead.wa_chave && <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>}
            <TabsTrigger value="dados">Dados</TabsTrigger>
          </TabsList>

          <TabsContent value="historico" className="space-y-4">
            <form onSubmit={registrar} className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={registro.tipo} onValueChange={tipo => setRegistro({ ...registro, tipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_ATIVIDADE.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                {registro.tipo !== "nota" && (
                  <Select value={registro.canal} onValueChange={canal => setRegistro({ ...registro, canal })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CANAIS_CONTATO.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
              <Textarea
                rows={2}
                value={registro.descricao}
                onChange={e => setRegistro({ ...registro, descricao: e.target.value })}
                placeholder="O que aconteceu? (opcional)"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Próximo contato</Label>
                  <Input type="datetime-local" value={registro.proximo} onChange={e => setRegistro({ ...registro, proximo: e.target.value })} />
                </div>
                <Button type="submit">Registrar</Button>
              </div>
            </form>

            <ol className="space-y-2 border-l border-border/60 pl-4">
              {historico.map(a => (
                <li key={a.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium">{rotuloAtividade(a.tipo)}</span>
                    {a.canal && <span className="text-xs text-muted-foreground">via {CANAIS_CONTATO.find(c => c.id === a.canal)?.label ?? a.canal}</span>}
                    {a.tipo === "etapa" && <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  {a.descricao && <p className="whitespace-pre-wrap text-muted-foreground">{a.descricao}</p>}
                  <div className="text-[11px] text-muted-foreground/70">
                    {nome(a.autor_id)} · {format(parseISO(a.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </div>
                </li>
              ))}
              {historico.length === 0 && <li className="text-xs text-muted-foreground">Nenhum contato registrado ainda.</li>}
            </ol>
          </TabsContent>

          {lead.wa_chave && (
            <TabsContent value="whatsapp" className="space-y-3">
              <ChatThread chave={lead.wa_chave} leadId={lead.id} lead={lead} altura="h-[320px]" />
              {sequencias.length > 0 && (
                <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center">
                  <span className="text-sm text-muted-foreground">Colocar numa sequência:</span>
                  <Select value={sequencia} onValueChange={setSequencia}>
                    <SelectTrigger className="sm:w-56"><SelectValue placeholder="Escolha" /></SelectTrigger>
                    <SelectContent>{sequencias.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" onClick={inscrever} disabled={!sequencia}>Inscrever</Button>
                </div>
              )}
            </TabsContent>
          )}

          <TabsContent value="dados" className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {campo("contato_nome", "Contato")}
              {campo("empresa", "Empresa")}
              {campo("cargo", "Cargo")}
              {campo("segmento", "Segmento")}
              {campo("whatsapp", "WhatsApp")}
              {campo("telefone", "Telefone")}
              {campo("instagram", "Instagram", { placeholder: "@perfil" })}
              {campo("email", "E-mail", { type: "email" })}
              {campo("cidade", "Cidade / região")}
              {campo("origem", "Origem", { placeholder: "Lista fria, evento, anúncio de outubro..." })}
              <div>
                <Label>Canal</Label>
                <Select value={rascunho.canal} onValueChange={canal => setRascunho({ ...rascunho, canal })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CANAIS_LEAD.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor estimado (R$/mês)</Label>
                <Input
                  type="number"
                  min={0}
                  value={rascunho.valor_estimado ?? ""}
                  onChange={e => setRascunho({ ...rascunho, valor_estimado: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Responsável (SDR / social)</Label>
                <Select value={rascunho.responsavel_id ?? SEM} onValueChange={v => setRascunho({ ...rascunho, responsavel_id: v === SEM ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM}>Sem dono (fila)</SelectItem>
                    {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} · {rotuloPapel(p.role)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Closer</Label>
                <Select value={rascunho.closer_id ?? SEM} onValueChange={v => setRascunho({ ...rascunho, closer_id: v === SEM ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM}>Nenhum ainda</SelectItem>
                    {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} · {rotuloPapel(p.role)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Próximo contato</Label>
                <Input
                  type="datetime-local"
                  value={paraInputLocal(rascunho.proximo_contato_em)}
                  onChange={e => setRascunho({ ...rascunho, proximo_contato_em: doInputLocal(e.target.value) })}
                />
              </div>
              <div>
                <Label>Reunião</Label>
                <Input
                  type="datetime-local"
                  value={paraInputLocal(rascunho.reuniao_em)}
                  onChange={e => setRascunho({ ...rascunho, reuniao_em: doInputLocal(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={3} value={rascunho.observacoes ?? ""} onChange={e => setRascunho({ ...rascunho, observacoes: e.target.value })} />
            </div>
            <div className="flex justify-between gap-2">
              {podeApagar ? (
                <Button variant="ghost" className="text-destructive" onClick={apagar}><Trash2 className="mr-1.5 h-4 w-4" /> Apagar</Button>
              ) : <span />}
              <Button onClick={salvarCampos} disabled={salvando}>
                {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
