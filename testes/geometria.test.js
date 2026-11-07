/* COORDIX · suíte de testes do núcleo geométrico (Fase 01)
 * Executar:  node testes/geometria.test.js
 * Cada cenário define o resultado esperado (estado e valores) e valida o obtido.
 * Sai com código 1 se algum cenário falhar. */
"use strict";
// COORDIX_NUCLEO=legado roda a mesma suíte no núcleo linear da Fase 01 (comparação de tempo)
const G = require(process.env.COORDIX_NUCLEO === "legado" ? "./legado_fase01.js" : "../coordix-geometria.js");
const F = require("./formas.js");
const { STATE: S } = G;
// Fase 02: permite rodar a suíte forçando a BVH em todas as malhas e escolhendo o método de corte
if (G.GEO.BVH && process.env.COORDIX_BVH_MIN) G.GEO.BVH.MIN_TRIS = Number(process.env.COORDIX_BVH_MIN);
if (G.GEO.BVH && process.env.COORDIX_BVH_METHOD) G.GEO.BVH.METHOD = process.env.COORDIX_BVH_METHOD;
if (G.GEO.BVH && process.env.COORDIX_BVH_LAZY) G.GEO.BVH.LAZY_SCANS = Number(process.env.COORDIX_BVH_LAZY);

const mesh = (...geoms) => G.prepareMesh(geoms);
const mm = (m) => (m == null ? null : m * 1000);
const resultados = [];
let falhas = 0;

function caso(id, nome, A, B, opt, esperado) {
  const t0 = process.hrtime.bigint();
  let r, erro = null;
  try { r = G.evaluatePair(A, B, opt); } catch (e) { erro = e; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const problemas = [];
  if (erro) problemas.push("exceção: " + erro.message);
  else {
    if (esperado.estado && r.state !== esperado.estado) problemas.push(`estado ${r.state} ≠ ${esperado.estado}`);
    if (esperado.valor) {
      const [lo, hi] = esperado.valor, v = mm(r.value);
      if (v == null || v < lo || v > hi) problemas.push(`valor ${v == null ? "—" : v.toFixed(3)} mm fora de [${lo}, ${hi}]`);
    }
    if (esperado.contemEspessura != null) { // espessura exata deve estar dentro de [lb, ub]
      const e = esperado.contemEspessura;
      if (!(r.lb != null && r.ub != null && mm(r.lb) <= e + 1e-6 && e <= mm(r.ub) + 1e-6)) problemas.push(`espessura exata ${e} mm fora de [${r.lb == null ? "—" : mm(r.lb).toFixed(3)}, ${r.ub == null ? "sem garantia" : mm(r.ub).toFixed(3)}]`);
    }
    if (esperado.volume != null) {
      const v = esperado.volume;
      if (!r.volume || !(r.volume.vmin <= v * (1 + 1e-9) && v * (1 - 1e-9) <= r.volume.vmax)) problemas.push(`volume exato ${v} m³ fora do intervalo ${r.volume ? `[${r.volume.vmin.toExponential(4)}, ${r.volume.vmax.toExponential(4)}]` : "—"}`);
    }
    if (esperado.qualidade && r.quality !== esperado.qualidade) problemas.push(`qualidade ${r.quality} ≠ ${esperado.qualidade}`);
    for (const f of esperado.flags || []) if (!r.flags.includes(f)) problemas.push(`sem a sinalização ${f}`);
    if (esperado.naoEstado && esperado.naoEstado.includes(r.state)) problemas.push(`estado proibido ${r.state}`);
  }
  const ok = problemas.length === 0; if (!ok) falhas++;
  resultados.push({ id, nome, ok, problemas, ms, esperado, r: r && { state: r.state, kind: r.kind, value: mm(r.value), lb: mm(r.lb), ub: mm(r.ub), volume: r.volume, quality: r.quality, metricQuality: r.metricQuality, evidence: r.evidence, flags: r.flags, stats: r.stats } });
}
function verificar(id, nome, fn) {
  let ok = false, detalhe = "";
  try { const o = fn(); ok = o.ok; detalhe = o.detalhe || ""; } catch (e) { detalhe = "exceção: " + e.message; }
  if (!ok) falhas++;
  resultados.push({ id, nome, ok, problemas: ok ? [] : [detalhe], detalhe, ms: 0, r: null });
}

/* ---------------- 1. Dois cubos separados ---------------- */
const cubo = mesh(F.caixa(0, 0, 0, 1, 1, 1));
caso("C01", "Cubos separados (100 mm)", cubo, mesh(F.caixa(1.1, 0, 0, 2.1, 1, 1)), { kind: "hard", tol: 0 }, { estado: S.SEM_CONFLITO });

/* ---------------- 2. Interseção parcial ---------------- */
caso("C02a", "Cubos com interseção parcial (20 mm em x)", cubo, mesh(F.caixa(0.98, 0, 0, 1.98, 1, 1)), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, valor: [19.5, 20.0001], contemEspessura: 20, volume: 0.02 });
caso("C02b", "Cubos com interseção de canto (30×40×50 mm)", cubo, mesh(F.caixa(0.97, 0.96, 0.95, 1.97, 1.96, 1.95)), { kind: "hard", tol: 0 },
  { estado: S.CONFIRMADO, valor: [29.5, 30.0001], contemEspessura: 30, volume: 0.03 * 0.04 * 0.05 });

/* ---------------- 3. Cubos coincidentes ---------------- */
caso("C03", "Cubos coincidentes (elemento duplicado)", cubo, mesh(F.caixa(0, 0, 0, 1, 1, 1)), { kind: "hard", tol: 0.01 },
  { estado: S.CONFIRMADO, valor: [999, 1000.0001], contemEspessura: 1000, volume: 1 });

/* ---------------- 4. Cubo contido em outro ---------------- */
caso("C04", "Cubo de 200 mm contido em cubo de 1 m", cubo, mesh(F.caixa(0.4, 0.4, 0.4, 0.6, 0.6, 0.6)), { kind: "hard", tol: 0.01 },
  { estado: S.CONFIRMADO, valor: [199, 200.0001], contemEspessura: 200, volume: 0.008 });

