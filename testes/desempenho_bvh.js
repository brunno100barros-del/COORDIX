/* COORDIX · Fase 02 · Marco 1 — medição de desempenho da BVH
 * Executar:  node testes/desempenho_bvh.js [--json saida.json]
 * Compara a varredura linear da Fase 01 (testes/legado_fase01.js) com a BVH (SAH e mediana)
 * nas mesmas geometrias. Cada tempo é a mediana de 5 repetições. Nada é estimado: todos os
 * números impressos vêm desta execução, na máquina em que ela roda. */
"use strict";
const os = require("os");
const N = require("../coordix-geometria.js");
const LAZY_PADRAO = N.GEO.BVH.LAZY_SCANS;
const L = require("./legado_fase01.js");
const F = require("./formas.js");

const REP = 5;
const ms = (f) => { const t = process.hrtime.bigint(); const r = f(); return [Number(process.hrtime.bigint() - t) / 1e6, r]; };
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
function medir(f) { const t = []; let r; for (let k = 0; k < REP; k++) { const [x, y] = ms(f); t.push(x); r = y; } return [mediana(t), r]; }
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const f1 = (x) => x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : x.toFixed(0);

const saida = { ambiente: { node: process.version, cpu: os.cpus()[0].model, nucleos: os.cpus().length, plataforma: `${os.platform()} ${os.arch()}`, data: new Date().toISOString() }, construcao: [], consultas: [], pares: [] };
console.log(`Node ${process.version} · ${saida.ambiente.cpu} · ${saida.ambiente.plataforma}\n`);

/* ---------- 1. Construção ---------- */
const malhas = [
  ["cilindro 256 lados", [F.cilindro([0, 0.5, 0.5], [2, 0.5, 0.5], 0.1, 256)]],
  ["caixa subdividida 20", [F.caixaSubdividida(0, 0, 0, 1, 1, 1, 20)]],
  ["caixa subdividida 60", [F.caixaSubdividida(0, 0, 0, 1, 1, 1, 60)]],
  ["caixa subdividida 100", [F.caixaSubdividida(0, 0, 0, 1, 1, 1, 100)]],
];
console.log("1. Construção da BVH (uma vez por malha)");
console.log("| malha | triângulos | método | tempo (ms) | nós | memória (KiB) | memória/triângulo (B) |\n|---|---:|---|---:|---:|---:|---:|");
for (const [nome, g] of malhas) for (const METHOD of ["sah", "mediana"]) {
  const m = N.prepareMesh(g);
  const [t, b] = medir(() => N.buildBVH(m, { METHOD }));
  saida.construcao.push({ nome, n: m.n, METHOD, ms: t, nos: b.nodes, bytes: b.bytes });
  console.log(`| ${nome} | ${m.n} | ${METHOD} | ${f1(t)} | ${b.nodes} | ${(b.bytes / 1024).toFixed(1)} | ${(b.bytes / m.n).toFixed(1)} |`);
}

