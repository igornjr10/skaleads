import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarCheck,
  CalendarDays,
  Columns3,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Repeat,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { CampoBusca, casaBusca } from "@/components/CampoBusca";
import { SearchableSelect } from "@/components/SearchableSelect";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ClientAvatar } from "@/components/ClientAvatar";
import { ReuniaoRelatorio } from "@/components/rotina/ReuniaoRelatorio";
import {
  SemanaPipeline,
  chaveOcorrencia,
  type ExecucaoRow,
  type Ocorrencia,
  type RotinaRow,
} from "@/components/rotina/SemanaPipeline";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/utils";
import {
  DIAS_SEMANA,
  PRIORIDADES,
  descreverRegra,
  inicioDaSemana,
  isoLocal,
  ocorrenciasNoIntervalo,
  prioridadeDe,
  somarDias,
  venceEm,
  type StatusOcorrencia,
} from "@/lib/rotinas";

type Rotina = RotinaRow;
type Execucao = ExecucaoRow;

interface Equipe {
  id: string;
  nome: string;
  ordem: number;
}

const COLUNAS_EXECUCAO = "id, rotina_id, data_ref, done, status, mover_para, lembrete_wa_at, done_at, done_by, observacao";

interface ClienteResumo {
  id: string;
  name: string;
  logo_url: string | null;
  manager_id: string | null;
}

interface Pessoa {
  id: string;
  nome: string;
  role: string;
}

const SEM_RESPONSAVEL = "sem-responsavel";
const SEM_CLIENTE = "sem-cliente";
const SEM_EQUIPE = "sem-equipe";
const TODAS_EQUIPES = "todas";
const JANELA_ADERENCIA = 7;

const FORM_VAZIO = {
  titulo: "",
  descricao: "",
  client_id: SEM_CLIENTE,
  assigned_to: SEM_RESPONSAVEL,
  equipe_id: SEM_EQUIPE,
  prioridade: "moderada",
  periodicidade: "semanal",
  dias_semana: [1] as number[],
  dia_mes: "1",
  data_pontual: "",
  horario_limite: "",
  ativa: true,
};

