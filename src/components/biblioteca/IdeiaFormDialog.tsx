import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link2, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useAuth } from "@/hooks/useAuth";
import {
  CATEGORIAS_IDEIA, LIMITE_UPLOAD, PLATAFORMAS, TIPOS_CRIATIVO, detectarPlataforma, nomeSeguroDeArquivo,
  normalizarTags, normalizarUrl, rotuloPlataforma, sugerirTipoPorUrl, tamanhoLegivel, tipoDoArquivo,
  type Plataforma,
} from "@/lib/biblioteca";
import { errorMessage } from "@/lib/utils";
import { BUCKET, PlataformaIcone, type Ideia } from "./comum";
import type { ClienteResumo } from "./IdeiaCard";

const SEM = "sem";

interface Form {
  origem: "link" | "arquivo";
  titulo: string;
  descricao: string;
  url: string;
  plataforma: Plataforma;
  plataformaManual: boolean;
  tipo: string;
  tipoManual: boolean;
  categoria: string;
  cliente: string;
  tags: string;
}

const VAZIO: Form = {
  origem: "link", titulo: "", descricao: "", url: "", plataforma: "outro", plataformaManual: false,
  tipo: "outro", tipoManual: false, categoria: "anuncio", cliente: SEM, tags: "",
};

function formDe(ideia: Ideia): Form {
  return {
    origem: ideia.arquivo_caminho ? "arquivo" : "link",
    titulo: ideia.titulo,
    descricao: ideia.descricao ?? "",
    url: ideia.url ?? "",
    plataforma: ideia.plataforma as Plataforma,
    plataformaManual: true,
    tipo: ideia.tipo_criativo,
    tipoManual: true,
    categoria: ideia.categoria,
    cliente: ideia.client_id ?? SEM,
    tags: ideia.tags.join(", "),
  };
}

