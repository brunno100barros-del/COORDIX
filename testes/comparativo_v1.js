/* COORDIX · comparativo v1 (BIMORA) × v2 (Fase 01) nos mesmos cenários sintéticos.
 * Executar:  node testes/comparativo_v1.js
 * A v1 é o código original extraído do commit inicial (testes/legado_v1.js). */
"use strict";
const G = require("../coordix-geometria.js");
const V1 = require("./legado_v1.js");
const F = require("./formas.js");

// adaptador: a v1 recebe {geoms:[{p,i}], box:{min,max}}
function el(...geoms) {
  const m = G.prepareMesh(geoms);
  const [x0, y0, z0, x1, y1, z1] = m.box;
  return { v1: { geoms: geoms.map(g => ({ p: g.p64, i: g.i })), box: { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } } }, v2: m };
}
const parede = el(F.caixa(-3, 0, 0, 3, 0.15, 3)), tubo = F.cilindro([0, -1, 1.5], [0, 1, 1.5], 0.05, 32);
const viga = el(F.perfilI(0, 3, 0, 0, 0.3, 0.15, 0.012, 0.008));
const cubo = el(F.caixa(0, 0, 0, 1, 1, 1));
const cen = [
  ["Cubos com 20 mm de sobreposição", cubo, el(F.caixa(0.98, 0, 0, 1.98, 1, 1)), "hard", 0.005, "conflito", 20],
  ["Cubos coincidentes", cubo, el(F.caixa(0, 0, 0, 1, 1, 1)), "hard", 0.005, "conflito", 1000],
  ["Cubo de 200 mm contido", cubo, el(F.caixa(0.4, 0.4, 0.4, 0.6, 0.6, 0.6)), "hard", 0.005, "conflito", 200],
  ["Cubos tangentes", cubo, el(F.caixa(1, 0, 0, 2, 1, 1)), "hard", 0, "sem conflito", 0],
  ["Tubo Ø100 × parede 150", parede, el(tubo), "hard", 0.005, "conflito", 100],
  ["Tubo Ø100 × parede 150, girado 45°", parede, el(F.girarZ(tubo, Math.PI / 4, 0, 0.075)), "hard", 0.005, "conflito", 100],
  ["Tubo Ø200 × parede 150", parede, el(F.cilindro([0, -1, 1.5], [0, 1, 1.5], 0.10, 32)), "hard", 0.005, "conflito", 150],
  ["Tubo diagonal afastado (caixas sobrepostas)", el(F.caixa(0, 0, 0, 0.3, 3, 0.3)), el(F.cilindro([-1.2, 1, -2], [2.8, 1.4, 2.6], 0.05, 32)), "hard", 0.005, "sem conflito", 0],
  ["Tubo na cavidade do perfil I", viga, el(F.cilindro([0.2, 0.05, 0], [2.8, 0.05, 0], 0.02, 32)), "hard", 0, "sem conflito", 0],
  ["Tubo Ø50 × alma de 8 mm do perfil I", viga, el(F.cilindro([1.5, -0.5, 0], [1.5, 0.5, 0], 0.025, 32)), "hard", 0.005, "conflito", 8],
  ["Cubos de 3 mm com 0,5 mm de sobreposição", el(F.caixa(0, 0, 0, 0.003, 0.003, 0.003)), el(F.caixa(0.0025, 0, 0, 0.0055, 0.003, 0.003)), "hard", 0.0002, "conflito", 0.5],
  ["Cubos a 5 mm, folga exigida 3 mm", cubo, el(F.caixa(1.005, 0, 0, 2.005, 1, 1)), "clearance", 0.003, "sem conflito", 5],
  ["Tubos paralelos a 8 mm, folga 10 mm", el(F.cilindro([0, 0, 0], [3, 0, 0], 0.025, 32)), el(F.cilindro([0, 0.058, 0], [3, 0.058, 0], 0.025, 32)), "clearance", 0.010, "conflito", 8],
  // orientação genérica (mesma cena girada: o valor exato não muda)
  ["Cubos com 20 mm de sobreposição — cena girada", el(F.girar(F.caixa(0, 0, 0, 1, 1, 1), 0.5, 0.7, 0.3)), el(F.girar(F.caixa(0.98, 0, 0, 1.98, 1, 1), 0.5, 0.7, 0.3)), "hard", 0.005, "conflito", 20],
  ["Tubo Ø100 × parede 150 — cena girada", el(F.girar(F.caixa(-3, 0, 0, 3, 0.15, 3), 0.5, 0.7, 0.3)), el(F.girar(tubo, 0.5, 0.7, 0.3)), "hard", 0.005, "conflito", 100],
  ["Tubo Ø50 × alma do perfil I — cena girada", el(F.girar(F.perfilI(0, 3, 0, 0, 0.3, 0.15, 0.012, 0.008), 0.5, 0.7, 0.3)), el(F.girar(F.cilindro([1.5, -0.5, 0], [1.5, 0.5, 0], 0.025, 32), 0.5, 0.7, 0.3)), "hard", 0.005, "conflito", 8],
  ["Cubos raspando 3 mm (tol. 5) — cena girada", el(F.girar(F.caixa(0, 0, 0, 1, 1, 1), 0.5, 0.7, 0.3)), el(F.girar(F.caixa(0.997, 0, 0, 1.997, 1, 1), 0.5, 0.7, 0.3)), "hard", 0.005, "sem conflito", 3],
  // malhas finas (limites silenciosos da v1)
  ["Malha fina: tubo Ø100 (256 lados) × parede subdividida", el(F.caixaSubdividida(-0.5, 0, 0, 0.5, 0.15, 3, 40)), el(F.cilindro([0, -1, 1.5], [0, 1, 1.5], 0.05, 256)), "hard", 0.005, "conflito", 100],
  ["Malha fina: peça de 200 mm (2.400 vértices) contida", cubo, el(F.caixaSubdividida(0.4, 0.4, 0.4, 0.6, 0.6, 0.6, 20)), "hard", 0.005, "conflito", 200],
  ["Malha fina: sobreposição de 20 mm entre caixas subdivididas", el(F.caixaSubdividida(0, 0, 0, 1, 1, 1, 30)), el(F.caixaSubdividida(0.98, 0.1, 0.1, 1.98, 0.9, 0.9, 30)), "hard", 0.005, "conflito", 20],
  ["Malha fina: tubos Ø50 (256 lados) a 8 mm, folga 10", el(F.cilindro([0, 0, 0], [3, 0, 0], 0.025, 256)), el(F.cilindro([0, 0.058, 0], [3, 0.058, 0], 0.025, 256)), "clearance", 0.010, "conflito", 8],
];
const conflitoV2 = (st) => st === G.STATE.CONFIRMADO;
const pad = (s, n) => (String(s) + " ".repeat(n)).slice(0, n), padL = (s, n) => (" ".repeat(n) + String(s)).slice(-n);
console.log("\nComparativo v1 × v2 (valores em mm)\n");
console.log(pad("Cenário", 44), pad("Esperado", 14), padL("Exato", 8), " | ", pad("v1: decisão", 14), padL("valor", 9), " | ", pad("v2: estado", 18), padL("valor", 9));
let acertoV1 = 0, acertoV2 = 0, errValV1 = [], errValV2 = [];
for (const [nome, A, B, kind, tol, esp, exato] of cen) {
  // v1: exactTest + regra de tolerância do runAnalysis original
  const r1 = V1.exactTest(A.v1, B.v1, kind, tol);
  let dec1, val1 = null;
  if (!r1) dec1 = "sem conflito";
  else { val1 = r1.value; dec1 = kind === "hard" ? (r1.value > tol * 1000 + 0.5 ? "conflito" : "sem conflito") : "conflito"; }
  const t2 = Date.now(); const r2 = G.evaluatePair(A.v2, B.v2, { kind, tol }); const ms2 = Date.now() - t2;
  const dec2 = conflitoV2(r2.state) ? "conflito" : r2.state === G.STATE.INCONCLUSIVO || r2.state === G.STATE.INCOMPLETO ? "revisar" : "sem conflito";
  const val2 = r2.value == null ? null : r2.value * 1000;
  if (dec1 === esp) acertoV1++; if (dec2 === esp) acertoV2++;
  if (esp === "conflito" && kind === "hard") { if (val1 != null) errValV1.push(Math.abs(val1 - exato)); if (val2 != null) errValV2.push(Math.abs(val2 - exato)); }
  console.log(pad(nome, 44), pad(esp, 14), padL(exato, 8), " | ", pad((dec1 === esp ? "✔ " : "✘ ") + dec1, 14), padL(val1 == null ? "—" : val1.toFixed(2), 9), " | ",
    pad((dec2 === esp ? "✔ " : "✘ ") + r2.state, 18), padL(val2 == null ? "—" : val2.toFixed(2), 9), padL(ms2 + " ms", 9));
}
const max = (a) => a.length ? Math.max(...a).toFixed(2) : "—";
console.log(`\nDecisões corretas: v1 ${acertoV1}/${cen.length} · v2 ${acertoV2}/${cen.length}`);
console.log(`Maior erro da penetração nos conflitos: v1 ${max(errValV1)} mm · v2 ${max(errValV2)} mm`);

