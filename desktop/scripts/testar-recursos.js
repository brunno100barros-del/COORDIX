/* COORDIX Desktop · testa a resolução de recursos (sem Electron): o que a página pode carregar e o que é recusado. */
"use strict";
const path = require("path");
const { resolver } = require("../recursos");
const RAIZ = path.resolve(__dirname, "..", "..");
const casos = [
  ["coordix://app/", "index.html"],
  ["coordix://app/index.html", "index.html"],
  ["coordix://app/coordix-geometria.js", "coordix-geometria.js"],
  ["coordix://app/web-ifc.wasm", "web-ifc.wasm"],
  ["coordix://app/exemplos/EXEMPLO-EST.ifc", "exemplos/EXEMPLO-EST.ifc"],
  ["coordix://app/marca/coordix-icone.svg", "marca/coordix-icone.svg"],
  ["https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js", "desktop/vendor/three/build/three.min.js"],
  ["https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js", "desktop/vendor/three/examples/js/controls/OrbitControls.js"],
  ["https://cdn.jsdelivr.net/npm/web-ifc@0.0.39/web-ifc-api.js", "desktop/vendor/web-ifc/web-ifc-api.js"],
  ["https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap", "desktop/vendor/fonts/fonts.css"],
  ["https://fonts.gstatic.com/coordix/ibm-plex-mono-latin-400-normal.woff2", "desktop/vendor/fonts/ibm-plex-mono-latin-400-normal.woff2"],
  // recusados
  ["coordix://app/../package.json", null], ["coordix://app/%2e%2e/package.json", null], ["coordix://app/package.json", null],
  ["coordix://app/desktop/main.js", null], ["coordix://app/testes/geometria.test.js", null], ["coordix://app/exemplos/..%2f..%2fpackage.json", null],
  ["coordix://app/desktop/vendor/..\\..\\package.json", null], ["coordix://outro/index.html", null],
  ["https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.min.js", null], ["https://cdn.jsdelivr.net/npm/three@0.147.0/../../evil.js", null],
  ["https://example.com/", null], ["http://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js", null], ["file:///C:/Windows/win.ini", null],
];
let falhas = 0;
for (const [url, esperado] of casos) {
  const r = resolver(RAIZ, url);
  const ok = r === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "✔" : "✘"} ${url} → ${r}${ok ? "" : "  (esperado " + esperado + ")"}`);
}
console.log(`\n${casos.length - falhas} de ${casos.length} casos de resolução de recursos aprovados.`);
process.exit(falhas ? 1 : 0);
