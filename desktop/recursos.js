/* COORDIX Desktop · onde cada recurso da página é buscado.
 *
 * A página é servida pelo esquema próprio coordix://app/ a partir da pasta do aplicativo, com uma
 * lista fechada de arquivos (nada fora dela é entregue). As URLs de CDN que o index.html usa são
 * atendidas pelas cópias locais em desktop/vendor/, sem rede. Qualquer outra requisição externa é
 * recusada: o aplicativo funciona inteiro sem internet. */
"use strict";
const path = require("path");

const ESQUEMA = "coordix";
const HOST = "app";
const ORIGEM = `${ESQUEMA}://${HOST}`;

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ifc": "application/octet-stream", ".json": "application/json",
};

/* arquivos da aplicação que podem ser servidos (relativos à raiz do aplicativo) */
const PERMITIDOS = [
  /^index\.html$/, /^coordix-geometria\.js$/, /^coordix-analise-worker\.js$/, /^web-ifc\.wasm$/,
  /^exemplos\/[A-Za-z0-9._-]+\.ifc$/, /^marca\/[A-Za-z0-9._-]+\.svg$/,
  /^desktop\/vendor\/[A-Za-z0-9._\/-]+\.(js|mjs|wasm|css|woff2)$/,
];

/* URLs externas usadas pelo index.html → cópia local (mesma versão) */
const CDN = [
  { prefixo: "https://cdn.jsdelivr.net/npm/three@0.147.0/", local: "desktop/vendor/three/" },
  { prefixo: "https://cdn.jsdelivr.net/npm/web-ifc@0.0.78/", local: "desktop/vendor/web-ifc/" },
  { prefixo: "https://fonts.gstatic.com/coordix/", local: "desktop/vendor/fonts/" },
];

/** caminho relativo seguro dentro da raiz, ou null (bloqueia "..", barras invertidas e afins) */
function relativoSeguro(raiz, rel) {
  let r;
  try { r = decodeURIComponent(rel); } catch { return null; }
  r = r.replace(/^\/+/, "");
  if (!r || r.includes("\\") || r.includes("\0")) return null;
  const abs = path.resolve(raiz, r);
  if (abs !== path.join(raiz, r) || !abs.startsWith(raiz + path.sep)) return null;
  const norm = path.relative(raiz, abs).split(path.sep).join("/");
  return PERMITIDOS.some((re) => re.test(norm)) ? norm : null;
}

/** resolve uma URL pedida pela página para um arquivo local permitido (relativo à raiz) ou null */
function resolver(raiz, url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol === ESQUEMA + ":" && u.host === HOST) {
    const p = u.pathname === "/" ? "index.html" : u.pathname;
    return relativoSeguro(raiz, p);
  }
  if (u.protocol === "https:") {
    if (u.host === "fonts.googleapis.com" && u.pathname === "/css2") return "desktop/vendor/fonts/fonts.css";
    const alvo = u.origin + u.pathname;
    for (const c of CDN) if (alvo.startsWith(c.prefixo)) return relativoSeguro(raiz, c.local + alvo.slice(c.prefixo.length));
  }
  return null;
}

const tipoDe = (rel) => MIME[path.extname(rel).toLowerCase()] || "application/octet-stream";

module.exports = { ESQUEMA, HOST, ORIGEM, resolver, tipoDe, relativoSeguro };
