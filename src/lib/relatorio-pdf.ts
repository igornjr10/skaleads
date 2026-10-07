// PDF A4 a partir do HTML do relatorio: cada secao vira imagem e a pagina so
// quebra entre secoes (o bloco de prints manda um pedaco por print). Secao
// maior que a pagina e fatiada. html2canvas-pro em vez do html2canvas porque
// este ignora object-fit e a foto do criativo saia esticada.

const LARGURA_PX = 760;
const ESCALA = 2;

async function carregarIframe(html: string): Promise<HTMLIFrameElement> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${LARGURA_PX}px;height:1200px;border:0`;
  document.body.appendChild(iframe);
  await new Promise<void>((pronto) => {
    iframe.onload = () => pronto();
    iframe.srcdoc = html;
  });
  const doc = iframe.contentDocument!;
  await Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete ? null : new Promise((fim) => ((img.onload = fim), (img.onerror = fim))),
    ),
  );
  await doc.fonts?.ready;
  return iframe;
}

export async function relatorioEmPdf(html: string): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const iframe = await carregarIframe(html);
  try {
    const doc = iframe.contentDocument!;
    const partes = Array.from(doc.querySelectorAll<HTMLElement>("body > header, main > section, body > footer"));
    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const larguraPg = pdf.internal.pageSize.getWidth();
    const alturaPg = pdf.internal.pageSize.getHeight();
    let y = 0;

    const pintar = (canvas: HTMLCanvasElement, altura: number) => {
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.88), "JPEG", 0, y, larguraPg, altura, undefined, "FAST");
      y += altura;
    };

    for (const el of partes) {
      const canvas = await html2canvas(el, { scale: ESCALA, backgroundColor: "#ffffff", useCORS: true, logging: false });
      const altura = (canvas.height * larguraPg) / canvas.width;

      if (altura <= alturaPg) {
        if (y > 0 && y + altura > alturaPg + 0.5) {
          pdf.addPage();
          y = 0;
        }
        pintar(canvas, altura);
        continue;
      }

      const fatiaPx = Math.floor((alturaPg * canvas.width) / larguraPg);
      for (let topo = 0; topo < canvas.height; topo += fatiaPx) {
        if (y > 0) {
          pdf.addPage();
          y = 0;
        }
        const fatia = document.createElement("canvas");
        fatia.width = canvas.width;
        fatia.height = Math.min(fatiaPx, canvas.height - topo);
        fatia.getContext("2d")!.drawImage(canvas, 0, topo, canvas.width, fatia.height, 0, 0, canvas.width, fatia.height);
        pintar(fatia, (fatia.height * larguraPg) / canvas.width);
      }
    }
    return pdf.output("blob");
  } finally {
    iframe.remove();
  }
}
