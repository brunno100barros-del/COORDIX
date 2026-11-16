/* COORDIX · testes da camada comum de dados (coordix-dados.js). Uso: node testes/dados.test.js
 * Parte A: lógica pura com dados sintéticos (sempre roda).
 * Parte B: leitura real de testes/ifc-dados/DADOS-EST.ifc com o leitor web-ifc (roda quando o pacote web-ifc
 *          está instalado: npm install; no CI do Windows ele está). Valores esperados em esperado.json. */
"use strict";
const path = require("path"), fs = require("fs");
const D = require("../coordix-dados.js");
let falhas = 0, total = 0, pulados = 0;
function ok(nome, cond, det) { total++; if (!cond) falhas++; console.log(`${cond ? "✔" : "✘"} ${nome}${cond ? "" : "  → " + JSON.stringify(det)}`); }
const perto = (a, b, e = 1e-9) => typeof a === "number" && Math.abs(a - b) <= e * Math.max(1, Math.abs(b));

/* ---------------- Parte A: unidades ---------------- */
const SI = (UnitType, Prefix, Name) => ({ type: "IFCSIUNIT", UnitType, Prefix, Name });
const U = D.unidadesDoProjeto([SI("LENGTHUNIT", "MILLI", "METRE"), SI("AREAUNIT", "", "SQUARE_METRE"), SI("VOLUMEUNIT", "", "CUBIC_METRE"), SI("MASSUNIT", "KILO", "GRAM")]);
ok("mm → fator 0,001 (rótulo mm)", perto(U.comprimento.fator, 1e-3) && U.comprimento.rotulo === "mm", U.comprimento);
ok("m², m³ e kg reconhecidos", perto(U.area.fator, 1) && perto(U.volume.fator, 1) && perto(U.massa.fator, 1), U);
ok("mm² e cm³ com prefixo elevado à potência", perto(D.fatorUnidade(SI("AREAUNIT", "MILLI", "SQUARE_METRE")).fator, 1e-6) && perto(D.fatorUnidade(SI("VOLUMEUNIT", "CENTI", "CUBIC_METRE")).fator, 1e-6));
ok("grama sem prefixo = 0,001 kg", perto(D.fatorUnidade(SI("MASSUNIT", "", "GRAM")).fator, 1e-3));
const pe = { type: "IFCCONVERSIONBASEDUNIT", UnitType: "LENGTHUNIT", Name: "FOOT", ConversionFactor: { ValueComponent: 0.3048, UnitComponent: SI("LENGTHUNIT", "", "METRE") } };
ok("unidade convertida (pé = 0,3048 m)", perto(D.fatorUnidade(pe).fator, 0.3048) && D.unidadesDoProjeto([pe]).comprimento.rotulo === "FOOT");
const conflito = D.unidadesDoProjeto([SI("LENGTHUNIT", "MILLI", "METRE"), SI("LENGTHUNIT", "", "METRE")]);
ok("unidades conflitantes: nada é presumido", conflito.comprimento === null && conflito.conflitos.includes("comprimento"));
ok("sem unidade declarada: valor SI nulo com motivo", D.paraSI(10, "area", D.unidadesDoProjeto([])).si === null && /não declarada/.test(D.paraSI(10, "area", D.unidadesDoProjeto([])).motivo));
ok("contagem não depende de unidade", D.paraSI(3, "contagem", D.unidadesDoProjeto([])).si === 3);

