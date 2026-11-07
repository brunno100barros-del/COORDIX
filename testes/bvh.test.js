/* COORDIX · Fase 02 · Marco 1 — testes da BVH por elemento
 * Executar:  node testes/bvh.test.js
 * 1. Estrutura da árvore (permutação, caixas, folhas, profundidade, construção única).
 * 2. Equivalência consulta a consulta com o núcleo linear da Fase 01 (testes/legado_fase01.js):
 *    trianglesInBox, unsignedDistance, windingNumber, parityInside, contactSearch, minDistance.
 * 3. Equivalência de evaluatePair (estado, valor, limites, volume, qualidade, sinalizações).
 * Tudo roda com os dois métodos de corte (SAH e mediana) e com a BVH forçada (MIN_TRIS = 1).
 * Sai com código 1 se algum teste falhar. */
"use strict";
const N = require("../coordix-geometria.js");
const L = require("./legado_fase01.js");
const F = require("./formas.js");

let falhas = 0, total = 0;
const linhas = [];
function ok(id, nome, cond, detalhe = "") {
  total++; if (!cond) falhas++;
  linhas.push(`${cond ? "✔" : "✘"} ${id.padEnd(6)} ${nome}${cond ? "" : "  → " + detalhe}`);
}
// gerador pseudoaleatório determinístico (mulberry32)
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const UTM = [7400000.0, 300000.0, 850.0]; // deslocamento típico de coordenadas UTM (m)
const utm = (g) => F.mover(g, UTM[0], UTM[1], UTM[2]);

/* Malhas de teste: pequenas, médias, dezenas de milhares de triângulos, abertas, não manifold,
 * degeneradas, coplanares e em coordenadas UTM. */
function catalogo() {
  return {
    cubo: [F.caixa(0, 0, 0, 1, 1, 1)],
    cilindro8: [F.cilindro([-0.5, 0.5, 0.5], [1.5, 0.5, 0.5], 0.1, 8)],
    cilindro256: [F.girar(F.cilindro([-0.5, 0.4, 0.6], [1.5, 0.6, 0.4], 0.12, 256), 0.3, 0.2, 0.1, [0.5, 0.5, 0.5])],
    perfilI: [F.perfilI(-0.2, 1.2, 0.5, 0.5, 0.3, 0.15, 0.02, 0.012)],
    sub20: [F.caixaSubdividida(0, 0, 0, 1, 1, 1, 20)],                       // 4 800 triângulos
    sub60: [F.caixaSubdividida(0.2, 0.2, 0.2, 1.2, 1.2, 1.2, 60)],           // 43 200 triângulos
    aberta: [F.removerFace(F.caixaSubdividida(0, 0, 0, 1, 1, 1, 10), 2, 1)], // sem a face superior
    inconsistente: [F.caixaSubdividida(0, 0, 0, 1, 1, 1, 10, { inconsistente: true })],
    naoManifold: [F.caixaSubdividida(0, 0, 0, 1, 1, 1, 6), F.caixaSubdividida(1, 0, 0, 2, 1, 1, 6)], // aresta/face compartilhada
    degenerados: [F.comDegenerados(F.caixaSubdividida(0, 0, 0, 1, 1, 1, 5))],
    soDegenerada: [F.degenerada()],
    placa: [F.placaPlana(0.5, 0, 0, 1, 1)],
    coplanar: [F.caixaSubdividida(1, 0, 0, 2, 1, 1, 8)],                     // face x=1 coplanar à do cubo
    proxima: [F.caixaSubdividida(1 + 1e-6, 0, 0, 2, 1, 1, 8)],               // a 1 µm
    utmSub: [utm(F.caixaSubdividida(0, 0, 0, 1, 1, 1, 15))],
    utmCil: [utm(F.cilindro([-0.5, 0.5, 0.5], [1.5, 0.5, 0.5], 0.1, 64))],
  };
}
const preparar = (G, geoms) => G.prepareMesh(geoms);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const semTested = (o) => { const c = Object.assign({}, o); delete c.tested; return c; };

function pontosDe(box, r, k, R = 0.3) {
  const P = [], sx = box[3] - box[0], sy = box[4] - box[1], sz = box[5] - box[2];
  for (let i = 0; i < k; i++) P.push([box[0] - R * sx + r() * (1 + 2 * R) * sx, box[1] - R * sy + r() * (1 + 2 * R) * sy, box[2] - R * sz + r() * (1 + 2 * R) * sz]);
  // pontos sobre a superfície e rente a ela (vértices e centroides de triângulos)
  return P;
}

