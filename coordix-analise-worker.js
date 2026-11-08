/* COORDIX · análise geométrica em segundo plano (Web Worker).
 *
 * Executa SOMENTE a avaliação dos pares (CoordixGeo.evaluatePair), com o mesmo núcleo
 * coordix-geometria.js e as mesmas opções que a análise usava na linha principal. A seleção dos
 * pares, a consolidação, a pré-classificação e tudo o que depende da interface continuam no app.
 *
 * Mensagens recebidas:
 *   {tipo:"malhas", itens:[{idx, geoms:[{p64,i}], incomplete}]}   geometria dos elementos (Float64)
 *   {tipo:"descartar", idx:[...]}                                    libera malhas de modelos removidos
 *   {tipo:"avaliar", execucao, pares:[{a, b, kind, tol}]}           pares na ordem da análise
 * Mensagens enviadas:
 *   {tipo:"progresso", execucao, etapa, feitos, total}
 *   {tipo:"resultado", execucao, resultados:[r | {erro}], topologias:{idx: topologia}}
 *   {tipo:"falha", execucao, mensagem}
 * O cancelamento é feito pelo app encerrando o worker (terminate): nenhum resultado parcial é aplicado. */
"use strict";
importScripts("coordix-geometria.js");
const G = self.CoordixGeo;
const malhas = new Map(); // idx → {geoms, incomplete, solid}

function solido(idx) {
  const m = malhas.get(idx);
  if (!m) throw new Error("malha do elemento " + idx + " não recebida");
  if (!m.solid) m.solid = G.prepareMesh(m.geoms, { incomplete: m.incomplete });
  return m.solid;
}

self.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.tipo === "malhas") {
    for (const it of msg.itens) malhas.set(it.idx, { geoms: it.geoms, incomplete: it.incomplete, solid: null });
    return;
  }
  if (msg.tipo === "descartar") { for (const i of msg.idx) malhas.delete(i); return; }
  if (msg.tipo !== "avaliar") return;
  const { execucao, pares } = msg;
  try {
    let ultimo = 0;
    const avisar = (etapa, feitos, total, forcar) => {
      const agora = Date.now();
      if (forcar || agora - ultimo > 120) { ultimo = agora; self.postMessage({ tipo: "progresso", execucao, etapa, feitos, total }); }
    };
    // 1. preparo das malhas (topologia, BVH sob demanda) dos elementos que aparecem nos pares
    const usados = [];
    const vistos = new Set();
    for (const p of pares) for (const i of [p.a, p.b]) if (!vistos.has(i)) { vistos.add(i); usados.push(i); }
    const topologias = {};
    for (let k = 0; k < usados.length; k++) {
      avisar("malhas", k, usados.length, k === 0);
      try { topologias[usados[k]] = solido(usados[k]).topology; } catch (e) { topologias[usados[k]] = null; }
    }
    avisar("malhas", usados.length, usados.length, true);
    // 2. avaliação dos pares, na mesma ordem e com as mesmas opções da análise original
    const resultados = new Array(pares.length);
    for (let k = 0; k < pares.length; k++) {
      avisar("pares", k, pares.length, k === 0);
      const p = pares[k];
      try { resultados[k] = G.evaluatePair(solido(p.a), solido(p.b), { kind: p.kind, tol: p.tol, volume: false }); }
      catch (e) { resultados[k] = { erro: String((e && e.message) || e) }; }
    }
    avisar("pares", pares.length, pares.length, true);
    self.postMessage({ tipo: "resultado", execucao, resultados, topologias });
  } catch (e) {
    self.postMessage({ tipo: "falha", execucao, mensagem: String((e && e.message) || e) });
  }
};
