import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { type useDemandas } from "@/hooks/useDemandas";
import { analisarOperacao } from "@/lib/operacao";
import {
  categoriaLabel,
  CATEGORIAS,
  estaAtrasada,
  hojeISO,
  STATUS_DEMANDA,
  statusMeta,
  type Demanda,
} from "@/lib/demandas";
import { type VisaoAgencia, MOTIVO_LABEL } from "@/lib/agencia";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DemandaDetalhe } from "@/components/demandas/DemandaDetalhe";
import { NovaDemandaDialog } from "@/components/demandas/NovaDemandaDialog";
import { CentralOperacional } from "./CentralOperacional";

export function PainelDemandas({
  fonte,
  agora,
  visao,
}: {
  fonte: ReturnType<typeof useDemandas>;
  agora: Date;
  visao: VisaoAgencia;
}) {
  const { empresa } = useAuth();
  const limites = useQuery({
    queryKey: ["limites-operacao", empresa?.id],
    enabled: !!empresa,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operacao_regras")
        .select("tipo, limite_carga, dias_parada")
        .eq("company_id", empresa!.id);
      if (error) throw error;
      return data;
    },
  });
  const limiteCarga =
    limites.data?.find((r) => r.tipo === "carga")?.limite_carga ?? 10;
  const diasParada =
    limites.data?.find((r) => r.tipo === "parada")?.dias_parada ?? 3;
  const analise = useMemo(
    () => analisarOperacao(fonte.demandas, agora, limiteCarga, diasParada),
    [fonte.demandas, agora, limiteCarga, diasParada],
  );
  const entradasPendentes = fonte.clientesDaCarteira.filter(
    (c) =>
      c.status === "active" &&
      c.created_at &&
      agora.getTime() - new Date(c.created_at).getTime() <= 14 * 86400000 &&
      fonte.onboarding.some((t) => t.client_id === c.id && !t.done),
  );
  const [idAberta, setIdAberta] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [status, setStatus] = useState("abertas");
  const [criando, setCriando] = useState(false);
  const nomeCliente = (d: Demanda) =>
    d.client_id
      ? (fonte.clientePorId.get(d.client_id)?.name ?? "Cliente vinculado")
      : "Interna";
  const nomePessoa = (id: string | null) =>
    id ? (fonte.pessoaPorId.get(id)?.nome ?? "Colaborador") : "Sem responsável";
  const lista = analise.demandas.filter((d) => {
    if (categoria && d.categoria !== categoria) return false;
    if (
      responsavel &&
      (responsavel === "sem" ? !!d.assigned_to : d.assigned_to !== responsavel)
    )
      return false;
    if (status === "abertas" && d.status === "concluida") return false;
    if (status === "atrasadas" && !estaAtrasada(d, hojeISO(agora)))
      return false;
    if (!["", "abertas", "atrasadas"].includes(status) && d.status !== status)
      return false;
    return `${d.titulo} ${nomeCliente(d)} ${nomePessoa(d.assigned_to)}`
      .toLowerCase()
      .includes(busca.toLowerCase().trim());
  });
  const cartao = (d: Demanda) => (
    <button
      key={d.id}
      type="button"
      onClick={() => setIdAberta(d.id)}
      className="w-full space-y-1 rounded-xl border bg-card/60 p-3 text-left transition-colors hover:border-primary/50"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium">{d.titulo}</p>
        <Badge
          variant={estaAtrasada(d, hojeISO(agora)) ? "destructive" : "outline"}
        >
          {estaAtrasada(d, hojeISO(agora))
            ? "Atrasada"
            : statusMeta(d.status).label}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {nomeCliente(d)} · {nomePessoa(d.assigned_to)}
      </p>
      <p className="text-xs text-muted-foreground">
        {categoriaLabel(d.categoria)} ·{" "}
        {d.prazo
          ? `Prazo: ${d.prazo.split("-").reverse().join("/")}${d.horario_limite ? ` às ${d.horario_limite.slice(0, 5)}` : ""}`
          : "Sem prazo"}
      </p>
    </button>
  );
  return (
    <>
      {fonte.error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive p-4 text-sm text-destructive"
        >
          Não foi possível atualizar as demandas. Os dados podem estar
          desatualizados.
          <Button
            variant="outline"
            size="sm"
            className="ml-2"
            onClick={fonte.recarregar}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            "Pendentes",
            analise.abertas.filter((d) => d.status === "a_fazer").length,
          ],
          ["Concluídas na semana", analise.concluidasSemana.length],
          ["Vencem em até 2 dias", analise.proximas.length],
          [
            "Clientes pedindo atenção",
            new Set([
              ...visao.atencao.map((c) => c.id),
              ...analise.gargalos.flatMap((g) =>
                g.clientId ? [g.clientId] : [],
              ),
              ...entradasPendentes.map((c) => c.id),
            ]).size,
          ],
        ].map(([nome, n]) => (
          <Card key={nome}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{nome}</p>
              <p className="text-2xl font-semibold">
                {fonte.loading ? "…" : n}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium">Resumo da operação</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {fonte.loading ? "Carregando demandas…" : analise.resumo}
          </p>
        </CardContent>
      </Card>
      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Demandas prioritárias</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {analise.prioridades.slice(0, 8).map(cartao)}
              {!analise.abertas.length && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma demanda aberta.
                </p>
              )}
              <Link
                className="inline-block text-sm text-primary"
                to="/demandas"
              >
                Abrir Central de Demandas →
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Acompanhamento da equipe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {analise.carga.map((c) => (
                <button
                  key={c.pessoa ?? "sem"}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left"
                  onClick={() => {
                    setResponsavel(c.pessoa ?? "sem");
                    setStatus("abertas");
                    document
                      .getElementById("pipeline-demandas")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <span className="text-sm">
                    {nomePessoa(c.pessoa)}
                    {c.sobrecarga && (
                      <span className="block text-xs text-amber-500">
                        Carga elevada: revise a distribuição
                      </span>
                    )}
                  </span>
                  <span className="text-xs">
                    {c.abertas} abertas ·{" "}
                    <span className={c.atrasadas ? "text-destructive" : ""}>
                      {c.atrasadas} atrasadas
                    </span>
                  </span>
                </button>
              ))}
              {!analise.carga.length && (
                <p className="text-sm text-muted-foreground">
                  Equipe sem pendências.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Gargalos e recomendações
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[480px] space-y-3 overflow-y-auto">
              <p className="text-xs text-muted-foreground">
                Análise por regras dos dados disponíveis; confirme os
                impedimentos com a equipe.
              </p>
              {analise.gargalos.map((g) => (
                <div key={g.id} className="rounded-xl border p-3">
                  <p className="text-sm font-medium">{g.problema}</p>
                  {g.clientId && (
                    <p className="text-xs text-primary">
                      {fonte.clientePorId.get(g.clientId)?.name ?? "Cliente"}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Impacto: {g.impacto}
                  </p>
                  <p className="mt-1 text-xs">Ação: {g.sugestao}</p>
                  {g.taskId && (
                    <Button
                      className="mt-2"
                      variant="outline"
                      size="sm"
                      onClick={() => setIdAberta(g.taskId!)}
                    >
                      Ver demanda
                    </Button>
                  )}
                </div>
              ))}
              {entradasPendentes.map((c) => (
                <Link
                  key={`entrada:${c.id}`}
                  to="/onboarding"
                  className="block rounded-xl border p-3"
                >
                  <p className="text-sm font-medium">
                    Entrada incompleta: {c.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cliente cadastrado nos últimos 14 dias com checklist
                    pendente. A operação pode atrasar.
                  </p>
                  <p className="mt-1 text-xs">
                    Confirme os acessos e materiais e defina responsáveis para
                    cada etapa.
                  </p>
                </Link>
              ))}
              {visao.atencao.map((c) => (
                <Link
                  key={c.id}
                  to={`/clients/${c.id}`}
                  className="block rounded-xl border p-3"
                >
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.motivos.map((m) => MOTIVO_LABEL[m]).join(" · ")}
                  </p>
                  <p className="mt-1 text-xs">
                    Revise os indicadores e os alertas do cliente antes de
                    ajustar campanhas ou valores.
                  </p>
                </Link>
              ))}
              {!analise.gargalos.length &&
                !visao.atencao.length &&
                !entradasPendentes.length && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum gargalo detectado.
                  </p>
                )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Reuniões agendadas ({analise.reunioes.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {analise.reunioes.slice(0, 5).map(cartao)}
              {!analise.reunioes.length && (
                <p className="text-sm text-muted-foreground">
                  Sem demandas de reunião agendadas.
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCriando(true)}
              >
                Registrar tarefa do alinhamento
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
      <Card id="pipeline-demandas">
        <CardHeader>
          <CardTitle className="text-base">
            Pipeline de demandas por setor e responsável
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Input
              aria-label="Buscar demandas"
              placeholder="Buscar demanda, cliente ou colaborador"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <select
              aria-label="Setor"
              className="h-10 rounded-md border bg-background px-2"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              <option value="">Todos os setores</option>
              {CATEGORIAS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Responsável"
              className="h-10 rounded-md border bg-background px-2"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
            >
              <option value="">Todos os responsáveis</option>
              <option value="sem">Sem responsável</option>
              {fonte.pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <select
              aria-label="Status"
              className="h-10 rounded-md border bg-background px-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="abertas">Todas as abertas</option>
              <option value="">Todos os status</option>
              <option value="atrasadas">Atrasadas</option>
              {STATUS_DEMANDA.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            {lista.length} demanda(s) · atualização automática a cada 30
            segundos e ao mudar dados
          </p>
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {CATEGORIAS.filter((c) =>
              lista.some((d) => d.categoria === c.id),
            ).map((c) => (
              <section key={c.id} className="rounded-xl bg-muted/30 p-3">
                <p className="mb-2 text-sm font-medium">{c.label}</p>
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {lista.filter((d) => d.categoria === c.id).map(cartao)}
                </div>
              </section>
            ))}
          </div>
          {!lista.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma demanda neste filtro.
            </p>
          )}
        </CardContent>
      </Card>
      <CentralOperacional pessoas={fonte.pessoas} />
      <DemandaDetalhe
        demanda={fonte.demandas.find((d) => d.id === idAberta) ?? null}
        onClose={() => setIdAberta(null)}
        onChange={fonte.substituir}
        onDelete={(id) => {
          fonte.remover(id);
          setIdAberta(null);
        }}
        clientesDaCarteira={fonte.clientesDaCarteira}
        clientePorId={fonte.clientePorId}
        pessoas={fonte.pessoas}
        pessoaPorId={fonte.pessoaPorId}
      />
      <NovaDemandaDialog
        open={criando}
        onOpenChange={setCriando}
        clientes={fonte.clientesDaCarteira}
        pessoas={fonte.pessoas}
        onCreated={fonte.substituir}
      />
    </>
  );
}
