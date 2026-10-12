import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET } from "./comum";

/**
 * URLs assinadas do bucket privado em lote: uma chamada para a grade toda em
 * vez de uma por card. Valem 1h; a lista recarrega bem antes disso na pratica.
 */
export function useUrlsAssinadas(caminhos: string[]) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const chave = [...new Set(caminhos)].sort().join("|");

  useEffect(() => {
    const lista = chave ? chave.split("|") : [];
    if (lista.length === 0) return;
    let vivo = true;
    supabase.storage.from(BUCKET).createSignedUrls(lista, 60 * 60).then(({ data }) => {
      if (!vivo || !data) return;
      setUrls(atual => {
        const proximo = new Map(atual);
        for (const item of data) if (item.path && item.signedUrl) proximo.set(item.path, item.signedUrl);
        return proximo;
      });
    });
    return () => {
      vivo = false;
    };
  }, [chave]);

  return urls;
}