/* ---------------- 5. Cubos tangentes ---------------- */
caso("C05a", "Cubos tangentes (face comum)", cubo, mesh(F.caixa(1, 0, 0, 2, 1, 1)), { kind: "hard", tol: 0 }, { estado: S.CONTATO, valor: [0, 0] });
caso("C05b", "Cubos tangentes por aresta", cubo, mesh(F.caixa(1, 1, 0, 2, 2, 1)), { kind: "hard", tol: 0 }, { estado: S.CONTATO });
caso("C05c", "Cubos tangentes por vértice", cubo, mesh(F.caixa(1, 1, 1, 2, 2, 2)), { kind: "hard", tol: 0 }, { estado: S.CONTATO });
caso("C05d", "Cubo apoiado em face maior (contato parcial)", mesh(F.caixa(0, 0, 0, 3, 3, 0.2)), mesh(F.caixa(1, 1, 0.2, 1.3, 1.3, 3)), { kind: "hard", tol: 0 }, { estado: S.CONTATO });

/* ---------------- 6. Separados por distância pequena ---------------- */
const cuboGap = mesh(F.caixa(1.005, 0, 0, 2.005, 1, 1));
caso("C06a", "Cubos a 5 mm — interferência", cubo, cuboGap, { kind: "hard", tol: 0 }, { estado: S.SEM_CONFLITO });
caso("C06b", "Cubos a 5 mm — folga exigida 10 mm", cubo, cuboGap, { kind: "clearance", tol: 0.010 }, { estado: S.CONFIRMADO, valor: [4.999, 5.001] });
caso("C06c", "Cubos a 5 mm — folga exigida 3 mm", cubo, cuboGap, { kind: "clearance", tol: 0.003 }, { estado: S.SEM_CONFLITO, flags: ["distancia_maior_que_folga"] });

/* ---------------- 7. Tubo atravessando parede ---------------- */
const parede = mesh(F.caixa(-3, 0, 0, 3, 0.15, 3));
const tubo100 = F.cilindro([0, -1, 1.5], [0, 1, 1.5], 0.05, 32);
const aTubo100 = F.areaPrismaCircunscrito(0.05, 32);
caso("C07a", "Tubo Ø100 atravessando parede de 150 mm", parede, mesh(tubo100), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, valor: [99.5, 100.0001], contemEspessura: 100, volume: aTubo100 * 0.15 });
caso("C07b", "Mesmo tubo girado 45° em planta", parede, mesh(F.girarZ(tubo100, Math.PI / 4, 0, 0.075)), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, valor: [99.5, 100.0001], contemEspessura: 100, volume: aTubo100 * 0.15 / Math.cos(Math.PI / 4) });
caso("C07c", "Tubo Ø200 atravessando parede de 150 mm", parede, mesh(F.cilindro([0, -1, 1.5], [0, 1, 1.5], 0.10, 32)), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, valor: [149.5, 150.0001], contemEspessura: 150 });

/* ---------------- 8. Duas tubulações próximas ---------------- */
const t50a = mesh(F.cilindro([0, 0, 0], [3, 0, 0], 0.025, 32));
const t50b = mesh(F.cilindro([0, 0.058, 0], [3, 0.058, 0], 0.025, 32));
caso("C08a", "Tubos Ø50 paralelos a 8 mm — interferência", t50a, t50b, { kind: "hard", tol: 0 }, { estado: S.SEM_CONFLITO });
caso("C08b", "Tubos Ø50 paralelos a 8 mm — folga 10 mm", t50a, t50b, { kind: "clearance", tol: 0.010 }, { estado: S.CONFIRMADO, valor: [7.999, 8.001] });
caso("C08c", "Tubos Ø50 paralelos a 8 mm — folga 5 mm", t50a, t50b, { kind: "clearance", tol: 0.005 }, { estado: S.SEM_CONFLITO, flags: ["distancia_maior_que_folga"] });
const tx = mesh(F.cilindro([-1, 0, 0], [1, 0, 0], 0.025, 32)), ty = mesh(F.cilindro([0, -1, 0.040], [0, 1, 0.040], 0.025, 32));
caso("C08d", "Tubos Ø50 cruzados com 10 mm de sobreposição — tol. 5 mm", tx, ty, { kind: "hard", tol: 0.005 }, { estado: S.CONFIRMADO, valor: [9.8, 10.0001], contemEspessura: 10 });
caso("C08e", "Tubos Ø50 cruzados com 10 mm de sobreposição — tol. 20 mm", tx, ty, { kind: "hard", tol: 0.020 }, { estado: S.ABAIXO_TOL });

/* ---------------- 9. Múltiplos componentes ---------------- */
const duasPecas = mesh(F.caixa(0, 0, 0, 1, 1, 1), F.caixa(2, 0, 0, 3, 1, 1));
caso("C09a", "Elemento com 2 componentes — peça no vão entre eles", duasPecas, mesh(F.caixa(1.2, 0.2, 0.2, 1.8, 0.8, 0.8)), { kind: "hard", tol: 0 }, { estado: S.SEM_CONFLITO });
caso("C09b", "Elemento com 2 componentes — sobreposição de 100 mm no 2º", duasPecas, mesh(F.caixa(2.9, 0.2, 0.2, 3.5, 0.8, 0.8)), { kind: "hard", tol: 0.01 },
  { estado: S.CONFIRMADO, valor: [99.5, 100.0001], contemEspessura: 100, volume: 0.1 * 0.6 * 0.6 });

/* ---------------- 10. Coordenadas muito grandes ---------------- */
const X0 = 500000.123, Y0 = 9000000.456, Z0 = 250.789; // ordem de grandeza UTM
const mv = (g) => F.mover(g, X0, Y0, Z0);
caso("C10a", "Interseção parcial de 20 mm em coordenadas UTM", mesh(mv(F.caixa(0, 0, 0, 1, 1, 1))), mesh(mv(F.caixa(0.98, 0, 0, 1.98, 1, 1))), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, valor: [19.5, 20.0001], contemEspessura: 20, volume: 0.02 });
caso("C10b", "Tubo atravessando parede em coordenadas UTM", mesh(mv(F.caixa(-3, 0, 0, 3, 0.15, 3))), mesh(mv(tubo100)), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, valor: [99.5, 100.0001], contemEspessura: 100 });
caso("C10c", "Folga de 5 mm em coordenadas UTM", mesh(mv(F.caixa(0, 0, 0, 1, 1, 1))), mesh(mv(F.caixa(1.005, 0, 0, 2.005, 1, 1))), { kind: "clearance", tol: 0.01 },
  { estado: S.CONFIRMADO, valor: [4.999, 5.001] });
