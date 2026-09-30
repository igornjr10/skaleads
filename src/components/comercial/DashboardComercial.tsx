import { useMemo, useState } from "react";
import { subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Pessoa } from "@/hooks/useDemandas";
import { rotuloPapel } from "@/lib/permissoes";
import {
  type Atividade, type Etapa, type Lead,
  funilAcumulado, motivosDePerda, produtividadeDe, produtividadePorPessoa, taxaDeGanho,
} from "@/lib/comercial";

const PAPEIS_COMERCIAIS = ["sdr", "closer", "social_seller"];

export function DashboardComercial({ leads, etapas, atividades, pessoas }: {
  leads: Lead[];
  etapas: Etapa[];
  atividades: Atividade[];
  pessoas: Pessoa[];
}) {
  const [dias, setDias] = useState("30");
  const desde = useMemo(() => subDays(new Date(), Number(dias)), [dias]);
  const noPeriodo = (iso: string | null) => !!iso && new Date(iso) >= desde;

  const porPessoa = useMemo(() => produtividadePorPessoa(atividades, desde), [atividades, desde]);
  const total = useMemo(() => {
    const soma = { contatos: 0, ligacoes: 0, mensagens: 0, reunioesMarcadas: 0, reunioesRealizadas: 0, propostas: 0 };
    for (const p of porPessoa.values()) {
      soma.contatos += p.contatos; soma.ligacoes += p.ligacoes; soma.mensagens += p.mensagens;
      soma.reunioesMarcadas += p.reunioesMarcadas; soma.reunioesRealizadas += p.reunioesRealizadas; soma.propostas += p.propostas;
    }
    return soma;
  }, [porPessoa]);

  const novos = leads.filter(l => noPeriodo(l.created_at)).length;
  const ganhos = leads.filter(l => noPeriodo(l.ganho_em));
  const perdidos = leads.filter(l => noPeriodo(l.perdido_em));
  const encerradosNoPeriodo = [...ganhos, ...perdidos];
  const taxa = taxaDeGanho(encerradosNoPeriodo);
  const funil = funilAcumulado(etapas, leads);
  const topo = Math.max(funil[0]?.total ?? 0, 1);

  // Time comercial sempre aparece (zerado conta); os demais so se registraram algo.
  const linhas = pessoas.filter(p => PAPEIS_COMERCIAIS.includes(p.role) || porPessoa.has(p.id)).map(p => {
    const prod = produtividadeDe(porPessoa, p.id);
    const seus = leads.filter(l => l.responsavel_id === p.id || l.closer_id === p.id);
    return {
      pessoa: p,
      prod,
      fechados: seus.filter(l => noPeriodo(l.ganho_em)).length,
      taxa: taxaDeGanho(seus.filter(l => noPeriodo(l.ganho_em) || noPeriodo(l.perdido_em))),
    };
  }).sort((a, b) => b.prod.contatos - a.prod.contatos);

  const numeros: [string, number | string][] = [
    ["Leads novos", novos],
    ["Contatos", total.contatos],
    ["Ligações", total.ligacoes],
    ["Mensagens", total.mensagens],
    ["Reuniões marcadas", total.reunioesMarcadas],
    ["Reuniões realizadas", total.reunioesRealizadas],
    ["Propostas", total.propostas],
    ["Fechamentos", ganhos.length],
    ["Perdidos", perdidos.length],
    ["Taxa de fechamento", taxa === null ? "—" : `${Math.round(taxa * 100)}%`],
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={dias} onValueChange={setDias}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {numeros.map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3">
            <div className="text-2xl font-semibold tabular-nums">{valor}</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Funil de prospecção</CardTitle>
            <p className="text-xs text-muted-foreground">Quantos leads chegaram pelo menos a cada etapa (hoje, sem os perdidos).</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {funil.map((linha, i) => {
              const anterior = funil[i - 1]?.total;
              const passagem = anterior ? Math.round((linha.total / anterior) * 100) : null;
              return (
                <div key={linha.nome}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{linha.nome}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {linha.total}{passagem !== null && <span className="ml-2 text-xs">{passagem}% da etapa anterior</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(linha.total / topo) * 100}%` }} />
                  </div>
                </div>
              );
            })}
            {funil.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Sem etapas.</p>}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2"><CardTitle className="text-base">Por pessoa</CardTitle></CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead>
                    <TableHead className="text-right">Contatos</TableHead>
                    <TableHead className="text-right">Ligações</TableHead>
                    <TableHead className="text-right">Msgs</TableHead>
                    <TableHead className="text-right">Reuniões</TableHead>
                    <TableHead className="text-right">Propostas</TableHead>
                    <TableHead className="text-right">Fechou</TableHead>
                    <TableHead className="text-right">Taxa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map(({ pessoa, prod, fechados, taxa: t }) => (
                    <TableRow key={pessoa.id}>
                      <TableCell>
                        <div className="font-medium">{pessoa.nome}</div>
                        <div className="text-xs text-muted-foreground">{rotuloPapel(pessoa.role)}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{prod.contatos}</TableCell>
                      <TableCell className="text-right tabular-nums">{prod.ligacoes}</TableCell>
                      <TableCell className="text-right tabular-nums">{prod.mensagens}</TableCell>
                      <TableCell className="text-right tabular-nums">{prod.reunioesMarcadas} / {prod.reunioesRealizadas}</TableCell>
                      <TableCell className="text-right tabular-nums">{prod.propostas}</TableCell>
                      <TableCell className="text-right tabular-nums">{fechados}</TableCell>
                      <TableCell className="text-right tabular-nums">{t === null ? "—" : `${Math.round(t * 100)}%`}</TableCell>
                    </TableRow>
                  ))}
                  {linhas.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">Ninguém do time comercial ainda.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="px-6 pt-2 text-[11px] text-muted-foreground">Reuniões = marcadas / realizadas.</p>
          </CardContent>
        </Card>
      </div>

      {perdidos.length > 0 && (
        <Card className="shadow-card">
          <CardHeader className="pb-2"><CardTitle className="text-base">Motivos de perda no período</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {motivosDePerda(perdidos).map(p => (
              <span key={p.motivo} className="rounded-full border border-border/60 px-3 py-1 text-xs">{p.motivo} · <strong>{p.total}</strong></span>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
