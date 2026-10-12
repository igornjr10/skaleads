import { ClientAvatar } from "@/components/ClientAvatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { quando, type LinhaGrupo } from "./grupos-logica";
import { AcoesDoGrupo, type AcoesGrupoProps } from "./GrupoCard";
import { EsperaGrupo, Responsaveis, StatusGrupo, TituloDoGrupo } from "./GrupoPartes";

export function GruposTabela({ linhas, acoes }: { linhas: LinhaGrupo[]; acoes: AcoesGrupoProps }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/60 shadow-card">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[24%]">Grupo</TableHead>
            <TableHead className="w-[20%]">Cliente</TableHead>
            <TableHead className="hidden w-[16%] lg:table-cell">Responsáveis</TableHead>
            <TableHead className="w-[12%]">Situação</TableHead>
            <TableHead>Última atividade</TableHead>
            <TableHead className="w-[15%] text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map(l => {
            const t = l.triagem;
            return (
              <TableRow key={l.chave} className="align-top">
                <TableCell className="py-3 text-sm">
                  <TituloDoGrupo linha={l} />
                </TableCell>
                <TableCell className="py-3">
                  {l.cliente ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <ClientAvatar name={l.cliente.name} logoUrl={l.cliente.logo_url} className="h-7 w-7" />
                      <span className="truncate text-sm font-medium" title={l.cliente.name}>{l.cliente.name}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem cliente</span>
                  )}
                </TableCell>
                <TableCell className="hidden py-3 lg:table-cell">
                  {l.cliente ? <Responsaveis pessoas={l.responsaveis} /> : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="py-3">
                  <StatusGrupo linha={l} />
                </TableCell>
                <TableCell className="py-3">
                  {t?.ultima_mensagem ? (
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm" title={t.ultima_mensagem}>{t.ultima_mensagem}</p>
                      <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        <span className="max-w-[8rem] truncate" title={t.ultima_de ?? ""}>{t.ultima_de}</span>
                        <span className="whitespace-nowrap">{quando(t.ultima_em)}</span>
                        <EsperaGrupo linha={l} />
                        {!!t.perguntas_abertas?.length && (
                          <span className="whitespace-nowrap text-amber-700 dark:text-amber-400">
                            {t.perguntas_abertas.length} pergunta(s) aberta(s)
                          </span>
                        )}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {l.situacao === "vinculado" ? "Ainda sem leitura" : "—"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-3">
                  <div className="flex justify-end">
                    <AcoesDoGrupo linha={l} p={acoes} cheio />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