verificar("C10d", "Transformação IFC em Float64 preserva 0,001 mm a 9.000 km", () => {
  const vd = new Float32Array([0, 0, 0, 0, 0, 1, 0.123, 0.456, 0.789, 0, 0, 1]);
  const t = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 512345.678, 9012345.901, 123.456, 1];
  const { P } = G.transformVertexData(vd, t);
  const off = [512345, 9012345, 123];
  const exato = [0.123 + 0.678, 0.456 + 0.901, 0.789 + 0.456];
  const novo = [P[3] - off[0], P[4] - off[1], P[5] - off[2]];
  // caminho v1: posição mundial gravada em Float32 antes de descontar a origem
  const v1 = [Math.fround(t[12] + Math.fround(0.123)) - off[0], Math.fround(t[13] + Math.fround(0.456)) - off[1]];
  const errNovo = Math.max(...novo.map((v, k) => Math.abs(v - exato[k]))) * 1000;
  const errV1 = Math.max(Math.abs(v1[0] - exato[0]), Math.abs(v1[1] - exato[1])) * 1000;
  return { ok: errNovo < 0.001, detalhe: `erro Float64 = ${errNovo.toExponential(2)} mm; erro se gravado em Float32 = ${errV1.toFixed(1)} mm` };
});

/* ---------------- 11. Dimensões reduzidas ---------------- */
const placa1mm = mesh(F.caixa(-0.05, -0.05, 0, 0.05, 0.05, 0.001));
const fio2mm = mesh(F.cilindro([0, 0, -0.02], [0, 0, 0.02], 0.001, 16));
caso("C11a", "Fio Ø2 mm atravessando chapa de 1 mm — tol. 0", placa1mm, fio2mm, { kind: "hard", tol: 0 }, { estado: S.CONFIRMADO, valor: [0.98, 1.0001], contemEspessura: 1 });
caso("C11b", "Fio Ø2 mm atravessando chapa de 1 mm — tol. 5 mm", placa1mm, fio2mm, { kind: "hard", tol: 0.005 }, { estado: S.ABAIXO_TOL });
caso("C11c", "Cubos de 3 mm com 0,5 mm de sobreposição — tol. 0,2 mm", mesh(F.caixa(0, 0, 0, 0.003, 0.003, 0.003)), mesh(F.caixa(0.0025, 0, 0, 0.0055, 0.003, 0.003)), { kind: "hard", tol: 0.0002 },
  { estado: S.CONFIRMADO, valor: [0.49, 0.5001], contemEspessura: 0.5, volume: 0.0005 * 0.003 * 0.003 });

/* ---------------- 12. Geometrias degeneradas ---------------- */
caso("C12a", "Elemento só com triângulos degenerados", mesh(F.degenerada()), cubo, { kind: "hard", tol: 0 }, { estado: S.INCOMPLETO, flags: ["sem_geometria_valida_A"] });
caso("C12b", "Cubo com triângulos degenerados extras × cubo sobreposto 20 mm", mesh(F.comDegenerados(F.caixa(0, 0, 0, 1, 1, 1))), mesh(F.caixa(0.98, 0, 0, 1.98, 1, 1)), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, valor: [19.5, 20.0001], flags: ["triangulos_degenerados_A"] });
caso("C12c", "Superfície plana (sem volume) atravessando cubo", mesh(F.placaPlana(0.5, -0.5, -0.5, 1.5, 1.5)), cubo, { kind: "hard", tol: 0 },
  { estado: S.INCONCLUSIVO, flags: ["superficie_sem_volume_A", "intersecao_de_superficies", "intersecao_sem_medida_confiavel"] }); // rodada complementar: aviso renomeado (antes "profundidade_indeterminada")

/* ---------------- Regressões e robustez ---------------- */
caso("R01", "Tubo diagonal afastado do pilar, com caixas sobrepostas (bug v1)", mesh(F.caixa(0, 0, 0, 0.3, 3, 0.3)), mesh(F.cilindro([-1.2, 1, -2], [2.8, 1.4, 2.6], 0.05, 32)), { kind: "hard", tol: 0.005 },
  { estado: S.SEM_CONFLITO });
const viga = mesh(F.perfilI(0, 3, 0, 0, 0.3, 0.15, 0.012, 0.008));
caso("R02", "Tubo na cavidade do perfil I, sem tocar (não convexo)", viga, mesh(F.cilindro([0.2, 0.05, 0], [2.8, 0.05, 0], 0.02, 32)), { kind: "hard", tol: 0 }, { estado: S.SEM_CONFLITO });
caso("R03a", "Tubo Ø50 atravessando a alma de 8 mm do perfil I — tol. 5 mm", viga, mesh(F.cilindro([1.5, -0.5, 0], [1.5, 0.5, 0], 0.025, 32)), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, valor: [7.9, 8.0001], contemEspessura: 8 });
caso("R03b", "Tubo Ø50 atravessando a alma de 8 mm do perfil I — tol. 10 mm", viga, mesh(F.cilindro([1.5, -0.5, 0], [1.5, 0.5, 0], 0.025, 32)), { kind: "hard", tol: 0.010 },
  { estado: S.ABAIXO_TOL });
caso("R04", "Malha com normais invertidas (orientação para dentro)", mesh(F.inverter(F.caixa(0, 0, 0, 1, 1, 1))), mesh(F.caixa(0.98, 0, 0, 1.98, 1, 1)), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, valor: [19.5, 20.0001], qualidade: "exata", volume: 0.02 });
caso("R05", "Malha aberta (cubo sem a tampa) com sobreposição de 20 mm", mesh(F.removerFace(F.caixa(0, 0, 0, 1, 1, 1), 2, 1)), mesh(F.caixa(0.98, 0, 0, 1.98, 1, 1)), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, qualidade: "aproximada", flags: ["malha_aberta_A"] });
caso("R06a", "Limite de pares de triângulos atingido em contato (não pode virar ausência)", cubo, mesh(F.caixa(1, 0, 0, 2, 1, 1)), { kind: "hard", tol: 0, limits: { TRI_PAIRS: 5, BB_EVALS: 200 } },
  { estado: S.INCOMPLETO, naoEstado: [S.SEM_CONFLITO, S.CONTATO] });
caso("R06b", "Limite de pares na distância (folga) — não pode virar ausência", t50a, t50b, { kind: "clearance", tol: 0.0085, limits: { DIST_PAIRS: 1 } },
  { estado: S.INCOMPLETO, naoEstado: [S.SEM_CONFLITO] });
caso("R06c", "Limite de avaliações da espessura perto do limiar (perfil I, não convexo)", viga, mesh(F.cilindro([1.5, -0.5, 0], [1.5, 0.5, 0], 0.025, 32)), { kind: "hard", tol: 0.0081, limits: { BB_EVALS: 3 } },
  { estado: S.INCOMPLETO, naoEstado: [S.SEM_CONFLITO, S.ABAIXO_TOL] });