export function IdeiaFormDialog({
  open, onOpenChange, ideia, clientes, onSalvo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ideia?: Ideia | null;
  clientes: ClienteResumo[];
  onSalvo: (ideia: Ideia) => void;
}) {
  const { user, empresa } = useAuth();
  const editando = !!ideia;
  const [form, setForm] = useState<Form>(VAZIO);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(ideia ? formDe(ideia) : VAZIO);
    setArquivo(null);
  }, [open, ideia]);

  function mudarUrl(url: string) {
    setForm(f => {
      const proximo = { ...f, url };
      if (!f.plataformaManual) proximo.plataforma = url.trim() ? detectarPlataforma(url) : "outro";
      if (!f.tipoManual) {
        const sugestao = sugerirTipoPorUrl(url);
        if (sugestao) proximo.tipo = sugestao;
      }
      return proximo;
    });
  }

  function escolherArquivo(file: File | undefined) {
    if (!file) return;
    if (file.size > LIMITE_UPLOAD) {
      toast.error("Arquivo acima de 50 MB: suba no Google Drive e cole o link aqui");
      return;
    }
    setArquivo(file);
    setForm(f => {
      const tipoArq = tipoDoArquivo(file.type, file.name);
      return {
        ...f,
        titulo: f.titulo || file.name.replace(/\.[^.]+$/, ""),
        tipo: f.tipoManual ? f.tipo : tipoArq === "video" ? "video" : tipoArq === "imagem" ? "imagem" : f.tipo,
      };
    });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const titulo = form.titulo.trim();
    if (!titulo) return toast.error("Dê um título para a ideia");

    const porLink = form.origem === "link";
    const temArquivoSalvo = editando && !!ideia?.arquivo_caminho;
    let url: string | null = null;
    if (form.url.trim()) {
      url = normalizarUrl(form.url);
      if (!url) return toast.error("Esse link não parece válido");
    }
    if (porLink && !url && !temArquivoSalvo) return toast.error("Cole o link da referência");
    if (!editando && !porLink && !arquivo) return toast.error("Escolha um arquivo");

    const campos = {
      titulo,
      descricao: form.descricao.trim() || null,
      url,
      plataforma: !porLink || (temArquivoSalvo && !url) ? "arquivo" : form.plataforma,
      tipo_criativo: form.tipo,
      categoria: form.categoria,
      client_id: form.cliente === SEM ? null : form.cliente,
      tags: normalizarTags(form.tags),
    };

    setSalvando(true);
    try {
      if (editando && ideia) {
        const { data, error } = await supabase.from("ideias").update(campos).eq("id", ideia.id).select("*").single();
        if (error) return toast.error(errorMessage(error, "Não foi possível salvar a ideia"));
        onSalvo({ ...data, favorita: ideia.favorita });
        toast.success("Ideia atualizada");
        onOpenChange(false);
        return;
      }

      if (!user) return toast.error("Sessão expirada: entre de novo");

      if (porLink) {
        const { data, error } = await supabase
          .from("ideias")
          .insert({ ...campos, ...(empresa?.id ? { company_id: empresa.id } : {}) })
          .select("*")
          .single();
        if (error) return toast.error(errorMessage(error, "Não foi possível adicionar a ideia"));
        onSalvo({ ...data, favorita: false });
        toast.success("Ideia adicionada à biblioteca");
        onOpenChange(false);
        return;
      }

      if (!empresa?.id) return toast.error("Sua conta não está ligada a uma empresa");
      const id = crypto.randomUUID();
      const caminho = `${empresa.id}/${id}/${crypto.randomUUID()}-${nomeSeguroDeArquivo(arquivo!.name)}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(caminho, arquivo!, { contentType: arquivo!.type || undefined });
      if (upErr) return toast.error(errorMessage(upErr, "Falha no upload"));

      const { data, error } = await supabase
        .from("ideias")
        .insert({
          ...campos,
          id,
          company_id: empresa.id,
          arquivo_caminho: caminho,
          arquivo_nome: arquivo!.name,
          arquivo_tipo: arquivo!.type || null,
          arquivo_tamanho: arquivo!.size,
        })
        .select("*")
        .single();
      if (error) {
        await supabase.storage.from(BUCKET).remove([caminho]);
        return toast.error(errorMessage(error, "Não foi possível adicionar a ideia"));
      }
      onSalvo({ ...data, favorita: false });
      toast.success("Ideia adicionada à biblioteca");
      onOpenChange(false);
    } finally {
      setSalvando(false);
    }
  }

  const opcoesClientes = [
    { value: SEM, label: "Sem cliente (referência geral)" },
    ...clientes.map(c => ({ value: c.id, label: c.name })),
  ];
  const mostraLink = form.origem === "link" || (editando && !!form.url);

  return (
    <Dialog open={open} onOpenChange={v => !salvando && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl sm:max-w-xl">
        <form onSubmit={salvar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar ideia" : "Nova ideia"}</DialogTitle>
            <DialogDescription>
              {editando
                ? "Ajuste título, organização e tags."
                : "Cole o link de uma referência ou envie o arquivo. A equipe toda passa a encontrar aqui."}
            </DialogDescription>
          </DialogHeader>

          {!editando && (
            <Tabs value={form.origem} onValueChange={v => setForm(f => ({ ...f, origem: v as Form["origem"] }))}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="link" className="gap-1.5"><Link2 className="h-4 w-4" />Link</TabsTrigger>
                <TabsTrigger value="arquivo" className="gap-1.5"><Upload className="h-4 w-4" />Arquivo</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {mostraLink && (
            <div className="space-y-1.5">
              <Label htmlFor="ideia-url">Link</Label>
              <Input
                id="ideia-url"
                autoFocus={!editando}
                inputMode="url"
                value={form.url}
                onChange={e => mudarUrl(e.target.value)}
                placeholder="Instagram, TikTok, YouTube, Facebook, Drive, Pinterest ou site"
              />
              {form.url.trim() && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <PlataformaIcone plataforma={form.plataforma} className="h-5 w-5 rounded-md" tamanho="h-3 w-3" />
                  Reconhecido como {rotuloPlataforma(form.plataforma)}
                  {form.plataforma === "drive" && " · confira se o link está compartilhado com a equipe"}
                </p>
              )}
            </div>
          )}

          {!editando && form.origem === "arquivo" && (
            <div className="space-y-1.5">
              <Label>Arquivo</Label>
              <input
                ref={inputArquivo}
                type="file"
                className="hidden"
                accept="image/*,video/*,application/pdf,.pdf,.ppt,.pptx,.doc,.docx,.zip"
                onChange={e => {
                  escolherArquivo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {arquivo ? (
                <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border/60 bg-muted/20 p-2.5">
                  <PlataformaIcone plataforma="arquivo" className="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={arquivo.name}>{arquivo.name}</p>
                    <p className="text-xs text-muted-foreground">{tamanhoLegivel(arquivo.size)}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setArquivo(null)} aria-label="Remover arquivo">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => inputArquivo.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    escolherArquivo(e.dataTransfer.files?.[0]);
                  }}
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/80 bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                >
                  <Upload className="h-5 w-5" />
                  <span>Clique ou arraste vídeo, imagem ou arquivo</span>
                  <span className="text-xs">Até 50 MB. Maior que isso, use o link do Google Drive.</span>
                </button>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ideia-titulo">Título</Label>
            <Input
              id="ideia-titulo"
              value={form.titulo}
              onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              placeholder="Ex.: Gancho de depoimento em 3 segundos"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ideia-descricao">Por que vale guardar</Label>
            <Textarea
              id="ideia-descricao"
              rows={3}
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="O que chamou atenção, como adaptar, para qual cliente serve..."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_IDEIA.map(c => <SelectItem key={c.valor} value={c.valor}>{c.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label>Tipo de criativo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v, tipoManual: true }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_CRIATIVO.map(t => <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {mostraLink && (
              <div className="min-w-0 space-y-1.5">
                <Label>Plataforma</Label>
                <Select
                  value={form.plataforma}
                  onValueChange={v => setForm(f => ({ ...f, plataforma: v as Plataforma, plataformaManual: true }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATAFORMAS.filter(p => p.valor !== "arquivo").map(p => (
                      <SelectItem key={p.valor} value={p.valor}>{p.rotulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className={mostraLink ? "min-w-0 space-y-1.5" : "min-w-0 space-y-1.5 sm:col-span-2"}>
              <Label>Cliente</Label>
              <SearchableSelect
                options={opcoesClientes}
                value={form.cliente}
                onChange={v => setForm(f => ({ ...f, cliente: v || SEM }))}
                searchPlaceholder="Buscar cliente..."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ideia-tags">Tags</Label>
            <Input
              id="ideia-tags"
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="Separe por vírgula: black friday, ugc, depoimento"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editando ? "Salvar" : form.origem === "arquivo" && salvando ? "Enviando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