export default function Rotina() {
  const { user, role } = useAuth();
  const podeGerenciar = role === "owner" || role === "admin";

  const [rotinas, setRotinas] = useState<Rotina[]>([]);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);

  const [modo, setModo] = useState<"semana" | "dia" | "cadastro" | "compromissos">("semana");
  const [dataSel, setDataSel] = useState(() => new Date());
  const [inicioSemana, setInicioSemana] = useState(() => inicioDaSemana(new Date()));
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [equipeSel, setEquipeSel] = useState(TODAS_EQUIPES);
  const [gerindoEquipes, setGerindoEquipes] = useState(false);
  const [novaEquipe, setNovaEquipe] = useState("");
  const [lembreteEnviando, setLembreteEnviando] = useState<string | null>(null);
  const [soMinhas, setSoMinhas] = useState(false);

  const [editando, setEditando] = useState<Rotina | null>(null);
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const hoje = useMemo(() => new Date(), []);
  const dataSelISO = isoLocal(dataSel);
  const hojeISO = isoLocal(hoje);

  // A janela precisa cobrir os 7 dias da aderencia, a data e a semana que o
  // usuario escolheu, que podem estar fora deles se ele navegou.
  const janela = useMemo(() => {
    const fimSemana = somarDias(inicioSemana, 6);
    const datas = [somarDias(hoje, -(JANELA_ADERENCIA - 1)), hoje, dataSel, inicioSemana, fimSemana];
    const inicio = new Date(Math.min(...datas.map((d) => d.getTime())));
    const fim = new Date(Math.max(...datas.map((d) => d.getTime())));
    return { inicio: isoLocal(inicio), fim: isoLocal(fim) };
  }, [dataSel, hoje, inicioSemana]);

  const carregarExecucoes = useCallback(async (inicio: string, fim: string) => {
    const { data, error } = await supabase
      .from("rotina_execucoes")
      .select(COLUNAS_EXECUCAO)
      .gte("data_ref", inicio)
      .lte("data_ref", fim);

    if (error) {
      toast.error(errorMessage(error, "Nao foi possivel carregar as baixas"));
      return;
    }
    setExecucoes((data as Execucao[]) ?? []);
  }, []);

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    if (semTabela || loading) return;
    carregarExecucoes(janela.inicio, janela.fim);
  }, [janela.inicio, janela.fim, semTabela, loading, carregarExecucoes]);

  async function carregar() {
    setLoading(true);

    const [rotinasRes, clientesRes, rolesRes, profilesRes] = await Promise.all([
      supabase.from("rotinas").select("*").order("horario_limite", { ascending: true, nullsFirst: false }),
      supabase.from("clients").select("id, name, logo_url, manager_id").neq("status", "archived").order("name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    // A migration pode nao ter rodado ainda neste ambiente.
    if (rotinasRes.error?.code === "42P01") {
      setSemTabela(true);
      setLoading(false);
      return;
    }

    if (rotinasRes.error) {
      toast.error(errorMessage(rotinasRes.error, "Nao foi possivel carregar as rotinas"));
    }

    const perfis = new Map(
      ((profilesRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [
        p.id,
        p.full_name || p.email || p.id.slice(0, 8),
      ])
    );
    const papeis = new Map(((rolesRes.data ?? []) as { user_id: string; role: string }[]).map((r) => [r.user_id, r.role]));
    const time = [...perfis.entries()]
      .map(([id, nome]) => ({ id, nome, role: papeis.get(id) ?? "viewer" }))
      .sort((a, b) => a.nome.localeCompare(b.nome));

    setRotinas((rotinasRes.data as Rotina[]) ?? []);
    setClientes((clientesRes.data as ClienteResumo[]) ?? []);
    setPessoas(time);
    await carregarEquipes();
    setLoading(false);
  }

  async function carregarEquipes(garantir = true) {
    const { data, error } = await supabase.from("rotina_equipes").select("id, nome, ordem").order("ordem").order("nome");
    if (error) return toast.error(errorMessage(error, "Nao foi possivel carregar as equipes"));
    if ((data ?? []).length === 0 && garantir && podeGerenciar) {
      await supabase.rpc("garantir_equipes_rotina");
      return carregarEquipes(false);
    }
    setEquipes((data as Equipe[]) ?? []);
  }

  async function criarEquipe() {
    const nome = novaEquipe.trim();
    if (!nome) return;
    const ordem = Math.max(0, ...equipes.map((e) => e.ordem)) + 1;
    const { data, error } = await supabase.from("rotina_equipes").insert({ nome, ordem }).select("id, nome, ordem").single();
    if (error) return toast.error(errorMessage(error, "Nao foi possivel criar a equipe"));
    setEquipes((atual) => [...atual, data as Equipe]);
    setNovaEquipe("");
    toast.success(`Equipe ${nome} criada`);
  }

  async function renomearEquipe(equipe: Equipe, nome: string) {
    nome = nome.trim();
    if (!nome || nome === equipe.nome) return;
    const { error } = await supabase.from("rotina_equipes").update({ nome }).eq("id", equipe.id);
    if (error) return toast.error(errorMessage(error, "Nao foi possivel renomear"));
    setEquipes((atual) => atual.map((e) => (e.id === equipe.id ? { ...e, nome } : e)));
  }

  async function excluirEquipe(equipe: Equipe) {
    if (!window.confirm(`Excluir a equipe ${equipe.nome}? As demandas dela ficam sem equipe.`)) return;
    const { error } = await supabase.from("rotina_equipes").delete().eq("id", equipe.id);
    if (error) return toast.error(errorMessage(error, "Nao foi possivel excluir a equipe"));
    setEquipes((atual) => atual.filter((e) => e.id !== equipe.id));
    setRotinas((atual) => atual.map((r) => (r.equipe_id === equipe.id ? { ...r, equipe_id: null } : r)));
    if (equipeSel === equipe.id) setEquipeSel(TODAS_EQUIPES);
  }

  const clientePorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const pessoaPorId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);

  const execPorChave = useMemo(() => {
    const mapa = new Map<string, Execucao>();
    for (const e of execucoes) mapa.set(`${e.rotina_id}|${e.data_ref}`, e);
    return mapa;
  }, [execucoes]);

  const ativas = useMemo(() => rotinas.filter((r) => r.ativa), [rotinas]);

  const daEquipe = useCallback(
    (r: Rotina) => equipeSel === TODAS_EQUIPES || r.equipe_id === equipeSel,
    [equipeSel]
  );

  const doDia = useMemo(() => {
    return ativas
      .filter(daEquipe)
      .filter((r) => venceEm(r, dataSel))
      .filter((r) => (soMinhas ? r.assigned_to === user?.id : true));
  }, [ativas, daEquipe, dataSel, soMinhas, user?.id]);

  function casaRotina(r: Rotina) {
    return casaBusca(
      busca,
      r.titulo,
      r.descricao,
      r.client_id ? clientePorId.get(r.client_id)?.name : null,
      r.assigned_to ? pessoaPorId.get(r.assigned_to)?.nome : null
    );
  }

  const doDiaVisiveis = doDia.filter(casaRotina);
  const rotinasVisiveis = rotinas.filter(daEquipe).filter(casaRotina);
  const daSemana = ativas
    .filter(daEquipe)
    .filter((r) => (soMinhas ? r.assigned_to === user?.id : true))
    .filter(casaRotina);

  const resumoSemana = { pendente: 0, andamento: 0, concluida: 0 };
  for (let i = 0; i < 7; i++) {
    const dia = somarDias(inicioSemana, i);
    for (const r of daSemana) {
      if (venceEm(r, dia)) resumoSemana[execPorChave.get(`${r.id}|${isoLocal(dia)}`)?.status ?? "pendente"] += 1;
    }
  }

  function baixaDe(rotina: Rotina, dataISO = dataSelISO) {
    return execPorChave.get(`${rotina.id}|${dataISO}`);
  }

  const resumoDia = useMemo(() => {
    const agora = new Date();
    let feitas = 0;
    let atrasadas = 0;

    for (const r of doDia) {
      const baixa = execPorChave.get(`${r.id}|${dataSelISO}`);
      if (baixa?.done) {
        feitas += 1;
        continue;
      }
      // "Atrasada" so faz sentido olhando para tras ou para o horario ja vencido
      // de hoje. Uma rotina de amanha nao esta atrasada.
      if (dataSelISO < hojeISO) {
        atrasadas += 1;
      } else if (dataSelISO === hojeISO && r.horario_limite) {
        const [h, m] = r.horario_limite.split(":");
        const limite = new Date(agora);
        limite.setHours(Number(h), Number(m), 0, 0);
        if (agora > limite) atrasadas += 1;
      }
    }

    return { feitas, atrasadas, pendentes: doDia.length - feitas, total: doDia.length };
  }, [doDia, execPorChave, dataSelISO, hojeISO]);

  // Aderencia: das ocorrencias que venceram nos ultimos 7 dias, quantas tiveram
  // baixa. Conta por pessoa para o gestor ver quem esta segurando a rotina.
  const aderencia = useMemo(() => {
    const inicio = somarDias(hoje, -(JANELA_ADERENCIA - 1));
    const porPessoa = new Map<string, { devidas: number; feitas: number }>();

    for (const r of ativas) {
      const chavePessoa = r.assigned_to ?? SEM_RESPONSAVEL;
      const atual = porPessoa.get(chavePessoa) ?? { devidas: 0, feitas: 0 };

      for (const dataISO of ocorrenciasNoIntervalo(r, inicio, hoje)) {
        atual.devidas += 1;
        if (execPorChave.get(`${r.id}|${dataISO}`)?.done) atual.feitas += 1;
      }
      porPessoa.set(chavePessoa, atual);
    }

    return [...porPessoa.entries()]
      .filter(([, v]) => v.devidas > 0)
      .map(([id, v]) => ({
        id,
        nome: id === SEM_RESPONSAVEL ? "Sem responsável" : pessoaPorId.get(id)?.nome ?? "Equipe",
        ...v,
        pct: Math.round((v.feitas / v.devidas) * 100),
      }))
      .sort((a, b) => a.pct - b.pct);
  }, [ativas, execPorChave, hoje, pessoaPorId]);

  function podeDarBaixa(rotina: Rotina) {
    return podeGerenciar || rotina.assigned_to === user?.id;
  }

  async function alternarBaixa(rotina: Rotina, done: boolean) {
    if (!podeDarBaixa(rotina)) return toast.error("Esta rotina nao esta atribuida a voce");

    const anterior = baixaDe(rotina);
    const otimista: Execucao = {
      id: anterior?.id ?? `tmp-${rotina.id}-${dataSelISO}`,
      rotina_id: rotina.id,
      data_ref: dataSelISO,
      done,
      status: done ? "concluida" : "pendente",
      mover_para: anterior?.mover_para ?? null,
      lembrete_wa_at: anterior?.lembrete_wa_at ?? null,
      done_at: done ? new Date().toISOString() : null,
      done_by: done ? user?.id ?? null : null,
      observacao: anterior?.observacao ?? null,
    };
    setExecucoes((atual) => [...atual.filter((e) => !(e.rotina_id === rotina.id && e.data_ref === dataSelISO)), otimista]);

    const { data, error } = await supabase
      .from("rotina_execucoes")
      .upsert(
        { rotina_id: rotina.id, data_ref: dataSelISO, done, observacao: anterior?.observacao ?? null },
        { onConflict: "rotina_id,data_ref" }
      )
      .select(COLUNAS_EXECUCAO)
      .single();

    if (error) {
      setExecucoes((atual) => [
        ...atual.filter((e) => !(e.rotina_id === rotina.id && e.data_ref === dataSelISO)),
        ...(anterior ? [anterior] : []),
      ]);
      return toast.error(errorMessage(error, "Nao foi possivel dar baixa"));
    }

    setExecucoes((atual) => [
      ...atual.filter((e) => !(e.rotina_id === rotina.id && e.data_ref === dataSelISO)),
      data as Execucao,
    ]);
  }

  async function salvarObservacao(rotina: Rotina, texto: string) {
    const anterior = baixaDe(rotina);
    if ((anterior?.observacao ?? "") === texto) return;
    if (!podeDarBaixa(rotina)) return;

    const { data, error } = await supabase
      .from("rotina_execucoes")
      .upsert(
        { rotina_id: rotina.id, data_ref: dataSelISO, done: anterior?.done ?? false, observacao: texto || null },
        { onConflict: "rotina_id,data_ref" }
      )
      .select(COLUNAS_EXECUCAO)
      .single();

    if (error) return toast.error(errorMessage(error, "Nao foi possivel salvar a observacao"));

    setExecucoes((atual) => [
      ...atual.filter((e) => !(e.rotina_id === rotina.id && e.data_ref === dataSelISO)),
      data as Execucao,
    ]);
  }

  function trocarExecucao(nova: Execucao) {
    setExecucoes((atual) => [
      ...atual.filter((e) => !(e.rotina_id === nova.rotina_id && e.data_ref === nova.data_ref)),
      nova,
    ]);
  }

  function execucaoBase(oc: Ocorrencia): Execucao {
    return {
      id: `tmp-${chaveOcorrencia(oc)}`,
      rotina_id: oc.rotina.id,
      data_ref: oc.dataRef,
      done: false,
      status: "pendente",
      mover_para: null,
      lembrete_wa_at: null,
      done_at: null,
      done_by: null,
      observacao: null,
      ...oc.execucao,
    };
  }

  // Grava so os campos da mudanca: o upsert do PostgREST atualiza apenas as
  // colunas enviadas, e o trigger mantem done e status em acordo.
  async function gravarOcorrencia(oc: Ocorrencia, mudanca: Partial<Execucao>, erro: string) {
    const anterior = oc.execucao;
    trocarExecucao({
      ...execucaoBase(oc),
      ...mudanca,
      ...(mudanca.status ? { done: mudanca.status === "concluida" } : {}),
    });

    const { data, error } = await supabase
      .from("rotina_execucoes")
      .upsert({ rotina_id: oc.rotina.id, data_ref: oc.dataRef, ...mudanca }, { onConflict: "rotina_id,data_ref" })
      .select(COLUNAS_EXECUCAO)
      .single();

    if (error) {
      setExecucoes((atual) => [
        ...atual.filter((e) => !(e.rotina_id === oc.rotina.id && e.data_ref === oc.dataRef)),
        ...(anterior ? [anterior] : []),
      ]);
      toast.error(errorMessage(error, erro));
      return false;
    }
    trocarExecucao(data as Execucao);
    return true;
  }

  function mudarStatus(oc: Ocorrencia, status: StatusOcorrencia) {
    if (!podeDarBaixa(oc.rotina)) return toast.error("Esta demanda nao esta atribuida a voce");
    gravarOcorrencia(oc, { status }, "Nao foi possivel mudar o status");
  }

  async function moverOcorrencia(oc: Ocorrencia, novaData: string) {
    if (oc.rotina.periodicidade === "pontual") {
      const backup = rotinas;
      setRotinas((atual) => atual.map((r) => (r.id === oc.rotina.id ? { ...r, data_pontual: novaData } : r)));
      const { error } = await supabase.from("rotinas").update({ data_pontual: novaData }).eq("id", oc.rotina.id);
      if (error) {
        setRotinas(backup);
        toast.error(errorMessage(error, "Nao foi possivel mover a demanda"));
      }
      return;
    }
    // Recorrente: so esta ocorrencia muda de dia; a regra continua a mesma.
    const ok = await gravarOcorrencia(
      oc,
      { mover_para: novaData === oc.dataRef ? null : novaData },
      "Nao foi possivel mover a demanda"
    );
    if (ok) toast.success("Movida só nesta semana. A repetição continua a mesma.", { id: "movida-recorrente" });
  }

  async function enviarLembrete(oc: Ocorrencia) {
    setLembreteEnviando(chaveOcorrencia(oc));
    try {
      const { data, error } = await supabase.functions.invoke("rotina-lembrete", {
        body: { rotina_id: oc.rotina.id, data_ref: oc.dataRef },
      });
      if (error) {
        // FunctionsHttpError esconde o corpo, e e nele que vem o motivo.
        const detalhe = await (error as { context?: { json?: () => Promise<{ error?: string }> } })
          .context?.json?.().catch(() => null);
        throw new Error(detalhe?.error || error.message);
      }
      if (data?.error) throw new Error(data.error);
      toast.success(`Lembrete enviado no WhatsApp de ${data?.responsavel || "responsável"}`);
      trocarExecucao({ ...execucaoBase(oc), lembrete_wa_at: data?.enviado_em ?? new Date().toISOString() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar o lembrete", { duration: 8000 });
    } finally {
      setLembreteEnviando(null);
    }
  }

  function abrirNova(dataISO?: string) {
    const equipe = equipeSel === TODAS_EQUIPES ? SEM_EQUIPE : equipeSel;
    setForm(
      dataISO
        ? { ...FORM_VAZIO, equipe_id: equipe, periodicidade: "pontual", data_pontual: dataISO }
        : { ...FORM_VAZIO, equipe_id: equipe }
    );
    setEditando(null);
    setCriando(true);
  }

  function abrirEdicao(rotina: Rotina) {
    setForm({
      titulo: rotina.titulo,
      descricao: rotina.descricao ?? "",
      client_id: rotina.client_id ?? SEM_CLIENTE,
      assigned_to: rotina.assigned_to ?? SEM_RESPONSAVEL,
      equipe_id: rotina.equipe_id ?? SEM_EQUIPE,
      prioridade: rotina.prioridade ?? "moderada",
      periodicidade: rotina.periodicidade,
      dias_semana: rotina.dias_semana ?? [1],
      dia_mes: String(rotina.dia_mes ?? 1),
      data_pontual: rotina.data_pontual ?? "",
      horario_limite: rotina.horario_limite?.slice(0, 5) ?? "",
      ativa: rotina.ativa,
    });
    setEditando(rotina);
    setCriando(true);
  }

  async function salvarRotina() {
    if (!form.titulo.trim()) return toast.error("A demanda precisa de um titulo");
    if (form.periodicidade === "pontual" && !form.data_pontual) return toast.error("Escolha a data da demanda");
    // O CHECK do banco tambem barra, mas o erro que voltaria fala de constraint
    // em vez de dizer o que fazer.
    if (form.periodicidade === "semanal" && form.dias_semana.length === 0) {
      return toast.error("Marque pelo menos um dia da semana");
    }
    setSalvando(true);

    // O CHECK do banco exige que so a ancora da periodicidade escolhida venha
    // preenchida; mandar as duas derruba o insert inteiro.
    const payload = {
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      client_id: form.client_id === SEM_CLIENTE ? null : form.client_id,
      assigned_to: form.assigned_to === SEM_RESPONSAVEL ? null : form.assigned_to,
      equipe_id: form.equipe_id === SEM_EQUIPE ? null : form.equipe_id,
      prioridade: form.prioridade,
      periodicidade: form.periodicidade,
      data_pontual: form.periodicidade === "pontual" ? form.data_pontual : null,
      dias_semana: form.periodicidade === "semanal" ? [...form.dias_semana].sort((a, b) => a - b) : null,
      dia_mes: form.periodicidade === "mensal" ? Number(form.dia_mes) : null,
      horario_limite: form.horario_limite || null,
      ativa: form.ativa,
    };

    const resposta = editando
      ? await supabase.from("rotinas").update(payload).eq("id", editando.id).select("*").single()
      : await supabase
          .from("rotinas")
          .insert({ ...payload, created_by: user?.id ?? null })
          .select("*")
          .single();

    setSalvando(false);
    if (resposta.error) return toast.error(errorMessage(resposta.error, "Nao foi possivel salvar a rotina"));

    const salva = resposta.data as Rotina;
    setRotinas((atual) => (editando ? atual.map((r) => (r.id === salva.id ? salva : r)) : [...atual, salva]));
    setCriando(false);
    setEditando(null);
    toast.success(editando ? "Demanda atualizada" : "Demanda criada");
  }

  async function excluirRotina(rotina: Rotina) {
    const repete = rotina.periodicidade !== "pontual";
    if (!window.confirm(`Excluir "${rotina.titulo}"${repete ? " e todas as repetições" : ""}?`)) return false;
    const backup = rotinas;
    setRotinas((atual) => atual.filter((r) => r.id !== rotina.id));

    const { error } = await supabase.from("rotinas").delete().eq("id", rotina.id);
    if (error) {
      setRotinas(backup);
      toast.error(errorMessage(error, "Nao foi possivel excluir"));
      return false;
    }
    return true;
  }

  if (semTabela) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Database className="h-8 w-8 text-muted-foreground" />
          <h2 className="text-base font-semibold">Rotina ainda não instalada no banco</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Rode a migration <code className="text-primary">20260916010000_rotinas.sql</code> no SQL Editor do Supabase
            e recarregue esta página.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
            <Repeat className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Rotina</h1>
            <p className="text-sm text-muted-foreground">
              A semana de cada equipe: demandas pontuais e recorrentes, quem cuida e em que pé está. Aviso no sino às 8h.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className={`grid grid-cols-3 gap-3 ${modo === "compromissos" || modo === "cadastro" ? "hidden" : ""}`}>
            {(modo === "semana"
              ? [
                  { label: "Pendentes", valor: resumoSemana.pendente, destaque: false },
                  { label: "Em andamento", valor: resumoSemana.andamento, destaque: false },
                  { label: "Concluídas", valor: resumoSemana.concluida, destaque: false },
                ]
              : [
                  { label: "Feitas", valor: resumoDia.feitas, destaque: false },
                  { label: "Pendentes", valor: resumoDia.pendentes, destaque: false },
                  { label: "Atrasadas", valor: resumoDia.atrasadas, destaque: resumoDia.atrasadas > 0 },
                ]
            ).map(({ label, valor, destaque }) => (
              <div
                key={label}
                className={`rounded-2xl border px-4 py-3 text-center ${
                  destaque ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-card/60"
                }`}
              >
                <div className={`text-2xl font-semibold tabular-nums ${destaque ? "text-destructive" : ""}`}>
                  {valor}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>

          {podeGerenciar && (
            <Button onClick={() => abrirNova()} className="shrink-0">
              <Plus className="mr-1.5 h-4 w-4" />
              Nova demanda
            </Button>
          )}
        </div>
      </div>

      {!podeGerenciar && (
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/40 px-4 py-3 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Seu perfil ({role ?? "sem role"}) muda o status, remaneja e pede lembrete das demandas atribuídas a você.
          Cadastrar e distribuir demandas é de owner/admin.
        </div>
      )}

      {/* ── Controles ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex shrink-0 flex-wrap rounded-xl border border-border/60 p-0.5">
          <Button variant={modo === "semana" ? "secondary" : "ghost"} size="sm" onClick={() => setModo("semana")}>
            <Columns3 className="mr-1.5 h-4 w-4" />
            Semana
          </Button>
          <Button variant={modo === "dia" ? "secondary" : "ghost"} size="sm" onClick={() => setModo("dia")}>
            <CalendarDays className="mr-1.5 h-4 w-4" />
            Do dia
          </Button>
          <Button
            variant={modo === "compromissos" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setModo("compromissos")}
          >
            <CalendarCheck className="mr-1.5 h-4 w-4" />
            Reunião e relatório
          </Button>
          {podeGerenciar && (
            <Button variant={modo === "cadastro" ? "secondary" : "ghost"} size="sm" onClick={() => setModo("cadastro")}>
              <Repeat className="mr-1.5 h-4 w-4" />
              Cadastro
            </Button>
          )}
        </div>

        {modo === "semana" && (
          <>
            <div className="flex items-center gap-1 rounded-xl border border-border/60 px-1 py-0.5">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setInicioSemana((d) => somarDias(d, -7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[9.5rem] text-center text-sm font-medium">
                {format(inicioSemana, "dd/MM")} a {format(somarDias(inicioSemana, 6), "dd/MM")}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setInicioSemana((d) => somarDias(d, 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {isoLocal(inicioSemana) !== isoLocal(inicioDaSemana(hoje)) && (
              <Button variant="outline" size="sm" onClick={() => setInicioSemana(inicioDaSemana(new Date()))}>
                Esta semana
              </Button>
            )}

            <Button
              variant={soMinhas ? "default" : "outline"}
              size="sm"
              onClick={() => setSoMinhas((v) => !v)}
              className="shrink-0"
            >
              Minhas demandas
            </Button>
          </>
        )}

        {modo === "dia" && (
          <>
            <div className="flex items-center gap-1 rounded-xl border border-border/60 px-1 py-0.5">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDataSel((d) => somarDias(d, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[9.5rem] text-center text-sm font-medium capitalize">
                {format(dataSel, "EEE, dd MMM", { locale: ptBR })}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDataSel((d) => somarDias(d, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {dataSelISO !== hojeISO && (
              <Button variant="outline" size="sm" onClick={() => setDataSel(new Date())}>
                Hoje
              </Button>
            )}

            <Button
              variant={soMinhas ? "default" : "outline"}
              size="sm"
              onClick={() => setSoMinhas((v) => !v)}
              className="shrink-0"
            >
              Minhas rotinas
            </Button>
          </>
        )}

        {modo !== "compromissos" && (
          <CampoBusca
            value={busca}
            onChange={setBusca}
            placeholder="Buscar demanda, cliente ou responsável"
            className="w-full lg:ml-auto lg:w-72"
          />
        )}
      </div>

      {/* ── Equipes (abas) ──────────────────────────────────────────────── */}
      {modo !== "compromissos" && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60">
          {[{ id: TODAS_EQUIPES, nome: "Todas" }, ...equipes].map((e) => {
            const ativa = equipeSel === e.id;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setEquipeSel(e.id)}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  ativa
                    ? "border-emerald-500 text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {e.nome}
              </button>
            );
          })}
          {podeGerenciar && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-1 shrink-0 text-muted-foreground"
              onClick={() => setGerindoEquipes(true)}
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Equipes
            </Button>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : modo === "semana" ? (
        <SemanaPipeline
          inicioSemana={inicioSemana}
          hojeISO={hojeISO}
          rotinas={daSemana}
          execPorChave={execPorChave}
          nomeDaPessoa={(id) => pessoaPorId.get(id)?.nome}
          clientePorId={clientePorId}
          podeGerenciar={podeGerenciar}
          podeDarBaixa={podeDarBaixa}
          lembreteEnviando={lembreteEnviando}
          onStatus={mudarStatus}
          onMover={moverOcorrencia}
          onEditar={abrirEdicao}
          onNova={abrirNova}
          onLembrete={enviarLembrete}
        />
      ) : modo === "dia" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          {/* ── Rotinas do dia ──────────────────────────────────────── */}
          <div className="space-y-2">
            {doDiaVisiveis.map((rotina) => {
              const baixa = baixaDe(rotina);
              const cliente = rotina.client_id ? clientePorId.get(rotina.client_id) : null;
              const responsavel = rotina.assigned_to ? pessoaPorId.get(rotina.assigned_to) : null;
              const liberado = podeDarBaixa(rotina);

              return (
                <div
                  key={rotina.id}
                  className={`rounded-2xl border px-4 py-3 transition-colors ${
                    baixa?.done ? "border-emerald-500/25 bg-emerald-500/[0.04]" : "border-border/60 bg-card/60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={!!baixa?.done}
                      disabled={!liberado}
                      onCheckedChange={(v) => alternarBaixa(rotina, v === true)}
                      className="mt-0.5"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm font-medium ${
                            baixa?.done ? "text-muted-foreground line-through" : ""
                          }`}
                        >
                          {rotina.titulo}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {descreverRegra(rotina)}
                        </Badge>
                        {rotina.horario_limite && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Clock className="h-3 w-3" />
                            até {rotina.horario_limite.slice(0, 5)}
                          </Badge>
                        )}
                      </div>

                      {rotina.descricao && (
                        <p className="mt-1 text-xs text-muted-foreground">{rotina.descricao}</p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        {cliente && (
                          <span className="flex items-center gap-1.5">
                            <ClientAvatar name={cliente.name} logoUrl={cliente.logo_url} className="h-4 w-4" />
                            {cliente.name}
                          </span>
                        )}
                        <span>{responsavel?.nome ?? "Sem responsável"}</span>
                        {baixa?.done && baixa.done_at && (
                          <span className="text-emerald-400/80">
                            feito {format(parseISO(baixa.done_at), "HH:mm", { locale: ptBR })}
                            {baixa.done_by && baixa.done_by !== rotina.assigned_to
                              ? ` por ${pessoaPorId.get(baixa.done_by)?.nome ?? "outro"}`
                              : ""}
                          </span>
                        )}
                      </div>

                      {liberado && (
                        <Input
                          defaultValue={baixa?.observacao ?? ""}
                          key={`${rotina.id}|${dataSelISO}|${baixa?.observacao ?? ""}`}
                          onBlur={(e) => salvarObservacao(rotina, e.target.value.trim())}
                          placeholder="Observação do dia (opcional)"
                          className="mt-2 h-8 text-xs"
                        />
                      )}
                      {!liberado && baixa?.observacao && (
                        <p className="mt-2 rounded-lg border border-border/60 bg-background/40 px-2 py-1 text-xs text-muted-foreground">
                          {baixa.observacao}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {doDiaVisiveis.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border/50 px-4 py-12 text-center text-sm text-muted-foreground">
                {ativas.length === 0
                  ? "Nenhuma rotina cadastrada ainda."
                  : doDia.length > 0
                  ? "Nenhuma rotina encontrada na busca."
                  : "Nenhuma rotina vence nesta data com esses filtros."}
              </div>
            )}
          </div>

          {/* ── Aderência ───────────────────────────────────────────── */}
          <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Aderência · últimos {JANELA_ADERENCIA} dias
            </h2>

            <div className="mt-4 space-y-3">
              {aderencia.map((p) => (
                <div key={p.id}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{p.nome}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {p.feitas}/{p.devidas} · {p.pct}%
                    </span>
                  </div>
                  <Progress value={p.pct} className="mt-1 h-1.5" />
                </div>
              ))}

              {aderencia.length === 0 && (
                <p className="text-xs text-muted-foreground">Sem ocorrências na janela ainda.</p>
              )}
            </div>
          </div>
        </div>
      ) : modo === "compromissos" ? (
        /* ── Reunião e relatório ───────────────────────────────────────── */
        <ReuniaoRelatorio clientes={clientes} />
      ) : (
        /* ── Cadastro ──────────────────────────────────────────────────── */
        <div className="overflow-hidden rounded-2xl border border-border/60">
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 border-b border-border/60 bg-card/40 px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Rotina</span>
            <span>Quando</span>
            <span>Responsável</span>
            <span>Cliente</span>
            <span />
          </div>

          {rotinasVisiveis.map((rotina) => (
            <div
              key={rotina.id}
              className="grid grid-cols-1 gap-2 border-b border-border/40 px-4 py-3 last:border-0 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-center lg:gap-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${prioridadeDe(rotina.prioridade).ponto}`}
                  title={`Prioridade ${prioridadeDe(rotina.prioridade).label.toLowerCase()}`}
                />
                <span className={`truncate text-sm font-medium ${rotina.ativa ? "" : "text-muted-foreground"}`}>
                  {rotina.titulo}
                </span>
                {!rotina.ativa && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    inativa
                  </Badge>
                )}
              </div>

              <span className="text-xs text-muted-foreground">
                {descreverRegra(rotina)}
                {equipeSel === TODAS_EQUIPES && rotina.equipe_id && (
                  <span className="block text-[11px]">{equipes.find((e) => e.id === rotina.equipe_id)?.nome}</span>
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {rotina.assigned_to ? pessoaPorId.get(rotina.assigned_to)?.nome ?? "—" : "Sem responsável"}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {rotina.client_id ? clientePorId.get(rotina.client_id)?.name ?? "—" : "—"}
              </span>

              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEdicao(rotina)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => excluirRotina(rotina)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}

          {rotinas.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhuma rotina cadastrada. Comece pelo que a equipe já faz todo dia.
            </div>
          )}
          {rotinas.length > 0 && rotinasVisiveis.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma rotina encontrada na busca.</div>
          )}
        </div>
      )}

      {/* ── Nova / editar rotina ────────────────────────────────────────── */}
      <Dialog
        open={criando}
        onOpenChange={(open) => {
          if (!open) {
            setCriando(false);
            setEditando(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar demanda" : "Nova demanda"}</DialogTitle>
            <DialogDescription>
              Pontual ou recorrente. O responsável é avisado no sino ao ser atribuído e às 8h do dia em que a demanda
              vence, se ainda estiver pendente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Título</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex.: Conferir verba de todos os clientes"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Equipe</Label>
                <Select value={form.equipe_id} onValueChange={(v) => setForm({ ...form, equipe_id: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_EQUIPE}>Sem equipe</SelectItem>
                    {equipes.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {PRIORIDADES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={form.prioridade === p.id}
                      onClick={() => setForm({ ...form, prioridade: p.id })}
                      className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        form.prioridade === p.id ? p.badge : "border-input text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${p.ponto}`} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Quando</Label>
                <Select
                  value={form.periodicidade}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      periodicidade: v,
                      data_pontual: v === "pontual" && !form.data_pontual ? isoLocal(new Date()) : form.data_pontual,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pontual">Uma vez (pontual)</SelectItem>
                    <SelectItem value="diaria">Todo dia</SelectItem>
                    <SelectItem value="semanal">Dias da semana</SelectItem>
                    <SelectItem value="mensal">Todo mês</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.periodicidade === "semanal" && (
                <div>
                  <Label>Dias da semana</Label>
                  {/* Botao por dia em vez de select: a rotina de seg/qua/sex e o
                      caso comum, e num select multiplo ela exigiria tres
                      interacoes e esconderia o que ja esta marcado. */}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {DIAS_SEMANA.map((d) => {
                      const marcado = form.dias_semana.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          aria-pressed={marcado}
                          onClick={() =>
                            setForm({
                              ...form,
                              dias_semana: marcado
                                ? form.dias_semana.filter((id) => id !== d.id)
                                : [...form.dias_semana, d.id],
                            })
                          }
                          className={`h-9 w-12 rounded-lg border text-xs font-medium transition-colors ${
                            marcado
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input bg-background text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {d.curto}
                        </button>
                      );
                    })}
                  </div>
                  {form.dias_semana.length === 0 && (
                    <p className="mt-1.5 text-xs text-rose-600">
                      Marque pelo menos um dia, senao a rotina nunca vence.
                    </p>
                  )}
                </div>
              )}

              {form.periodicidade === "pontual" && (
                <div>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={form.data_pontual}
                    onChange={(e) => setForm({ ...form, data_pontual: e.target.value })}
                  />
                </div>
              )}

              {form.periodicidade === "mensal" && (
                <div>
                  <Label>Dia do mês</Label>
                  <Select value={form.dia_mes} onValueChange={(v) => setForm({ ...form, dia_mes: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          Dia {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.periodicidade === "diaria" && (
                <div>
                  <Label>Horário limite</Label>
                  <Input
                    type="time"
                    value={form.horario_limite}
                    onChange={(e) => setForm({ ...form, horario_limite: e.target.value })}
                  />
                </div>
              )}
            </div>

            {form.periodicidade !== "diaria" && (
              <div>
                <Label>Horário limite (opcional)</Label>
                <Input
                  type="time"
                  value={form.horario_limite}
                  onChange={(e) => setForm({ ...form, horario_limite: e.target.value })}
                />
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Responsável</Label>
                <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
                    {pessoas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome} · {p.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cliente</Label>
                <SearchableSelect
                  options={[
                    { value: SEM_CLIENTE, label: "Sem cliente" },
                    ...clientes.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  value={form.client_id}
                  onChange={(v) => setForm({ ...form, client_id: v })}
                  searchPlaceholder="Buscar cliente..."
                />
              </div>
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                rows={3}
                placeholder="O que exatamente precisa ser conferido, e onde."
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.ativa}
                onCheckedChange={(v) => setForm({ ...form, ativa: v === true })}
              />
              Demanda ativa
            </label>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {editando ? (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  if (await excluirRotina(editando)) {
                    setCriando(false);
                    setEditando(null);
                  }
                }}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Excluir
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCriando(false);
                  setEditando(null);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={salvarRotina} disabled={salvando}>
                {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {editando ? "Salvar" : "Criar demanda"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Equipes ─────────────────────────────────────────────────────── */}
      <Dialog open={gerindoEquipes} onOpenChange={setGerindoEquipes}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Equipes da rotina</DialogTitle>
            <DialogDescription>Cada equipe vira uma aba. Renomeie direto no campo.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {equipes.map((e) => (
              <div key={e.id} className="flex items-center gap-2">
                <Input
                  key={`${e.id}|${e.nome}`}
                  defaultValue={e.nome}
                  onBlur={(ev) => renomearEquipe(e, ev.target.value)}
                  className="h-9"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-destructive"
                  title="Excluir equipe"
                  onClick={() => excluirEquipe(e)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {equipes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma equipe ainda.</p>}
          </div>

          <form
            className="flex gap-2 border-t border-border/60 pt-3"
            onSubmit={(ev) => {
              ev.preventDefault();
              criarEquipe();
            }}
          >
            <Input value={novaEquipe} onChange={(ev) => setNovaEquipe(ev.target.value)} placeholder="Nova equipe, ex.: Closer" />
            <Button type="submit" disabled={!novaEquipe.trim()} className="shrink-0">
              <Plus className="mr-1 h-4 w-4" />
              Adicionar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