/* ---------------- Parte A: leitura de conjuntos (linhas sintéticas no formato do leitor) ---------------- */
const fonteSint = { nomeTipo: (l) => l.__t, texto: (s) => s, unidade: () => null };
const v = (value, name) => (name ? { value, name } : { value });
const pset = { __t: "IFCPROPERTYSET", Name: v("Pset_WallCommon"), HasProperties: [
  { __t: "IFCPROPERTYSINGLEVALUE", Name: v("FireRating"), NominalValue: v("", "IFCLABEL") },
  { __t: "IFCPROPERTYSINGLEVALUE", Name: v("IsExternal"), NominalValue: v("T", "IFCBOOLEAN") },
  { __t: "IFCPROPERTYSINGLEVALUE", Name: v("Largura"), NominalValue: v(150, "IFCPOSITIVELENGTHMEASURE") },
  { __t: "IFCPROPERTYSINGLEVALUE", Name: v("SemValor"), NominalValue: null },
] };
const c = D.lerConjunto(pset, fonteSint, U);
const it = (n) => c.itens.find((i) => i.nome === n);
ok("propriedade com texto vazio é 'vazio' (não ausente)", it("FireRating").vazio === true);
ok("booleano IFC normalizado", it("IsExternal").valor === true);
ok("medida de comprimento convertida pelo projeto (150 mm → 0,15 m)", perto(it("Largura").si, 0.15) && it("Largura").grandeza === "comprimento", it("Largura"));
ok("propriedade sem valor nominal é vazia", it("SemValor").vazio === true);
const qto = { __t: "IFCELEMENTQUANTITY", Name: v("Qto_BeamBaseQuantities"), Quantities: [
  { __t: "IFCQUANTITYLENGTH", Name: v("Length"), LengthValue: v(5000) },
  { __t: "IFCQUANTITYVOLUME", Name: v("NetVolume"), VolumeValue: v(0.12) },
  { __t: "IFCPHYSICALCOMPLEXQUANTITY", Name: v("X") },
] };
const q = D.lerConjunto(qto, fonteSint, U);
ok("quantidade de comprimento: 5000 mm → 5 m", perto(q.itens[0].si, 5) && q.itens[0].grandeza === "comprimento");
ok("quantidade complexa fora do escopo (ignorada, não inventada)", q.itens.length === 2);

/* ---------------- Parte A: elemento × tipo, ausente × vazio ---------------- */
const reg = (conjuntos, extra = {}) => Object.assign({ conjuntos, materiais: [], classificacoes: [], materialOrigem: null }, extra);
const cj = (origem, nome, tipo, itens) => ({ origem, nome, tipo, itens });
const qi = (nome, grandeza, valor, si) => ({ nome, grandeza, valor, si, vazio: false, quantidade: true });
const R1 = reg([cj("elemento", "Qto_X", "qto", [qi("NetVolume", "volume", 0.09, 0.09)]), cj("tipo", "Qto_X", "qto", [qi("NetVolume", "volume", 0.1, 0.1)])]);
const r1 = D.quantidade(R1, "NetVolume");
ok("ocorrência prevalece sobre o tipo e a divergência é sinalizada", perto(r1.si, 0.09) && r1.origem === "elemento" && r1.divergeTipo === true && perto(r1.valorTipo, 0.1), r1);
const R2 = reg([cj("tipo", "Qto_X", "qto", [qi("NetVolume", "volume", 0.2, 0.2)])]);
ok("sem declaração na ocorrência: usa o tipo e marca a origem", D.quantidade(R2, "NetVolume").origem === "tipo");
ok("quantidade inexistente é 'ausente'", D.quantidade(R2, "GrossArea").estado === "ausente");
const R3 = reg([cj("elemento", "Qto_A", "qto", [qi("NetVolume", "volume", 1, 1)]), cj("elemento", "Qto_B", "qto", [qi("NetVolume", "volume", 2, 2)])]);
ok("duas declarações diferentes na ocorrência: conflito sinalizado, nunca somado", !!D.quantidade(R3, "NetVolume").conflito && perto(D.quantidade(R3, "NetVolume").si, 1));
const R4 = reg([cj("elemento", "P", "pset", [{ nome: "A", valor: "", vazio: true }]), cj("tipo", "P", "pset", [{ nome: "A", valor: "x", vazio: false }])]);
ok("propriedade vazia na ocorrência não é preenchida pelo tipo (o vazio é informado)", D.propriedade(R4, "P", "A").estado === "vazio");
ok("propriedade inexistente é 'ausente'", D.propriedade(R4, "P", "Z").estado === "ausente");

