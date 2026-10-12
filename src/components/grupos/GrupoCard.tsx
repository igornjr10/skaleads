import { Link } from "react-router-dom";
import { CornerUpLeft, ExternalLink, Loader2, MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientAvatar } from "@/components/ClientAvatar";
import { cn } from "@/lib/utils";
import { quando, type ClienteGrupo, type GrupoWhatsapp, type LinhaGrupo } from "./grupos-logica";
import {
  DicaComIcone,
  EsperaGrupo,
  Responsaveis,
  StatusGrupo,
  TituloDoGrupo,
  VincularControle,
} from "./GrupoPartes";
import { faixaDaLinha } from "./grupos-estilo";

export interface AcoesGrupoProps {
  atualizando: string | null;
  vinculando: string | null;
  grupos: GrupoWhatsapp[] | null;
  carregandoGrupos: boolean;
  clientesSemGrupo: ClienteGrupo[];
  onAtualizar: (clientId: string) => void;
  onVincular: (clientId: string, jid: string, chave: string) => void;
  onCarregarGrupos: () => void;
}

export function AcoesDoGrupo({ linha, p, cheio }: { linha: LinhaGrupo; p: AcoesGrupoProps; cheio?: boolean }) {
  if (linha.situacao !== "vinculado") {
    return (
      <VincularControle
        linha={linha}
        grupos={p.grupos}
        carregandoGrupos={p.carregandoGrupos}
        clientesSemGrupo={p.clientesSemGrupo}
        vinculando={p.vinculando === linha.chave}
        onCarregarGrupos={p.onCarregarGrupos}
        onVincular={p.onVincular}
        className={cheio ? "w-full" : "w-full sm:w-56"}
      />
    );
  }
  const cliente = linha.cliente!;
  return (
    <div className="flex items-center gap-1">
      <DicaComIcone dica="Ler o grupo de novo">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => p.onAtualizar(cliente.id)}
          disabled={!!p.atualizando}
          aria-label={`Atualizar leitura do grupo de ${cliente.name}`}
        >
          {p.atualizando === cliente.id
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </DicaComIcone>
      <DicaComIcone dica="Abrir cliente">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link to={`/clients/${cliente.id}`} aria-label={`Abrir ${cliente.name}`}>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </DicaComIcone>
    </div>
  );
}

export function GrupoCard({ linha, acoes }: { linha: LinhaGrupo; acoes: AcoesGrupoProps }) {
  const t = linha.triagem;
  const perguntas = t?.perguntas_abertas ?? [];
  return (
    <article
      className={cn(
        "relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-4 shadow-card transition-colors hover:border-border",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        faixaDaLinha(linha),
      )}
    >
      <header className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1 text-sm">
          <TituloDoGrupo linha={linha} />
        </div>
        <StatusGrupo linha={linha} />
      </header>

      <dl className="grid gap-2 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <dt className="sr-only">Cliente</dt>
          {linha.cliente ? (
            <dd className="flex min-w-0 items-center gap-2">
              <ClientAvatar name={linha.cliente.name} logoUrl={linha.cliente.logo_url} className="h-7 w-7" />
              <span className="truncate font-medium" title={linha.cliente.name}>{linha.cliente.name}</span>
            </dd>
          ) : (
            <dd className="text-xs text-muted-foreground">Nenhum cliente usa este grupo</dd>
          )}
        </div>
        {linha.cliente && (
          <div className="flex min-w-0 items-center gap-2">
            <dt className="sr-only">Responsáveis</dt>
            <dd className="min-w-0"><Responsaveis pessoas={linha.responsaveis} /></dd>
          </div>
        )}
      </dl>

      {linha.situacao === "vinculado" && (
        <div className="flex min-w-0 flex-1 flex-col gap-2 border-t border-border/50 pt-3">
          {!t && <p className="text-xs text-muted-foreground">Ainda sem leitura deste grupo.</p>}

          {t && (t.horas_sem_resposta != null || !!t.sinais?.length || t.cobrancas > 1) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <EsperaGrupo linha={linha} />
              {t.cobrancas > 1 && (
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  {t.cobrancas} mensagens seguidas sem resposta
                </span>
              )}
              {t.sinais?.map(s => (
                <span key={s} className="rounded-full border border-amber-500/30 px-1.5 py-px text-[10px] text-amber-700 dark:text-amber-400">
                  {s}
                </span>
              ))}
            </div>
          )}

          {t?.ultima_mensagem && (
            <div className="min-w-0 rounded-xl border border-border/50 bg-muted/30 p-3">
              <p className="mb-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                {t.ultima_da_agencia && <CornerUpLeft className="h-3 w-3 shrink-0" />}
                <span>{t.ultima_da_agencia ? "Agência respondeu por último" : "Última, do cliente"}</span>
                <span aria-hidden>·</span>
                <span className="max-w-[10rem] truncate" title={t.ultima_de ?? ""}>{t.ultima_de}</span>
                <span aria-hidden>·</span>
                <span className="whitespace-nowrap">{quando(t.ultima_em)}</span>
              </p>
              <p className="line-clamp-3 break-words text-sm" title={t.ultima_mensagem}>{t.ultima_mensagem}</p>
            </div>
          )}

          {perguntas.length > 0 && (
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Perguntou e não foi respondido
              </p>
              <ul className="space-y-1">
                {perguntas.slice(0, 3).map((pg, i) => (
                  <li key={i} className="flex min-w-0 gap-2 text-sm">
                    <span className="text-muted-foreground">•</span>
                    <span className="min-w-0 break-words">
                      {pg.texto}
                      <span className="ml-1.5 text-xs text-muted-foreground">— {pg.quem}, {quando(pg.quando)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {perguntas.length > 3 && (
                <p className="mt-1 text-xs text-muted-foreground">e mais {perguntas.length - 3}</p>
              )}
            </div>
          )}
        </div>
      )}

      <footer className="mt-auto flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
        {t ? (
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 whitespace-nowrap">
              <MessageSquare className="h-3 w-3" />
              {t.mensagens} hoje · {t.participantes} pessoa(s)
            </span>
            <span className="whitespace-nowrap">lido {quando(t.gerado_em)}</span>
          </span>
        ) : (
          <span />
        )}
        <div className={cn(linha.situacao !== "vinculado" && "w-full")}>
          <AcoesDoGrupo linha={linha} p={acoes} cheio />
        </div>
      </footer>
    </article>
  );
}
