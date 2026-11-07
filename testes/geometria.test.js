/* COORDIX · suíte de testes do núcleo geométrico (Fase 01)
 * Executar:  node testes/geometria.test.js
 * Cada cenário define o resultado esperado (estado e valores) e valida o obtido.
 * Sai com código 1 se algum cenário falhar. */
"use strict";
const G = require("../coordix-geometria.js");
const F = require("./formas.js");
const { STATE: S } = G;

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
      if (!(mm(r.lb) <= e + 1e-6 && e <= mm(r.ub) + 1e-6)) problemas.push(`espessura exata ${e} mm fora de [${mm(r.lb).toFixed(3)}, ${mm(r.ub).toFixed(3)}]`);
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
  resultados.push({ id, nome, ok, problemas, ms, esperado, r: r && { state: r.state, value: mm(r.value), lb: mm(r.lb), ub: mm(r.ub), volume: r.volume, quality: r.quality, flags: r.flags, stats: r.stats } });
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
  { estado: S.INCONCLUSIVO, flags: ["superficie_sem_volume_A", "profundidade_indeterminada"] });

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
verificar("R11", "Unidades: milímetros convertidos, metros preservados, prefixo desconhecido sinalizado", () => {
  const a = G.unitScaleFor("MILLI", 25000), b = G.unitScaleFor("MILLI", 25), c = G.unitScaleFor("", 30), d = G.unitScaleFor("XYZ", 30);
  const ok = a.scale === 0.001 && !a.assumed && b.scale === 1 && b.assumed && c.scale === 1 && d.unknown;
  return { ok, detalhe: JSON.stringify({ a, b, c, d }) };
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

/* ---------------- relatório ---------------- */
const pad = (s, n) => (String(s) + " ".repeat(n)).slice(0, n);
console.log("\nCOORDIX · testes do núcleo geométrico\n");
for (const x of resultados) {
  const r = x.r;
  const info = r ? `${pad(r.state, 18)} t=${r.value == null ? "—" : r.value.toFixed(3)} mm` + (r.lb != null && r.kind !== "clearance" ? ` [${r.lb.toFixed(3)}; ${r.ub.toFixed(3)}]` : "") +
    (r.volume ? ` V=[${r.volume.vmin.toExponential(3)}; ${r.volume.vmax.toExponential(3)}] m³` : "") + (r.quality !== "exata" ? " (aprox.)" : "") + ` ${x.ms.toFixed(1)} ms` : x.detalhe;
  console.log(`${x.ok ? "✔" : "✘"} ${pad(x.id, 5)} ${pad(x.nome, 72)} ${info}`);
  for (const p of x.problemas) console.log(`        ↳ ${p}`);
}
console.log(`\n${resultados.length - falhas} de ${resultados.length} cenários aprovados${falhas ? ` — ${falhas} FALHA(S)` : ""}.\n`);
if (process.argv.includes("--json")) require("fs").writeFileSync(process.argv[process.argv.indexOf("--json") + 1], JSON.stringify(resultados, null, 1));
process.exit(falhas ? 1 : 0);
