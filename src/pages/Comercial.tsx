import { useEffect, useMemo, useState } from "react";
import { Handshake, Loader2, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaComercial, type Area } from "@/components/comercial/AreaComercial";
import { DashboardComercial } from "@/components/comercial/DashboardComercial";
import { EtapasDialog } from "@/components/comercial/EtapasDialog";
import { LeadDetalhe } from "@/components/comercial/LeadDetalhe";
import { NovoLeadDialog } from "@/components/comercial/NovoLeadDialog";
import { Pipeline } from "@/components/comercial/Pipeline";
import { useAuth } from "@/hooks/useAuth";
import { useComercial } from "@/hooks/useComercial";
import { errorMessage } from "@/lib/utils";
import { veTodosOsClientes } from "@/lib/permissoes";
import type { Etapa, Lead } from "@/lib/comercial";

const AREAS: { id: Area; label: string }[] = [
  { id: "sdr", label: "SDR" },
  { id: "closer", label: "Closer" },
  { id: "social", label: "Social Seller" },
];

function areaDoPapel(role: string | null): Area {
  if (role === "closer") return "closer";
  if (role === "social_seller") return "social";
  return "sdr";
}

export default function Comercial() {
  const { user, role } = useAuth();
  const isAdmin = veTodosOsClientes(role);
  const {
    funis, etapas, leads, atividades, pessoas, clientes, loading,
    pessoaPorId, substituirLead, removerLead, adicionarAtividade, recarregar,
  } = useComercial();

  const prospeccao = useMemo(() => funis.find(f => !f.client_id) ?? null, [funis]);
  const [funilId, setFunilId] = useState<string | null>(null);
  const [aba, setAba] = useState(role === "sdr" || role === "closer" || role === "social_seller" ? "area" : "pipeline");
  const [area, setArea] = useState<Area>(areaDoPapel(role));
  const [aberto, setAberto] = useState<Lead | null>(null);
  const [perderPara, setPerderPara] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [editandoEtapas, setEditandoEtapas] = useState(false);
  const [novoFunil, setNovoFunil] = useState<{ clientId: string } | null>(null);
  const [criandoFunil, setCriandoFunil] = useState(false);

  useEffect(() => {
    if (!funilId && funis.length) setFunilId((prospeccao ?? funis[0]).id);
  }, [funis, funilId, prospeccao]);

  const funil = funis.find(f => f.id === funilId) ?? null;
  const etapasDoFunil = etapas.filter(e => e.funil_id === funilId);
  const leadsDoFunil = leads.filter(l => l.funil_id === funilId);
  const leadsProspeccao = leads.filter(l => l.funil_id === prospeccao?.id);
  const etapasProspeccao = etapas.filter(e => e.funil_id === prospeccao?.id);
  const nomeCliente = (id: string | null) => clientes.find(c => c.id === id)?.name ?? "Cliente";

  function abrir(l: Lead, perdaEm: string | null = null) {
    setPerderPara(perdaEm);
    setAberto(l);
  }

  async function mover(l: Lead, etapa: Etapa, posicao: number) {
    // Perdido pede motivo: abre o lead em vez de mover as cegas.
    if (etapa.tipo === "perdido" && l.etapa_id !== etapa.id) return abrir(l, etapa.id);
    const anterior = l;
    substituirLead({ ...l, etapa_id: etapa.id, posicao });
    const { data, error } = await supabase.from("crm_leads").update({ etapa_id: etapa.id, posicao }).eq("id", l.id).select("*").single();
    if (error) {
      substituirLead(anterior);
      return toast.error(errorMessage(error, "Não foi possível mover o lead"));
    }
    substituirLead(data as Lead);
  }

  async function puxar(l: Lead) {
    if (!user) return;
    const { data, error } = await supabase.from("crm_leads").update({ responsavel_id: user.id }).eq("id", l.id).select("*").single();
    if (error) return toast.error(errorMessage(error, "Não foi possível puxar o lead"));
    substituirLead(data as Lead);
    toast.success("Lead agora é seu");
  }

  async function criarFunilDeCliente() {
    if (!novoFunil?.clientId) return;
    setCriandoFunil(true);
    const { data, error } = await supabase.rpc("criar_funil_de_cliente", { _client_id: novoFunil.clientId, _nome: "Vendas" });
    setCriandoFunil(false);
    if (error) return toast.error(errorMessage(error, "Não foi possível criar o funil"));
    setNovoFunil(null);
    await recarregar();
    setFunilId(data as string);
    toast.success("Funil criado");
  }

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-[480px] rounded-2xl" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Handshake className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Comercial</h1>
            <p className="text-sm text-muted-foreground">Prospecção da agência e o funil de vendas dos clientes.</p>
          </div>
        </div>
        <Button onClick={() => setNovo(true)} disabled={!funilId}><Plus className="mr-1.5 h-4 w-4" /> Novo lead</Button>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="area">Minha área</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={funilId ?? undefined} onValueChange={setFunilId}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Funil" /></SelectTrigger>
              <SelectContent>
                {funis.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.client_id ? `${nomeCliente(f.client_id)} · ${f.nome}` : `${f.nome} (agência)`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditandoEtapas(true)} disabled={!funilId}>
                  <Settings2 className="mr-1.5 h-4 w-4" /> Etapas
                </Button>
                <Button variant="outline" size="sm" onClick={() => setNovoFunil({ clientId: "" })}>
                  <Plus className="mr-1.5 h-4 w-4" /> Funil de cliente
                </Button>
              </>
            )}
          </div>
          {funil ? (
            <Pipeline
              etapas={etapasDoFunil}
              leads={leadsDoFunil}
              pessoas={pessoas}
              pessoaPorId={pessoaPorId}
              meuId={user?.id}
              onAbrir={l => abrir(l)}
              onMover={mover}
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">Você ainda não tem funil. Peça ao ADM da empresa.</p>
          )}
        </TabsContent>

        <TabsContent value="area" className="space-y-4">
          <div className="flex rounded-xl border border-border/60 p-0.5 sm:w-fit">
            {AREAS.map(a => (
              <Button key={a.id} size="sm" variant={area === a.id ? "secondary" : "ghost"} onClick={() => setArea(a.id)}>{a.label}</Button>
            ))}
          </div>
          <AreaComercial
            area={area}
            leads={leadsProspeccao}
            atividades={atividades}
            meuId={user?.id}
            onAbrir={l => abrir(l)}
            onPuxar={puxar}
          />
        </TabsContent>

        <TabsContent value="dashboard">
          <DashboardComercial leads={leadsProspeccao} etapas={etapasProspeccao} atividades={atividades} pessoas={pessoas} />
        </TabsContent>
      </Tabs>

      <LeadDetalhe
        lead={aberto}
        perderPara={perderPara}
        etapas={etapas}
        pessoas={pessoas}
        pessoaPorId={pessoaPorId}
        onClose={() => { setAberto(null); setPerderPara(null); }}
        onChange={l => { substituirLead(l); setAberto(l); setPerderPara(null); }}
        onDelete={id => { removerLead(id); setAberto(null); toast.success("Lead apagado"); }}
        onAtividade={adicionarAtividade}
      />

      <NovoLeadDialog
        open={novo}
        onOpenChange={setNovo}
        funilId={funilId}
        etapas={etapas}
        pessoas={pessoas}
        canalPadrao={funil?.client_id ? "anuncio" : area === "social" ? "social" : "sdr"}
        onCreated={substituirLead}
      />

      <EtapasDialog
        open={editandoEtapas}
        onOpenChange={setEditandoEtapas}
        funilId={funilId}
        etapas={etapas}
        leads={leads}
        onSaved={recarregar}
      />

      <Dialog open={!!novoFunil} onOpenChange={open => !open && setNovoFunil(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Funil de vendas de um cliente</DialogTitle>
            <DialogDescription>
              Para acompanhar os leads que chegam dos anúncios do cliente até a venda. Nasce com etapas de atendimento, que dá para editar depois.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Cliente</Label>
            <Select value={novoFunil?.clientId || undefined} onValueChange={clientId => setNovoFunil({ clientId })}>
              <SelectTrigger><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
              <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoFunil(null)}>Cancelar</Button>
            <Button onClick={criarFunilDeCliente} disabled={!novoFunil?.clientId || criandoFunil}>
              {criandoFunil && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Criar funil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
