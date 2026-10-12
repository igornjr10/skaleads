import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Clock, ExternalLink, FileText, Loader2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { type AulaAcademia, formatarDuracao, tipoLabel, urlDeEmbed } from "@/lib/academia";

interface Props {
  aula: AulaAcademia;
  moduloTitulo: string;
  concluida: boolean;
  checklistFeitos: number[];
  salvando: boolean;
  anterior: AulaAcademia | null;
  proxima: AulaAcademia | null;
  podeEditar: boolean;
  onAlternarItem: (indice: number) => void;
  onAlternarConcluida: () => void;
  onAbrir: (aulaId: string) => void;
  onEditar: () => void;
}

function Material({ aula }: { aula: AulaAcademia }) {
  const embed = aula.tipo === "texto" ? null : urlDeEmbed(aula.url);
  const ehVideo = aula.tipo === "video";

  return (
    <div className="space-y-4">
      {embed && (
        <div className={`overflow-hidden rounded-2xl border border-border/60 bg-black ${ehVideo ? "aspect-video" : "h-[70vh] min-h-[420px]"}`}>
          <iframe
            src={embed}
            title={aula.titulo}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}

      {aula.url && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card/60 p-4">
          <FileText className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{embed ? "Abrir em outra aba" : "Material de apoio"}</div>
            <div className="truncate text-xs text-muted-foreground" title={aula.url}>{aula.url}</div>
          </div>
          <Button asChild size="sm" variant={embed ? "outline" : "default"}>
            <a href={aula.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" /> Abrir material
            </a>
          </Button>
        </div>
      )}

      {aula.conteudo?.trim() && (
        <div className="whitespace-pre-wrap break-words rounded-2xl border border-border/60 bg-card/60 p-4 text-sm leading-relaxed sm:p-6">
          {aula.conteudo}
        </div>
      )}

      {!aula.url && !aula.conteudo?.trim() && (
        <div className="rounded-2xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          Esta aula ainda não tem material. Um administrador pode colar o link do vídeo, PDF ou Google Drive em "Editar".
        </div>
      )}
    </div>
  );
}

export function AulaViewer(p: Props) {
  const { aula } = p;
  const total = aula.checklist.length;
  const feitos = p.checklistFeitos.filter(i => i < total).length;
  const duracao = formatarDuracao(aula.duracao_min);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="truncate text-xs uppercase tracking-wide text-muted-foreground" title={p.moduloTitulo}>{p.moduloTitulo}</div>
          <h2 className="break-words text-xl font-semibold sm:text-2xl">{aula.titulo}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{tipoLabel(aula.tipo)}</Badge>
            {duracao && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {duracao}</span>}
            {p.concluida && <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Concluída</Badge>}
          </div>
          {aula.descricao && <p className="mt-2 break-words text-sm text-muted-foreground">{aula.descricao}</p>}
        </div>
        {p.podeEditar && (
          <Button variant="outline" size="sm" onClick={p.onEditar} className="shrink-0 self-start">
            <Pencil className="mr-2 h-4 w-4" /> Editar aula
          </Button>
        )}
      </div>

      <Material aula={aula} />

      {total > 0 && (
        <div className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Checklist de aprendizado</h3>
            <span className="text-xs tabular-nums text-muted-foreground">{feitos}/{total}</span>
          </div>
          <Progress value={total ? (feitos / total) * 100 : 0} className="h-1.5" />
          <ul className="space-y-2">
            {aula.checklist.map((item, i) => {
              const marcado = p.checklistFeitos.includes(i);
              return (
                <li key={i}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted/40">
                    <Checkbox checked={marcado} onCheckedChange={() => p.onAlternarItem(i)} className="mt-0.5" disabled={p.salvando} />
                    <span className={`min-w-0 break-words text-sm ${marcado ? "text-muted-foreground line-through" : ""}`}>{item}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          onClick={p.onAlternarConcluida}
          disabled={p.salvando}
          variant={p.concluida ? "outline" : "default"}
          className="w-full sm:w-auto"
        >
          {p.salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : p.concluida ? <Circle className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          {p.concluida ? "Desmarcar" : "Marcar aula como concluída"}
        </Button>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="ghost" disabled={!p.anterior} onClick={() => p.anterior && p.onAbrir(p.anterior.id)} title={p.anterior?.titulo} className="min-w-0">
            <ArrowLeft className="mr-2 h-4 w-4 shrink-0" /> <span className="truncate">Anterior</span>
          </Button>
          <Button variant="ghost" disabled={!p.proxima} onClick={() => p.proxima && p.onAbrir(p.proxima.id)} title={p.proxima?.titulo} className="min-w-0">
            <span className="truncate">Próxima</span> <ArrowRight className="ml-2 h-4 w-4 shrink-0" />
          </Button>
        </div>
      </div>
    </div>
  );
}
