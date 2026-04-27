export const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export const formatNumber = (v: number) =>
  new Intl.NumberFormat("pt-BR").format(v);

export const formatPercent = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v / 100);
