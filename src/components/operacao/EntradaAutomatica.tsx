import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Pessoa } from "@/hooks/useDemandas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Tables } from "@/integrations/supabase/types";
import { buscarTudo } from "@/lib/buscar-tudo";
import { errorMessage } from "@/lib/utils";

const FASES = ["acessos", "rastreamento", "estrategia", "operacao", "geral"];
function Etapa({
  inicial,
  pessoas,
  salvar,
}: {
  inicial: Tables<"operacao_onboarding">;
  pessoas: Pessoa[];
  salvar: (r: Tables<"operacao_onboarding">) => Promise<void>;
}) {
  const [r, setR] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex justify-between gap-2">
        <span className="text-sm font-medium capitalize">{r.fase}</span>
        <Switch
          aria-label={`Automatizar etapa ${r.fase}`}
          checked={r.ativa}
          onCheckedChange={(ativa) => setR({ ...r, ativa })}
        />
      </div>
      <Label>
        Responsável proposto
        <select
          className="mt-1 h-10 w-full rounded-md border bg-background px-2"
          value={r.responsavel_id ?? ""}
          onChange={(e) =>
            setR({ ...r, responsavel_id: e.target.value || null })
          }
        >
          <option value="">Selecione</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </Label>
      <Label>
        Prazo em dias após o cadastro
        <Input
          type="number"
          min={0}
          max={90}
          value={r.dias_prazo}
          onChange={(e) => setR({ ...r, dias_prazo: Number(e.target.value) })}
        />
      </Label>
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
        Salvar etapa
      </Button>
    </div>
  );
}
export function EntradaAutomatica({ pessoas }: { pessoas: Pessoa[] }) {
  const { empresa } = useAuth();
  const cache = useQueryClient();
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const key = ["entrada-automatica", empresa?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!empresa,
    refetchInterval: 30000,
    queryFn: async () => {
      const [regras, propostas, clientes] = await Promise.all([
        supabase
          .from("operacao_onboarding")
          .select("*")
          .eq("company_id", empresa!.id),
        buscarTudo((de, ate) =>
          supabase
            .from("operacao_aprovacoes")
            .select("*")
            .eq("company_id", empresa!.id)
            .order("created_at", { ascending: false })
            .order("id")
            .range(de, ate),
        ),
        buscarTudo((de, ate) =>
          supabase
            .from("clients")
            .select("id,name")
            .eq("company_id", empresa!.id)
            .order("id")
            .range(de, ate),
        ),
      ]);
      if (regras.error) throw regras.error;
      return {
        regras: regras.data,
        propostas,
        clientes: new Map(clientes.map((c) => [c.id, c.name])),
      };
    },
  });
  async function salvar(r: Tables<"operacao_onboarding">) {
    if (r.dias_prazo < 0 || r.dias_prazo > 90 || (r.ativa && !r.responsavel_id))
      return void toast.error(
        "Defina um responsável e prazo entre 0 e 90 dias",
      );
    const { error } = await supabase
      .from("operacao_onboarding")
      .upsert(r, { onConflict: "company_id,fase" })
      .select()
      .single();
    if (error)
      return void toast.error(errorMessage(error, "Não foi possível salvar"));
    toast.success("Configuração de entrada salva");
    await cache.invalidateQueries({ queryKey: key });
  }
  async function decidir(id: string, aprovar: boolean) {
    setDecidindo(id);
    const { error } = await supabase.rpc("decidir_onboarding_operacional", {
      _id: id,
      _aprovar: aprovar,
    });
    setDecidindo(null);
    if (error)
      return void toast.error(errorMessage(error, "Não foi possível decidir"));
    toast.success(
      aprovar ? "Etapa aprovada e demanda sincronizada" : "Proposta recusada",
    );
    await cache.invalidateQueries({ queryKey: key });
    await cache.invalidateQueries({ queryKey: ["demandas-operacao"] });
  }
  if (query.error)
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar as configurações de entrada.
      </p>
    );
  if (query.isLoading || !empresa)
    return <p className="text-sm">Carregando entrada automática…</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        O checklist de onboarding já é criado automaticamente. Configure
        propostas de responsável e prazo para novos clientes; a gestão aprova
        cada etapa antes de aplicá-la.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {FASES.map((fase) => {
          const r = query.data?.regras.find((r) => r.fase === fase) ?? {
            company_id: empresa.id,
            fase,
            ativa: false,
            responsavel_id: null,
            dias_prazo: 7,
          };
          return (
            <Etapa
              key={JSON.stringify(r)}
              inicial={r}
              pessoas={pessoas}
              salvar={salvar}
            />
          );
        })}
      </div>
      <p className="font-medium">Aprovações de entrada</p>
      {query.data?.propostas.map((p) => (
        <div key={p.id} className="rounded-xl border p-3">
          <p className="text-sm font-medium">
            {query.data?.clientes.get(p.client_id) ?? "Cliente"} · {p.fase}
          </p>
          <p className="text-xs text-muted-foreground">
            {pessoas.find((x) => x.id === p.responsavel_id)?.nome ??
              "Sem responsável"}{" "}
            · Prazo: {p.prazo.split("-").reverse().join("/")} · {p.status}
          </p>
          {p.status === "pendente" && (
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                disabled={!!decidindo}
                onClick={() => decidir(p.id, true)}
              >
                Aprovar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!decidindo}
                onClick={() => decidir(p.id, false)}
              >
                Recusar
              </Button>
            </div>
          )}
          {p.decidido_at && (
            <p className="text-xs text-muted-foreground">
              Decisão: {new Date(p.decidido_at).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
      ))}
      {!query.data?.propostas.length && (
        <p className="text-sm text-muted-foreground">
          Nenhuma proposta. As etapas ativas geram propostas quando um novo
          cliente é cadastrado.
        </p>
      )}
    </div>
  );
}
