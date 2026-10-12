import { Clock, Loader2, Unlink, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { statusDaLinha } from "./grupos-estilo";
import { espera, iniciais, type ClienteGrupo, type GrupoWhatsapp, type LinhaGrupo, type Pessoa } from "./grupos-logica";

export function StatusGrupo({ linha, className }: { linha: LinhaGrupo; className?: string }) {
  const s = statusDaLinha(linha);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        s.classe,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.ponto)} />
      {s.rotulo}
    </span>
  );
}

export function EsperaGrupo({ linha }: { linha: LinhaGrupo }) {
  const h = linha.triagem?.horas_sem_resposta;
  if (h == null) return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-amber-700 dark:text-amber-400">
      <Clock className="h-3 w-3" />
      {espera(h)} sem resposta
    </span>
  );
}

export function Responsaveis({ pessoas, compacto }: { pessoas: Pessoa[]; compacto?: boolean }) {
  if (!pessoas.length) {
    return <span className="text-xs text-muted-foreground">Sem responsável</span>;
  }
  const visiveis = pessoas.slice(0, 3);
  const resto = pessoas.length - visiveis.length;
  const nomes = pessoas.map(p => p.nome).join(", ");
  return (
    <div className="flex min-w-0 items-center gap-2" title={nomes}>
      <div className="flex shrink-0 -space-x-1.5">
        {visiveis.map(p => (
          <span
            key={p.id}
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-primary/15 text-[10px] font-semibold text-primary"
          >
            {iniciais(p.nome)}
          </span>
        ))}
        {resto > 0 && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-muted-foreground">
            +{resto}
          </span>
        )}
      </div>
      {!compacto && <span className="min-w-0 truncate text-xs text-muted-foreground">{nomes}</span>}
    </div>
  );
}

export function TituloDoGrupo({ linha }: { linha: LinhaGrupo }) {
  const titulo = linha.nomeGrupo ?? (linha.cliente ? `Grupo de ${linha.cliente.name}` : "Grupo sem nome");
  if (linha.situacao === "sem_grupo") {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Unlink className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Nenhum grupo vinculado</span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={titulo}>
      <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className={cn("truncate font-semibold", !linha.nomeGrupo && "text-muted-foreground")}>{titulo}</span>
    </span>
  );
}

interface VincularProps {
  linha: LinhaGrupo;
  grupos: GrupoWhatsapp[] | null;
  carregandoGrupos: boolean;
  clientesSemGrupo: ClienteGrupo[];
  vinculando: boolean;
  onCarregarGrupos: () => void;
  onVincular: (clientId: string, jid: string, chave: string) => void;
  className?: string;
}

/** Cliente sem grupo escolhe o grupo; grupo sem cliente escolhe o cliente. */
export function VincularControle({
  linha, grupos, carregandoGrupos, clientesSemGrupo, vinculando, onCarregarGrupos, onVincular, className,
}: VincularProps) {
  if (vinculando) {
    return (
      <Button variant="outline" size="sm" disabled className={cn("h-8 w-full sm:w-auto", className)}>
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Vinculando...
      </Button>
    );
  }

  if (linha.situacao === "sem_cliente" && linha.jid) {
    const jid = linha.jid;
    return (
      <SearchableSelect
        className={cn("h-8 text-xs", className)}
        options={clientesSemGrupo.map(c => ({ value: c.id, label: c.name }))}
        value=""
        onChange={clientId => clientId && onVincular(clientId, jid, linha.chave)}
        placeholder="Vincular a cliente..."
        searchPlaceholder="Buscar cliente"
        emptyText="Nenhum cliente sem grupo"
      />
    );
  }

  if (linha.situacao === "sem_grupo" && linha.cliente) {
    const clientId = linha.cliente.id;
    if (!grupos) {
      return (
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 w-full text-xs sm:w-auto", className)}
          onClick={onCarregarGrupos}
          disabled={carregandoGrupos}
        >
          {carregandoGrupos && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Escolher grupo...
        </Button>
      );
    }
    return (
      <SearchableSelect
        className={cn("h-8 text-xs", className)}
        options={grupos.map(g => ({ value: g.id, label: g.subject }))}
        value=""
        onChange={jid => jid && onVincular(clientId, jid, linha.chave)}
        placeholder="Escolher grupo..."
        searchPlaceholder="Buscar grupo"
        emptyText="Nenhum grupo encontrado"
      />
    );
  }

  return null;
}

export function DicaComIcone({ dica, children }: { dica: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{dica}</TooltipContent>
    </Tooltip>
  );
}