caso("R07", "Elemento contido sem cruzamento de superfícies — folga", cubo, mesh(F.caixa(0.4, 0.4, 0.4, 0.6, 0.6, 0.6)), { kind: "clearance", tol: 0.01 },
  { estado: S.CONFIRMADO, valor: [0, 0], flags: ["interpenetracao"] });
verificar("R08", "Dentro/fora em grade 21³ incluindo pontos alinhados a vértices e arestas", () => {
  let erros = 0, total = 0;
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) for (let k = 0; k <= 20; k++) {
    const x = -0.5 + i * 0.1, y = -0.5 + j * 0.1, z = -0.5 + k * 0.1;
    const bord = [x, y, z].some(v => Math.abs(v) < 1e-9 || Math.abs(v - 1) < 1e-9);
    if (bord) continue;
    total++;
    const dentro = x > 0 && x < 1 && y > 0 && y < 1 && z > 0 && z < 1;
    const w = G.windingNumber(cubo, x, y, z);
    if ((w >= 0.5) !== dentro) erros++;
  }
  return { ok: erros === 0, detalhe: `${erros} erros em ${total} pontos` };
});
verificar("R09", "Interseção triângulo×triângulo: casos tangentes, coplanares e cruzados", () => {
  const T = (a) => Float64Array.from(a);
  const base = T([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const casos = [
    ["cruzamento transversal", T([0.2, 0.2, -1, 0.2, 0.2, 1, 0.3, 0.3, 1]), G.CROSS],
    ["vértice tocando a face", T([0.2, 0.2, 0, 0.2, 0.2, 1, 0.3, 0.3, 1]), G.TOUCH],
    ["coplanar sobreposto", T([0.1, 0.1, 0, 0.6, 0.1, 0, 0.1, 0.6, 0]), G.TOUCH],
    ["coplanar disjunto", T([2, 2, 0, 3, 2, 0, 2, 3, 0]), G.NONE],
    ["aresta compartilhada (fora do plano)", T([0, 0, 0, 1, 0, 0, 0, 0, 1]), G.TOUCH],
    ["paralelo afastado", T([0, 0, 0.1, 1, 0, 0.1, 0, 1, 0.1]), G.NONE],
    ["cruza o plano fora do triângulo", T([2, 2, -1, 2, 2, 1, 2.1, 2.1, 1]), G.NONE],
  ];
  const falhou = casos.filter(([, U, esp]) => G.triTriIntersect(base, 0, U, 0, null) !== esp || G.triTriIntersect(U, 0, base, 0, null) !== esp).map(c => c[0]);
  return { ok: !falhou.length, detalhe: falhou.length ? "falhou: " + falhou.join(", ") : "" };
});
verificar("R10", "Topologia: fechada/aberta, orientação e degenerados detectados", () => {
  const c = cubo, ab = mesh(F.removerFace(F.caixa(0, 0, 0, 1, 1, 1), 2, 1)), inv = mesh(F.inverter(F.caixa(0, 0, 0, 1, 1, 1))), dg = mesh(F.comDegenerados(F.caixa(0, 0, 0, 1, 1, 1)));
  const ok = c.closed && c.oriented && c.orientSign === 1 && Math.abs(c.volume - 1) < 1e-12 && !ab.closed && inv.closed && inv.oriented && inv.orientSign === -1 && dg.degenerate === 2 && dg.n === 12;
  return { ok, detalhe: JSON.stringify({ cubo: [c.closed, c.oriented, c.orientSign], aberta: ab.closed, invertida: [inv.closed, inv.orientSign], degenerados: dg.degenerate }) };
});
verificar("R11", "Unidades: escala vem da unidade declarada, sem heurística pela extensão (revisado na rodada complementar)", () => {
  const a = G.unitScaleFor("MILLI"), b = G.unitScaleFor(""), d = G.unitScaleFor("XYZ");
  const ok = a.scale === 0.001 && a.status === "declarada" && b.scale === 1 && d.status === "nao_suportada";
  return { ok, detalhe: JSON.stringify({ a, b, d }) };
});


caso("R14", "Malha fina com orientação inconsistente — não pode concluir ausência", mesh(F.caixaSubdividida(-0.5, 0, 0, 0.5, 0.15, 3, 40, { inconsistente: true })), mesh(F.cilindro([0, -1, 1.5], [0, 1, 1.5], 0.05, 256)), { kind: "hard", tol: 0.005 },
  { qualidade: "aproximada", flags: ["orientacao_inconsistente_A"], naoEstado: [S.SEM_CONFLITO, S.CONTATO, S.ABAIXO_TOL] });
caso("R15", "Malha fina: tubo Ø100 (256 lados) × parede subdividida (19.200 triângulos)", mesh(F.caixaSubdividida(-0.5, 0, 0, 0.5, 0.15, 3, 40)), mesh(F.cilindro([0, -1, 1.5], [0, 1, 1.5], 0.05, 256)), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, valor: [99.99, 100.0001], volume: F.areaPrismaCircunscrito(0.05, 256) * 0.15 });
caso("R16", "Cena girada (rotação genérica): cubos raspando 3 mm, tol. 5 mm", mesh(F.girar(F.caixa(0, 0, 0, 1, 1, 1), 0.5, 0.7, 0.3)), mesh(F.girar(F.caixa(0.997, 0, 0, 1.997, 1, 1), 0.5, 0.7, 0.3)), { kind: "hard", tol: 0.005 },
  { estado: S.ABAIXO_TOL, valor: [2.999, 3.0001] });
caso("R17", "Cena girada: tubo Ø50 × alma do perfil I (não convexo)", mesh(F.girar(F.perfilI(0, 3, 0, 0, 0.3, 0.15, 0.012, 0.008), 0.5, 0.7, 0.3)), mesh(F.girar(F.cilindro([1.5, -0.5, 0], [1.5, 0.5, 0], 0.025, 32), 0.5, 0.7, 0.3)), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, valor: [7.9, 8.0001], contemEspessura: 8 });
caso("R18", "Malha fina contida (2.400 vértices) — limite de 160 vértices da v1", cubo, mesh(F.caixaSubdividida(0.4, 0.4, 0.4, 0.6, 0.6, 0.6, 20)), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, valor: [199.99, 200.0001], volume: 0.008 });
verificar("T11", "Componentes sobrepostos com faces coplanares são detectados (regressão da rodada)", () => {
  const A = mesh(F.caixa(0, 0, 0, 1, 1, 1), F.caixa(0.5, 0, 0, 1.5, 1, 1)), B = mesh(F.caixa(0, 0, 0, 1, 1, 1), F.caixa(2, 0, 0, 3, 1, 1));
  return { ok: G.selfOverlap(A) === true && G.selfOverlap(B) === false, detalhe: `sobrepostos=${G.selfOverlap(A)} separados=${G.selfOverlap(B)}` };
});
verificar("R12", "Verificação cruzada: ramo-e-limite × centro de Chebyshev nos pares convexos", () => {
  const pares = [
    ["C02a", cubo, mesh(F.caixa(0.98, 0, 0, 1.98, 1, 1)), 20],
    ["C04", cubo, mesh(F.caixa(0.4, 0.4, 0.4, 0.6, 0.6, 0.6)), 200],
    ["C07b", parede, mesh(F.girarZ(tubo100, Math.PI / 4, 0, 0.075)), 100],
    ["C08d", tx, ty, 10],
  ];
  const linhas = [];
  let ok = true;
  for (const [id, A, B, esperado] of pares) {
    const core = G.overlapBox(A.box, B.box, 1e-5);
    const bb = G.depthBound(A, B, core, -1, 60000, true); // limiar −1: decide na hora e usa todo o orçamento para refinar
    const ca = G.convexInfo(A), cb = G.convexInfo(B);
    const x0 = bb.best;
    const lp = G.chebyshev(ca.planes.concat(cb.planes), x0);
    const tLP = 2 * lp.r * 1000, lb = 2 * bb.lb * 1000, ub = 2 * bb.ub * 1000;
    const coerente = lb <= tLP + 1e-6 && tLP <= ub + 1e-6 && Math.abs(tLP - esperado) < 1e-6;
    ok = ok && coerente;
    linhas.push(`${id}: LP ${tLP.toFixed(4)} ∈ [${lb.toFixed(3)}; ${ub.toFixed(3)}] ${coerente ? "ok" : "DIVERGE"}`);
  }
  return { ok, detalhe: linhas.join(" · ") };
});
verificar("R13", "Volume de peça não convexa (perfil I × tubo) contém o valor analítico", () => {
  const A = viga, B = mesh(F.cilindro([1.5, -0.5, 0], [1.5, 0.5, 0], 0.025, 32));
  const r = G.evaluatePair(A, B, { kind: "hard", tol: 0.005, limits: { VOL_EVALS: 20000 } });
  const exato = F.areaPrismaCircunscrito(0.025, 32) * 0.008;
  const ok = r.volume && r.volume.vmin <= exato && exato <= r.volume.vmax;
  return { ok, detalhe: `exato ${exato.toExponential(4)} m³ ∈ [${r.volume.vmin.toExponential(4)}; ${r.volume.vmax.toExponential(4)}]` };
});

