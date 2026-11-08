/* COORDIX · compara o leitor IFC antigo (web-ifc 0.0.39) com o novo (0.0.78) nos mesmos arquivos.
 * Uso:  node testes/comparar-leitores.js [arquivos.ifc ...]   (padrão: exemplos/ e testes/ifc-carga/)
 * Para cada arquivo: abre com cada versão (com as mesmas opções que o app usa), gera a geometria de todos
 * os elementos, aplica a transformação em Float64 e compara, por elemento (ID STEP), a caixa envolvente
 * no mundo e o número de triângulos. Mede também tempo e erros ("Aborted()").
 * Precisa: npm install (pacotes web-ifc e web-ifc-0039). Grava testes/comparar-leitores.json. */
"use strict";
const fs = require("fs");
const path = require("path");

const LEITORES = [
  { nome: "0.0.39", mod: "web-ifc-0039", opcoes: { COORDINATE_TO_ORIGIN: false, USE_FAST_BOOLS: true } },
  { nome: "0.0.78", mod: "web-ifc", opcoes: { COORDINATE_TO_ORIGIN: false, CIRCLE_SEGMENTS: 24 } },
];

function arquivosPadrao() {
  const raiz = path.resolve(__dirname, "..");
  const lista = [];
  for (const d of ["exemplos", "testes/ifc-carga"]) {
    const p = path.join(raiz, d);
    if (fs.existsSync(p)) for (const f of fs.readdirSync(p).sort()) if (/\.ifc$/i.test(f)) lista.push(path.join(p, f));
  }
  return lista;
}

async function ler(leitor, arquivo) {
  const W = require(leitor.mod);
  const api = new W.IfcAPI();
  await api.Init();
  const bytes = new Uint8Array(fs.readFileSync(arquivo));
  const t0 = process.hrtime.bigint();
  const el = new Map(); // expressID → {box:[6], tri}
  let mid = -1, erro = null, malhas = 0;
  try {
    mid = api.OpenModel(bytes, leitor.opcoes);
    if (mid < 0) throw new Error("OpenModel devolveu " + mid);
    api.StreamAllMeshes(mid, (fm) => {
      const pgs = fm.geometries;
      for (let i = 0; i < pgs.size(); i++) {
        const pg = pgs.get(i);
        const g = api.GetGeometry(mid, pg.geometryExpressID);
        const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
        const ix = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
        const T = pg.flatTransformation; // 4×4, coluna principal (double)
        let r = el.get(fm.expressID);
        if (!r) { r = { box: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], tri: 0 }; el.set(fm.expressID, r); }
        for (let k = 0; k < v.length; k += 6) {
          const x = v[k], y = v[k + 1], z = v[k + 2];
          const X = T[0] * x + T[4] * y + T[8] * z + T[12], Y = T[1] * x + T[5] * y + T[9] * z + T[13], Z = T[2] * x + T[6] * y + T[10] * z + T[14];
          if (X < r.box[0]) r.box[0] = X; if (Y < r.box[1]) r.box[1] = Y; if (Z < r.box[2]) r.box[2] = Z;
          if (X > r.box[3]) r.box[3] = X; if (Y > r.box[4]) r.box[4] = Y; if (Z > r.box[5]) r.box[5] = Z;
        }
        r.tri += ix.length / 3; malhas++;
        if (g.delete) g.delete();
      }
    });
  } catch (e) { erro = String((e && e.message) || e); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  let schema = null;
  try { if (mid >= 0) schema = api.GetModelSchema ? api.GetModelSchema(mid) : null; } catch {}
  try { if (mid >= 0) api.CloseModel(mid); } catch {}
  return { el, erro, ms, malhas, schema };
}

const diag = (b) => Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]);

(async () => {
  const arquivos = process.argv.slice(2).length ? process.argv.slice(2) : arquivosPadrao();
  const relatorio = { arquivos: [] };
  for (const arq of arquivos) {
    const [a, b] = [await ler(LEITORES[0], arq), await ler(LEITORES[1], arq)];
    const comuns = [...a.el.keys()].filter((k) => b.el.has(k));
    let max = 0, acima1mm = 0, acima10mm = 0, triA = 0, triB = 0, inchados = [];
    for (const k of comuns) {
      const A = a.el.get(k), B = b.el.get(k);
      const d = Math.max(...A.box.map((v, i) => Math.abs(v - B.box[i])));
      if (d > max) max = d;
      if (d > 0.001) acima1mm++;
      if (d > 0.01) acima10mm++;
      // "estilhaço": a caixa do leitor antigo é muito maior que a do novo (triângulos espúrios)
      const da = diag(A.box), db = diag(B.box);
      if (db > 0 && da > 2 * db + 0.05) inchados.push({ id: k, diagonal_0039_m: +da.toFixed(3), diagonal_0078_m: +db.toFixed(3) });
    }
    for (const r of a.el.values()) triA += r.tri;
    for (const r of b.el.values()) triB += r.tri;
    const linha = {
      arquivo: path.basename(arq), tamanho_kb: Math.round(fs.statSync(arq).size / 1024),
      "0.0.39": { erro: a.erro, elementos: a.el.size, triangulos: triA, ms: Math.round(a.ms) },
      "0.0.78": { erro: b.erro, elementos: b.el.size, triangulos: triB, ms: Math.round(b.ms) },
      elementos_comuns: comuns.length, so_0039: a.el.size - comuns.length, so_0078: b.el.size - comuns.length,
      dif_max_caixa_mm: +(max * 1000).toFixed(3), elementos_dif_acima_1mm: acima1mm, elementos_dif_acima_10mm: acima10mm,
      estilhacos_corrigidos: inchados.length, exemplos_estilhacos: inchados.slice(0, 5),
    };
    relatorio.arquivos.push(linha);
    console.log(`${linha.arquivo} (${linha.tamanho_kb} kB)\n  0.0.39: ${a.erro ? "ERRO " + a.erro : `${a.el.size} elementos, ${triA} triângulos, ${Math.round(a.ms)} ms`}\n  0.0.78: ${b.erro ? "ERRO " + b.erro : `${b.el.size} elementos, ${triB} triângulos, ${Math.round(b.ms)} ms`}\n  caixas: ${comuns.length} comuns · maior diferença ${linha.dif_max_caixa_mm} mm · >1 mm: ${acima1mm} · >10 mm: ${acima10mm} · estilhaços corrigidos: ${inchados.length}`);
  }
  const saida = path.join(__dirname, "comparar-leitores.json");
  fs.writeFileSync(saida, JSON.stringify(relatorio, null, 1));
  const falhasNovo = relatorio.arquivos.filter((x) => x["0.0.78"].erro || x["0.0.78"].elementos < x["0.0.39"].elementos);
  console.log(`\n${relatorio.arquivos.length} arquivos comparados. Novo leitor com erro ou com menos elementos: ${falhasNovo.length}.`);
  process.exit(falhasNovo.length ? 1 : 0);
})();
