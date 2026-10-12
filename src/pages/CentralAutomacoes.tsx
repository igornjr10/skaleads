import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Bot, Check, History, Loader2, MessageCircle, Play, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { veTodosOsClientes } from "@/lib/permissoes";
import { errorMessage } from "@/lib/utils";
import {
  type Campo, type ChaveAutomacao, type ConfigAutomacao, type ItemCatalogo,
  CATALOGO, FASES_ONBOARDING, ROTULO_AUTOMACAO, configEfetiva,
} from "@/lib/automacoes";

interface Pessoa { id: string; nome: string }

interface Execucao {
  id: string;
  chave: string;
  user_id: string | null;
  titulo: string;
  corpo: string | null;
  link: string | null;
  canal_whatsapp: string | null;
  status: string;
  decidido_por: string | null;
  decidido_at: string | null;
  created_at: string;
}

const CANAL: Record<string, string> = {
  enviado: "WhatsApp enviado",
  sem_numero: "Sem WhatsApp cadastrado",
  erro: "Falha no WhatsApp",
  fora_do_horario: "Fora do horário",
};

const SEM = "sem";

function SeletorPessoas({ pessoas, valor, onChange, vazio, disabled }: {
  pessoas: Pessoa[];
  valor: string[];
  onChange: (v: string[]) => void;
  vazio: string;
  disabled?: boolean;
}) {
  const nomes = pessoas.filter(p => valor.includes(p.id)).map(p => p.nome);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className="h-9 w-full justify-start truncate font-normal">
          {nomes.length ? nomes.join(", ") : <span className="text-muted-foreground">{vazio}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-64 overflow-y-auto p-1">
        {pessoas.map(p => (
          <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
            <Checkbox
              checked={valor.includes(p.id)}
              onCheckedChange={v => onChange(v ? [...valor, p.id] : valor.filter(x => x !== p.id))}
            />
            {p.nome}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function CampoConfig({ campo, config, setConfig, pessoas, disabled }: {
  campo: Campo;
  config: Record<string, unknown>;
  setConfig: (c: Record<string, unknown>) => void;
  pessoas: Pessoa[];
  disabled: boolean;
}) {
  if (campo.tipo === "numero") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{campo.rotulo}</span>
        <Input
          type="number"
          min={campo.min}
          max={campo.max}
          disabled={disabled}
          className="h-8 w-20"
          value={(config[campo.chave] as number | undefined) ?? ""}
          onChange={e => setConfig({ ...config, [campo.chave]: e.target.value === "" ? "" : Number(e.target.value) })}
        />
        {campo.sufixo && <span className="text-muted-foreground">{campo.sufixo}</span>}
      </div>
    );
  }
  if (campo.tipo === "sim_nao") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <Checkbox disabled={disabled} checked={!!config[campo.chave]} onCheckedChange={v => setConfig({ ...config, [campo.chave]: !!v })} />
        {campo.rotulo}
      </label>
    );
  }
  if (campo.tipo === "opcoes") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{campo.rotulo}</span>
        <Select disabled={disabled} value={String(config[campo.chave] ?? "")} onValueChange={v => setConfig({ ...config, [campo.chave]: v })}>
          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{campo.opcoes.map(o => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    );
  }
  if (campo.tipo === "pessoas") {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{campo.rotulo}</Label>
        <SeletorPessoas
          pessoas={pessoas}
          disabled={disabled}
          vazio={campo.vazio}
          valor={(config[campo.chave] as string[]) ?? []}
          onChange={v => setConfig({ ...config, [campo.chave]: v })}
        />
      </div>
    );
  }
  const responsaveis = (config.responsaveis ?? {}) as Record<string, string | null>;
  const prazos = (config.prazos ?? {}) as Record<string, number>;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>Etapa</span><span>Responsável padrão</span><span>Prazo (dias)</span>
      </div>
      {FASES_ONBOARDING.map(f => (
        <div key={f.id} className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-2 text-sm">
          <span>{f.label}</span>
          <Select
            disabled={disabled}
            value={responsaveis[f.id] ?? SEM}
            onValueChange={v => setConfig({ ...config, responsaveis: { ...responsaveis, [f.id]: v === SEM ? null : v } })}
          >
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM}>Não definir</SelectItem>
              {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            max={90}
            disabled={disabled}
            className="h-8 w-20"
            value={prazos[f.id] ?? ""}
            onChange={e => setConfig({ ...config, prazos: { ...prazos, [f.id]: e.target.value === "" ? 0 : Number(e.target.value) } })}
          />
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">Prazo contado da data de cadastro do cliente; 0 deixa sem prazo.</p>
    </div>
  );
}

function CardAutomacao({ item, inicial, pessoas, podeEditar, onSalvo }: {
  item: ItemCatalogo;
  inicial: ConfigAutomacao;
  pessoas: Pessoa[];
  podeEditar: boolean;
  onSalvo: () => void;
}) {
  const [cfg, setCfg] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setCfg(inicial), [inicial]);
  const mudou = JSON.stringify(cfg) !== JSON.stringify(inicial);

  async function salvar(proximo = cfg) {
    setSalvando(true);
    const { error } = await supabase.from("automacoes").upsert(
      { chave: item.chave, ativa: proximo.ativa, whatsapp: proximo.whatsapp, config: proximo.config as Json },
      { onConflict: "company_id,chave" },
    );
    setSalvando(false);
    if (error) return toast.error(errorMessage(error, "Não foi possível salvar a automação"));
    toast.success(`${item.titulo}: ${proximo.ativa ? "ativa" : "desligada"}`);
    onSalvo();
  }

  return (
    <Card className={`shadow-card transition-opacity ${cfg.ativa ? "" : "opacity-70"}`}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{item.titulo}</span>
              {item.alteraDados && <Badge variant="outline" className="text-[10px]">altera dados</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{item.descricao}</p>
          </div>
          <Switch
            checked={cfg.ativa}
            disabled={!podeEditar || salvando}
            onCheckedChange={v => { const proximo = { ...cfg, ativa: v }; setCfg(proximo); salvar(proximo); }}
            aria-label={`Ativar ${item.titulo}`}
          />
        </div>
        <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <span><strong className="font-medium text-foreground">Quem recebe:</strong> {item.quem}</span>
          <span><strong className="font-medium text-foreground">Quando:</strong> {item.quando}</span>
        </div>
        {item.campos.length > 0 && (
          <div className="space-y-2.5 rounded-xl border border-border/60 bg-muted/20 p-3">
            {item.campos.map((c, i) => (
              <CampoConfig key={i} campo={c} config={cfg.config} setConfig={config => setCfg({ ...cfg, config })} pessoas={pessoas} disabled={!podeEditar} />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {item.whatsapp ? (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={cfg.whatsapp} disabled={!podeEditar} onCheckedChange={v => setCfg({ ...cfg, whatsapp: v })} />
              <MessageCircle className="h-4 w-4 text-emerald-500" /> Também no WhatsApp
            </label>
          ) : (
            <span className="text-xs text-muted-foreground">Só no sino</span>
          )}
          {podeEditar && mudou && (
            <Button size="sm" onClick={() => salvar()} disabled={salvando}>
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CentralAutomacoes() {
  const { role } = useAuth();
  const podeEditar = veTodosOsClientes(role);
  const [linhas, setLinhas] = useState<{ chave: string; ativa: boolean; whatsapp: boolean; config: Json }[] | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [historico, setHistorico] = useState<Execucao[]>([]);
  const [filtro, setFiltro] = useState("todas");
  const [rodando, setRodando] = useState(false);

  const carregar = useCallback(async () => {
    const [cfg, perfis, exec] = await Promise.all([
      supabase.from("automacoes").select("chave, ativa, whatsapp, config"),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("automacao_execucoes").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if (cfg.error) toast.error(errorMessage(cfg.error, "A Central ainda não está no banco: rode a migration central_operacional"));
    setLinhas(cfg.data ?? []);
    setPessoas(((perfis.data ?? []) as { id: string; full_name: string | null; email: string | null }[])
      .map(p => ({ id: p.id, nome: p.full_name || p.email || "—" }))
      .sort((a, b) => a.nome.localeCompare(b.nome)));
    setHistorico((exec.data ?? []) as Execucao[]);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const nomeDe = useCallback((id: string | null) => (id ? pessoas.find(p => p.id === id)?.nome ?? "—" : "Gestão"), [pessoas]);
  const configs = useMemo(() => new Map(CATALOGO.map(c => [c.chave, configEfetiva(linhas?.find(l => l.chave === c.chave) as Partial<ConfigAutomacao> | undefined, c.chave)])), [linhas]);
  const pendentes = historico.filter(h => h.status === "aguardando_aprovacao");
  const visiveis = historico.filter(h => h.status !== "aguardando_aprovacao" && (filtro === "todas" || h.chave === filtro));

  async function rodarAgora() {
    setRodando(true);
    const { data, error } = await supabase.functions.invoke("automacoes-operacao", { body: {} });
    setRodando(false);
    if (error) return toast.error(errorMessage(error, "Não foi possível rodar as automações"));
    const total = ((data?.resultados ?? []) as { avisos?: number }[]).reduce((s, r) => s + (r.avisos ?? 0), 0);
    toast.success(total ? `${total} aviso${total === 1 ? "" : "s"} novo${total === 1 ? "" : "s"}` : "Tudo em dia: nenhum aviso novo");
    carregar();
  }

  async function decidir(id: string, aprovar: boolean) {
    const { error } = await supabase.rpc("decidir_automacao", { _id: id, _aprovar: aprovar });
    if (error) return toast.error(errorMessage(error, "Não foi possível decidir"));
    toast.success(aprovar ? "Aplicado" : "Recusado");
    carregar();
  }

  const grupos = ["Demandas", "Equipe", "Clientes", "Rotina"] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Bot className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Central de automações</h1>
            <p className="text-sm text-muted-foreground">
              Rodam sozinhas a cada 15 minutos, das 8h às 20h. Avisos vão para o sino e, se ligado, para o WhatsApp de cada pessoa.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/agencia"><ArrowLeft className="mr-1.5 h-4 w-4" /> Visão da agência</Link></Button>
          {podeEditar && (
            <Button onClick={rodarAgora} disabled={rodando}>
              {rodando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />} Rodar agora
            </Button>
          )}
        </div>
      </div>

      {!podeEditar && (
        <p className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Só o ADM liga, desliga e configura. Aqui você vê o que está ativo e os avisos que recebeu.
        </p>
      )}

      {pendentes.length > 0 && (
        <Card className="border-amber-500/40 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-amber-500" /> Aguardando aprovação ({pendentes.length})</CardTitle>
            <p className="text-xs text-muted-foreground">Ações que mudam responsável ou prazo só rodam depois que um ADM aprova.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendentes.map(p => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card/60 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{p.titulo}</div>
                  <div className="text-xs text-muted-foreground">{p.corpo} · {format(new Date(p.created_at), "dd/MM HH:mm")}</div>
                </div>
                {podeEditar && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => decidir(p.id, false)}><X className="mr-1 h-3.5 w-3.5" /> Recusar</Button>
                    <Button size="sm" onClick={() => decidir(p.id, true)}><Check className="mr-1 h-3.5 w-3.5" /> Aprovar</Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {linhas === null ? (
        <div className="grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
      ) : (
        grupos.map(g => (
          <section key={g} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {CATALOGO.filter(c => c.grupo === g).map(item => (
                <CardAutomacao
                  key={item.chave}
                  item={item}
                  inicial={configs.get(item.chave)!}
                  pessoas={pessoas}
                  podeEditar={podeEditar}
                  onSalvo={carregar}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <p className="text-xs text-muted-foreground">
        WhatsApp sai pelo número da agência para o WhatsApp de cada colaborador cadastrado em Configurações &gt; Equipe.
      </p>

      <Card className="shadow-card">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-primary" /> Histórico</CardTitle>
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as automações</SelectItem>
              {CATALOGO.map(c => <SelectItem key={c.chave} value={c.chave}>{c.titulo}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {visiveis.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma execução ainda.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {visiveis.map(h => (
                <div key={h.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {h.link ? <Link to={h.link} className="hover:underline">{h.titulo}</Link> : h.titulo}
                    </div>
                    {h.corpo && <div className="text-xs text-muted-foreground">{h.corpo}</div>}
                    <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      <span>{ROTULO_AUTOMACAO[h.chave as ChaveAutomacao] ?? h.chave}</span>
                      <span>· para {nomeDe(h.user_id)}</span>
                      {h.canal_whatsapp && <span>· {CANAL[h.canal_whatsapp] ?? h.canal_whatsapp}</span>}
                      {(h.status === "aprovado" || h.status === "recusado") && (
                        <span>· {h.status === "aprovado" ? "aprovado" : "recusado"} por {nomeDe(h.decidido_por)}</span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {format(new Date(h.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
