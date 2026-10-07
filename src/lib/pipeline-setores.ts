import { isoLocal, venceEm, type RegraRotina, type StatusOcorrencia } from "./rotinas";

export interface SetorRotina {
  id: string;
  nome: string;
  ordem: number;
}

export interface RotinaDoSetor extends RegraRotina {
  id: string;
  titulo: string;
  equipe_id: string | null;
  assigned_to: string | null;
  client_id: string | null;
  prioridade: string;
  horario_limite: string | null;
  ativa: boolean;
}

export interface ExecucaoDoSetor {
  rotina_id: string;
  data_ref: string;
  status: StatusOcorrencia;
  mover_para: string | null;
}

export interface OcorrenciaDoSetor {
  rotina: RotinaDoSetor;
  /** Dia em que vence pela regra. */
  dataRef: string;
  /** Dia em que aparece: dataRef ou o dia para onde foi remanejada. */
  dia: string;
  status: StatusOcorrencia;
}

export interface PipelineSetor {
  id: string;
  nome: string;
  pendente: number;
  andamento: number;
  concluida: number;
  total: number;
  responsaveis: string[];
  ocorrencias: OcorrenciaDoSetor[];
}

export const SEM_SETOR = "sem-setor";

function diasEntre(de: string, ate: string): Date[] {
  const [a, m, d] = de.split("-").map(Number);
  const cursor = new Date(a, m - 1, d);
  const dias: Date[] = [];
  while (isoLocal(cursor) <= ate) {
    dias.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

function dataLocal(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

/**
 * As ocorrencias de rotina que caem entre `de` e `ate`, com a mesma regra do
 * quadro da Rotina: a remanejada aparece no dia para onde foi movida. Por isso
 * `execucoes` precisa trazer tambem as que tem `mover_para` dentro do periodo
 * mesmo com `data_ref` fora dele.
 */
export function ocorrenciasNoPeriodo(
  rotinas: RotinaDoSetor[],
  execucoes: ExecucaoDoSetor[],
  de: string,
  ate: string,
): OcorrenciaDoSetor[] {
  const ativas = rotinas.filter((r) => r.ativa);
  const porId = new Map(ativas.map((r) => [r.id, r]));
  const execPorChave = new Map(execucoes.map((e) => [`${e.rotina_id}|${e.data_ref}`, e]));
  const dentro = (iso: string) => iso >= de && iso <= ate;
  const lista: OcorrenciaDoSetor[] = [];

  for (const dia of diasEntre(de, ate)) {
    const dataRef = isoLocal(dia);
    for (const rotina of ativas) {
      if (!venceEm(rotina, dia)) continue;
      const exec = execPorChave.get(`${rotina.id}|${dataRef}`);
      const destino = exec?.mover_para ?? dataRef;
      if (!dentro(destino)) continue;
      lista.push({ rotina, dataRef, dia: destino, status: exec?.status ?? "pendente" });
    }
  }

  for (const exec of execucoes) {
    if (!exec.mover_para || dentro(exec.data_ref) || !dentro(exec.mover_para)) continue;
    const rotina = porId.get(exec.rotina_id);
    if (!rotina || !venceEm(rotina, dataLocal(exec.data_ref))) continue;
    lista.push({ rotina, dataRef: exec.data_ref, dia: exec.mover_para, status: exec.status });
  }

  return lista;
}

const ORDEM_STATUS: Record<StatusOcorrencia, number> = { andamento: 0, pendente: 1, concluida: 2 };
const ORDEM_PRIORIDADE: Record<string, number> = { urgente: 0, moderada: 1, leve: 2 };

/** Um card por setor, na ordem das equipes; "Sem setor" so aparece se tiver rotina. */
export function montarPipelineSetores(setores: SetorRotina[], ocorrencias: OcorrenciaDoSetor[]): PipelineSetor[] {
  const ids = new Set(setores.map((s) => s.id));
  const base = [...setores]
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
    .map((s) => ({ id: s.id, nome: s.nome }));
  base.push({ id: SEM_SETOR, nome: "Sem setor" });

  const cards = base.map(({ id, nome }) => {
    const minhas = ocorrencias
      .filter((o) => (o.rotina.equipe_id && ids.has(o.rotina.equipe_id) ? o.rotina.equipe_id : SEM_SETOR) === id)
      .sort(
        (a, b) =>
          a.dia.localeCompare(b.dia) ||
          ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status] ||
          (ORDEM_PRIORIDADE[a.rotina.prioridade] ?? 1) - (ORDEM_PRIORIDADE[b.rotina.prioridade] ?? 1) ||
          (a.rotina.horario_limite ?? "99").localeCompare(b.rotina.horario_limite ?? "99") ||
          a.rotina.titulo.localeCompare(b.rotina.titulo),
      );
    const conta = (s: StatusOcorrencia) => minhas.filter((o) => o.status === s).length;
    return {
      id,
      nome,
      pendente: conta("pendente"),
      andamento: conta("andamento"),
      concluida: conta("concluida"),
      total: minhas.length,
      responsaveis: [...new Set(minhas.map((o) => o.rotina.assigned_to).filter((p): p is string => !!p))],
      ocorrencias: minhas,
    };
  });

  return cards.filter((c) => c.id !== SEM_SETOR || c.total > 0);
}