/* =====================================================================
 * RODADA COMPLEMENTAR — testes de regressão obrigatórios
 * Resultados esperados definidos pelas regras da rodada, antes da execução.
 * ===================================================================== */
const unir = (...gs) => { const P = [], I = []; let off = 0; for (const g of gs) { P.push(...g.p64); for (const k of g.i) I.push(k + off); off += g.p64.length / 3; } return { p64: Float64Array.from(P), i: Uint32Array.from(I) }; };
const inverterTriangulos = (g, desde, ate) => { const I = Uint32Array.from(g.i); for (let k = desde * 3; k < ate * 3; k += 3) { const x = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = x; } return { p64: g.p64, i: I }; };
const comAleta = (g) => { const n = g.p64.length / 3; return { p64: Float64Array.from([...g.p64, 0.5, -0.5, 0]), i: Uint32Array.from([...g.i, 0, 1, n]) }; }; // 3ª face na aresta 0–1
const topo = (id, nome, geom, esperado) => verificar(id, nome, () => {
  const m = mesh(geom); const falhas = Object.entries(esperado).filter(([k, v]) => typeof v === "function" ? !v(m[k]) : m[k] !== v).map(([k]) => k);
  return { ok: !falhas.length, detalhe: `topologia=${m.topology} componentes=${m.components} bordas=${m.boundaryEdges} nãoManifold(arestas/vértices)=${m.nonManifoldEdges}/${m.nonManifoldVertices} inconsistentes=${m.inconsistentEdges} vazios=${m.voids}${falhas.length ? " — divergiu em: " + falhas.join(", ") : ""}` };
});

/* ---- Topologia ---- */
topo("T01", "Malha fechada e manifold (cubo)", F.caixa(0, 0, 0, 1, 1, 1), { topology: "solido_valido", components: 1, boundaryEdges: 0, nonManifoldEdges: 0, nonManifoldVertices: 0, inconsistentEdges: 0 });
topo("T02", "Malha aberta (cubo sem a tampa)", F.removerFace(F.caixa(0, 0, 0, 1, 1, 1), 2, 1), { topology: "aberta", boundaryEdges: (v) => v === 4, nonManifoldEdges: 0 });
topo("T03", "Aresta compartilhada por 3 faces (aleta)", comAleta(F.caixa(0, 0, 0, 1, 1, 1)), { topology: "invalida", nonManifoldEdges: (v) => v >= 1 });
topo("T04", "Orientação inconsistente (uma face invertida)", inverterTriangulos(F.caixa(0, 0, 0, 1, 1, 1), 0, 2), { topology: "invalida", inconsistentEdges: (v) => v > 0, insideMode: "paridade" });
topo("T05", "Componentes desconectados (dois cubos separados)", unir(F.caixa(0, 0, 0, 1, 1, 1), F.caixa(2, 0, 0, 3, 1, 1)), { topology: "solido_valido", components: 2 });
topo("T06", "Vértice não manifold (cubos unidos por um vértice)", unir(F.caixa(0, 0, 0, 1, 1, 1), F.caixa(1, 1, 1, 2, 2, 2)), { topology: "invalida", nonManifoldVertices: (v) => v >= 1, nonManifoldEdges: 0 });
topo("T07", "Vazio interno (casca interna com orientação oposta) é sólido válido", unir(F.caixa(0, 0, 0, 1, 1, 1), F.inverter(F.caixa(0.3, 0.3, 0.3, 0.7, 0.7, 0.7))), { topology: "solido_valido", voids: 1, components: 2 });
topo("T08", "Componente separado com orientação invertida é inválido", unir(F.caixa(0, 0, 0, 1, 1, 1), F.inverter(F.caixa(2, 0, 0, 3, 1, 1))), { topology: "invalida", orientationConflict: true });
topo("T09", "Fusão de vértices na fronteira de célula não cria bordas falsas", F.mover(F.caixa(0, 0, 0, 1, 1, 1), 0.000005, 0.000015, 0.0000049999), { topology: "solido_valido", boundaryEdges: 0 });
caso("T10", "Malha não manifold não é usada como sólido (sobreposição de 20 mm)", mesh(comAleta(F.caixa(0, 0, 0, 1, 1, 1))), mesh(F.caixa(0.98, 0.1, 0.1, 1.98, 0.9, 0.9)), { kind: "hard", tol: 0.005 }, // B recuado nas laterais: cruzamento transversal real
  { qualidade: "aproximada", flags: ["topologia_invalida_A", "arestas_nao_manifold_A", "intersecao_de_superficies"], naoEstado: [S.SEM_CONFLITO, S.CONTATO, S.ABAIXO_TOL] });