/* ---------------- Parte A: consulta e medição ---------------- */
const B = new Map();
const mk = (id, campos, conjuntos, extra) => { const r = reg(conjuntos, Object.assign({ idx: id, eid: id, modelo: "m1" }, extra)); B.set(r, campos); return r; };
const basico = (r, c) => (c === "arquivo" ? "EST.ifc" : B.get(r)[c] == null ? null : B.get(r)[c]);
const vol = (x) => [cj("elemento", "Qto", "qto", [qi("NetVolume", "volume", x, x)])];
const regs = [
  mk(1, { classe: "IFCBEAM", pavimento: "TÉRREO", guid: "g1" }, vol(0.12)),
  mk(2, { classe: "IFCBEAM", pavimento: "1º PAV", guid: "g2" }, vol(0.2)),
  mk(3, { classe: "IFCELEMENTASSEMBLY", pavimento: "TÉRREO", guid: "g3" }, vol(1.0), { temPartes: true }),
  mk(4, { classe: "IFCMEMBER", pavimento: "TÉRREO", guid: "g4" }, vol(0.3), { pai: 3 }),
  mk(5, { classe: "IFCMEMBER", pavimento: "TÉRREO", guid: "g5" }, vol(0.3), { pai: 3 }),
  mk(6, { classe: "IFCBEAM", pavimento: "TÉRREO", guid: "g1" }, vol(0.12)), // mesmo GUID de outro modelo
  mk(7, { classe: "IFCWALL", pavimento: "TÉRREO", guid: "g7" }, [cj("elemento", "Qto", "qto", [qi("NetSideArea", "area", 10, 10)])]),
  mk(8, { classe: "IFCSLAB", pavimento: "TÉRREO", guid: "g8" }, [cj("elemento", "Qto", "qto", [qi("NetVolume", "volume", 5, null)])]),
];
const r = D.consultar(regs, { filtros: [{ campo: "classe", op: "=", valor: "IFCBEAM" }], medida: { campo: "qto:NetVolume" } }, basico);
ok("contagem por classe", r.itens.length === 3 && r.consultados === 8);
ok("GUID duplicado não é somado duas vezes e é informado", perto(r.medida.total, 0.32) && r.medida.conflitos.some((x) => x.tipo === "guid-duplicado"), r.medida);
const tudo = D.consultar(regs, { medida: { campo: "qto:NetVolume" } }, basico).medida;
ok("montagem não somada quando as partes têm o dado (soma = partes)", tudo.partesDeMontagem.length === 1 && perto(tudo.total, 0.12 + 0.2 + 0.3 + 0.3), tudo);
ok("valor sem unidade conversível fica fora do total e é listado", tudo.semSI.length === 1 && tudo.semValor.length === 1);
const pav = D.consultar(regs, { filtros: [{ campo: "pavimento", op: "=", valor: "térreo" }, { campo: "classe", op: "=", valor: "IFCBEAM" }] }, basico);
ok("filtros combinados (pavimento + classe, sem diferenciar maiúsculas)", pav.itens.length === 2);
const g = D.consultar(regs, { agrupar: ["pavimento"], medida: { campo: "qto:NetVolume" } }, basico);
ok("agrupamento por pavimento com medida por grupo", g.grupos.length === 2 && g.grupos.find((x) => x.chave[0] === "1º PAV").medida.total === 0.2);
const tubos = [mk(20, { classe: "IFCPIPESEGMENT", guid: "t1" }, [cj("elemento", "Dim", "pset", [{ nome: "DN", valor: 150, si: 0.15, grandeza: "comprimento", vazio: false }])]),
  mk(21, { classe: "IFCPIPESEGMENT", guid: "t2" }, [cj("elemento", "Dim", "pset", [{ nome: "DN", valor: 75, si: 0.075, grandeza: "comprimento", vazio: false }])]),
  mk(22, { classe: "IFCPIPESEGMENT", guid: "t3" }, [])];
