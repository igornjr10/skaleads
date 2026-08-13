import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Play,
  RotateCcw,
  Save,
  Send,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientAvatar } from "@/components/ClientAvatar";

interface Cliente {
  id: string;
  name: string;
  logo_url: string | null;
  status: string;
  whatsapp_number: string | null;
  whatsapp_group_jid: string | null;
}

interface Mensalidade {
  client_id: string;
  monthly_fee: number;
  billing_day: number;
  enabled: boolean;
  destino: string;
}

interface Fatura {
  id: string;
  client_id: string;
  competencia: string;
  due_date: string;
  amount: number;
  status: "aberta" | "paga" | "vencida" | "cancelada";
  paid_at: string | null;
}

interface Ajustes {
  team_id: string;
  pix_key: string | null;
  payment_link: string | null;
  regua: number[];
  template_antes: string;
  template_vencimento: string;
  template_atraso: string;
  modo_teste: boolean;
  teste_numero: string | null;
}

const STATUS_BADGE: Record<Fatura["status"], { label: string; className: string }> = {
  aberta: { label: "Em aberto", className: "border-sky-500/30 bg-sky-500/10 text-sky-400" },
  paga: { label: "Paga", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  vencida: { label: "Vencida", className: "border-rose-500/30 bg-rose-500/10 text-rose-400" },
  cancelada: { label: "Cancelada", className: "border-border bg-muted/40 text-muted-foreground" },
};

function moeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Financeiro() {
  const { role } = useAuth();
  const podeGerenciar = role === "owner" || role === "admin";

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mensalidades, setMensalidades] = useState<Record<string, Mensalidade>>({});
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [rodando, setRodando] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);

    const [clientesRes, mensalidadesRes, faturasRes, ajustesRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name, logo_url, status, whatsapp_number, whatsapp_group_jid")
        .order("name"),
      supabase.from("client_billing").select("client_id, monthly_fee, billing_day, enabled, destino"),
      supabase.from("invoices").select("id, client_id, competencia, due_date, amount, status, paid_at").order("due_date"),
      supabase.from("billing_settings").select("*").maybeSingle(),
    ]);

    if (mensalidadesRes.error?.code === "42P01") {
      setSemTabela(true);
      setLoading(false);
      return;
    }

    setClientes((clientesRes.data as Cliente[]) ?? []);
    setFaturas((faturasRes.data as Fatura[]) ?? []);
    setMensalidades(
      Object.fromEntries(((mensalidadesRes.data as Mensalidade[]) ?? []).map((m) => [m.client_id, m]))
    );

    if (ajustesRes.data) {
      setAjustes(ajustesRes.data as Ajustes);
    } else {
      // Time ainda sem ajustes: monta o rascunho local. O motor não dispara nada
      // enquanto essa linha não existir no banco.
      const { data: teamId } = await supabase.rpc("my_team_id");
      setAjustes({
        team_id: teamId as string,
        pix_key: "",
        payment_link: "",
        regua: [-5, -3, -1, 0, 3, 7],
        template_antes:
          "Oi! Passando para lembrar que a mensalidade de {{cliente}} vence em {{vencimento}} ({{dias}} dias). Valor: {{valor}}.\n\n{{pagamento}}\n\nQualquer duvida e so chamar.",
        template_vencimento:
          "Oi! A mensalidade de {{cliente}} vence hoje, {{vencimento}}. Valor: {{valor}}.\n\n{{pagamento}}",
        template_atraso:
          "Oi! A mensalidade de {{cliente}}, com vencimento em {{vencimento}}, consta em aberto ha {{dias}} dias. Valor: {{valor}}.\n\n{{pagamento}}\n\nSe o pagamento ja foi feito, me avisa que eu dou baixa.",
        modo_teste: true,
        teste_numero: "",
      });
    }

    setLoading(false);
  }

  const mesAtual = format(new Date(), "yyyy-MM");
  const faturasDoMes = useMemo(
    () => faturas.filter((f) => f.competencia.startsWith(mesAtual)),
    [faturas, mesAtual]
  );

  const kpis = useMemo(() => {
    const ativos = Object.values(mensalidades).filter((m) => m.enabled);
    return {
      mrr: ativos.reduce((soma, m) => soma + Number(m.monthly_fee), 0),
      ativos: ativos.length,
      aReceber: faturasDoMes
        .filter((f) => f.status === "aberta" || f.status === "vencida")
        .reduce((soma, f) => soma + Number(f.amount), 0),
      recebido: faturasDoMes.filter((f) => f.status === "paga").reduce((soma, f) => soma + Number(f.amount), 0),
      vencido: faturas
        .filter((f) => f.status === "vencida")
        .reduce((soma, f) => soma + Number(f.amount), 0),
    };
  }, [mensalidades, faturasDoMes, faturas]);

  const nomePorCliente = useMemo(
    () => Object.fromEntries(clientes.map((c) => [c.id, c])),
    [clientes]
  );

  async function mudarStatus(fatura: Fatura, status: Fatura["status"]) {
    const anterior = faturas;
    setFaturas((atual) => atual.map((f) => (f.id === fatura.id ? { ...f, status } : f)));
    const { error } = await supabase.from("invoices").update({ status }).eq("id", fatura.id);
    if (error) {
      setFaturas(anterior);
      toast.error(error.message);
    }
  }

  async function salvarMensalidade(clienteId: string, dados: Partial<Mensalidade>) {
    const atual = mensalidades[clienteId];
    const registro = {
      client_id: clienteId,
      monthly_fee: dados.monthly_fee ?? atual?.monthly_fee ?? 0,
      billing_day: dados.billing_day ?? atual?.billing_day ?? 10,
      enabled: dados.enabled ?? atual?.enabled ?? false,
      destino: dados.destino ?? atual?.destino ?? "auto",
    };

    setMensalidades((a) => ({ ...a, [clienteId]: registro as Mensalidade }));

    const { error } = await supabase.from("client_billing").upsert(registro, { onConflict: "client_id" });
    if (error) {
      toast.error(error.message);
      carregar();
    }
  }

  async function salvarAjustes() {
    if (!ajustes) return;
    setSalvando(true);
    const { error } = await supabase
      .from("billing_settings")
      .upsert({ ...ajustes, updated_at: new Date().toISOString() }, { onConflict: "team_id" });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Ajustes salvos");
  }

  async function rodarAgora() {
    setRodando(true);
    const { data, error } = await supabase.functions.invoke("billing-cron", { body: {} });
    setRodando(false);

    if (error || data?.error) return toast.error(data?.error || error?.message || "Falha ao rodar");

    toast.success(
      `${data.faturas_geradas} fatura(s) gerada(s) · ${data.enviados} cobrança(s) enviada(s)` +
        (data.falhas ? ` · ${data.falhas} falha(s)` : "")
    );
    carregar();
  }

  if (semTabela) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Wallet className="h-8 w-8 text-muted-foreground" />
          <h2 className="text-base font-semibold">Financeiro ainda não instalado no banco</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Rode a migration <code className="text-primary">20260812000008_financeiro.sql</code> e recarregue.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
            <CircleDollarSign className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
            <p className="text-sm text-muted-foreground">
              Mensalidades, faturas e cobrança automática por WhatsApp.
            </p>
          </div>
        </div>

        {podeGerenciar && (
          <div className="flex items-center gap-2">
            {ajustes?.modo_teste && (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
                Modo teste
              </Badge>
            )}
            <Button variant="outline" onClick={rodarAgora} disabled={rodando}>
              <Play className="mr-2 h-4 w-4" />
              {rodando ? "Rodando..." : "Rodar cobrança agora"}
            </Button>
          </div>
        )}
      </div>

      {/* ── KPIs ────────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "MRR ativo", valor: moeda(kpis.mrr), hint: `${kpis.ativos} cliente(s) na régua`, icon: Wallet },
          { label: "A receber no mês", valor: moeda(kpis.aReceber), hint: "aberto + vencido", icon: Clock },
          { label: "Recebido no mês", valor: moeda(kpis.recebido), hint: "baixas confirmadas", icon: CheckCircle2 },
          { label: "Vencido", valor: moeda(kpis.vencido), hint: "todas as competências", icon: AlertTriangle },
        ].map(({ label, valor, hint, icon: Icone }) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{hint}</p>
                </div>
                <Icone className="h-4 w-4 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="faturas">
        <TabsList>
          <TabsTrigger value="faturas">Faturas do mês</TabsTrigger>
          <TabsTrigger value="mensalidades">Mensalidades</TabsTrigger>
          {podeGerenciar && <TabsTrigger value="ajustes">Ajustes da cobrança</TabsTrigger>}
        </TabsList>

        {/* ── Faturas ───────────────────────────────────────────────────── */}
        <TabsContent value="faturas" className="mt-4 space-y-2">
          {faturasDoMes.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <CircleDollarSign className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Nenhuma fatura neste mês</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  As faturas são geradas automaticamente para clientes com mensalidade ativa. Cadastre em
                  "Mensalidades" e use "Rodar cobrança agora" para gerar na hora.
                </p>
              </CardContent>
            </Card>
          ) : (
            faturasDoMes.map((fatura) => {
              const cliente = nomePorCliente[fatura.client_id];
              const badge = STATUS_BADGE[fatura.status];
              return (
                <Card key={fatura.id}>
                  <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                    <ClientAvatar name={cliente?.name ?? "Cliente"} logoUrl={cliente?.logo_url} />

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{cliente?.name ?? "Cliente removido"}</p>
                      <p className="text-xs text-muted-foreground">
                        Vence em {format(new Date(`${fatura.due_date}T00:00:00`), "dd 'de' MMMM", { locale: ptBR })}
                        {fatura.paid_at && ` · paga em ${format(new Date(fatura.paid_at), "dd/MM")}`}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{moeda(Number(fatura.amount))}</p>
                      <Badge variant="outline" className={`mt-1 ${badge.className}`}>
                        {badge.label}
                      </Badge>
                    </div>

                    {podeGerenciar && (
                      <div className="flex shrink-0 gap-2">
                        {fatura.status === "paga" ? (
                          <Button size="sm" variant="ghost" onClick={() => mudarStatus(fatura, "aberta")}>
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            Reabrir
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => mudarStatus(fatura, "paga")}>
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            Dar baixa
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ── Mensalidades ──────────────────────────────────────────────── */}
        <TabsContent value="mensalidades" className="mt-4 space-y-2">
          {clientes
            .filter((c) => c.status === "active")
            .map((cliente) => {
              const m = mensalidades[cliente.id];
              const semWhatsapp = !cliente.whatsapp_number && !cliente.whatsapp_group_jid;
              return (
                <Card key={cliente.id}>
                  <CardContent className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <ClientAvatar name={cliente.name} logoUrl={cliente.logo_url} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{cliente.name}</p>
                        {semWhatsapp && (
                          <p className="text-[11px] text-amber-400">
                            Sem WhatsApp cadastrado — a cobrança não tem para onde ir
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-32">
                        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Mensalidade</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={!podeGerenciar}
                          defaultValue={m?.monthly_fee ?? ""}
                          placeholder="0,00"
                          onBlur={(e) =>
                            salvarMensalidade(cliente.id, { monthly_fee: Number(e.target.value || 0) })
                          }
                        />
                      </div>

                      <div className="w-24">
                        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Vence dia</Label>
                        <Input
                          type="number"
                          min="1"
                          max="28"
                          disabled={!podeGerenciar}
                          defaultValue={m?.billing_day ?? 10}
                          onBlur={(e) =>
                            salvarMensalidade(cliente.id, { billing_day: Number(e.target.value || 10) })
                          }
                        />
                      </div>

                      <div className="w-36">
                        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Enviar para</Label>
                        <Select
                          value={m?.destino ?? "auto"}
                          disabled={!podeGerenciar}
                          onValueChange={(v) => salvarMensalidade(cliente.id, { destino: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Automático</SelectItem>
                            <SelectItem value="numero">Número</SelectItem>
                            <SelectItem value="grupo">Grupo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center gap-2 pb-2">
                        <Switch
                          checked={m?.enabled ?? false}
                          disabled={!podeGerenciar || !m?.monthly_fee}
                          onCheckedChange={(v) => salvarMensalidade(cliente.id, { enabled: v })}
                        />
                        <span className="text-xs text-muted-foreground">Cobrança automática</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </TabsContent>

        {/* ── Ajustes ───────────────────────────────────────────────────── */}
        {podeGerenciar && ajustes && (
          <TabsContent value="ajustes" className="mt-4">
            <Card>
              <CardContent className="space-y-6 pt-6">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">Modo teste</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Com isto ligado, toda cobrança vai para o número abaixo em vez de ir para o cliente.
                        Desligue só depois de conferir uma mensagem real.
                      </p>
                    </div>
                    <Switch
                      checked={ajustes.modo_teste}
                      onCheckedChange={(v) => setAjustes({ ...ajustes, modo_teste: v })}
                    />
                  </div>
                  {ajustes.modo_teste && (
                    <Input
                      className="mt-3"
                      value={ajustes.teste_numero ?? ""}
                      onChange={(e) => setAjustes({ ...ajustes, teste_numero: e.target.value })}
                      placeholder="Número de teste com DDI, ex: 5511999999999"
                    />
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Chave PIX</Label>
                    <Input
                      className="mt-1.5"
                      value={ajustes.pix_key ?? ""}
                      onChange={(e) => setAjustes({ ...ajustes, pix_key: e.target.value })}
                      placeholder="CNPJ, e-mail ou chave aleatória"
                    />
                  </div>
                  <div>
                    <Label>Link de pagamento (opcional)</Label>
                    <Input
                      className="mt-1.5"
                      value={ajustes.payment_link ?? ""}
                      onChange={(e) => setAjustes({ ...ajustes, payment_link: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div>
                  <Label>Régua de cobrança</Label>
                  <Input
                    className="mt-1.5"
                    value={ajustes.regua.join(", ")}
                    onChange={(e) =>
                      setAjustes({
                        ...ajustes,
                        regua: e.target.value
                          .split(",")
                          .map((n) => parseInt(n.trim(), 10))
                          .filter((n) => !Number.isNaN(n)),
                      })
                    }
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Negativo = dias antes do vencimento · 0 = no dia · positivo = dias de atraso.
                    Cada número dispara no máximo uma mensagem por fatura.
                  </p>
                </div>

                {(
                  [
                    ["template_antes", "Antes do vencimento"],
                    ["template_vencimento", "No dia do vencimento"],
                    ["template_atraso", "Em atraso"],
                  ] as const
                ).map(([campo, rotulo]) => (
                  <div key={campo}>
                    <Label>{rotulo}</Label>
                    <Textarea
                      className="mt-1.5 min-h-28 font-mono text-xs"
                      value={ajustes[campo]}
                      onChange={(e) => setAjustes({ ...ajustes, [campo]: e.target.value })}
                    />
                  </div>
                ))}

                <p className="text-xs text-muted-foreground">
                  Variáveis: <code className="text-primary">{"{{cliente}}"}</code>{" "}
                  <code className="text-primary">{"{{valor}}"}</code>{" "}
                  <code className="text-primary">{"{{vencimento}}"}</code>{" "}
                  <code className="text-primary">{"{{dias}}"}</code>{" "}
                  <code className="text-primary">{"{{pagamento}}"}</code>
                </p>

                <div className="flex items-center gap-3">
                  <Button onClick={salvarAjustes} disabled={salvando}>
                    <Save className="mr-2 h-4 w-4" />
                    {salvando ? "Salvando..." : "Salvar ajustes"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    <Send className="mr-1 inline h-3 w-3" />
                    Nada é enviado enquanto estes ajustes não forem salvos.
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