/* ---------- 2. Consultas isoladas ---------- */
console.log("\n2. Consultas isoladas (tempo total de um lote; triângulos examinados por consulta)");
console.log("| malha | consulta | lote | linear (ms) | BVH SAH (ms) | BVH mediana (ms) | ganho SAH | tri. linear | tri. SAH | tri. mediana |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
function consultas(nome, g, inconsistente) {
  const ml = L.prepareMesh(g), r = rng(99);
  const mesh = {}; for (const M of ["sah", "mediana"]) { mesh[M] = N.prepareMesh(g); mesh[M]._bvh = N.buildBVH(mesh[M], { METHOD: M }); }
  const bx = ml.box, sx = bx[3] - bx[0];
  const pts = Array.from({ length: 400 }, () => [bx[0] - 0.2 * sx + r() * 1.4 * sx, bx[1] - 0.2 * sx + r() * 1.4 * sx, bx[2] - 0.2 * sx + r() * 1.4 * sx]);
  const caixas = pts.map(([x, y, z]) => { const h = 0.01 * sx; return [x - h, y - h, z - h, x + h, y + h, z + h]; });
  const qs = [
    ["trianglesInBox", (G, m) => { let s = 0; for (const B of caixas) s += G.trianglesInBox(m, B).length; return s; }, caixas.length],
    ["unsignedDistance", (G, m) => { let s = 0; for (const p of pts) s += G.unsignedDistance(m, ...p); return s; }, pts.length],
    [inconsistente ? "parityInside (malha inválida)" : "windingNumber (sólido válido)", (G, m) => { let s = 0; for (const p of pts.slice(0, 100)) s += G.windingNumber(m, ...p) >= 0.5 ? 1 : 0; return s; }, 100],
  ];
  for (const [q, f, lote] of qs) {
    N.resetPerf(); const [tl, rl] = medir(() => f(L, ml));
    const linTri = { trianglesInBox: ml.n, unsignedDistance: null }[q];
    const res = {};
    for (const M of ["sah", "mediana"]) { N.resetPerf(); const [t, rv] = medir(() => f(N, mesh[M])); res[M] = { t, tri: (N.PERF.triTests + N.PERF.linearTriTests) / REP / lote, igual: rv === rl }; }
    const linEx = q.startsWith("trianglesInBox") || q.startsWith("parity") || q.startsWith("winding") ? (q.startsWith("parity") ? 3 * ml.n : ml.n) : null;
    saida.consultas.push({ malha: nome, n: ml.n, consulta: q, lote, linear_ms: tl, sah_ms: res.sah.t, mediana_ms: res.mediana.t, tri_linear: linEx, tri_sah: res.sah.tri, tri_mediana: res.mediana.tri, resultados_iguais: res.sah.igual && res.mediana.igual });
    console.log(`| ${nome} (${ml.n}) | ${q} | ${lote} | ${f1(tl)} | ${f1(res.sah.t)} | ${f1(res.mediana.t)} | ${(tl / res.sah.t).toFixed(1)}× | ${linEx == null ? "≤ " + ml.n + " ¹" : linEx} | ${res.sah.tri.toFixed(0)} | ${res.mediana.tri.toFixed(0)} |${res.sah.igual && res.mediana.igual ? "" : " ✘ RESULTADO DIFERENTE"}`);
    void linTri;
  }
}
consultas("cilindro 256", [F.girar(F.cilindro([0, 0.4, 0.6], [2, 0.6, 0.4], 0.1, 256), 0.3, 0.2, 0.1)], false);
consultas("caixa sub. 60", [F.caixaSubdividida(0, 0, 0, 1, 1, 1, 60)], false);
consultas("caixa sub. 60 inconsistente", [F.caixaSubdividida(0, 0, 0, 1, 1, 1, 60, { inconsistente: true })], true);
console.log("¹ a varredura linear já poda por caixa antes de calcular a distância; percorre todas as caixas.");

/* ---------- 3. Pares completos (evaluatePair) ---------- */
console.log("\n3. Avaliação completa de pares (evaluatePair). Preparação = prepareMesh das duas malhas (igual nos dois núcleos);");
console.log("   1ª avaliação inclui a construção das BVHs; 2ª avaliação reutiliza as BVHs já construídas.");
console.log("   Configurações: SAH e mediana com construção imediata (LAZY_SCANS = 0) e o PADRÃO (mediana, LAZY_SCANS = " + LAZY_PADRAO + ").");
console.log("| par | triângulos A × B | regra | preparação (ms) | linear (ms) | SAH 1ª / 2ª (ms) | mediana 1ª / 2ª (ms) | padrão 1ª / 2ª (ms) | ganho padrão 1ª | estado | idêntico |\n|---|---|---|---:|---:|---:|---:|---:|---:|---|---|");
const pares = [
  ["tubo 64 lados atravessando parede fina", () => [F.caixaSubdividida(0, 0, 0, 3, 0.15, 3, 30)], () => [F.cilindro([1.5, -0.5, 1.5], [1.5, 0.7, 1.5], 0.05, 64)], { kind: "hard", tol: 0.01 }],
  ["tubo 256 lados a 30 mm da laje (folga 50 mm)", () => [F.caixaSubdividida(0, 0, 0, 4, 4, 0.2, 40)], () => [F.cilindro([-0.5, 2, 0.33], [4.5, 2, 0.33], 0.1, 256)], { kind: "clearance", tol: 0.05 }],
  ["tubo 256 lados passando longe da laje", () => [F.caixaSubdividida(0, 0, 0, 4, 4, 0.2, 40)], () => [F.cilindro([-0.5, 2, 0.6], [4.5, 2, 0.6], 0.1, 256)], { kind: "hard", tol: 0 }],
  ["viga I × pilar subdividido (cruzamento)", () => [F.caixaSubdividida(0.9, 0.4, 0, 1.2, 0.7, 3, 25)], () => [F.perfilI(0, 3, 0.55, 2.8, 0.3, 0.15, 0.02, 0.012)], { kind: "hard", tol: 0.01 }],
  ["tubo 128 lados em parede de 43 200 triângulos (UTM)", () => [F.mover(F.caixaSubdividida(0, 0, 0, 3, 3, 0.2, 60), 7.4e6, 3e5, 850)], () => [F.mover(F.cilindro([1.5, 1.5, -0.5], [1.5, 1.5, 0.7], 0.05, 128), 7.4e6, 3e5, 850)], { kind: "hard", tol: 0.01 }],
];
for (const [nome, ga, gb, opt] of pares) {
  const A = ga(), B = gb();
  const prep = [], lin = []; let rl, nA, nB;
  for (let k = 0; k < REP; k++) {
    const [tp, M] = ms(() => [L.prepareMesh(A), L.prepareMesh(B)]); prep.push(tp); nA = M[0].n; nB = M[1].n;
    const [t, r] = ms(() => L.evaluatePair(M[0], M[1], opt)); lin.push(t); rl = r;
  }
  const out = {};
  const cfgs = { sah: ["sah", 0], mediana: ["mediana", 0], padrao: ["mediana", LAZY_PADRAO] };
  for (const M in cfgs) {
    N.GEO.BVH.METHOD = cfgs[M][0]; N.GEO.BVH.LAZY_SCANS = cfgs[M][1]; const c1 = [], c2 = []; let r1, r2;
    for (let k = 0; k < REP; k++) {
      const MA = N.prepareMesh(A), MB = N.prepareMesh(B);
      let [t, r] = ms(() => N.evaluatePair(MA, MB, opt)); c1.push(t); r1 = r;
      [t, r] = ms(() => N.evaluatePair(MA, MB, opt)); c2.push(t); r2 = r;
    }
    out[M] = { t1: mediana(c1), t2: mediana(c2), r1, r2 };
  }
  N.GEO.BVH.METHOD = "mediana"; N.GEO.BVH.LAZY_SCANS = LAZY_PADRAO;
  const limpa = (r) => { const c = { ...r, stats: { ...r.stats } }; delete c.stats.windingAtBest; return JSON.stringify(c); };
  const igual = ["sah", "mediana", "padrao"].every(M => limpa(out[M].r1) === limpa(rl) && limpa(out[M].r2) === limpa(rl));
  const tl = mediana(lin);
  saida.pares.push({ nome, nA, nB, regra: `${opt.kind} ${opt.tol * 1000} mm`, preparacao_ms: mediana(prep), linear_ms: tl, sah_1a_ms: out.sah.t1, sah_2a_ms: out.sah.t2, mediana_1a_ms: out.mediana.t1, mediana_2a_ms: out.mediana.t2, padrao_1a_ms: out.padrao.t1, padrao_2a_ms: out.padrao.t2, estado: rl.state, identico: igual });
  console.log(`| ${nome} | ${nA} × ${nB} | ${opt.kind} ${opt.tol * 1000} mm | ${f1(mediana(prep))} | ${f1(tl)} | ${f1(out.sah.t1)} / ${f1(out.sah.t2)} | ${f1(out.mediana.t1)} / ${f1(out.mediana.t2)} | ${f1(out.padrao.t1)} / ${f1(out.padrao.t2)} | ${(tl / out.padrao.t1).toFixed(1)}× | ${rl.state} | ${igual ? "sim" : "NÃO"} |`);
}

const i = process.argv.indexOf("--json");
if (i > 0) require("fs").writeFileSync(process.argv[i + 1], JSON.stringify(saida, null, 1));