// teste de ponto interno: paridade por raio (v1) × número de voltas (v2) em pontos alinhados a vértices/arestas
const c = cubo.v2; let e1 = 0, e2 = 0, n = 0;
for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) for (let k = 0; k <= 20; k++) {
  const x = -0.5 + i * 0.1, y = -0.5 + j * 0.1, z = -0.5 + k * 0.1;
  if ([x, y, z].some(v => Math.abs(v) < 1e-9 || Math.abs(v - 1) < 1e-9)) continue;
  n++;
  const dentro = x > 0 && x < 1 && y > 0 && y < 1 && z > 0 && z < 1;
  if (V1.pointInside(x, y, z, cubo.v1) !== dentro) e1++;
  if ((G.windingNumber(c, x, y, z) >= 0.5) !== dentro) e2++;
}
// pontos cujo raio da v1 passa exatamente por uma aresta: (x, y, z) com y = 1 - 0,00131·(1 - x) etc.
let e1b = 0, e2b = 0, nb = 0;
for (let i = 1; i < 50; i++) {
  const x = 0.02 * i - 0.5, y = 1 - 0.00131 * (1 - x) * 1, z = 0.5; // raio inclinado atinge a aresta y=1 da face x=1? (aprox.)
  const dentro = x > 0 && x < 1 && y > 0 && y < 1;
  nb++;
  if (V1.pointInside(x, y, z, cubo.v1) !== dentro) e1b++;
  if ((G.windingNumber(c, x, y, z) >= 0.5) !== dentro) e2b++;
}
console.log(`Classificação dentro/fora (grade 21³, ${n} pontos): erros v1 ${e1} · v2 ${e2}`);
console.log(`Classificação dentro/fora (raios rasantes à aresta, ${nb} pontos): erros v1 ${e1b} · v2 ${e2b}\n`);
