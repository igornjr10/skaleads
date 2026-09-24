import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "client-logos";
const GRAPH_VERSION = "v21.0";

interface ClientRow {
  id: string;
  name: string;
  meta_page_id: string | null;
  meta_access_token: string | null;
}

interface PictureInfo {
  url: string;
  isSilhouette: boolean;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function dbFetch(supabaseUrl: string, svcKey: string, path: string, init?: RequestInit) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

// `redirect=false` devolve JSON com a URL e o is_silhouette. Sem isso nao da
// pra distinguir a foto real do avatar cinza padrao do Facebook, e acabariamos
// gravando o silhueta como se fosse o logo do cliente.
async function fetchPictureInfo(pageId: string, token: string | null): Promise<PictureInfo | null> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/picture`);
  url.searchParams.set("type", "square");
  url.searchParams.set("width", "256");
  url.searchParams.set("height", "256");
  url.searchParams.set("redirect", "false");
  if (token) url.searchParams.set("access_token", token);

  const response = await fetch(url.toString());
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Graph respondeu ${response.status}`);
  }

  const data = body?.data;
  if (!data?.url) return null;
  return { url: data.url as string, isSilhouette: data.is_silhouette === true };
}

async function uploadToStorage(
  supabaseUrl: string,
  svcKey: string,
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
      "cache-control": "3600",
    },
    body: bytes,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Falha ao subir para o storage: ${detail}`);
  }
}

async function syncOne(
  supabaseUrl: string,
  svcKey: string,
  client: ClientRow,
): Promise<{ id: string; name: string; logo_url: string }> {
  if (!client.meta_page_id) throw new Error("Cliente sem Pagina do Facebook vinculada");

  const picture = await fetchPictureInfo(client.meta_page_id, client.meta_access_token);
  if (!picture) throw new Error("A Pagina nao devolveu foto");
  if (picture.isSilhouette) throw new Error("A Pagina esta com a foto padrao do Facebook");

  const imageResponse = await fetch(picture.url);
  if (!imageResponse.ok) throw new Error(`Nao consegui baixar a imagem (${imageResponse.status})`);

  const contentType = (imageResponse.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
  const extension = EXTENSIONS[contentType];
  if (!extension) throw new Error(`Formato nao suportado: ${contentType}`);

  const bytes = await imageResponse.arrayBuffer();
  const path = `${client.id}.${extension}`;
  await uploadToStorage(supabaseUrl, svcKey, path, bytes, contentType);

  // O caminho e estavel (mesmo arquivo a cada atualizacao), entao sem o
  // parametro de versao o browser e o CDN continuariam servindo a foto antiga.
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}?v=${Date.now()}`;

  const update = await dbFetch(supabaseUrl, svcKey, `clients?id=eq.${client.id}`, {
    method: "PATCH",
    body: JSON.stringify({ logo_url: publicUrl }),
  });
  if (!update.ok) throw new Error(`Falha ao salvar logo_url: ${await update.text()}`);

  return { id: client.id, name: client.name, logo_url: publicUrl };
}

// Baixa a foto da Pagina do Facebook uma vez e guarda no Storage. O link que a
// Meta devolve expira em poucos dias; o do Storage nao expira nunca.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
    if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY nao configurados");

    const { clientId, all } = await req.json().catch(() => ({ clientId: undefined, all: false }));
    if (!clientId && !all) throw new Error("Informe clientId ou all: true");

    const select = "id,name,meta_page_id,meta_access_token";
    const query = clientId
      ? `clients?id=eq.${clientId}&select=${select}`
      : `clients?meta_page_id=not.is.null&status=neq.archived&select=${select}&order=name`;

    const listResponse = await dbFetch(supabaseUrl, svcKey, query);
    if (!listResponse.ok) throw new Error(`Falha ao ler clientes: ${await listResponse.text()}`);
    const clients = (await listResponse.json()) as ClientRow[];

    if (clients.length === 0) throw new Error("Nenhum cliente com Pagina do Facebook vinculada");

    const updated: Array<{ id: string; name: string; logo_url: string }> = [];
    const failed: Array<{ id: string; name: string; error: string }> = [];

    for (const client of clients) {
      try {
        updated.push(await syncOne(supabaseUrl, svcKey, client));
      } catch (err) {
        failed.push({ id: client.id, name: client.name, error: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, updated, failed, total: clients.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-client-logo error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