/* ---- Integridade geométrica (leitor por elemento com falhas simuladas) ---- */
const cuboVD = (() => { const c = F.caixa(0, 0, 0, 1, 1, 1), vd = []; for (let k = 0; k < c.p64.length; k += 3) vd.push(c.p64[k], c.p64[k + 1], c.p64[k + 2], 0, 0, 1); return { vd: Float32Array.from(vd), id: Uint32Array.from(c.i) }; })();
const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function leitor(falhas) { // falhas: {geomIdx: "geometria"|"vertices"|"indices"|"indiceForaDoIntervalo"}
  const log = { criadas: 0, liberadas: 0 };
  return { log, r: {
    getGeometry: (ref) => { if (falhas[ref.geometryExpressID] === "geometria") throw new Error("GetGeometry falhou"); log.criadas++; return { id: ref.geometryExpressID }; },
    getVertices: (g) => { if (falhas[g.id] === "vertices") throw new Error("GetVertexArray falhou"); return cuboVD.vd; },
    getIndices: (g) => { if (falhas[g.id] === "indices") throw new Error("GetIndexArray falhou"); if (falhas[g.id] === "indiceForaDoIntervalo") return Uint32Array.from([0, 1, 99]); return cuboVD.id; },
    release: () => { log.liberadas++; }, transform: () => I4 } };
}
const refs3 = [{ geometryExpressID: 101 }, { geometryExpressID: 102 }, { geometryExpressID: 103 }];
verificar("I01", "Elemento com 3 geometrias e falha em uma (GetGeometry)", () => {
  const { r, log } = leitor({ 102: "geometria" }); const o = G.readElementGeometries(refs3, r);
  const ok = o.integrity === "parcial" && o.geoms.length === 2 && o.failures.length === 1 && o.failures[0].ref.geometryExpressID === 102 && o.failures[0].stage === "geometria" && log.liberadas === log.criadas;
  return { ok, detalhe: `integridade=${o.integrity} lidas=${o.geoms.length} falhas=${JSON.stringify(o.failures.map(f => [f.ref.geometryExpressID, f.stage]))} recursos ${log.liberadas}/${log.criadas} liberados` };
});
verificar("I02", "Elemento com todas as geometrias inválidas", () => {
  const { r } = leitor({ 101: "vertices", 102: "indices", 103: "indiceForaDoIntervalo" }); const o = G.readElementGeometries(refs3, r);
  return { ok: o.integrity === "nao_processada" && o.geoms.length === 0 && o.failures.length === 3, detalhe: `integridade=${o.integrity} etapas=${o.failures.map(f => f.stage).join(",")}` };
});
verificar("I03", "Falha na leitura de índices libera o recurso e é registrada", () => {
  const { r, log } = leitor({ 103: "indices" }); const o = G.readElementGeometries(refs3, r);
  return { ok: o.integrity === "parcial" && o.failures[0].stage === "indices" && log.liberadas === 3, detalhe: `etapa=${o.failures[0].stage} recursos liberados=${log.liberadas}/3` };
});
verificar("I04", "Índice fora do intervalo é rejeitado na validação (não vira geometria parcial silenciosa)", () => {
  const { r } = leitor({ 101: "indiceForaDoIntervalo" }); const o = G.readElementGeometries(refs3, r);
  return { ok: o.failures.length === 1 && o.failures[0].stage === "validacao" && /fora do intervalo/.test(o.failures[0].reason), detalhe: JSON.stringify(o.failures.map(f => [f.stage, f.reason])) };
});
verificar("I05", "Elemento com GUID e geometria parcial: falha identificável e malha marcada como incompleta", () => {
  const { r } = leitor({ 102: "vertices" }); const o = G.readElementGeometries(refs3, r);
  const el = { guid: "2N1qr7$8f3Bw0Kc9Lx1Abc", geoIntegrity: o.integrity, geoFailures: o.failures.map(f => ({ geometryExpressID: f.ref.geometryExpressID, stage: f.stage })) };
  const m = G.prepareMesh(o.geoms.map(g => ({ p64: g.w, i: g.i })), { incomplete: el.geoIntegrity !== "completa" });
  return { ok: el.geoIntegrity === "parcial" && el.geoFailures[0].geometryExpressID === 102 && m.incomplete === true, detalhe: JSON.stringify(el) };
});
const pilarIncompleto = G.prepareMesh([F.caixa(0, 0, 0, 0.3, 3, 0.3)], { incomplete: true });
caso("K04", "Geometria incompleta com aparente ausência de conflito", pilarIncompleto, mesh(F.cilindro([-1.2, 1, -2], [2.8, 1.4, 2.6], 0.05, 32)), { kind: "hard", tol: 0.005 },
  { estado: S.INCONCLUSIVO, flags: ["geometria_incompleta_A", "ausencia_nao_confirmada_geometria_incompleta"] });
caso("K05", "Geometria incompleta com evidência positiva de conflito", G.prepareMesh([F.caixa(0, 0, 0, 1, 1, 1)], { incomplete: true }), mesh(F.caixa(0.98, 0, 0, 1.98, 1, 1)), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, valor: [19.999, 20.0001], flags: ["representacao_completa_nao_validada"] });
caso("K06", "Geometria incompleta: folga atendida não é confirmada", G.prepareMesh([F.caixa(0, 0, 0, 1, 1, 1)], { incomplete: true }), cuboGap, { kind: "clearance", tol: 0.003 },
  { estado: S.INCONCLUSIVO });

