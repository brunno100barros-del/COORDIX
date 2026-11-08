/* COORDIX Desktop · prepara as cópias locais das bibliotecas que a versão web carrega por CDN.
 *
 * A versão web (index.html) carrega three.js 0.147, web-ifc 0.0.39 e as fontes IBM Plex da internet.
 * Para o aplicativo abrir sem conexão, as mesmas versões são copiadas de node_modules para
 * desktop/vendor/ e servidas no lugar das URLs originais (ver desktop/recursos.js). O index.html
 * não é alterado.
 *
 * Executado por `npm run preparar`, `npm start` e pelo gancho generateAssets do Electron Forge.
 * Falha (código 1) se faltar arquivo ou se a versão instalada for diferente da usada na web. */
"use strict";
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..", "..");
const NM = path.join(RAIZ, "node_modules");
const DEST = path.join(RAIZ, "desktop", "vendor");

const VERSOES = { three: "0.147.0", "web-ifc": "0.0.78" }; // as mesmas URLs do index.html
const erros = [];

function versaoDe(pacote) {
  try { return JSON.parse(fs.readFileSync(path.join(NM, pacote, "package.json"), "utf8")).version; }
  catch { return null; }
}
function copiar(origem, destino) {
  if (!fs.existsSync(origem)) { erros.push("ausente: " + path.relative(RAIZ, origem)); return; }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
}

fs.rmSync(DEST, { recursive: true, force: true });

for (const [p, v] of Object.entries(VERSOES)) {
  const inst = versaoDe(p);
  if (inst !== v) erros.push(`${p}: instalada ${inst}, esperada ${v} (a mesma da versão web)`);
}

// three.js 0.147: build UMD e OrbitControls (examples/js), exatamente os caminhos usados no index.html
copiar(path.join(NM, "three/build/three.min.js"), path.join(DEST, "three/build/three.min.js"));
copiar(path.join(NM, "three/examples/js/controls/OrbitControls.js"), path.join(DEST, "three/examples/js/controls/OrbitControls.js"));

// web-ifc 0.0.78: API ESM e .wasm da mesma versão (o app busca os dois na URL do CDN, servida por esta cópia)
const wi = path.join(NM, "web-ifc");
if (fs.existsSync(wi)) {
  for (const f of fs.readdirSync(wi)) if (/\.(m?js|wasm)$/.test(f)) copiar(path.join(wi, f), path.join(DEST, "web-ifc", f));
}
for (const f of ["web-ifc-api.js", "web-ifc.wasm"]) if (!fs.existsSync(path.join(DEST, "web-ifc", f))) erros.push("ausente: web-ifc/" + f);

// fontes IBM Plex (mesmas famílias e pesos do link do Google Fonts no index.html)
const FONTES = [
  ["IBM Plex Mono", "ibm-plex-mono", [400, 500]],
  ["IBM Plex Sans Condensed", "ibm-plex-sans-condensed", [500, 600, 700]],
  ["IBM Plex Sans", "ibm-plex-sans", [400, 500, 600]],
];
// faixas Unicode dos subconjuntos (as mesmas que o Google Fonts usa)
const FAIXA = {
  "latin-ext": "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
  latin: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
};
let css = "/* COORDIX Desktop · fontes IBM Plex locais (gerado por desktop/scripts/preparar-vendor.js) */\n";
for (const [familia, id, pesos] of FONTES) {
  const dir = path.join(NM, "@fontsource", id, "files");
  for (const w of pesos) for (const sub of ["latin-ext", "latin"]) {
    const nome = `${id}-${sub}-${w}-normal.woff2`;
    copiar(path.join(dir, nome), path.join(DEST, "fonts", nome));
    css += `@font-face{font-family:'${familia}';font-style:normal;font-weight:${w};font-display:swap;src:url(https://fonts.gstatic.com/coordix/${nome}) format('woff2');unicode-range:${FAIXA[sub]}}\n`;
  }
}
fs.mkdirSync(path.join(DEST, "fonts"), { recursive: true });
fs.writeFileSync(path.join(DEST, "fonts", "fonts.css"), css);

if (erros.length) {
  console.error("COORDIX Desktop: falha ao preparar as bibliotecas locais:\n  " + erros.join("\n  "));
  process.exit(1);
}
console.log(`COORDIX Desktop: bibliotecas locais prontas em ${path.relative(RAIZ, DEST)} (three ${VERSOES.three}, web-ifc ${VERSOES["web-ifc"]}, IBM Plex).`);
