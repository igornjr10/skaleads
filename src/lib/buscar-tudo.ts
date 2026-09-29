/**
 * PostgREST corta cada resposta em 1000 linhas. Para somas e contagens isso
 * da numero errado sem aviso, entao quem precisa do conjunto inteiro pagina.
 * `consulta` recebe o intervalo e devolve a pagina ja filtrada e ordenada.
 */
export async function buscarTudo<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pagina = 1000
): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += pagina) {
    const { data, error } = await consulta(de, de + pagina - 1);
    if (error) throw error;
    linhas.push(...(data ?? []));
    if (!data || data.length < pagina) return linhas;
  }
}