/* ---- Unidades ---- */
const SI = (Prefix) => ({ type: "IFCSIUNIT", UnitType: "LENGTHUNIT", Prefix, Name: "METRE" });
const outras = [{ type: "IFCSIUNIT", UnitType: "AREAUNIT", Prefix: "", Name: "SQUARE_METRE" }, { type: "IFCSIUNIT", UnitType: "PLANEANGLEUNIT", Prefix: "", Name: "RADIAN" }];
const und = (id, nome, units, esp) => verificar(id, nome, () => {
  const u = G.resolveLengthUnit(units), sc = G.unitScaleFor(u, false);
  const ok = u.status === esp.status && (esp.scale == null || Math.abs(sc.scale - esp.scale) < 1e-15);
  return { ok, detalhe: `estado=${u.status} unidade=${u.label} escala=${sc.scale}` };
});
und("U01", "IFC em metros", [SI(""), ...outras], { status: "declarada", scale: 1 });
und("U02", "IFC em milímetros", [SI("MILLI"), ...outras], { status: "declarada", scale: 0.001 });
und("U03", "IFC em centímetros", [SI("CENTI"), ...outras], { status: "declarada", scale: 0.01 });
und("U04", "IFC em quilômetros", [SI("KILO"), ...outras], { status: "declarada", scale: 1000 });
und("U05", "IFC em decímetros", [SI("DECI"), ...outras], { status: "declarada", scale: 0.1 });
und("U06", "Unidade de comprimento ausente", outras, { status: "ausente" });
und("U07", "Prefixo não suportado", [SI("XYZ")], { status: "nao_suportada" });
und("U08", "Unidade por conversão (pé = 0,3048 m)", [{ type: "IFCCONVERSIONBASEDUNIT", UnitType: "LENGTHUNIT", Name: "FOOT", ConversionFactor: { ValueComponent: 0.3048, UnitComponent: SI("") } }], { status: "declarada", scale: 0.3048 });
und("U09", "Unidade por conversão com fator inválido", [{ type: "IFCCONVERSIONBASEDUNIT", UnitType: "LENGTHUNIT", Name: "FOOT", ConversionFactor: { ValueComponent: 0, UnitComponent: SI("") } }], { status: "nao_suportada" });
und("U10", "Duas unidades de comprimento conflitantes", [SI("MILLI"), SI("")], { status: "ambigua" });
verificar("U11", "Modelo pequeno declarado em milímetros (extensão 500): escala 0,001 (a heurística antiga usava 1)", () => {
  const sc = G.unitScaleFor(G.resolveLengthUnit([SI("MILLI")]), false), ext = 500 * sc.scale, pl = G.checkScalePlausibility(ext);
  return { ok: sc.scale === 0.001 && Math.abs(ext - 0.5) < 1e-12 && pl.ok, detalhe: `escala=${sc.scale} extensão=${ext} m plausível=${pl.ok}` };
});
verificar("U12", "Conversão duplicada é sinalizada (12 m já convertidos tratados como mm → 0,012 m)", () => {
  const sc = G.unitScaleFor(G.resolveLengthUnit([SI("MILLI")]), false), pl = G.checkScalePlausibility(12 * sc.scale);
  const semDupla = G.unitScaleFor(G.resolveLengthUnit([SI("MILLI")]), true);
  return { ok: !pl.ok && pl.reason === "modelo_pequeno_demais" && semDupla.scale === 1, detalhe: JSON.stringify({ pl, leitorConverte: semDupla.scale }) };
});

verificar("U13", "Quem converte: extensão bruta menor que a maior extrusão ⇒ o leitor já converteu (sem conversão dupla)", () => {
  const conv = G.detectReaderConversion(12.3, 2880, 0.001), nao = G.detectReaderConversion(12300, 2880, 0.001), sem = G.detectReaderConversion(12.3, 0, 0.001), m = G.detectReaderConversion(12.3, 2.88, 1);
  const ok = conv.converts === true && nao.converts === false && sem.converts === null && m.converts === null
    && G.unitScaleFor(G.resolveLengthUnit([SI("MILLI")]), conv.converts).scale === 1 && G.unitScaleFor(G.resolveLengthUnit([SI("MILLI")]), nao.converts).scale === 0.001;
  return { ok, detalhe: JSON.stringify({ conv, nao, sem, m }) };
});

/* ---- Simplex ---- */
const planos = (g) => G.convexInfo(mesh(g)).planes;
const sx = (id, nome, fn) => verificar(id, nome, fn);
sx("S01", "Convergência normal (sobreposição de 20 mm)", () => { const r = G.chebyshev(planos(F.caixa(0, 0, 0, 1, 1, 1)).concat(planos(F.caixa(0.98, 0, 0, 1.98, 1, 1))), [0.5, 0.5, 0.5]); return { ok: r.status === "otimo" && Math.abs(r.r - 0.01) < 1e-12, detalhe: JSON.stringify({ status: r.status, r: r.r, it: r.iterations }) }; });
sx("S02", "Problema inviável (cubos separados)", () => { const r = G.chebyshev(planos(F.caixa(0, 0, 0, 1, 1, 1)).concat(planos(F.caixa(2, 0, 0, 3, 1, 1))), [0.5, 0.5, 0.5]); return { ok: r.status === "inviavel", detalhe: r.status }; });
sx("S03", "Limite de iterações atingido: não devolve r", () => { const r = G.chebyshev(planos(F.caixa(0, 0, 0, 1, 1, 1)).concat(planos(F.caixa(0.98, 0, 0, 1.98, 1, 1))), [0.5, 0.5, 0.5], { maxIter: 1 }); return { ok: r.status === "limite_iteracoes" && r.r === null && r.x === null, detalhe: JSON.stringify(r) }; });
sx("S04", "Falha numérica (plano com NaN)", () => { const pl = planos(F.caixa(0, 0, 0, 1, 1, 1)); pl.push([NaN, 0, 0, 1]); const r = G.chebyshev(pl, [0.5, 0.5, 0.5]); return { ok: r.status === "falha_numerica" && r.r === null, detalhe: r.status }; });
sx("S05", "Dimensões muito pequenas (cubos de 1 mm, sobreposição de 0,1 mm)", () => { const r = G.chebyshev(planos(F.caixa(0, 0, 0, 0.001, 0.001, 0.001)).concat(planos(F.caixa(0.0009, 0, 0, 0.0019, 0.001, 0.001))), [0.0005, 0.0005, 0.0005]); return { ok: r.status === "otimo" && Math.abs(r.r - 0.00005) < 1e-12, detalhe: `r=${r.r}` }; });
sx("S06", "Dimensões muito grandes (caixas de 2 km em coordenadas UTM, sobreposição de 20 m)", () => {
  const X = 5e5, Y = 9e6, a = planos(F.mover(F.caixa(0, 0, 0, 2000, 2000, 2000), X, Y, 0)), b = planos(F.mover(F.caixa(1980, 0, 0, 3980, 2000, 2000), X, Y, 0));
  const r = G.chebyshev(a.concat(b), [X + 1000, Y + 1000, 1000]); return { ok: r.status === "otimo" && Math.abs(r.r - 10) < 1e-6, detalhe: `r=${r.r} resíduo=${r.residual}` };
});
caso("S07", "Simplex sem convergência: evaluatePair não usa o valor e recorre ao ramo-e-limite", cubo, mesh(F.caixa(0.98, 0, 0, 1.98, 1, 1)), { kind: "hard", tol: 0.005, limits: { SIMPLEX_ITER: 1 } },
  { estado: S.CONFIRMADO, flags: ["simplex_limite_iteracoes"], valor: [19.5, 20.0001], contemEspessura: 20 });

