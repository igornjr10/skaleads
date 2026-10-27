import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CircleX, Loader2, Power, RefreshCw, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/utils";
import { formatarTelefone } from "@/lib/whatsapp";

interface Numero {
  id: string;
  user_id: string;
  padrao: boolean;
  conectado: boolean;
  numero: string | null;
  perfil_nome: string | null;
  status_em: string | null;
}

interface Pessoa {
  user_id: string;
  nome: string;
}

async function chamar(fn: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const detalhe = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.().catch(() => null);
    throw new Error(detalhe?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/** ADM: quem da equipe tem WhatsApp conectado e qual numero e o padrao da empresa. */
export function NumerosDaEquipe({ onMudou }: { onMudou?: () => void }) {
  const { empresa } = useAuth();
  const [numeros, setNumeros] = useState<Numero[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!empresa?.id) return;
    setCarregando(true);
    try {
      const [{ data: inst, error }, { data: vinculos }] = await Promise.all([
        supabase
          .from("wa_instancias")
          .select("id, user_id, padrao, conectado, numero, perfil_nome, status_em")
          .eq("company_id", empresa.id),
        supabase.from("user_companies").select("user_id").eq("company_id", empresa.id),
      ]);
      if (error) throw error;
      const ids = (vinculos ?? []).map((v) => v.user_id);
      const { data: perfis } = ids.length
        ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
        : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
      setNumeros((inst as Numero[]) ?? []);
      setPessoas((perfis ?? []).map((p) => ({ user_id: p.id, nome: p.full_name || p.email || "Sem nome" })));
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível carregar os números da equipe"));
    } finally {
      setCarregando(false);
    }
  }, [empresa?.id]);

  // O "conectado" do banco so muda quando alguem consulta: confere todos ao abrir,
  // senao o painel mostra conectado um numero que caiu dias atras (e vice-versa).
  useEffect(() => {
    carregar().then(async () => {
      const { data } = await supabase.from("wa_instancias").select("id").eq("company_id", empresa?.id ?? "");
      if (!data?.length) return;
      await Promise.allSettled(data.map((n) => chamar("whatsapp-instance-status", { instancia_id: n.id })));
      await carregar();
    });
  }, [carregar]); // eslint-disable-line react-hooks/exhaustive-deps

  async function agir(id: string, rotulo: string, fazer: () => Promise<unknown>) {
    setOcupado(id);
    try {
      await fazer();
      toast.success(rotulo);
      await carregar();
      onMudou?.();
    } catch (err) {
      toast.error(errorMessage(err, "Não deu certo"), { duration: 12000 });
    } finally {
      setOcupado(null);
    }
  }

  const tornarPadrao = (n: Numero) => agir(n.id, "Número padrão atualizado", async () => {
    const { error } = await supabase.rpc("definir_numero_padrao_wa", { _instancia: n.id });
    if (error) throw error;
  });
  const conferir = (n: Numero) => agir(n.id, "Status atualizado", () => chamar("whatsapp-instance-status", { instancia_id: n.id }));
  const desconectar = (n: Numero) => agir(n.id, "Número desconectado", () => chamar("whatsapp-instance-admin", { action: "logout", instancia_id: n.id }));
  const remover = (n: Numero) => agir(n.id, "Número removido da plataforma", () => chamar("whatsapp-instance-admin", { action: "remover", instancia_id: n.id }));

  const nomeDe = (userId: string) => pessoas.find((p) => p.user_id === userId)?.nome ?? "Pessoa fora da empresa";
  const semNumero = pessoas.filter((p) => !numeros.some((n) => n.user_id === p.user_id));
  const temPadrao = numeros.some((n) => n.padrao);

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>WhatsApp da equipe</CardTitle>
        <CardDescription>
          Cada pessoa conecta o próprio número em Configurações. O <strong>número padrão</strong> envia o que não tem
          dono (cobranças, aviso de depósito, agendamentos antigos) e lê os grupos de clientes para o resumo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!carregando && !temPadrao && numeros.length > 0 && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
            Nenhum número padrão escolhido: cobranças e avisos de depósito não vão sair até você marcar um.
          </p>
        )}

        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {numeros.map((n) => (
                <TableRow key={n.id}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{nomeDe(n.user_id)}</span>
                      {n.padrao && (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                          <Star className="mr-1 h-3 w-3" /> Padrão
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {n.numero ? formatarTelefone(n.numero) : "—"}
                    {n.perfil_nome && <div className="text-xs">{n.perfil_nome}</div>}
                  </TableCell>
                  <TableCell>
                    {n.conectado ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><CircleCheck className="h-3.5 w-3.5" /> Conectado</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive"><CircleX className="h-3.5 w-3.5" /> Desconectado</span>
                    )}
                    {n.status_em && (
                      <div className="text-[11px] text-muted-foreground">
                        conferido {new Date(n.status_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      {ocupado === n.id && <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground" />}
                      <Button variant="ghost" size="sm" disabled={!!ocupado} onClick={() => conferir(n)}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Conferir
                      </Button>
                      {!n.padrao && (
                        <Button variant="outline" size="sm" disabled={!!ocupado} onClick={() => tornarPadrao(n)}>
                          <Star className="mr-1.5 h-3.5 w-3.5" /> Tornar padrão
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" disabled={!!ocupado || !n.conectado} className="text-destructive hover:text-destructive">
                            <Power className="mr-1.5 h-3.5 w-3.5" /> Desconectar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Desconectar o WhatsApp de {nomeDe(n.user_id)}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              A sessão cai e só a própria pessoa consegue conectar de novo, lendo o QR no celular dela.
                              O histórico de conversas continua na plataforma.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => desconectar(n)}>Desconectar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" disabled={!!ocupado}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover o número de {nomeDe(n.user_id)}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Apaga a instância na uazapi. As mensagens antigas ficam no histórico (visíveis para o ADM),
                              mas as mídias delas deixam de abrir. Use quando a pessoa sai da equipe ou troca de número.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remover(n)}>Remover</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {semNumero.map((p) => (
                <TableRow key={p.user_id}>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">—</TableCell>
                  <TableCell className="text-xs text-muted-foreground" colSpan={2}>Ainda não conectou o WhatsApp</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
