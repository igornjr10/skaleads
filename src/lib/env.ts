// O Vite substitui `import.meta.env.VITE_X` pelo valor literal na hora do build.
// Quando a variavel nao existe no ambiente de build, o bundle sai com
// `undefined` no lugar e nada falha: o build passa, o deploy sobe e o erro so
// aparece no browser do usuario. Foi assim que a producao ficou em branco.
//
// A leitura precisa ser estatica, uma chave por vez: `import.meta.env[chave]`
// nao e substituido no build e daria `undefined` mesmo com a variavel definida.

import { MissingEnvError } from "./env-error";

const values = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_META_APP_ID: import.meta.env.VITE_META_APP_ID,
} as const;

type EnvKey = keyof typeof values;

// Sem estas duas o app nao sobe: o cliente Supabase e criado no import e
// lanca antes do React montar.
const REQUIRED: EnvKey[] = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const missing = REQUIRED.filter((key) => !clean(values[key]));

if (missing.length > 0) {
  throw new MissingEnvError(missing);
}

export const SUPABASE_URL = clean(values.VITE_SUPABASE_URL);
export const SUPABASE_PUBLISHABLE_KEY = clean(values.VITE_SUPABASE_PUBLISHABLE_KEY);
export const META_APP_ID = clean(values.VITE_META_APP_ID);

export { MissingEnvError };
