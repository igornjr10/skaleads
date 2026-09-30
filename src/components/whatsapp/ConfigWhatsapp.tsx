import { useEffect, useState } from "react";
import { CircleCheck, CircleX, Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/utils";
import { type LimitesWa, estimativaDeEnvio } from "@/lib/whatsapp-fila";

async function adminDaInstancia(action: "webhook" | "webhook_status") {
  const { data, error } = await supabase.functions.invoke("whatsapp-instance-admin", { body: { action } });
  if (error) {
    const detalhe = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.().catch(() => null);
    throw new Error(detalhe?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data?.response;
}

export function ConfigWhatsapp({ limites, onSalvo }: { limites: LimitesWa; onSalvo: () => void }) {
  const { empresa } = useAuth();
  const [form, setForm] = useState(limites);
  const [salvando, setSalvando] = useState(false);
  const [ligada, setLigada] = useState<boolean | null>(null);
  const [ligando, setLigando] = useState(false);

  useEffect(() => { setForm(limites); }, [limites]);

  useEffect(() => {
    adminDaInstancia("webhook_status")
      .then(r => {
        // Modo simples devolve um webhook; modo avancado, uma lista.
        const lista = Array.isArray(r) ? r : [r];
        setLigada(lista.some((w: { url?: string; enabled?: boolean }) => w?.enabled !== false && String(w?.url ?? "").includes("/wa-webhook")));
      })
      .catch(() => setLigada(false));
  }, []);

  async function ligar() {
    setLigando(true);
    try {
      await adminDaInstancia("webhook");
      setLigada(true);
      toast.success("Caixa de conversas ligada: as mensagens novas já chegam aqui");
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível ligar o webhook"));
    } finally {
      setLigando(false);
    }
  }

  async function salvar() {
    if (!empresa) return;
    if (form.hora_fim <= form.hora_inicio) return toast.error("O horário final precisa ser depois do inicial");
    setSalvando(true);
    const { error } = await supabase.from("wa_config").upsert({ company_id: empresa.id, ...form, updated_at: new Date().toISOString() });
    setSalvando(false);
    if (error) return toast.error(errorMessage(error, "Não foi possível salvar"));
    toast.success("Limites salvos");
    onSalvo();
  }

  const numero = (chave: keyof LimitesWa, rotulo: string, min: number, max: number, ajuda: string) => (
    <div>
      <Label>{rotulo}</Label>
      <Input type="number" min={min} max={max} value={form[chave]} onChange={e => setForm({ ...form, [chave]: Number(e.target.value) })} />
      <p className="mt-1 text-[11px] text-muted-foreground">{ajuda}</p>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Caixa de conversas</CardTitle>
          <CardDescription>Faz a Uazapi mandar cada mensagem recebida para o sistema. Só precisa ser ligada uma vez (e de novo se trocar a instância).</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          {ligada === null ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            : ligada ? <CircleCheck className="h-5 w-5 text-emerald-400" /> : <CircleX className="h-5 w-5 text-muted-foreground" />}
          <span className="text-sm">{ligada === null ? "Verificando..." : ligada ? "Ligada" : "Desligada"}</span>
          <Button className="ml-auto" variant={ligada ? "outline" : "default"} onClick={ligar} disabled={ligando}>
            {ligando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PlugZap className="mr-1.5 h-4 w-4" />}
            {ligada ? "Religar" : "Ligar"}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Limites de envio automático</CardTitle>
          <CardDescription>Valem para disparos e sequências; resposta manual não entra na conta. Número novo: comece baixo e suba aos poucos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {numero("limite_diario", "Máximo por dia", 1, 2000, "Mensagens automáticas por dia")}
            {numero("intervalo_seg", "Intervalo mínimo (s)", 10, 600, "Entre um envio e outro, com folga aleatória")}
            {numero("hora_inicio", "Começa às (h)", 0, 23, "Horário de Brasília")}
            {numero("hora_fim", "Para às (h)", 1, 24, "Não envia a partir desta hora")}
          </div>
          <p className="text-xs text-muted-foreground">Com isso: {estimativaDeEnvio(100, form)}</p>
          <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar</Button>
        </CardContent>
      </Card>
    </div>
  );
}
