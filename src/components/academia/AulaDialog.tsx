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
import { errorMessage } from "@/lib/utils";
import {
  type AulaAcademia, type ModuloAcademia, type TipoAula, TIPOS_AULA, checklistDeTexto, urlDeEmbed, urlValida,
} from "@/lib/academia";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aula: AulaAcademia | null;
  moduloId: string;
  modulos: ModuloAcademia[];
  ordemSugerida: number;
  onSalvo: () => void;
}

const DICA_LINK: Record<TipoAula, string> = {
  video: "YouTube, Vimeo ou Google Drive (o vídeo precisa estar compartilhado com quem tem o link).",
  pdf: "Link do PDF no Google Drive ou link direto para o arquivo .pdf.",
  link: "Qualquer página: Notion, Google Docs, Slides, artigo...",
  texto: "Opcional: um link de apoio para acompanhar o texto.",
};

export function AulaDialog({ open, onOpenChange, aula, moduloId, modulos, ordemSugerida, onSalvo }: Props) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<TipoAula>("video");
  const [url, setUrl] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [duracao, setDuracao] = useState("");
  const [checklist, setChecklist] = useState("");
  const [modulo, setModulo] = useState(moduloId);
  const [ordem, setOrdem] = useState("1");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitulo(aula?.titulo ?? "");
    setDescricao(aula?.descricao ?? "");
    setTipo(aula?.tipo ?? "video");
    setUrl(aula?.url ?? "");
    setConteudo(aula?.conteudo ?? "");
    setDuracao(aula?.duracao_min ? String(aula.duracao_min) : "");
    setChecklist((aula?.checklist ?? []).join("\n"));
    setModulo(aula?.modulo_id ?? moduloId);
    setOrdem(String(aula?.ordem ?? ordemSugerida));
  }, [open, aula, moduloId, ordemSugerida]);

  const urlLimpa = url.trim();
  const urlInvalida = urlLimpa.length > 0 && !urlValida(urlLimpa);
  const vaiEmbutir = urlLimpa.length > 0 && !urlInvalida && tipo !== "texto" && urlDeEmbed(urlLimpa) !== null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) {
      toast.error("Dê um título à aula");
      return;
    }
    if (urlInvalida) {
      toast.error("O link precisa começar com http:// ou https://");
      return;
    }
    if (tipo !== "texto" && !urlLimpa) {
      toast.error("Cole o link do material ou mude o tipo para Texto");
      return;
    }
    if (tipo === "texto" && !conteudo.trim()) {
      toast.error("Escreva o conteúdo da aula");
      return;
    }
    const min = duracao.trim() ? Number.parseInt(duracao, 10) : null;
    if (min !== null && (!Number.isFinite(min) || min <= 0)) {
      toast.error("Duração deve ser em minutos, maior que zero");
      return;
    }

    setSalvando(true);
    const dados = {
      modulo_id: modulo,
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      tipo,
      url: urlLimpa || null,
      conteudo: conteudo.trim() || null,
      duracao_min: min,
      checklist: checklistDeTexto(checklist),
      ordem: Number.parseInt(ordem, 10) || 0,
    };
    const { error } = aula
      ? await supabase.from("academia_aulas").update(dados).eq("id", aula.id)
      : await supabase.from("academia_aulas").insert(dados);
    setSalvando(false);
    if (error) {
      toast.error(errorMessage(error, "Não foi possível salvar a aula"));
      return;
    }
    toast.success(aula ? "Aula atualizada" : "Aula criada");
    onOpenChange(false);
    onSalvo();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{aula ? "Editar aula" : "Nova aula"}</DialogTitle>
          <DialogDescription>Cole o link do Drive, YouTube, Vimeo ou PDF. Não precisa mexer no sistema para trocar o material.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="aula-titulo">Título</Label>
            <Input id="aula-titulo" value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={160} autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={v => setTipo(v as TipoAula)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_AULA.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="aula-duracao">Duração (min)</Label>
              <Input id="aula-duracao" type="number" min={1} inputMode="numeric" value={duracao} onChange={e => setDuracao(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aula-ordem">Ordem</Label>
              <Input id="aula-ordem" type="number" inputMode="numeric" value={ordem} onChange={e => setOrdem(e.target.value)} />
            </div>
          </div>
          {modulos.length > 1 && (
            <div className="space-y-2">
              <Label>Módulo</Label>
              <Select value={modulo} onValueChange={setModulo}>
                <SelectTrigger className="min-w-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {modulos.map(m => <SelectItem key={m.id} value={m.id}>{m.titulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="aula-url">Link {tipo === "texto" && <span className="text-muted-foreground">(opcional)</span>}</Label>
            <Input id="aula-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://drive.google.com/file/d/.../view" inputMode="url" />
            <p className={`text-xs ${urlInvalida ? "text-destructive" : "text-muted-foreground"}`}>
              {urlInvalida
                ? "O link precisa começar com http:// ou https://"
                : vaiEmbutir
                  ? "Este link vai aparecer embutido na aula."
                  : DICA_LINK[tipo]}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="aula-desc">Resumo</Label>
            <Input id="aula-desc" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Uma linha sobre o que a pessoa vai aprender" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aula-conteudo">Texto da aula {tipo !== "texto" && <span className="text-muted-foreground">(opcional)</span>}</Label>
            <Textarea id="aula-conteudo" value={conteudo} onChange={e => setConteudo(e.target.value)} rows={tipo === "texto" ? 10 : 4} placeholder="Procedimento passo a passo, observações, links úteis..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aula-checklist">Checklist de aprendizado</Label>
            <Textarea id="aula-checklist" value={checklist} onChange={e => setChecklist(e.target.value)} rows={4} placeholder={"Um item por linha\nSei abrir o gerenciador de anúncios\nSei ler o CPM"} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
