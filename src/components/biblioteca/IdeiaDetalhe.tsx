import { useEffect, useState } from "react";
import { Download, ExternalLink, Loader2, Pencil, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClientAvatar } from "@/components/ClientAvatar";
import {
  embedDoYoutube, idDoYoutube, rotuloCategoria, rotuloPlataforma, rotuloTipo, tamanhoLegivel, tipoDoArquivo,
} from "@/lib/biblioteca";
import { cn, errorMessage } from "@/lib/utils";
import { BUCKET, IconeArquivo, PlataformaIcone, type Ideia } from "./comum";
import type { ClienteResumo } from "./IdeiaCard";

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function IdeiaDetalhe({
  ideia, cliente, autor, podeEditar, onFechar, onEditar, onFavoritar, onExcluida,
}: {
  ideia: Ideia | null;
  cliente?: ClienteResumo;
  autor?: string;
  podeEditar: boolean;
  onFechar: () => void;
  onEditar: () => void;
  onFavoritar: () => void;
  onExcluida: (id: string) => void;
}) {
  const [urlArquivo, setUrlArquivo] = useState<string | null>(null);
  const [carregandoArquivo, setCarregandoArquivo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const caminho = ideia?.arquivo_caminho ?? null;
  useEffect(() => {
    setUrlArquivo(null);
    if (!caminho) return;
    let vivo = true;
    setCarregandoArquivo(true);
    supabase.storage.from(BUCKET).createSignedUrl(caminho, 60 * 60).then(({ data, error }) => {
      if (!vivo) return;
      setCarregandoArquivo(false);
      if (error || !data) toast.error(errorMessage(error, "Não foi possível carregar o arquivo"));
      else setUrlArquivo(data.signedUrl);
    });
    return () => {
      vivo = false;
    };
  }, [caminho]);

  async function excluir() {
    if (!ideia) return;
    setExcluindo(true);
    // Arquivo antes da linha: a policy do bucket que libera o ADM confere a ideia na tabela.
    if (ideia.arquivo_caminho) {
      const { error: errArq } = await supabase.storage.from(BUCKET).remove([ideia.arquivo_caminho]);
      if (errArq) console.warn("Arquivo da ideia ficou no bucket", errArq);
    }
    const { error } = await supabase.from("ideias").delete().eq("id", ideia.id);
    if (error) {
      setExcluindo(false);
      return toast.error(errorMessage(error, "Não foi possível excluir"));
    }
    setExcluindo(false);
    setConfirmando(false);
    onExcluida(ideia.id);
    toast.success("Ideia excluída");
  }

  const idYoutube = idDoYoutube(ideia?.url);
  const tipoArquivo = ideia?.arquivo_caminho ? tipoDoArquivo(ideia.arquivo_tipo, ideia.arquivo_nome) : null;
  const ehDrive = ideia?.plataforma === "drive";

  return (
    <>
      <Dialog open={!!ideia} onOpenChange={v => !v && onFechar()}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl p-0 sm:max-w-3xl">
          {ideia && (
            <div className="min-w-0">
              <div className="overflow-hidden rounded-t-2xl bg-black/40">
                {idYoutube ? (
                  <div className="aspect-video w-full">
                    <iframe
                      src={embedDoYoutube(idYoutube)}
                      title={ideia.titulo}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : tipoArquivo === "imagem" && urlArquivo ? (
                  <img src={urlArquivo} alt={ideia.titulo} className="mx-auto max-h-[60vh] w-auto object-contain" />
                ) : tipoArquivo === "video" && urlArquivo ? (
                  <video src={urlArquivo} controls playsInline className="mx-auto max-h-[60vh] w-full" />
                ) : (
                  <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
                    {carregandoArquivo ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : tipoArquivo === "outro" ? (
                      <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary ring-1 ring-primary/20">
                        <IconeArquivo className="h-10 w-10" />
                      </span>
                    ) : (
                      <PlataformaIcone plataforma={ideia.plataforma} className="h-20 w-20 rounded-3xl" tamanho="h-10 w-10" />
                    )}
                    <p className="max-w-full break-words text-sm">
                      {ideia.arquivo_nome ?? `Prévia indisponível para ${rotuloPlataforma(ideia.plataforma)}: abra o original`}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-4 p-4 sm:p-6">
                <DialogHeader className="space-y-2 text-left">
                  <div className="flex min-w-0 items-start gap-3 pr-6">
                    <PlataformaIcone plataforma={ideia.plataforma} className="mt-0.5 h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <DialogTitle className="break-words text-lg leading-snug">{ideia.titulo}</DialogTitle>
                      <DialogDescription className="mt-1 text-xs">
                        {rotuloPlataforma(ideia.plataforma)}
                        {autor ? ` · adicionada por ${autor}` : ""} · {dataCurta(ideia.created_at)}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{rotuloCategoria(ideia.categoria)}</Badge>
                  <Badge variant="outline">{rotuloTipo(ideia.tipo_criativo)}</Badge>
                  {ideia.tags.map(t => (
                    <Badge key={t} variant="outline" className="max-w-full truncate border-primary/30 text-primary" title={`#${t}`}>
                      #{t}
                    </Badge>
                  ))}
                </div>

                {cliente && (
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <ClientAvatar name={cliente.name} logoUrl={cliente.logo_url} className="h-6 w-6" />
                    <span className="truncate" title={cliente.name}>{cliente.name}</span>
                  </div>
                )}

                {ideia.descricao && (
                  <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{ideia.descricao}</p>
                )}

                {ideia.url && (
                  <p className="truncate text-xs text-muted-foreground" title={ideia.url}>{ideia.url}</p>
                )}
                {ideia.arquivo_caminho && ideia.arquivo_tamanho ? (
                  <p className="text-xs text-muted-foreground">
                    {ideia.arquivo_nome} · {tamanhoLegivel(ideia.arquivo_tamanho)}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                  {ideia.url && (
                    <Button asChild>
                      <a href={ideia.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {ehDrive ? "Abrir no Drive" : "Abrir original"}
                      </a>
                    </Button>
                  )}
                  {urlArquivo && (
                    <Button asChild variant={ideia.url ? "outline" : "default"}>
                      <a href={urlArquivo} target="_blank" rel="noopener noreferrer" download={ideia.arquivo_nome ?? undefined}>
                        <Download className="mr-2 h-4 w-4" />
                        Abrir arquivo
                      </a>
                    </Button>
                  )}
                  <Button variant="outline" onClick={onFavoritar}>
                    <Star className={cn("mr-2 h-4 w-4", ideia.favorita && "fill-amber-400 text-amber-400")} />
                    {ideia.favorita ? "Favorita" : "Favoritar"}
                  </Button>
                  {podeEditar && (
                    <>
                      <Button variant="outline" onClick={onEditar}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                      <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmando(true)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmando} onOpenChange={v => !excluindo && setConfirmando(v)}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta ideia?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela some da biblioteca para toda a equipe{ideia?.arquivo_caminho ? ", junto com o arquivo enviado" : ""}. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => {
                e.preventDefault();
                excluir();
              }}
              disabled={excluindo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluindo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