const t = D.consultar(tubos, { filtros: [{ campo: "pset:Dim.DN", op: ">", valor: 100, unidade: "mm" }] }, basico);
ok("comparação com unidade (DN > 100 mm) usa o valor convertido", t.itens.length === 1 && basico(t.itens[0], "guid") === "t1");
ok("elemento sem a propriedade não entra em comparação numérica", D.consultar(tubos, { filtros: [{ campo: "pset:Dim.DN", op: "<", valor: 1000, unidade: "mm" }] }, basico).itens.length === 2);
ok("operador 'ausente'", D.consultar(tubos, { filtros: [{ campo: "pset:Dim.DN", op: "ausente" }] }, basico).itens.length === 1);
ok("propriedade pelo nome em qualquer conjunto", D.consultar(tubos, { filtros: [{ campo: "pset:DN", op: "existe" }] }, basico).itens.length === 2);
const mista = D.medir([regs[0], regs[6]], "qto:NetVolume", basico);
ok("grandezas diferentes nunca são somadas", mista.comValor.length === 1);

/* ---------------- Parte B: IFC real com o leitor web-ifc ---------------- */
(async () => {
  let W = null;
  try { W = require("web-ifc"); } catch (e) { /* pacote ausente */ }
  if (!W && process.env.COORDIX_EXIGIR_LEITOR) { ok("leitor web-ifc disponível (exigido neste ambiente)", false); return fim(); }
  if (!W) { pulados++; console.log("– Parte B pulada: pacote web-ifc não instalado (roda no CI do Windows)."); return fim(); }
  const arq = path.join(__dirname, "ifc-dados", "DADOS-EST.ifc");
  const esp = JSON.parse(fs.readFileSync(path.join(__dirname, "ifc-dados", "esperado.json"), "utf8"));
  const api = new W.IfcAPI(); await api.Init();
  const mid = api.OpenModel(new Uint8Array(fs.readFileSync(arq)), { COORDINATE_TO_ORIGIN: false, CIRCLE_SEGMENTS: 24 });
  const TN = {}; for (const [k, x] of Object.entries(W)) if (/^IFC[A-Z0-9_]+$/.test(k) && typeof x === "number") TN[x] = k;
  const val = (a) => (a == null ? null : typeof a === "object" && "value" in a ? a.value : a);
  const vec = (x) => { const o = []; for (let i = 0; i < x.size(); i++) o.push(x.get(i)); return o; };
  const ids = (code) => vec(api.GetLineIDsWithType(mid, code));
  const line = (id) => api.GetLine(mid, id, false);
  const refs = (a) => (Array.isArray(a) ? a : a == null ? [] : [a]);
  // mesmas relações que o COORDIX indexa na carga (index.html, indexModel)
  const rel = { psetsOf: {}, typeOf: {}, materialOf: {}, classifOf: {}, aggParent: {} };
  for (const id of ids(W.IFCRELDEFINESBYPROPERTIES)) { const l = line(id); for (const r of refs(l.RelatedObjects)) (rel.psetsOf[val(r)] = rel.psetsOf[val(r)] || []).push(val(l.RelatingPropertyDefinition)); }
  for (const id of ids(W.IFCRELDEFINESBYTYPE)) { const l = line(id); for (const r of refs(l.RelatedObjects)) rel.typeOf[val(r)] = val(l.RelatingType); }
  for (const id of ids(W.IFCRELASSOCIATESMATERIAL)) { const l = line(id); for (const r of refs(l.RelatedObjects)) rel.materialOf[val(r)] = val(l.RelatingMaterial); }
  for (const id of ids(W.IFCRELASSOCIATESCLASSIFICATION)) { const l = line(id); for (const r of refs(l.RelatedObjects)) (rel.classifOf[val(r)] = rel.classifOf[val(r)] || []).push(val(l.RelatingClassification)); }
  for (const id of ids(W.IFCRELAGGREGATES)) { const l = line(id); for (const r of refs(l.RelatedObjects)) rel.aggParent[val(r)] = val(l.RelatingObject); }
  // unidades "planas" pelo VALOR dos campos, como no index.html
  const PREF = ["EXA", "PETA", "TERA", "GIGA", "MEGA", "KILO", "HECTO", "DECA", "DECI", "CENTI", "MILLI", "MICRO", "NANO", "PICO", "FEMTO", "ATTO"];
  const enums = (l) => Object.keys(l).filter((k) => k !== "type" && k !== "expressID").map((k) => val(l[k])).filter((x) => typeof x === "string");
  const plana = (id) => { const l = line(id); const e = enums(l); return { type: TN[l.type], UnitType: e.find((x) => /UNIT$/.test(x)), Prefix: e.find((x) => PREF.includes(x)) || "", Name: e.find((x) => !/UNIT$/.test(x) && !PREF.includes(x)) }; };
  const unidades = [];
  for (const pid of ids(W.IFCPROJECT)) { const ua = val(line(pid).UnitsInContext); for (const u of line(ua).Units || []) unidades.push(plana(val(u))); }
  const fonte = { linha: (id, flat) => api.GetLine(mid, id, !!flat), nomeTipo: (l) => TN[l && l.type] || "", texto: (s) => s, unidade: (id) => plana(id) };
  const ctx = Object.assign({ fonte, unidades: D.unidadesDoProjeto(unidades), cache: D.novoCache() }, rel);
  ok("IFC: unidades do projeto (mm, m², m³, kg)", ctx.unidades.comprimento.rotulo === "mm" && ctx.unidades.area.rotulo === "m²" && ctx.unidades.volume.rotulo === "m³" && ctx.unidades.massa.rotulo === "kg", ctx.unidades);
  // elementos por GUID
  const porGuid = {}, regs2 = [], info = new Map();
  for (const cls of ["IFCBEAM", "IFCCOLUMN", "IFCWALL", "IFCELEMENTASSEMBLY", "IFCMEMBER", "IFCPIPESEGMENT", "IFCCABLESEGMENT", "IFCSLAB"]) {
    for (const id of ids(W[cls])) {
      const l = line(id); const d = D.dadosDoElemento(ctx, id);
      const r = Object.assign({ idx: id, eid: id, modelo: "m", pai: null, temPartes: false }, d);
      porGuid[val(l.GlobalId)] = r; regs2.push(r); info.set(r, { classe: cls, guid: val(l.GlobalId) });
    }
  }
  const eids = new Set(regs2.map((r) => r.eid));
  for (const r of regs2) { const p = rel.aggParent[r.eid]; if (p != null && eids.has(p)) { r.pai = p; regs2.find((x) => x.eid === p).temPartes = true; } }
  const bas = (r, c) => (c === "arquivo" ? "DADOS-EST.ifc" : (info.get(r) || {})[c] == null ? null : info.get(r)[c]);
  const G = esp.guids, R = (k) => porGuid[G[k]];
  ok("IFC: 12 elementos lidos", regs2.length === 12, regs2.length);
  const qv1 = D.quantidade(R("V1"), "Length");
  ok("IFC: Length 5000 mm → 5 m (unidade do projeto)", perto(qv1.si, esp.comprimento_V1_m) && qv1.origem === "elemento", qv1);
  const qc1 = D.quantidade(R("C1"), "Length");
  ok("IFC: quantidade com unidade própria (2,5 m) respeitada", perto(qc1.si, esp.comprimento_C1_m), qc1);
  ok("IFC: área 12,5 m²", perto(D.quantidade(R("W1"), "NetSideArea").si, esp.area_W1_m2));
  ok("IFC: peso 250 kg", perto(D.quantidade(R("S1"), "GrossWeight").si, esp.massa_S1_kg));
  const qv2 = D.quantidade(R("V2"), "NetVolume");
  ok("IFC: volume declarado só no tipo → origem 'tipo'", perto(qv2.si, 0.2) && qv2.origem === "tipo", qv2);
  const qp1 = D.quantidade(R("P1"), "NetVolume");
  ok("IFC: divergência ocorrência × tipo detectada", qp1.divergeTipo === true && perto(qp1.si, 0.09), qp1);
  const m = D.medir(regs2, "qto:NetVolume", bas);
  ok("IFC: volume total sem dupla contagem (montagem fora, partes dentro)", perto(m.total, esp.netVolume_total_m3, 1e-9) && m.partesDeMontagem.length === 1 && bas(m.partesDeMontagem[0], "guid") === G.A1, { total: m.total, esperado: esp.netVolume_total_m3 });
  ok("IFC: origem dos valores somados (4 elemento, 1 tipo)", m.porOrigem.elemento === esp.netVolume_origem.elemento && m.porOrigem.tipo === esp.netVolume_origem.tipo, m.porOrigem);
  ok("IFC: material da ocorrência (direto)", JSON.stringify(R("V1").materiais) === JSON.stringify(esp.material.V1) && R("V1").materialOrigem === "elemento");
  ok("IFC: material herdado do tipo", JSON.stringify(R("V2").materiais) === JSON.stringify(esp.material.V2) && R("V2").materialOrigem === "tipo", [R("V2").materiais, R("V2").materialOrigem]);
  ok("IFC: material por conjunto de camadas", JSON.stringify(R("P1").materiais) === JSON.stringify(esp.material.P1), R("P1").materiais);
  ok("IFC: elemento sem material = lista vazia (ausente, não inventado)", R("W2").materiais.length === 0 && R("W2").materialOrigem === null);
  const cl = R("W1").classificacoes[0] || {};
  ok("IFC: classificação (sistema, código, nome)", cl.sistema === esp.classificacao_W1.sistema && cl.codigo === esp.classificacao_W1.codigo && cl.nome === esp.classificacao_W1.nome, cl);
  const fr = D.propriedade(R("W1"), "Pset_WallCommon", "FireRating");
  ok("IFC: propriedade de texto vazio → 'vazio'", fr.estado === "vazio", fr);
  ok("IFC: booleano IFC lido como verdadeiro", D.propriedade(R("W1"), "Pset_WallCommon", "IsExternal").valor === true, D.propriedade(R("W1"), "Pset_WallCommon", "IsExternal"));
  ok("IFC: propriedade inexistente → 'ausente'", D.propriedade(R("W2"), "Pset_WallCommon", "FireRating").estado === "ausente");
  const dn = D.propriedade(R("T1"), "Dimensões", "DiametroNominal");
  ok("IFC: tipo de medida informado pelo leitor (comprimento) e convertido", dn.item && dn.item.grandeza === "comprimento" && perto(dn.item.si, 0.15), dn.item);
  const tb = D.consultar(regs2, { filtros: [{ campo: "classe", op: "=", valor: "IFCPIPESEGMENT" }, { campo: "pset:Dimensões.DiametroNominal", op: ">", valor: 100, unidade: "mm" }] }, bas);
  ok("IFC: 'tubulações com diâmetro > 100 mm' → só T1", tb.itens.length === 1 && bas(tb.itens[0], "guid") === G.T1, tb.itens.map((x) => bas(x, "guid")));
  api.CloseModel(mid);
  fim();
})().catch((e) => { console.error(e); process.exit(1); });

function fim() {
  console.log(`\n${total - falhas} de ${total} testes da camada de dados aprovados${pulados ? " (parte com o leitor IFC pulada neste ambiente)" : ""}.`);
  process.exit(falhas ? 1 : 0);
}
