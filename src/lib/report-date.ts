import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function formatReportDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "Data indisponível";
  const date = parseISO(value);
  return isValid(date)
    ? format(date, "dd/MM/yyyy HH:mm", { locale: ptBR })
    : "Data indisponível";
}
