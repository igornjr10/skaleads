import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// PostgrestError nao e instanceof Error, entao `error instanceof Error` engole
// a mensagem real do Postgres e sobra so o fallback generico
export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const { message, details, hint, code } = error as Record<string, unknown>;
    const parts = [message, details, hint].filter((part): part is string => typeof part === "string" && part.length > 0);
    if (parts.length > 0) {
      return typeof code === "string" && code ? `${parts.join(" · ")} (${code})` : parts.join(" · ");
    }
  }
  return fallback;
}
