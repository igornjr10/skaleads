import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import type { Pessoa } from "@/hooks/useDemandas";
import { errorMessage } from "@/lib/utils";
import { rotuloPapel } from "@/lib/permissoes";
import { CANAIS_LEAD, type Etapa, type Lead } from "@/lib/comercial";

const SEM = "sem";

export function NovoLeadDialog({ open, onOpenChange, funilId, etapas, pessoas, canalPadrao, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funilId: string | null;
  etapas: Etapa[];
  pessoas: Pessoa[];
  canalPadrao: string;
  onCreated: (l: Lead) => void;
}) {
  const { user, role } = useAuth();
  const doFunil = etapas.filter(e => e.funil_id === funilId && e.tipo === "aberta").sort((a, b) => a.posicao - b.posicao);
  const comercial = role === "sdr" || role === "closer" || role === "social_seller";

  const vazio = () => ({
    contato_nome: "", empresa: "", cargo: "", whatsapp: "", instagram: "", email: "",
    segmento: "", cidade: "", origem: "", observacoes: "",
    canal: canalPadrao,
    etapa_id: doFunil[0]?.id ?? "",
    // Quem prospecta ja cadastra o lead como seu; o ADM costuma abastecer a fila.
    responsavel_id: comercial && user ? user.id : SEM,
  });
  const [form, setForm] = useState(vazio);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) setForm(vazio());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, funilId]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contato_nome.trim()) return toast.error("Informe o nome do contato");
    if (!funilId || !form.etapa_id || !user) return;
    setSalvando(true);
    const { data, error } = await supabase
      .from("crm_leads")
      .insert({
        funil_id: funilId,
        etapa_id: form.etapa_id,
        contato_nome: form.contato_nome.trim(),
        empresa: form.empresa.trim() || null,
        cargo: form.cargo.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        instagram: form.instagram.trim().replace(/^@/, "") || null,
        email: form.email.trim() || null,
        segmento: form.segmento.trim() || null,
        cidade: form.cidade.trim() || null,
        origem: form.origem.trim() || null,
        observacoes: form.observacoes.trim() || null,
        canal: form.canal,
        responsavel_id: form.responsavel_id === SEM ? null : form.responsavel_id,
        created_by: user.id,
        posicao: Date.now(),
      })
      .select("*")
      .single();
    setSalvando(false);
    if (error) return toast.error(errorMessage(error, "Não foi possível cadastrar o lead"));
    onCreated(data as Lead);
    onOpenChange(false);
    toast.success("Lead cadastrado");
  }

  const texto = (chave: keyof typeof form, rotulo: string, extra: React.ComponentProps<typeof Input> = {}) => (
    <div>
      <Label>{rotulo}</Label>
      <Input value={form[chave]} onChange={e => setForm({ ...form, [chave]: e.target.value })} {...extra} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={criar} className="space-y-3">
          <DialogHeader>
            <DialogTitle>Novo lead</DialogTitle>
            <DialogDescription>Só o nome é obrigatório; o resto dá para completar depois.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {texto("contato_nome", "Nome do contato", { autoFocus: true })}
            {texto("empresa", "Empresa")}
            {texto("whatsapp", "WhatsApp", { placeholder: "(11) 98888-7777" })}
            {texto("instagram", "Instagram", { placeholder: "@perfil" })}
            {texto("segmento", "Segmento")}
            {texto("cidade", "Cidade / região")}
            {texto("cargo", "Cargo")}
            {texto("email", "E-mail", { type: "email" })}
            <div>
              <Label>Canal</Label>
              <Select value={form.canal} onValueChange={canal => setForm({ ...form, canal })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CANAIS_LEAD.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {texto("origem", "Origem", { placeholder: "Lista, evento, indicação de..." })}
            <div>
              <Label>Etapa</Label>
              <Select value={form.etapa_id} onValueChange={etapa_id => setForm({ ...form, etapa_id })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{doFunil.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsável</Label>
              <Select value={form.responsavel_id} onValueChange={responsavel_id => setForm({ ...form, responsavel_id })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Sem dono (fila)</SelectItem>
                  {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} · {rotuloPapel(p.role)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvando || !funilId}>
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Cadastrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
