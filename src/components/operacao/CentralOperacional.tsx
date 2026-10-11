import { EntradaAutomatica } from "./EntradaAutomatica";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Pessoa } from "@/hooks/useDemandas";
import {
  AUTOMACOES_OPERACIONAIS,
  regraPadrao,
  type RegraOperacional,
} from "@/lib/automacoes-operacionais";
import { buscarTudo } from "@/lib/buscar-tudo";
import { veTodosOsClientes } from "@/lib/permissoes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/utils";

function EditorRegra({
  regra,
  pessoas,
  salvar,
}: {
  regra: RegraOperacional;
  pessoas: Pessoa[];
  salvar: (r: RegraOperacional) => Promise<void>;
}) {
  const [r, setR] = useState(regra);
  const [salvando, setSalvando] = useState(false);
  const meta = AUTOMACOES_OPERACIONAIS.find((a) => a.id === r.tipo)!;
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{meta.nome}</p>
          <p className="text-xs text-muted-foreground">{meta.descricao}</p>
        </div>
        <Switch
          aria-label={`Ativar ${meta.nome}`}
          checked={r.ativa}
          onCheckedChange={(ativa) => setR({ ...r, ativa })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label>
          Horário diário (Brasília)
          <Input
            type="time"
            value={r.horario.slice(0, 5)}
            onChange={(e) => setR({ ...r, horario: e.target.value })}
          />
        </Label>
        {["prazo", "reuniao"].includes(r.tipo) && (
          <Label>
            Antecedência
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3"
              value={r.antecedencia_horas}
              onChange={(e) =>
                setR({ ...r, antecedencia_horas: Number(e.target.value) })
              }
            >
              <option value={24}>No dia anterior</option>
              <option value={2}>
                Duas horas antes (exige horário na demanda)
              </option>
            </select>
          </Label>
        )}
        {r.tipo === "parada" && (
          <Label>
            Dias sem atualização
            <Input
              type="number"
              min={1}
              max={90}
              value={r.dias_parada}
              onChange={(e) =>
                setR({ ...r, dias_parada: Number(e.target.value) })
              }
            />
          </Label>
        )}
        {r.tipo === "carga" && (
          <Label>
            Limite de pendências
            <Input
              type="number"
              min={1}
              max={1000}
              value={r.limite_carga}
              onChange={(e) =>
                setR({ ...r, limite_carga: Number(e.target.value) })
              }
            />
          </Label>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        Destinatários adicionais (ADM). O responsável recebe os avisos das
        próprias demandas.
      </div>
      <div className="flex max-h-32 flex-wrap gap-3 overflow-y-auto">
        {pessoas
          .filter((p) => ["admin", "owner"].includes(p.role))
          .map((p) => (
            <label key={p.id} className="flex items-center gap-1.5 text-xs">
              <Checkbox
                checked={r.destinatarios.includes(p.id)}
                onCheckedChange={(v) =>
                  setR({
                    ...r,
                    destinatarios: v
                      ? [...r.destinatarios, p.id]
                      : r.destinatarios.filter((id) => id !== p.id),
                  })
                }
              />
              {p.nome}
            </label>
          ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={r.whatsapp}
          onCheckedChange={(v) => setR({ ...r, whatsapp: !!v })}
        />
        Autorizar avisos por WhatsApp
      </label>
      <p className="text-xs text-muted-foreground">
        Os avisos aparecem no sino do sistema. WhatsApp exige integração
        conectada e número cadastrado em Configurações → Equipe.
      </p>
      <Button
        size="sm"
        disabled={salvando}
        onClick={async () => {
          setSalvando(true);
          try {
            await salvar(r);
          } finally {
            setSalvando(false);
          }
        }}
      >
        {salvando ? "Salvando…" : "Salvar regra"}
      </Button>
    </div>
  );
}

export function CentralOperacional({ pessoas }: { pessoas: Pessoa[] }) {
  const { empresa, user, role } = useAuth();
  const admin = veTodosOsClientes(role);
  const cache = useQueryClient();
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState("alerta");
  const [salvando, setSalvando] = useState(false);
  const [mostrarResolvidos, setMostrarResolvidos] = useState(false);
  const key = ["central-operacional", empresa?.id, user?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!empresa?.id,
    refetchInterval: 30000,
    queryFn: async () => {
      const [avisos, regras, execucoes] = await Promise.all([
        buscarTudo((de, ate) =>
          supabase
            .from("operacao_avisos")
            .select("*")
            .eq("company_id", empresa!.id)
            .order("created_at", { ascending: false })
            .order("id")
            .range(de, ate),
        ),
        supabase
          .from("operacao_regras")
          .select("*")
          .eq("company_id", empresa!.id),
        supabase
          .from("operacao_execucoes")
          .select("*")
          .eq("company_id", empresa!.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (regras.error) throw regras.error;
      if (execucoes.error) throw execucoes.error;
      return {
        avisos,
        regras: regras.data as RegraOperacional[],
        execucoes: execucoes.data,
      };
    },
  });
  const atualizar = () => cache.invalidateQueries({ queryKey: key });
  async function salvarRegra(r: RegraOperacional) {
    if (
      !r.horario ||
      r.dias_parada < 1 ||
      r.dias_parada > 90 ||
      r.limite_carga < 1 ||
      r.limite_carga > 1000
    )
      return void toast.error("Revise os limites e o horário");
    const { updated_at: _, ...payload } = r;
    const { error } = await supabase
      .from("operacao_regras")
      .upsert(payload, { onConflict: "company_id,tipo" })
      .select()
      .single();
    if (error) {
      toast.error(errorMessage(error, "Não foi possível salvar"));
      return;
    }
    toast.success("Regra salva");
    await atualizar();
    await cache.invalidateQueries({
      queryKey: ["limites-operacao", empresa?.id],
    });
  }
  async function publicar() {
    if (!texto.trim() || !empresa || !user) return;
    setSalvando(true);
    const { error } = await supabase
      .from("operacao_avisos")
      .insert({
        company_id: empresa.id,
        autor_id: user.id,
        tipo,
        texto: texto.trim(),
      })
      .select()
      .single();
    setSalvando(false);
    if (error)
      return void toast.error(
        errorMessage(error, "Não foi possível registrar"),
      );
    setTexto("");
    await atualizar();
  }
  async function resolver(id: string, resolvido: boolean) {
    const { error } = await supabase
      .from("operacao_avisos")
      .update({ resolvido_at: resolvido ? null : new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error)
      return void toast.error(
        errorMessage(error, "Não foi possível atualizar"),
      );
    await atualizar();
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Central da operação</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="avisos">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="avisos">Alertas e ideias</TabsTrigger>
            {admin && (
              <>
                <TabsTrigger value="regras">Central de Automações</TabsTrigger>
                <TabsTrigger value="entrada">Entrada e aprovações</TabsTrigger>
              </>
            )}
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>
          {query.isLoading && (
            <p className="py-4 text-sm">Carregando central…</p>
          )}
          {query.error && (
            <div className="py-4 text-sm text-destructive">
              Não foi possível carregar a central. Verifique a instalação dos
              recursos operacionais.
              <Button
                variant="outline"
                size="sm"
                className="ml-2"
                onClick={() => query.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          )}
          {!query.error && !query.isLoading && empresa && (
            <>
              <TabsContent value="avisos" className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    aria-label="Tipo de aviso"
                    className="h-10 rounded-md border bg-background px-3"
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value)}
                  >
                    {["alerta", "ideia", "problema", "aviso"].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={mostrarResolvidos}
                      onCheckedChange={(v) => setMostrarResolvidos(!!v)}
                    />
                    Mostrar resolvidos
                  </label>
                </div>
                <Textarea
                  maxLength={3000}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Registre um alerta, ideia ou ponto de atenção para a equipe…"
                />
                <Button disabled={salvando || !texto.trim()} onClick={publicar}>
                  Registrar
                </Button>
                {query.data?.avisos
                  .filter((a) => mostrarResolvidos || !a.resolvido_at)
                  .map((a) => (
                    <div key={a.id} className="rounded-xl border p-3">
                      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {a.tipo} ·{" "}
                          {pessoas.find((p) => p.id === a.autor_id)?.nome ??
                            "Equipe"}{" "}
                          · {new Date(a.created_at).toLocaleString("pt-BR")}
                        </span>
                        <span>{a.resolvido_at ? "Resolvido" : "Aberto"}</span>
                      </div>
                      <p className="my-2 whitespace-pre-wrap break-words text-sm">
                        {a.texto}
                      </p>
                      {(admin || a.autor_id === user?.id) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resolver(a.id, !!a.resolvido_at)}
                        >
                          {a.resolvido_at ? "Reabrir" : "Marcar como resolvido"}
                        </Button>
                      )}
                    </div>
                  ))}
                {!query.data?.avisos.some(
                  (a) => mostrarResolvidos || !a.resolvido_at,
                ) && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum aviso neste filtro.
                  </p>
                )}
              </TabsContent>
              {admin && (
                <TabsContent value="regras" className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Estas regras enviam avisos; mudanças em campanhas, valores,
                    responsáveis e prazos são realizadas pela gestão nas telas
                    de origem.
                  </p>
                  {AUTOMACOES_OPERACIONAIS.map((a) => {
                    const r =
                      query.data?.regras.find((r) => r.tipo === a.id) ??
                      regraPadrao(empresa.id, a.id);
                    return (
                      <EditorRegra
                        key={`${a.id}:${r.updated_at}`}
                        regra={r}
                        pessoas={pessoas}
                        salvar={salvarRegra}
                      />
                    );
                  })}
                  <div className="rounded-xl border p-4 text-sm space-y-2">
                    <p className="font-medium">Automações que já existem</p>
                    <p>
                      <Link className="text-primary" to="/rotina">
                        Rotinas recorrentes
                      </Link>
                      : dias, responsáveis e ocorrências semanais.
                    </p>
                    <p>
                      <Link className="text-primary" to="/onboarding">
                        Entrada de clientes
                      </Link>
                      : checklist automático e demandas sincronizadas por etapa.
                    </p>
                    <p>
                      <Link className="text-primary" to="/alerts">
                        Metas de campanhas
                      </Link>
                      : regras e canais de aviso.
                    </p>
                    <p>
                      <Link className="text-primary" to="/automations">
                        Envios e histórico de campanhas
                      </Link>
                      .
                    </p>
                  </div>
                </TabsContent>
              )}
              {admin && (
                <TabsContent value="entrada">
                  <EntradaAutomatica pessoas={pessoas} />
                </TabsContent>
              )}
              <TabsContent value="historico" className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Últimos 50 avisos automáticos. Cada ocorrência e destinatário
                  recebem um único registro.
                </p>
                {query.data?.execucoes.map((e) => (
                  <div key={e.id} className="rounded-xl border p-3">
                    <p className="text-sm font-medium">{e.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("pt-BR")} ·{" "}
                      {pessoas.find((p) => p.id === e.destinatario)?.nome ??
                        "Colaborador"}{" "}
                      · WhatsApp: {e.whatsapp_status}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {e.mensagem}
                    </p>
                    {e.erro && (
                      <p className="text-xs text-destructive">{e.erro}</p>
                    )}
                  </div>
                ))}
                {!query.data?.execucoes.length && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum aviso automático executado.
                  </p>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