function rodada(metodo) {
  N.GEO.BVH.METHOD = metodo; N.GEO.BVH.MIN_TRIS = 1; N.GEO.BVH.LAZY_SCANS = 0;
  const tag = metodo === "sah" ? "S" : "M";
  const cat = catalogo(), r = rng(metodo === "sah" ? 12345 : 54321);
  const MN = {}, ML = {};
  for (const k in cat) { MN[k] = preparar(N, cat[k]); ML[k] = preparar(L, cat[k]); }

  /* ---------- 1. Estrutura ---------- */
  for (const k of ["cubo", "cilindro256", "sub60", "degenerados", "naoManifold"]) {
    const m = MN[k]; N.resetPerf();
    const b = N.bvhOf(m), b2 = N.bvhOf(m);
    const perm = Array.from(b.perm).sort((x, y) => x - y);
    let permOk = perm.length === m.n && perm.every((v, i) => v === i);
    let caixasOk = true, folhasOk = true, prof = 0;
    const visita = (nd, d) => {
      prof = Math.max(prof, d); const o = nd * 6;
      if (b.left[nd] < 0) {
        if (b.count[nd] > N.GEO.BVH.LEAF_SIZE && d < N.GEO.BVH.MAX_DEPTH) {
          // folha grande só é aceitável se todos os centroides coincidirem
          const c0 = b.perm[b.start[nd]], cs = [0, 1, 2].map(a => (m.tb[c0 * 6 + a] + m.tb[c0 * 6 + 3 + a]) / 2);
          for (let q = b.start[nd]; q < b.start[nd] + b.count[nd]; q++) { const t = b.perm[q]; for (let a = 0; a < 3; a++) if ((m.tb[t * 6 + a] + m.tb[t * 6 + 3 + a]) / 2 !== cs[a]) folhasOk = false; }
        }
        for (let q = b.start[nd]; q < b.start[nd] + b.count[nd]; q++) { const t = b.perm[q] * 6; for (let a = 0; a < 3; a++) if (m.tb[t + a] < b.boxes[o + a] || m.tb[t + 3 + a] > b.boxes[o + 3 + a]) caixasOk = false; }
      } else for (const c of [b.left[nd], b.right[nd]]) { for (let a = 0; a < 3; a++) if (b.boxes[c * 6 + a] < b.boxes[o + a] || b.boxes[c * 6 + 3 + a] > b.boxes[o + 3 + a]) caixasOk = false; visita(c, d + 1); }
    };
    visita(0, 0);
    ok(`${tag}E-${k}`.slice(0, 6), `[${metodo}] estrutura da BVH: ${k} (${m.n} tri, ${b.nodes} nós, prof. ${prof}, ${(b.bytes / 1024).toFixed(1)} KiB)`,
      permOk && caixasOk && folhasOk && prof <= N.GEO.BVH.MAX_DEPTH && b === b2 && N.PERF.bvhBuilds === 1 && !("tris" in b),
      `perm ${permOk}, caixas ${caixasOk}, folhas ${folhasOk}, prof ${prof}, reconstruiu ${N.PERF.bvhBuilds}`);
  }

  /* ---------- 2. Consultas ---------- */
  for (const k in cat) {
    const n = MN[k], l = ML[k];
    if (!n.n) { ok(`${tag}Q-${k}`.slice(0, 6), `[${metodo}] ${k}: malha vazia tratada igual`, n.n === l.n && N.bvhOf(n) === null); continue; }
    let erros = [];
    // trianglesInBox: caixas aleatórias (0, 1, poucos e milhares de triângulos) e a caixa inteira
    const boxes = [n.box.slice(), [n.box[0] - 10, n.box[1] - 10, n.box[2] - 10, n.box[0] - 9, n.box[1] - 9, n.box[2] - 9]];
    for (let q = 0; q < 60; q++) {
      const [x, y, z] = pontosDe(n.box, r, 1)[0], h = Math.pow(10, -6 + r() * 6.5) * (n.box[3] - n.box[0] + 1);
      boxes.push([x - h, y - h, z - h, x + h, y + h, z + h]);
    }
    const t0 = n.tb; boxes.push([t0[0], t0[1], t0[2], t0[0], t0[1], t0[2]]); // caixa degenerada num vértice
    let tamanhos = new Set();
    for (const B of boxes) { const a = N.trianglesInBox(n, B), b = L.trianglesInBox(l, B); tamanhos.add(a.length === 0 ? "0" : a.length === 1 ? "1" : a.length >= 1000 ? "1000+" : "n"); if (!igual(a, b)) erros.push("trianglesInBox"); }
    // pontos: aleatórios, vértices, centroides e pontos a 1e-7 m da superfície
    const pts = pontosDe(n.box, r, 80);
    for (let q = 0; q < 20; q++) {
      const t = Math.floor(r() * n.n) * 9, T = n.tris;
      pts.push([T[t], T[t + 1], T[t + 2]]);
      const c = [(T[t] + T[t + 3] + T[t + 6]) / 3, (T[t + 1] + T[t + 4] + T[t + 7]) / 3, (T[t + 2] + T[t + 5] + T[t + 8]) / 3];
      pts.push(c, [c[0] + 1e-7, c[1] - 1e-7, c[2] + 1e-7]);
    }
    let maxW = 0;
    for (const [x, y, z] of pts) {
      if (N.unsignedDistance(n, x, y, z) !== L.unsignedDistance(l, x, y, z)) erros.push("unsignedDistance");
      const wn = N.windingNumber(n, x, y, z), wl = L.windingNumber(l, x, y, z);
      if (n.topology === "solido_valido") {
        // número de voltas exato de sólido válido é 0 ou 1; a soma da Fase 01 difere só por arredondamento
        maxW = Math.max(maxW, Math.abs(wn - wl));
        if ((wn >= 0.5) !== (wl >= 0.5) || Math.abs(wn - wl) > 1e-6) erros.push(`windingNumber ${wn} vs ${wl}`);
      } else if (wn !== wl) erros.push(`windingNumber ${wn} vs ${wl}`);
      if (N.parityInside(n, x, y, z) !== L.windingNumber({ ...l, insideMode: "paridade" }, x, y, z)) erros.push("parityInside");
      const sn = N.signedDistance(n, x, y, z), sl = L.signedDistance(l, x, y, z);
      if (sn !== sl && !(Math.abs(sn) === Math.abs(sl) && Math.abs(wl - 0.5) < 1e-6)) erros.push(`signedDistance ${sn} vs ${sl}`);
    }
    ok(`${tag}Q-${k}`.slice(0, 6), `[${metodo}] consultas de ponto e caixa: ${k} (${n.n} tri; resultados ${[...tamanhos].join("/")}; |Δw| máx ${maxW.toExponential(1)})`, erros.length === 0, [...new Set(erros)].slice(0, 4).join("; "));
  }

  /* ---------- 3. Pares: contactSearch, minDistance e evaluatePair ---------- */
  const pares = [
    ["cubo", "cilindro256"], ["sub20", "cilindro256"], ["sub60", "cilindro256"], ["sub60", "sub20"], ["cubo", "coplanar"],
    ["sub20", "coplanar"], ["sub20", "proxima"], ["aberta", "cilindro256"], ["inconsistente", "cilindro8"], ["naoManifold", "cilindro256"],
    ["degenerados", "perfilI"], ["placa", "cilindro256"], ["placa", "sub20"], ["utmSub", "utmCil"], ["soDegenerada", "cubo"], ["perfilI", "cilindro256"],
  ];
  for (const [ka, kb] of pares) {
    const An = MN[ka], Bn = MN[kb], Al = ML[ka], Bl = ML[kb];
    let erros = [];
    const ov = N.overlapBox(An.box, Bn.box, 0.01);
    if (ov) for (const lim of [1, 7, 100, 5000, 2e6]) {
      const a = N.contactSearch(An, Bn, ov, lim), b = L.contactSearch(Al, Bl, ov, lim);
      if (!igual(semTested(a), b)) erros.push(`contactSearch(lim ${lim}) ${JSON.stringify(semTested(a))} vs ${JSON.stringify(b)}`);
    }
    if (An.n && Bn.n) for (const reach of [0, 1e-6, 0.005, 0.05, 1]) for (const lim of [3, 500, 2e6]) for (const stop of [0, 0.001]) {
      const a = N.minDistance(An, Bn, reach, lim, stop), b = L.minDistance(Al, Bl, reach, lim, stop);
      if (!igual(semTested(a), b)) erros.push(`minDistance(${reach},${lim},${stop}) ${JSON.stringify(semTested(a))} vs ${JSON.stringify(b)}`);
    }
    for (const opt of [{ kind: "hard", tol: 0 }, { kind: "hard", tol: 0.01 }, { kind: "clearance", tol: 0.05 }]) {
      const a = N.evaluatePair(An, Bn, opt), b = L.evaluatePair(Al, Bl, opt);
      const ca = { ...a, stats: { ...a.stats } }, cb = { ...b, stats: { ...b.stats } };
      for (const c of [ca, cb]) { delete c.stats.windingAtBest; for (const s in c.stats) if (/ms|tested/i.test(s)) delete c.stats[s]; }
      const wa = a.stats && a.stats.windingAtBest, wb = b.stats && b.stats.windingAtBest;
      const wOk = (!wa && !wb) || (wa && wb && wa.every((v, i) => Math.abs(v - wb[i]) <= 1e-9));
      if (!igual(ca, cb) || !wOk) erros.push(`evaluatePair(${opt.kind},${opt.tol}) ${a.state}/${a.value} vs ${b.state}/${b.value}`);
    }
    ok(`${tag}P-${ka.slice(0, 2)}${kb.slice(0, 2)}`.slice(0, 6), `[${metodo}] par ${ka} × ${kb}: contactSearch, minDistance e evaluatePair idênticos`, erros.length === 0, erros.slice(0, 3).join("; "));
  }

  /* ---------- 4. Cenas aleatórias ---------- */
  let erros = [], nCenas = 60;
  for (let c = 0; c < nCenas; c++) {
    const nlados = [8, 16, 48, 128][Math.floor(r() * 4)];
    const p0 = [r(), r(), r()], p1 = [r() * 2 - 0.5, r() * 2 - 0.5, r() * 2 - 0.5];
    const gA = F.caixaSubdividida(0, 0, 0, 0.5 + r(), 0.5 + r(), 0.5 + r(), 1 + Math.floor(r() * 12));
    const gB = F.cilindro(p0, p1, 0.01 + r() * 0.2, nlados);
    const off = r() < 0.3 ? UTM : [0, 0, 0];
    const An = preparar(N, [F.mover(gA, ...off)]), Bn = preparar(N, [F.mover(gB, ...off)]);
    const Al = preparar(L, [F.mover(gA, ...off)]), Bl = preparar(L, [F.mover(gB, ...off)]);
    const opt = [{ kind: "hard", tol: 0 }, { kind: "hard", tol: 0.005 }, { kind: "clearance", tol: 0.03 }][c % 3];
    const a = N.evaluatePair(An, Bn, opt), b = L.evaluatePair(Al, Bl, opt);
    const ca = { ...a, stats: { ...a.stats } }, cb = { ...b, stats: { ...b.stats } };
    for (const x of [ca, cb]) { delete x.stats.windingAtBest; }
    if (!igual(ca, cb)) erros.push(`cena ${c}: ${a.state}/${a.value} vs ${b.state}/${b.value}`);
  }
  ok(`${tag}R-60`, `[${metodo}] ${nCenas} cenas aleatórias (caixa subdividida × tubo, 30% em UTM): evaluatePair idêntico`, erros.length === 0, erros.slice(0, 3).join("; "));
}

