// Endpoint no oficial de Google Translate (el mismo que usan varias libs
// open-source tipo google-translate-api) — sin API key, pero no soportado
// oficialmente: Google podría bloquearlo o cambiarlo sin aviso.
const TRANSLATE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";

async function translateSingle(text: string, targetLang: string): Promise<string> {
  const url = `${TRANSLATE_ENDPOINT}?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translate request failed: ${res.status}`);

  // Respuesta: [[[translatedChunk, originalChunk, ...], ...], ...] — el texto
  // de entrada puede llegar partido en varias oraciones/chunks que hay que
  // volver a unir.
  const data = await res.json();
  const chunks: unknown = data?.[0];
  if (!Array.isArray(chunks)) return text;
  return chunks.map((chunk) => (Array.isArray(chunk) ? chunk[0] : "")).join("");
}

// El auto-detect de sl=auto opera sobre el string entero de una sola: un
// texto que mezcla inglés y español (p. ej. "English title - descripción en
// español") se detecta como un solo idioma dominante, y si ese idioma
// coincide con el destino, el string entero vuelve sin tocar — incluida la
// parte en inglés. Partiendo primero por límites de oración y separadores
// " - "/" – ", cada trozo pasa por su propio auto-detect: el trozo en
// español queda igual (ya está en destino) y el que realmente está en
// inglés sí se traduce.
const SPLIT_RE = /([.!?]+\s+|\s[-–—]\s)/;

export async function translateText(text: string, targetLang = "es"): Promise<string> {
  if (!text.trim()) return text;

  const parts = text.split(SPLIT_RE);
  if (parts.length === 1) return translateSingle(text, targetLang);

  // split() con grupo capturante alterna [texto, separador, texto, ...] —
  // los separadores (índices impares) se devuelven tal cual, sin traducir.
  const translatedParts = await Promise.all(
    parts.map((part, i) => (i % 2 === 1 || !part.trim() ? part : translateSingle(part, targetLang))),
  );
  return translatedParts.join("");
}

// Traduce solo los nodos de texto de un fragmento de HTML, preservando las
// etiquetas (negrita, listas, etc.) intactas — así una nota con formato no
// pierde su estructura al traducirla.
export async function translateHtml(html: string, targetLang = "es"): Promise<string> {
  const container = document.createElement("div");
  container.innerHTML = html;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent?.trim()) textNodes.push(node as Text);
  }

  const translations = await Promise.all(textNodes.map((node) => translateText(node.textContent ?? "", targetLang)));
  textNodes.forEach((node, i) => {
    node.textContent = translations[i];
  });

  return container.innerHTML;
}
