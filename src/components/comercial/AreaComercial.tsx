import { useMemo, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Hand, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type Atividade, type Lead,
  estaEmAberto, followUpPendente, motivosDePerda, produtividadeDe, produtividadePorPessoa,
  reuniaoFutura, reuniaoHoje, taxaDeGanho,
} from "@/lib/comercial";

export type Area = "sdr" | "closer" | "social";

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: string | number; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${destaque ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-card/60"}`}>
      <div className={`text-2xl font-semibold tabular-nums ${destaque ? "text-destructive" : ""}`}>{valor}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
    </div>
  );
}

function Lista({ titulo, leads, vazio, detalhe, acao, onAbrir }: {
  titulo: string;
  leads: Lead[];
  vazio: string;
  detalhe?: (l: Lead) => React.ReactNode;
  acao?: (l: Lead) => React.ReactNode;
  onAbrir: (l: Lead) => void;
}) {
  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo} <span className="text-sm font-normal text-muted-foreground">({leads.length})</span></CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {leads.slice(0, 30).map(l => (
          <div key={l.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40">
            <button type="button" onClick={() => onAbrir(l)} className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm font-medium">{l.empresa || l.contato_nome}</div>
              {detalhe && <div className="truncate text-xs text-muted-foreground">{detalhe(l)}</div>}
            </button>
            {acao?.(l)}
          </div>
        ))}
        {leads.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{vazio}</p>}
        {leads.length > 30 && <p className="px-2 text-xs text-muted-foreground">+{leads.length - 30}</p>}
      </CardContent>
    </Card>
  );
}

const quando = (iso: string | null) => (iso ? format(parseISO(iso), "EEE dd/MM HH:mm", { locale: ptBR }) : "");

