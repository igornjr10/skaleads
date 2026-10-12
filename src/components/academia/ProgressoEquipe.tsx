import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEstadoDaTela } from "@/hooks/useEstadoDaTela";
import {
  type AulaAcademia, type ModuloAcademia, type ProgressoAula, ordenarPorOrdem, progressoDaEquipe,
} from "@/lib/academia";

export interface PessoaAcademia {
  id: string;
  nome: string;
  role: string;
}

interface Props {
  pessoas: PessoaAcademia[];
  modulos: ModuloAcademia[];
  aulas: AulaAcademia[];
  progresso: ProgressoAula[];
}

function corDoPct(pct: number) {
  if (pct >= 100) return "text-primary";
  if (pct >= 50) return "text-foreground";
  if (pct > 0) return "text-amber-500";
  return "text-muted-foreground";
}

export function ProgressoEquipe({ pessoas, modulos, aulas, progresso }: Props) {
  const [busca, setBusca] = useEstadoDaTela("academia:equipe:busca", "");
  const modulosOrdenados = useMemo(() => ordenarPorOrdem(modulos).filter(m => aulas.some(a => a.modulo_id === m.id)), [modulos, aulas]);

  const linhas = useMemo(() => {
    const porId = new Map(pessoas.map(p => [p.id, p]));
    const termo = busca.trim().toLowerCase();
    return progressoDaEquipe(pessoas, modulos, aulas, progresso)
      .map(r => ({ ...r, pessoa: porId.get(r.userId)! }))
      .filter(r => !termo || r.pessoa.nome.toLowerCase().includes(termo))
      .sort((a, b) => b.geral.pct - a.geral.pct || a.pessoa.nome.localeCompare(b.pessoa.nome));
  }, [pessoas, modulos, aulas, progresso, busca]);

  if (!aulas.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        Ainda não há aulas cadastradas. Crie aulas em "Editar conteúdo" para acompanhar o progresso da equipe.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pessoa" className="pl-9" />
      </div>

      {!linhas.length ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          <Users className="h-6 w-6" />
          {pessoas.length ? "Ninguém encontrado com essa busca." : "Nenhuma pessoa na equipe."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/60 shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 min-w-[160px] bg-card">Pessoa</TableHead>
                <TableHead className="min-w-[140px]">Geral</TableHead>
                {modulosOrdenados.map(m => (
                  <TableHead key={m.id} className="min-w-[96px] max-w-[140px]">
                    <span className="line-clamp-2 text-xs leading-tight" title={m.titulo}>{m.titulo}</span>
                  </TableHead>
                ))}
                <TableHead className="min-w-[130px]">Última atividade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map(r => (
                <TableRow key={r.userId}>
                  <TableCell className="sticky left-0 z-10 max-w-[200px] bg-card">
                    <div className="truncate font-medium" title={r.pessoa.nome}>{r.pessoa.nome}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={r.geral.pct} className="h-1.5 w-16" />
                      <span className={`text-sm font-semibold tabular-nums ${corDoPct(r.geral.pct)}`}>{r.geral.pct}%</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{r.geral.concluidas}/{r.geral.total} aulas</div>
                  </TableCell>
                  {modulosOrdenados.map(m => {
                    const pm = r.porModulo[m.id];
                    return (
                      <TableCell key={m.id} className={`tabular-nums ${corDoPct(pm.pct)}`} title={`${pm.concluidas}/${pm.total} aulas`}>
                        {pm.pct}%
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-xs text-muted-foreground">
                    {r.ultimaAtividade
                      ? formatDistanceToNow(new Date(r.ultimaAtividade), { addSuffix: true, locale: ptBR })
                      : "Nunca acessou"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
