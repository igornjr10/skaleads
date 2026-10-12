import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ListTodo, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { cn, errorMessage } from "@/lib/utils";
import { type AcaoReuniao, type Reuniao, descricaoDaDemanda, novoId, tituloDaDemanda } from "@/lib/reunioes";
import type { PessoaDaReuniao } from "./useReunioes";

const NINGUEM = "__ninguem__";

function SeletorResponsavel({ valor, pessoas, onChange, disabled }: {
  valor: string | null;
  pessoas: PessoaDaReuniao[];
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={valor ?? NINGUEM} onValueChange={v => onChange(v === NINGUEM ? null : v)} disabled={disabled}>
      <SelectTrigger className="h-8 min-w-0 text-xs"><SelectValue placeholder="Responsável" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NINGUEM}>Sem responsável</SelectItem>
        {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function LinhaDaAcao({ acao, pessoas, podeEditar, convertendo, onMudar, onRemover, onVirarDemanda }: {
  acao: AcaoReuniao;
  pessoas: PessoaDaReuniao[];
  podeEditar: boolean;
  convertendo: boolean;
  onMudar: (patch: Partial<AcaoReuniao>) => void;
  onRemover: () => void;
  onVirarDemanda: () => void;
}) {
  const [texto, setTexto] = useState(acao.texto);
  useEffect(() => setTexto(acao.texto), [acao.texto]);

  return (
    <li className={cn("rounded-xl border border-border/60 bg-card/40 p-3", acao.feito && "opacity-70")}>
      <div className="flex items-start gap-2">
        <Checkbox
          className="mt-2"
          checked={acao.feito}
          onCheckedChange={v => onMudar({ feito: v === true })}
          disabled={!podeEditar}
          aria-label={acao.feito ? "Marcar como não feita" : "Marcar como feita"}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onBlur={() => {
              const t = texto.trim();
              if (!t) setTexto(acao.texto);
              else if (t !== acao.texto) onMudar({ texto: t });
            }}
            disabled={!podeEditar}
            className={cn("h-8 text-sm", acao.feito && "line-through")}
            aria-label="Texto da ação"
          />
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
            <SeletorResponsavel valor={acao.responsavel_id} pessoas={pessoas} onChange={id => onMudar({ responsavel_id: id })} disabled={!podeEditar} />
            <Input
              type="date"
              value={acao.prazo ?? ""}
              onChange={e => onMudar({ prazo: e.target.value || null })}
              disabled={!podeEditar}
              className="h-8 text-xs"
              aria-label="Prazo"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {acao.task_id ? (
              <Button asChild size="sm" variant="secondary" className="h-7 text-xs">
                <Link to={`/demandas?demanda=${acao.task_id}`}>
                  <ArrowUpRight className="mr-1 h-3.5 w-3.5" /> Ver demanda
                </Link>
              </Button>
            ) : (
              podeEditar && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onVirarDemanda} disabled={convertendo}>
                  {convertendo ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                  Virar demanda
                </Button>
              )
            )}
            {podeEditar && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive" onClick={onRemover}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export function ReuniaoAcoes({ reuniao, pessoas, nomeDoCliente, podeEditar, salvarAcoes }: {
  reuniao: Reuniao;
  pessoas: PessoaDaReuniao[];
  nomeDoCliente: string | null;
  podeEditar: boolean;
  salvarAcoes: (acoes: AcaoReuniao[]) => Promise<boolean>;
}) {
  const { user } = useAuth();
  const [nova, setNova] = useState<{ texto: string; responsavel_id: string | null; prazo: string }>({ texto: "", responsavel_id: null, prazo: "" });
  const [convertendo, setConvertendo] = useState<Set<string>>(new Set());
  const acoes = reuniao.acoes;
  const pendentesDeDemanda = useMemo(() => acoes.filter(a => !a.task_id && !a.feito), [acoes]);
  const feitas = acoes.filter(a => a.feito).length;

  function mudar(id: string, patch: Partial<AcaoReuniao>) {
    salvarAcoes(acoes.map(a => (a.id === id ? { ...a, ...patch } : a)));
  }

  async function adicionar() {
    const texto = nova.texto.trim();
    if (!texto) return;
    const ok = await salvarAcoes([...acoes, { id: novoId(), texto, responsavel_id: nova.responsavel_id, prazo: nova.prazo || null, feito: false, task_id: null }]);
    if (ok) setNova({ texto: "", responsavel_id: null, prazo: "" });
  }

  async function criarDemanda(acao: AcaoReuniao): Promise<string> {
    if (!user) throw new Error("Sessão expirada");
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        titulo: tituloDaDemanda(acao.texto),
        descricao: descricaoDaDemanda(acao, reuniao, { cliente: nomeDoCliente, origem: window.location.origin }),
        client_id: reuniao.client_id,
        assigned_to: acao.responsavel_id,
        prazo: acao.prazo,
        categoria: "reuniao",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async function converter(lista: AcaoReuniao[]) {
    if (!lista.length) return;
    setConvertendo(new Set(lista.map(a => a.id)));
    const criadas = new Map<string, string>();
    let falha: unknown = null;
    for (const acao of lista) {
      try {
        criadas.set(acao.id, await criarDemanda(acao));
      } catch (e) {
        falha = e;
        break;
      }
    }
    if (criadas.size) {
      const ok = await salvarAcoes(acoes.map(a => (criadas.has(a.id) ? { ...a, task_id: criadas.get(a.id)! } : a)));
      if (ok) {
        toast.success(criadas.size === 1 ? "Ação virou demanda" : `${criadas.size} ações viraram demandas`);
        const semDono = lista.filter(a => criadas.has(a.id) && !a.responsavel_id).length;
        if (semDono) toast.info(`${semDono === 1 ? "Uma demanda ficou" : `${semDono} demandas ficaram`} sem responsável: defina em Demandas.`);
      } else {
        toast.error("As demandas foram criadas, mas o vínculo com a reunião não foi salvo");
      }
    }
    if (falha) toast.error(errorMessage(falha, "Não foi possível criar a demanda"));
    setConvertendo(new Set());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {acoes.length ? `${feitas} de ${acoes.length} feitas` : "O que ficou combinado vira ação com dono e prazo."}
        </p>
        {podeEditar && pendentesDeDemanda.length > 0 && (
          <Button size="sm" onClick={() => converter(pendentesDeDemanda)} disabled={convertendo.size > 0}>
            {convertendo.size > 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListTodo className="mr-2 h-4 w-4" />}
            Transformar todas em demandas ({pendentesDeDemanda.length})
          </Button>
        )}
      </div>

      {acoes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          Nenhuma ação ainda. {podeEditar ? "Anote abaixo ou use as sugestões do Resumo IA." : ""}
        </div>
      ) : (
        <ul className="space-y-2">
          {acoes.map(a => (
            <LinhaDaAcao
              key={a.id}
              acao={a}
              pessoas={pessoas}
              podeEditar={podeEditar}
              convertendo={convertendo.has(a.id)}
              onMudar={patch => mudar(a.id, patch)}
              onRemover={() => salvarAcoes(acoes.filter(x => x.id !== a.id))}
              onVirarDemanda={() => converter([a])}
            />
          ))}
        </ul>
      )}

      {podeEditar && (
        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
          <Input
            value={nova.texto}
            onChange={e => setNova(n => ({ ...n, texto: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }}
            placeholder="Nova ação, ex.: Enviar proposta de verba"
            className="h-9"
          />
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
            <SeletorResponsavel valor={nova.responsavel_id} pessoas={pessoas} onChange={id => setNova(n => ({ ...n, responsavel_id: id }))} />
            <Input type="date" value={nova.prazo} onChange={e => setNova(n => ({ ...n, prazo: e.target.value }))} className="h-8 text-xs" aria-label="Prazo da nova ação" />
            <Button size="sm" className="h-8" onClick={adicionar} disabled={!nova.texto.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