export function AreaComercial({ area, leads, atividades, meuId, onAbrir, onPuxar }: {
  area: Area;
  leads: Lead[];
  atividades: Atividade[];
  meuId: string | undefined;
  onAbrir: (l: Lead) => void;
  onPuxar: (l: Lead) => void;
}) {
  const [dias, setDias] = useState("7");
  const desde = useMemo(() => subDays(new Date(), Number(dias)), [dias]);
  const minha = useMemo(() => produtividadeDe(produtividadePorPessoa(atividades, desde), meuId), [atividades, desde, meuId]);

  const comContato = useMemo(
    () => new Set(atividades.filter(a => !["etapa", "convertido", "nota"].includes(a.tipo)).map(a => a.lead_id)),
    [atividades]
  );
  const trabalhados = new Set(atividades.filter(a => a.autor_id === meuId && new Date(a.created_at) >= desde).map(a => a.lead_id)).size;

  const periodo = (
    <Select value={dias} onValueChange={setDias}>
      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="1">Hoje</SelectItem>
        <SelectItem value="7">Últimos 7 dias</SelectItem>
        <SelectItem value="30">Últimos 30 dias</SelectItem>
      </SelectContent>
    </Select>
  );

  const puxar = (l: Lead) =>
    !l.responsavel_id ? (
      <Button size="sm" variant="outline" onClick={() => onPuxar(l)}><Hand className="mr-1 h-3.5 w-3.5" /> Puxar</Button>
    ) : null;

  if (area === "closer") {
    const meus = leads.filter(l => l.closer_id === meuId);
    const hoje = meus.filter(l => reuniaoHoje(l)).sort((a, b) => (a.reuniao_em! < b.reuniao_em! ? -1 : 1));
    const futuras = meus.filter(l => reuniaoFutura(l)).sort((a, b) => (a.reuniao_em! < b.reuniao_em! ? -1 : 1));
    const negociando = meus.filter(l => estaEmAberto(l) && !reuniaoHoje(l) && !reuniaoFutura(l));
    const fechados = meus.filter(l => l.ganho_em && new Date(l.ganho_em) >= desde);
    const taxa = taxaDeGanho(meus);
    const perdas = motivosDePerda(meus);
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{periodo}</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Numero rotulo="Reuniões hoje" valor={hoje.length} />
          <Numero rotulo="Próximas reuniões" valor={futuras.length} />
          <Numero rotulo="Reuniões realizadas" valor={minha.reunioesRealizadas} />
          <Numero rotulo="Propostas" valor={minha.propostas} />
          <Numero rotulo="Fechamentos" valor={fechados.length} />
          <Numero rotulo="Taxa de fechamento" valor={taxa === null ? "—" : `${Math.round(taxa * 100)}%`} />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Lista titulo="Reuniões de hoje" leads={hoje} vazio="Nenhuma reunião hoje." detalhe={l => quando(l.reuniao_em)} onAbrir={onAbrir} />
          <Lista titulo="Próximas reuniões" leads={futuras} vazio="Nada agendado." detalhe={l => quando(l.reuniao_em)} onAbrir={onAbrir} />
          <Lista titulo="Propostas e negociações" leads={negociando} vazio="Nada em aberto." detalhe={l => l.contato_nome} onAbrir={onAbrir} />
        </div>
        {perdas.length > 0 && (
          <Card className="shadow-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">Por que perdi</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {perdas.map(p => (
                <span key={p.motivo} className="rounded-full border border-border/60 px-3 py-1 text-xs">{p.motivo} · <strong>{p.total}</strong></span>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const canal = area === "social" ? "social" : null;
  const doCanal = (l: Lead) => (canal ? l.canal === "social" : l.canal !== "social");
  const meus = leads.filter(l => l.responsavel_id === meuId && doCanal(l));
  const fila = leads.filter(l => !l.responsavel_id && estaEmAberto(l) && doCanal(l));
  // Para abordar = aberto e sem nenhum contato registrado ainda (meus + fila).
  const paraAbordar = [...meus, ...fila].filter(l => estaEmAberto(l) && !comContato.has(l.id));
  const followUps = meus.filter(l => followUpPendente(l)).sort((a, b) => (a.proximo_contato_em! < b.proximo_contato_em! ? -1 : 1));
  const reunioes = meus.filter(l => reuniaoHoje(l) || reuniaoFutura(l)).sort((a, b) => (a.reuniao_em! < b.reuniao_em! ? -1 : 1));
  const abordagensInsta = atividades.filter(a => a.autor_id === meuId && a.canal === "instagram" && new Date(a.created_at) >= desde).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{periodo}</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Numero rotulo="Leads trabalhados" valor={trabalhados} />
        <Numero rotulo="Contatos" valor={minha.contatos} />
        {area === "social" ? (
          <Numero rotulo="Abordagens no Instagram" valor={abordagensInsta} />
        ) : (
          <>
            <Numero rotulo="Ligações" valor={minha.ligacoes} />
            <Numero rotulo="Atendidas" valor={minha.ligacoesAtendidas} />
          </>
        )}
        <Numero rotulo="Mensagens" valor={minha.mensagens} />
        <Numero rotulo="Reuniões marcadas" valor={minha.reunioesMarcadas} />
        <Numero rotulo="Follow-ups pendentes" valor={followUps.length} destaque={followUps.length > 0} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Lista
          titulo="Follow-ups para hoje"
          leads={followUps}
          vazio="Nenhum follow-up vencendo."
          detalhe={l => quando(l.proximo_contato_em)}
          onAbrir={onAbrir}
        />
        <Lista
          titulo={area === "social" ? "Perfis para abordar" : "Leads para abordar"}
          leads={paraAbordar}
          vazio={area === "social" ? "Cadastre perfis do Instagram com canal Social selling." : "Fila vazia."}
          detalhe={l => [l.segmento, l.cidade, l.instagram ? `@${l.instagram}` : null].filter(Boolean).join(" · ") || l.contato_nome}
          acao={l => (
            <div className="flex items-center gap-1">
              {area === "social" && l.instagram && (
                <Button asChild size="icon" variant="ghost" title="Abrir perfil">
                  <a href={`https://instagram.com/${l.instagram}`} target="_blank" rel="noreferrer"><Instagram className="h-4 w-4" /></a>
                </Button>
              )}
              {puxar(l)}
            </div>
          )}
          onAbrir={onAbrir}
        />
        <Lista titulo="Reuniões agendadas" leads={reunioes} vazio="Nenhuma reunião marcada." detalhe={l => quando(l.reuniao_em)} onAbrir={onAbrir} />
      </div>
    </div>
  );
}
