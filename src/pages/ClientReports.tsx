import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, FileText, MoreHorizontal, Download, Link2, Trash2, Eye, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pdf } from "@react-pdf/renderer";
import { ReportPdfTemplate, type ReportData } from "@/components/reports/ReportPdfTemplate";
import { ReportGeneratorDialog } from "@/components/reports/ReportGeneratorDialog";

interface Report {
  id: string;
  name: string;
  period: { start: string; end: string; label: string };
  status: string;
  share_token: string | null;
  share_expires_at: string | null;
  view_count: number;
  created_at: string;
  data: ReportData | null;
}

interface Client {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ready: { label: "Pronto", variant: "default" },
  generating: { label: "Gerando...", variant: "secondary" },
  pending: { label: "Pendente", variant: "outline" },
  error: { label: "Erro", variant: "destructive" },
};

export default function ClientReports() {
  const { id: clientId } = useParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerator, setShowGenerator] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (clientId) {
      fetchClient();
      fetchReports();
    }
  }, [clientId]);

  async function fetchClient() {
    const { data } = await supabase.from("clients").select("id, name").eq("id", clientId!).single();
    if (data) setClient(data);
  }

  async function fetchReports() {
    setLoading(true);
    const { data, error } = await supabase
      .from("reports")
      .select("id, name, period, status, share_token, share_expires_at, view_count, created_at, data")
      .eq("client_id", clientId!)
      .order("created_at", { ascending: false });

    if (error) toast.error("Erro ao carregar relatórios");
    setReports((data as any) || []);
    setLoading(false);
  }

  async function downloadPdf(report: Report) {
    if (!report.data) {
      toast.error("Dados do relatório não disponíveis");
      return;
    }
    try {
      const blob = await pdf(<ReportPdfTemplate data={report.data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Erro ao gerar PDF");
    }
  }

  async function copyShareLink(report: Report) {
    if (!report.share_token) return;
    const url = `${window.location.origin}/share/reports/${report.share_token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado para o clipboard");
  }

  async function deleteReport(id: string) {
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir relatório");
    } else {
      toast.success("Relatório excluído");
      setReports(prev => prev.filter(r => r.id !== id));
    }
    setDeleteId(null);
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/clients">
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Relatórios</h1>
            {client && <p className="text-sm text-muted-foreground">{client.name}</p>}
          </div>
        </div>
        <Button onClick={() => setShowGenerator(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Relatório
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">Nenhum relatório ainda</p>
            <p className="text-sm text-muted-foreground mt-1">Crie o primeiro relatório para {client?.name}</p>
            <Button className="mt-4" onClick={() => setShowGenerator(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Gerar Relatório
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map(report => {
            const status = STATUS_LABELS[report.status] || STATUS_LABELS.pending;
            const createdAt = format(new Date(report.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR });
            return (
              <Card key={report.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  <FileText className="h-8 w-8 text-primary shrink-0" />

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{report.name}</p>
                    <p className="text-xs text-muted-foreground">{createdAt}</p>
                    {report.period?.label && (
                      <p className="text-xs text-muted-foreground">{report.period.label}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={status.variant}>{status.label}</Badge>

                    {report.view_count > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="h-3 w-3" />
                        {report.view_count}
                      </span>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {report.data && (
                          <DropdownMenuItem onClick={() => downloadPdf(report)}>
                            <Download className="mr-2 h-4 w-4" />
                            Baixar PDF
                          </DropdownMenuItem>
                        )}
                        {report.share_token && (
                          <DropdownMenuItem onClick={() => copyShareLink(report)}>
                            <Link2 className="mr-2 h-4 w-4" />
                            Copiar link
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteId(report.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Generator dialog */}
      {showGenerator && client && (
        <ReportGeneratorDialog
          isOpen={showGenerator}
          onClose={() => setShowGenerator(false)}
          clientId={client.id}
          clientName={client.name}
          onReportCreated={fetchReports}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir relatório?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteId && deleteReport(deleteId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
