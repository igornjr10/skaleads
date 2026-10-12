/**
 * Telas de primeiro nivel (as do menu) nao ganham "voltar": la o caminho e o
 * proprio menu. Tela interna e a que tem mais de um pedaco no caminho.
 */
export function eTelaInterna(pathname: string): boolean {
  return pathname.split("/").filter(Boolean).length > 1;
}

/**
 * Para onde o "voltar" leva quando nao ha historico no app (link aberto
 * direto, F5 numa aba nova): o nivel de cima que existe como rota.
 */
export function telaDeCima(pathname: string): string {
  const partes = pathname.split("/").filter(Boolean);
  if (partes.length <= 1) return "/dashboard";
  // /alerts/new e /alerts/:id/edit voltam para a lista: /alerts/:id nao e rota.
  if (partes[0] === "alerts") return "/alerts";
  return "/" + partes.slice(0, -1).join("/");
}
