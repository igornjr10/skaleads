import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const PREFIXO = "tela:";

function ler<T>(chave: string, inicial: T): T {
  try {
    const salvo = sessionStorage.getItem(PREFIXO + chave);
    return salvo === null ? inicial : (JSON.parse(salvo) as T);
  } catch {
    return inicial;
  }
}

/**
 * useState que sobrevive a sair e voltar para a tela na mesma aba: filtros,
 * busca e modo de visao continuam onde a pessoa deixou. Fica no
 * sessionStorage, entao fechar a aba (ou trocar de login) volta ao padrao.
 */
export function useEstadoDaTela<T>(chave: string, inicial: T): [T, Dispatch<SetStateAction<T>>] {
  const [valor, setValor] = useState<T>(() => ler(chave, inicial));

  useEffect(() => {
    try {
      sessionStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
    } catch {
      // Storage cheio ou bloqueado: a tela segue funcionando, so nao lembra.
    }
  }, [chave, valor]);

  return [valor, setValor];
}

/** Ao sair da conta, ninguem herda os filtros de quem estava logado antes. */
export function limparEstadosDasTelas() {
  try {
    for (const chave of Object.keys(sessionStorage)) {
      if (chave.startsWith(PREFIXO)) sessionStorage.removeItem(chave);
    }
  } catch {
    // sem storage, nada a limpar
  }
}