/* ---- Classificação de malhas não sólidas ---- */
const caixaAberta = mesh(F.removerFace(F.caixa(0, 0, 0, 1, 1, 1), 2, 1)); // sem a face z = 1
caso("K01a", "Malha aberta sem interseção superficial e sem contenção possível", mesh(F.removerFace(F.caixa(0, 0, 0, 0.3, 3, 0.3), 1, 3)), mesh(F.cilindro([-1.2, 1, -2], [2.8, 1.4, 2.6], 0.05, 32)), { kind: "hard", tol: 0.005 },
  { estado: S.SEM_CONFLITO, flags: ["malha_aberta_A", "ausencia_por_separacao_de_superficies"] });
caso("K01b", "Malha aberta sem interseção superficial, com peça contida", caixaAberta, mesh(F.caixa(0.4, 0.4, 0.4, 0.6, 0.6, 0.6)), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, flags: ["contencao_estimada"], naoEstado: [S.SEM_CONFLITO] });
caso("K01c", "Malha aberta: tubo entra pelo furo sem cruzar superfícies (não pode virar ausência)", caixaAberta, mesh(F.cilindro([0.5, 0.5, 0.5], [0.5, 0.5, 2], 0.05, 32)), { kind: "hard", tol: 0.005 },
  { naoEstado: [S.SEM_CONFLITO, S.CONTATO, S.ABAIXO_TOL] });
caso("K02a", "Malha aberta com interseção superficial e espessura estimada acima da tolerância", caixaAberta, mesh(F.caixa(0.98, 0.1, 0.1, 1.98, 0.9, 0.9)), { kind: "hard", tol: 0.005 },
  { estado: S.CONFIRMADO, flags: ["intersecao_de_superficies", "espessura_estimada"] });
caso("K02b", "Malha aberta com interseção superficial rasa (3 mm, tol. 5): sem garantia de estar abaixo", caixaAberta, mesh(F.caixa(0.997, 0.1, 0.1, 1.997, 0.9, 0.9)), { kind: "hard", tol: 0.005 },
  { estado: S.INCONCLUSIVO, flags: ["intersecao_de_superficies", "intersecao_sem_medida_confiavel"] });
caso("K03a", "Malha não manifold com peça dentro da sua caixa e sem cruzamento", mesh(comAleta(F.caixa(0, 0, 0, 1, 1, 1))), mesh(F.caixa(0.4, 0.4, 0.4, 0.6, 0.6, 0.6)), { kind: "hard", tol: 0.005 },
  { estado: S.INCONCLUSIVO, flags: ["topologia_invalida_A", "contencao_nao_verificavel"] });
caso("K03b", "Malha não manifold com ausência aparente e separação provada", mesh(comAleta(F.caixa(0, 0, 0, 0.3, 3, 0.3))), mesh(F.cilindro([-1.2, 1, -2], [2.8, 1.4, 2.6], 0.05, 32)), { kind: "hard", tol: 0.005 },
  { estado: S.SEM_CONFLITO, flags: ["topologia_invalida_A", "ausencia_por_separacao_de_superficies"] });
caso("K07", "Malha aberta: folga violada é confirmada pela distância exata", caixaAberta, mesh(F.caixa(1.005, 0, 0, 2.005, 1, 1)), { kind: "clearance", tol: 0.010 },
  { estado: S.CONFIRMADO, valor: [4.999, 5.001] });
caso("K08", "Componentes sobrepostos no elemento: 'abaixo da tolerância' sem garantia vira inconclusivo", mesh(F.caixa(0, 0, 0, 1, 1, 1), F.caixa(0.5, 0, 0, 1.5, 1, 1), F.caixa(0, 0, 3, 0.2, 0.2, 3.2)), mesh(F.caixa(1.497, 0.2, 0.2, 2.5, 0.8, 0.8)), { kind: "hard", tol: 0.005 },
  { naoEstado: [S.ABAIXO_TOL, S.SEM_CONFLITO, S.CONTATO] });

/* ---------------- relatório ---------------- */
const pad = (s, n) => (String(s) + " ".repeat(n)).slice(0, n);
console.log("\nCOORDIX · testes do núcleo geométrico\n");
for (const x of resultados) {
  const r = x.r;
  const info = r ? `${pad(r.state, 18)} t=${r.value == null ? "—" : r.value.toFixed(3)} mm` + (r.lb != null && r.kind !== "clearance" ? ` [${r.lb.toFixed(3)}; ${r.ub == null ? "sem garantia" : r.ub.toFixed(3)}]` : "") +
    (r.volume ? ` V=[${r.volume.vmin.toExponential(3)}; ${r.volume.vmax.toExponential(3)}] m³` : "") + (r.quality !== "exata" ? " (aprox.)" : "") + ` ${x.ms.toFixed(1)} ms` : x.detalhe;
  console.log(`${x.ok ? "✔" : "✘"} ${pad(x.id, 5)} ${pad(x.nome, 72)} ${info}`);
  for (const p of x.problemas) console.log(`        ↳ ${p}`);
}
console.log(`\n${resultados.length - falhas} de ${resultados.length} cenários aprovados${falhas ? ` — ${falhas} FALHA(S)` : ""}.\n`);
if (process.argv.includes("--json")) require("fs").writeFileSync(process.argv[process.argv.indexOf("--json") + 1], JSON.stringify(resultados, null, 1));
process.exit(falhas ? 1 : 0);