/* ---------- 5. Casos dirigidos e parâmetros configuráveis ---------- */
function dirigidos() {
  N.GEO.BVH.METHOD = "sah"; N.GEO.BVH.MIN_TRIS = 1; N.GEO.BVH.LAZY_SCANS = 0;
  // consulta que devolve exatamente 1 triângulo: triângulo isolado longe de uma malha fina
  const tri = { p64: Float64Array.from([5, 5, 5, 5.1, 5, 5, 5, 5.1, 5]), i: Uint32Array.from([0, 1, 2]) };
  const g = [F.caixaSubdividida(0, 0, 0, 1, 1, 1, 20), tri];
  const n = N.prepareMesh(g), l = L.prepareMesh(g), B = [4.99, 4.99, 4.99, 5.2, 5.2, 5.01];
  const a = N.trianglesInBox(n, B), b = L.trianglesInBox(l, B);
  ok("D01", `consulta com exatamente 1 triângulo (${n.n} tri na malha)`, a.length === 1 && igual(a, b), JSON.stringify(a));
  // parâmetros: folhas grandes, profundidade mínima e profundidade 0 (uma única folha)
  const geo = [F.girar(F.cilindro([-0.5, 0.4, 0.6], [1.5, 0.6, 0.4], 0.12, 256), 0.3, 0.2, 0.1)];
  const r = rng(7); let erros = [];
  for (const cfg of [{ LEAF_SIZE: 64 }, { MAX_DEPTH: 2 }, { MAX_DEPTH: 0 }, { LEAF_SIZE: 1 }, { SAH_BINS: 2 }, { METHOD: "mediana", LEAF_SIZE: 16 }]) {
    const m = N.prepareMesh(geo), ml = L.prepareMesh(geo);
    m._bvh = N.buildBVH(m, cfg);
    if (cfg.MAX_DEPTH === 0 && m._bvh.nodes !== 1) erros.push("MAX_DEPTH 0 deveria gerar 1 nó");
    for (let q = 0; q < 40; q++) {
      const [x, y, z] = pontosDe(m.box, r, 1)[0], h = r() * 0.3;
      if (!igual(N.trianglesInBox(m, [x - h, y - h, z - h, x + h, y + h, z + h]), L.trianglesInBox(ml, [x - h, y - h, z - h, x + h, y + h, z + h]))) erros.push(JSON.stringify(cfg) + " trianglesInBox");
      if (N.unsignedDistance(m, x, y, z) !== L.unsignedDistance(ml, x, y, z)) erros.push(JSON.stringify(cfg) + " unsignedDistance");
      if ((N.windingNumber(m, x, y, z) >= 0.5) !== (L.windingNumber(ml, x, y, z) >= 0.5)) erros.push(JSON.stringify(cfg) + " windingNumber");
    }
  }
  ok("D02", "LEAF_SIZE, MAX_DEPTH e SAH_BINS configuráveis sem alterar resultados", erros.length === 0, [...new Set(erros)].join("; "));
  // raio rente a aresta/vértice: a paridade robusta detecta e o resultado cai na soma completa
  const cubo = N.prepareMesh([F.caixa(0, 0, 0, 1, 1, 1)]); cubo._bvh = N.buildBVH(cubo, { LEAF_SIZE: 1 });
  const R0 = [0.5773502691896258, 0.5773502691896257, 0.5773502691896259];
  // ponto escolhido para que o 1º raio passe exatamente pelo vértice (1,1,1)
  const t = 0.4, P = [1 - R0[0] * t, 1 - R0[1] * t, 1 - R0[2] * t];
  const p1 = N.rayParity(cubo, P[0], P[1], P[2], R0, true);
  const w = N.windingNumber(cubo, P[0], P[1], P[2]), ws = N.windingSum(cubo, P[0], P[1], P[2]);
  ok("D03", "raio pelo vértice: paridade marcada como degenerada (−1) e classificação correta", p1 === -1 && w >= 0.5 && ws >= 0.5, `paridade ${p1}, w ${w}, soma ${ws}`);
  // malha pequena (< MIN_TRIS) não constrói BVH; a de 43 200 triângulos constrói uma única vez
  N.GEO.BVH.MIN_TRIS = 32; N.resetPerf();
  const peq = N.prepareMesh([F.caixa(0, 0, 0, 1, 1, 1)]); N.trianglesInBox(peq, peq.box); N.unsignedDistance(peq, 2, 2, 2);
  const gr = N.prepareMesh([F.caixaSubdividida(0, 0, 0, 1, 1, 1, 60)]); for (let q = 0; q < 5; q++) { N.unsignedDistance(gr, 2, 2, 2 + q); N.windingNumber(gr, 0.5, 0.5, q * 0.3); }
  ok("D04", "BVH só acima de MIN_TRIS e construída uma vez por malha", !peq._bvh && N.PERF.bvhBuilds === 1, `construções ${N.PERF.bvhBuilds}`);
  // construção adiada: as LAZY_SCANS primeiras consultas são lineares e dão o mesmo resultado
  N.GEO.BVH.LAZY_SCANS = 4; N.resetPerf();
  const geo30 = [F.caixaSubdividida(0, 0, 0, 1, 1, 1, 30)], m = N.prepareMesh(geo30), ml = L.prepareMesh(geo30);
  const vals = [], ref = [];
  for (let q = 0; q < 8; q++) { vals.push(N.unsignedDistance(m, 1.3, 0.2 + q * 0.1, 0.5)); ref.push(L.unsignedDistance(ml, 1.3, 0.2 + q * 0.1, 0.5)); if (q === 3 && m._bvh) break; }
  ok("D05", "construção adiada (LAZY_SCANS = 4): 4 consultas lineares, depois BVH; valores iguais", !!m._bvh && N.PERF.bvhBuilds === 1 && m._scans === 5 && igual(vals, ref), `scans ${m._scans}, construções ${N.PERF.bvhBuilds}`);
}

const t0 = Date.now();
rodada("sah");
rodada("mediana");
dirigidos();
N.GEO.BVH.METHOD = "mediana"; N.GEO.BVH.MIN_TRIS = 32; N.GEO.BVH.LAZY_SCANS = 4;
console.log(linhas.join("\n"));
console.log(`\n${total - falhas} de ${total} testes da BVH aprovados (${((Date.now() - t0) / 1000).toFixed(1)} s).`);
process.exit(falhas ? 1 : 0);
