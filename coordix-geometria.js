/* =====================================================================
 * COORDIX · núcleo geométrico (Fase 01 — confiabilidade)
 * ---------------------------------------------------------------------
 * Módulo sem dependências, usado pelo app (navegador, global CoordixGeo)
 * e pela suíte de testes (Node, require).
 *
 * Unidades: METROS em todo o núcleo. Coordenadas em precisão dupla
 * (Float64), relativas à origem comum do projeto.
 *
 * Organização (preparada para a Fase 02 — BVH / índices espaciais):
 *   GEO / LIMITS ........ tolerâncias e limites centralizados
 *   STATE ............... estados de confiabilidade de um par
 *   prepareMesh ......... malha preparada (triângulos, caixas, topologia)
 *   Caixas .............. overlapBox, boxDist2
 *   Consultas de malha .. trianglesInBox, unsignedDistance, windingNumber
 *                         (varredura linear; a Fase 02 troca por BVH sem
 *                          mudar as assinaturas)
 *   Interseções ......... triTriIntersect, contactSearch
 *   Distâncias .......... ptTriDist2, segSegDist2, triTriDist, minDistance
 *   Métricas ............ depthBound (espessura de interferência),
 *                         intersectionVolume
 *   Avaliação ........... evaluatePair → {state, value, lb, ub, ...}
 *   Transformações IFC .. transformVertexData, unitScaleFor
 * ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CoordixGeo = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Parâmetros geométricos (metros)                                      */
  /* ------------------------------------------------------------------ */
  const GEO = {
    EPS_LEN: 1e-6,      // 0,001 mm — zero numérico de comprimento (sinal em relação a um plano, coplanaridade)
    WELD: 1e-5,         // 0,01 mm  — fusão de vértices coincidentes para análise de topologia
    CONTACT: 1e-4,      // 0,1 mm   — espessura de interferência abaixo da qual há apenas CONTATO
    DEPTH_ABS: 2.5e-4,  // 0,25 mm  — precisão alvo do raio (espessura ± 0,5 mm)
    DEPTH_REL: 0.01,    // 1 %      — precisão relativa alvo da espessura
    WIND_AMBIG: 0.1,    // número de voltas entre 0,1 e 0,9 = classificação dentro/fora ambígua
    PROBE_DEPTHS: [5e-4, 1e-4], // 0,5 e 0,1 mm — recuos dos pontos de prova para dentro das faces (teste de contenção)
    CONVEX_EPS: 1e-5,   // 0,01 mm  — tolerância do teste de convexidade (vértices gravados em Float32 pelo leitor)
    FAR_COORD: 5000,    // m — acima disso a visualização (Float32) perde precisão; a análise usa Float64
    LIMITS: {
      BB_EVALS: 8000,   // avaliações do ramo-e-limite para DECIDIR em relação à tolerância, por par
      BB_REFINE: 1500,  // avaliações extras para estreitar o intervalo da espessura depois de decidido
      VOL_EVALS: 4000,  // avaliações do cálculo de volume por par
      TRI_PAIRS: 2e6,   // pares de triângulos na busca de contato/cruzamento por par
      DIST_PAIRS: 2e6,  // pares de triângulos no cálculo de distância mínima por par
      PROBES: 20000,    // pontos de prova de contenção por par
    },
  };

  const STATE = {
    CONFIRMADO: "confirmado",          // conflito confirmado (acima da tolerância / folga violada)
    ABAIXO_TOL: "abaixo_tolerancia",   // interferência existe, mas comprovadamente ≤ tolerância
    CONTATO: "contato",                // superfícies se tocam, sem penetração (≤ GEO.CONTACT)
    SEM_CONFLITO: "sem_conflito",      // ausência de conflito confirmada
    INCONCLUSIVO: "inconclusivo",      // métodos divergem ou dados insuficientes para decidir
    INCOMPLETO: "incompleto",          // limite de processamento atingido ou falha geométrica
  };

  /* ------------------------------------------------------------------ */
  /* Malha preparada                                                      */
  /* ------------------------------------------------------------------ */
  /**
   * geoms: [{p64|p: posições xyz (m), i: índices}]  — várias geometrias por elemento.
   * Retorna triângulos válidos (Float64), caixa de cada triângulo, caixa geral e
   * diagnóstico de topologia: fechada (toda aresta usada por nº par de faces),
   * orientada (cada aresta percorrida nos dois sentidos), sinal de orientação e volume.
   */
  function prepareMesh(geoms) {
    let nIn = 0;
    for (const g of geoms) nIn += Math.floor(g.i.length / 3);
    const tris = new Float64Array(nIn * 9), tb = new Float64Array(nIn * 6);
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const q = 1 / GEO.WELD;
    const vmap = new Map(); let nv = 0;
    const vid = (x, y, z) => {
      const k = Math.round(x * q) + "," + Math.round(y * q) + "," + Math.round(z * q);
      let id = vmap.get(k); if (id === undefined) { id = nv++; vmap.set(k, id); } return id;
    };
    const edges = new Map(); // chave a*2^26+b (a<b) → [a→b, b→a]
    const addEdge = (a, b) => {
      if (a === b) return;
      const lo = a < b ? a : b, hi = a < b ? b : a, key = lo * 67108864 + hi;
      let e = edges.get(key); if (!e) { e = [0, 0]; edges.set(key, e); }
      if (a < b) e[0]++; else e[1]++;
    };
    let n = 0, degenerate = 0, vol6 = 0, ox = null, oy = 0, oz = 0;
    for (const g of geoms) {
      const P = g.p64 || g.p, I = g.i;
      for (let k = 0; k + 2 < I.length; k += 3) {
        const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
        const ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[b], by = P[b + 1], bz = P[b + 2], cx = P[c], cy = P[c + 1], cz = P[c + 2];
        if (!(isFinite(ax + ay + az + bx + by + bz + cx + cy + cz))) { degenerate++; continue; }
        const ia = vid(ax, ay, az), ib = vid(bx, by, bz), ic = vid(cx, cy, cz);
        addEdge(ia, ib); addEdge(ib, ic); addEdge(ic, ia);
        const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const nl = Math.hypot(nx, ny, nz);
        const e2 = Math.max(ux * ux + uy * uy + uz * uz, wx * wx + wy * wy + wz * wz, (cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2);
        // degenerado: área nula ou altura < EPS_LEN (agulha/colinear)
        if (nl <= 0 || nl / Math.sqrt(e2) < GEO.EPS_LEN) { degenerate++; continue; }
        if (ox === null) { ox = ax; oy = ay; oz = az; }
        const Ax = ax - ox, Ay = ay - oy, Az = az - oz, Bx = bx - ox, By = by - oy, Bz = bz - oz, Cx = cx - ox, Cy = cy - oy, Cz = cz - oz;
        vol6 += Ax * (By * Cz - Bz * Cy) - Ay * (Bx * Cz - Bz * Cx) + Az * (Bx * Cy - By * Cx);
        const o = n * 9;
        tris[o] = ax; tris[o + 1] = ay; tris[o + 2] = az; tris[o + 3] = bx; tris[o + 4] = by; tris[o + 5] = bz; tris[o + 6] = cx; tris[o + 7] = cy; tris[o + 8] = cz;
        const t = n * 6;
        tb[t] = Math.min(ax, bx, cx); tb[t + 1] = Math.min(ay, by, cy); tb[t + 2] = Math.min(az, bz, cz);
        tb[t + 3] = Math.max(ax, bx, cx); tb[t + 4] = Math.max(ay, by, cy); tb[t + 5] = Math.max(az, bz, cz);
        for (let d = 0; d < 3; d++) { if (tb[t + d] < box[d]) box[d] = tb[t + d]; if (tb[t + 3 + d] > box[3 + d]) box[3 + d] = tb[t + 3 + d]; }
        n++;
      }
    }
    let closed = edges.size > 0, oriented = true, manifold = true;
    for (const e of edges.values()) {
      const tot = e[0] + e[1];
      if (tot % 2 !== 0) closed = false;
      if (tot !== 2) manifold = false;
      if (e[0] !== e[1]) oriented = false;
    }
    if (!closed) oriented = false;
    const volume = Math.abs(vol6) / 6;
    // casca com volume desprezível (superfície): sem interior confiável
    const span = n ? Math.max(box[3] - box[0], box[4] - box[1], box[5] - box[2]) : 0;
    const surfaceOnly = n > 0 && volume <= GEO.EPS_LEN * span * span;
    return {
      tris: tris.subarray(0, n * 9), tb: tb.subarray(0, n * 6), n, nInput: nIn, degenerate,
      closed, manifold, oriented, orientSign: vol6 >= 0 ? 1 : -1, volume, surfaceOnly,
      box: n ? box : null,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Caixas                                                               */
  /* ------------------------------------------------------------------ */
  function overlapBox(a, b, pad) {
    if (!a || !b) return null;
    const r = [Math.max(a[0], b[0]) - pad, Math.max(a[1], b[1]) - pad, Math.max(a[2], b[2]) - pad,
               Math.min(a[3], b[3]) + pad, Math.min(a[4], b[4]) + pad, Math.min(a[5], b[5]) + pad];
    return (r[0] <= r[3] && r[1] <= r[4] && r[2] <= r[5]) ? r : null;
  }
  function boxDist2(a, b) { // distância² entre duas caixas (0 se tocam)
    let s = 0;
    for (let d = 0; d < 3; d++) { const g = Math.max(0, a[d] - b[d + 3], b[d] - a[d + 3]); s += g * g; }
    return s;
  }
  function triBoxDist2(tb, t, B) {
    let s = 0;
    for (let d = 0; d < 3; d++) { const g = Math.max(0, tb[t + d] - B[d + 3], B[d] - tb[t + 3 + d]); s += g * g; }
    return s;
  }
  function pointBoxDist2(tb, t, x, y, z) {
    const gx = Math.max(0, tb[t] - x, x - tb[t + 3]), gy = Math.max(0, tb[t + 1] - y, y - tb[t + 4]), gz = Math.max(0, tb[t + 2] - z, z - tb[t + 5]);
    return gx * gx + gy * gy + gz * gz;
  }

  /* ------------------------------------------------------------------ */
  /* Consultas de malha (varredura linear — substituíveis por BVH)        */
  /* ------------------------------------------------------------------ */
  function trianglesInBox(mesh, B) {
    const out = [];
    const tb = mesh.tb;
    for (let i = 0; i < mesh.n; i++) {
      const t = i * 6;
      if (tb[t + 3] < B[0] || tb[t] > B[3] || tb[t + 4] < B[1] || tb[t + 1] > B[4] || tb[t + 5] < B[2] || tb[t + 2] > B[5]) continue;
      out.push(i);
    }
    return out;
  }

  /** Distância² de p ao triângulo (Ericson, Real-Time Collision Detection §5.1.5). */
  function ptTriDist2(px, py, pz, T, o) {
    const ax = T[o], ay = T[o + 1], az = T[o + 2], bx = T[o + 3], by = T[o + 4], bz = T[o + 5], cx = T[o + 6], cy = T[o + 7], cz = T[o + 8];
    const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    let rx, ry, rz;
    if (d1 <= 0 && d2 <= 0) { rx = ax; ry = ay; rz = az; }
    else {
      const bpx = px - bx, bpy = py - by, bpz = pz - bz;
      const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
      if (d3 >= 0 && d4 <= d3) { rx = bx; ry = by; rz = bz; }
      else {
        const vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); rx = ax + v * abx; ry = ay + v * aby; rz = az + v * abz; }
        else {
          const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
          const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
          if (d6 >= 0 && d5 <= d6) { rx = cx; ry = cy; rz = cz; }
          else {
            const vb = d5 * d2 - d1 * d6;
            if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); rx = ax + w * acx; ry = ay + w * acy; rz = az + w * acz; }
            else {
              const va = d3 * d6 - d5 * d4;
              if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); rx = bx + w * (cx - bx); ry = by + w * (cy - by); rz = bz + w * (cz - bz); }
              else { const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; rx = ax + abx * v + acx * w; ry = ay + aby * v + acy * w; rz = az + abz * v + acz * w; }
            }
          }
        }
      }
    }
    return (px - rx) ** 2 + (py - ry) ** 2 + (pz - rz) ** 2;
  }

  /** Distância (sem sinal) de p à superfície da malha. Exata (todas as faces, com poda por caixa). */
  function unsignedDistance(mesh, x, y, z) {
    const T = mesh.tris, tb = mesh.tb; let best = Infinity;
    for (let i = 0; i < mesh.n; i++) {
      if (pointBoxDist2(tb, i * 6, x, y, z) >= best) continue;
      const d = ptTriDist2(x, y, z, T, i * 9); if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /**
   * Número de voltas generalizado (Jacobson et al., 2013): soma dos ângulos sólidos
   * (fórmula de Van Oosterom–Strackee) / 4π. Vale 1 dentro e 0 fora de uma malha fechada
   * e orientada, sem as degenerescências do teste de paridade por raio (raio passando por
   * aresta ou vértice). Em malhas abertas fica fracionário perto das falhas.
   */
  function windingNumber(mesh, x, y, z) {
    const T = mesh.tris; let sum = 0;
    for (let o = 0; o < mesh.n * 9; o += 9) {
      const ax = T[o] - x, ay = T[o + 1] - y, az = T[o + 2] - z;
      const bx = T[o + 3] - x, by = T[o + 4] - y, bz = T[o + 5] - z;
      const cx = T[o + 6] - x, cy = T[o + 7] - y, cz = T[o + 8] - z;
      const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
      const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
      const den = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (ax * cx + ay * cy + az * cz) * lb + (bx * cx + by * cy + bz * cz) * la;
      sum += Math.atan2(det, den);
    }
    return mesh.orientSign * sum / (2 * Math.PI);
  }

  /** Distância com sinal (positiva dentro). ctx acumula classificações ambíguas. */
  function signedDistance(mesh, x, y, z, ctx) {
    const d = unsignedDistance(mesh, x, y, z);
    if (d <= GEO.EPS_LEN) return 0;
    const w = windingNumber(mesh, x, y, z);
    if (ctx && w > GEO.WIND_AMBIG && w < 1 - GEO.WIND_AMBIG) ctx.ambiguous++;
    return w >= 0.5 ? d : -d;
  }

  /* ------------------------------------------------------------------ */
  /* Interseção triângulo × triângulo                                     */
  /* ------------------------------------------------------------------ */
  const NONE = 0, TOUCH = 1, CROSS = 2;
  function sgn(v) { return v > GEO.EPS_LEN ? 1 : v < -GEO.EPS_LEN ? -1 : 0; }
  function unitNormal(T, o) {
    const ux = T[o + 3] - T[o], uy = T[o + 4] - T[o + 1], uz = T[o + 5] - T[o + 2];
    const wx = T[o + 6] - T[o], wy = T[o + 7] - T[o + 1], wz = T[o + 8] - T[o + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz);
    return [nx / l, ny / l, nz / l];
  }
  // pontos do triângulo T sobre o plano (n, ponto q): interpolação nas arestas com troca estrita de sinal + vértices no plano
  function planeSection(T, o, d, s) {
    const pts = [];
    for (let k = 0; k < 3; k++) {
      const a = k, b = (k + 1) % 3;
      if (s[a] === 0) pts.push([T[o + a * 3], T[o + a * 3 + 1], T[o + a * 3 + 2]]);
      if (s[a] * s[b] < 0) {
        const t = d[a] / (d[a] - d[b]);
        pts.push([T[o + a * 3] + t * (T[o + b * 3] - T[o + a * 3]), T[o + a * 3 + 1] + t * (T[o + b * 3 + 1] - T[o + a * 3 + 1]), T[o + a * 3 + 2] + t * (T[o + b * 3 + 2] - T[o + a * 3 + 2])]);
      }
    }
    return pts;
  }
  function seg2Intersect(a, b, c, d, eps) { // segmentos 2D se tocam (inclui colineares sobrepostos)
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const on = (p, q, r) => Math.min(p[0], q[0]) - eps <= r[0] && r[0] <= Math.max(p[0], q[0]) + eps && Math.min(p[1], q[1]) - eps <= r[1] && r[1] <= Math.max(p[1], q[1]) + eps;
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, l2 = Math.hypot(d[0] - c[0], d[1] - c[1]) || 1;
    const o1 = o(a, b, c) / l1, o2 = o(a, b, d) / l1, o3 = o(c, d, a) / l2, o4 = o(c, d, b) / l2;
    const s1 = sgn(o1), s2 = sgn(o2), s3 = sgn(o3), s4 = sgn(o4);
    if (s1 * s2 < 0 && s3 * s4 < 0) return true;
    if (s1 === 0 && on(a, b, c)) return true; if (s2 === 0 && on(a, b, d)) return true;
    if (s3 === 0 && on(c, d, a)) return true; if (s4 === 0 && on(c, d, b)) return true;
    return false;
  }
  function pt2InTri(p, a, b, c) {
    const o = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
    const d1 = o(a, b, p), d2 = o(b, c, p), d3 = o(c, a, p);
    const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  }
  function coplanarOverlap(T, i, U, j, n) {
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const [u, v] = ax >= ay && ax >= az ? [1, 2] : ay >= az ? [0, 2] : [0, 1];
    const A = [0, 1, 2].map(k => [T[i + k * 3 + u], T[i + k * 3 + v]]), B = [0, 1, 2].map(k => [U[j + k * 3 + u], U[j + k * 3 + v]]);
    for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) if (seg2Intersect(A[p], A[(p + 1) % 3], B[q], B[(q + 1) % 3], GEO.EPS_LEN)) return true;
    return pt2InTri(A[0], B[0], B[1], B[2]) || pt2InTri(B[0], A[0], A[1], A[2]);
  }
  /**
   * Classifica a interseção de dois triângulos (não degenerados):
   *   NONE  — disjuntos
   *   TOUCH — contato tangencial: coplanares sobrepostos, contato por vértice/aresta,
   *           ou um triângulo apenas encosta no plano do outro
   *   CROSS — cruzamento transversal: cada triângulo tem vértices estritamente dos dois
   *           lados do plano do outro e o trecho comum tem comprimento > EPS_LEN.
   * Em superfícies fechadas, um CROSS implica sobreposição de interiores com volume > 0.
   * out (opcional) recebe o ponto médio do trecho comum.
   */
  function triTriIntersect(T, i, U, j, out) {
    const nU = unitNormal(U, j);
    const dT = [0, 1, 2].map(k => nU[0] * (T[i + k * 3] - U[j]) + nU[1] * (T[i + k * 3 + 1] - U[j + 1]) + nU[2] * (T[i + k * 3 + 2] - U[j + 2]));
    const sT = dT.map(sgn);
    if (sT[0] === sT[1] && sT[1] === sT[2] && sT[0] !== 0) return NONE;
    if (sT[0] === 0 && sT[1] === 0 && sT[2] === 0) return coplanarOverlap(T, i, U, j, nU) ? TOUCH : NONE;
    const nT = unitNormal(T, i);
    const dU = [0, 1, 2].map(k => nT[0] * (U[j + k * 3] - T[i]) + nT[1] * (U[j + k * 3 + 1] - T[i + 1]) + nT[2] * (U[j + k * 3 + 2] - T[i + 2]));
    const sU = dU.map(sgn);
    if (sU[0] === sU[1] && sU[1] === sU[2] && sU[0] !== 0) return NONE;
    let Dx = nT[1] * nU[2] - nT[2] * nU[1], Dy = nT[2] * nU[0] - nT[0] * nU[2], Dz = nT[0] * nU[1] - nT[1] * nU[0];
    const Dl = Math.hypot(Dx, Dy, Dz);
    if (Dl < 1e-12) return coplanarOverlap(T, i, U, j, nU) ? TOUCH : NONE; // planos praticamente paralelos e coincidentes
    Dx /= Dl; Dy /= Dl; Dz /= Dl;
    const pa = planeSection(T, i, dT, sT), pb = planeSection(U, j, dU, sU);
    if (!pa.length || !pb.length) return NONE;
    const proj = p => p[0] * Dx + p[1] * Dy + p[2] * Dz;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of pa) { const v = proj(p); if (v < a0) a0 = v; if (v > a1) a1 = v; }
    for (const p of pb) { const v = proj(p); if (v < b0) b0 = v; if (v > b1) b1 = v; }
    const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
    if (hi < lo - GEO.EPS_LEN) return NONE;
    if (out) { // ponto médio do trecho comum sobre a reta de interseção
      const m = (lo + hi) / 2; let best = pa[0], bd = Infinity;
      for (const p of pa) { const dd = Math.abs(proj(p) - m); if (dd < bd) { bd = dd; best = p; } }
      out[0] = best[0] + (m - proj(best)) * Dx; out[1] = best[1] + (m - proj(best)) * Dy; out[2] = best[2] + (m - proj(best)) * Dz;
    }
    const strictT = sT.includes(1) && sT.includes(-1), strictU = sU.includes(1) && sU.includes(-1);
    return (hi - lo > GEO.EPS_LEN && strictT && strictU) ? CROSS : TOUCH;
  }

  function triBoxesOverlap(ta, i, tb, j, pad) {
    const a = i * 6, b = j * 6;
    return !(ta[a + 3] + pad < tb[b] || tb[b + 3] + pad < ta[a] || ta[a + 4] + pad < tb[b + 1] || tb[b + 4] + pad < ta[a + 1] || ta[a + 5] + pad < tb[b + 2] || tb[b + 5] + pad < ta[a + 2]);
  }

  /** Busca exaustiva de cruzamento/contato entre as superfícies dentro da caixa B. */
  function contactSearch(A, B, box, limit) {
    const ia = trianglesInBox(A, box), ib = trianglesInBox(B, box);
    const res = { cross: false, touch: false, point: null, pairs: 0, truncated: false };
    const pt = [0, 0, 0];
    for (const i of ia) for (const j of ib) {
      if (++res.pairs > limit) { res.truncated = true; return res; }
      if (!triBoxesOverlap(A.tb, i, B.tb, j, GEO.EPS_LEN)) continue;
      const r = triTriIntersect(A.tris, i * 9, B.tris, j * 9, pt);
      if (r === CROSS) { res.cross = true; res.point = pt.slice(); return res; }
      if (r === TOUCH && !res.touch) { res.touch = true; res.point = pt.slice(); }
    }
    return res;
  }

  /* ------------------------------------------------------------------ */
  /* Distâncias                                                           */
  /* ------------------------------------------------------------------ */
  function segSegDist2(p1x, p1y, p1z, q1x, q1y, q1z, p2x, p2y, p2z, q2x, q2y, q2z) { // Ericson §5.1.9
    const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z, d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z;
    const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
    const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
    let s, t; const E = 1e-18;
    if (a <= E && e <= E) { s = t = 0; }
    else if (a <= E) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
    else {
      const c = d1x * rx + d1y * ry + d1z * rz;
      if (e <= E) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else {
        const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
        s = den > E ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
      }
    }
    const x = p1x + d1x * s - (p2x + d2x * t), y = p1y + d1y * s - (p2y + d2y * t), z = p1z + d1z * s - (p2z + d2z * t);
    return x * x + y * y + z * z;
  }
  /** Distância² exata entre dois triângulos: 0 se se intersectam; senão o mínimo entre
   *  vértice×face (6) e aresta×aresta (9), que cobre todos os casos de triângulos disjuntos. */
  function triTriDist2(T, i, U, j) {
    if (triTriIntersect(T, i, U, j, null) !== NONE) return 0;
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      best = Math.min(best, ptTriDist2(T[i + k * 3], T[i + k * 3 + 1], T[i + k * 3 + 2], U, j), ptTriDist2(U[j + k * 3], U[j + k * 3 + 1], U[j + k * 3 + 2], T, i));
    }
    for (let e = 0; e < 3; e++) for (let f = 0; f < 3; f++) {
      const a = i + e * 3, b = i + ((e + 1) % 3) * 3, c = j + f * 3, d = j + ((f + 1) % 3) * 3;
      best = Math.min(best, segSegDist2(T[a], T[a + 1], T[a + 2], T[b], T[b + 1], T[b + 2], U[c], U[c + 1], U[c + 2], U[d], U[d + 1], U[d + 2]));
    }
    return best;
  }
  /** Distância mínima entre as superfícies, considerando só faces que podem estar a menos
   *  de `reach` da outra peça (faces de A dentro da caixa de B alargada por reach, e vice-versa).
   *  d = Infinity significa: nenhuma face a menos de reach (distância ≥ reach). */
  function minDistance(A, B, reach, limit, stopAt) {
    const ex = (b, r) => [b[0] - r, b[1] - r, b[2] - r, b[3] + r, b[4] + r, b[5] + r];
    const ia = trianglesInBox(A, ex(B.box, reach)), ib = trianglesInBox(B, ex(A.box, reach));
    const res = { d: Infinity, pairs: 0, truncated: false };
    let best = Infinity; const stop2 = stopAt * stopAt;
    for (const i of ia) {
      for (const j of ib) {
        if (++res.pairs > limit) { res.truncated = true; res.d = Math.sqrt(best); return res; }
        const ta = i * 6, tbb = j * 6;
        let g = 0;
        for (let d = 0; d < 3; d++) { const gg = Math.max(0, A.tb[ta + d] - B.tb[tbb + d + 3], B.tb[tbb + d] - A.tb[ta + d + 3]); g += gg * gg; }
        if (g >= best) continue;
        const d2 = triTriDist2(A.tris, i * 9, B.tris, j * 9);
        if (d2 < best) { best = d2; if (best <= stop2) { res.d = Math.sqrt(best); return res; } }
      }
    }
    res.d = Math.sqrt(best);
    return res;
  }

  /* ------------------------------------------------------------------ */
  /* Métricas de interferência                                            */
  /* ------------------------------------------------------------------ */
  /**
   * ESPESSURA DE INTERFERÊNCIA  t = 2·r*,  r* = max_{p} min( sdA(p), sdB(p) )
   * (sd = distância com sinal, positiva dentro). r* é o raio da maior esfera contida
   * simultaneamente nos dois sólidos: t é a espessura do material compartilhado.
   *  • t = 0 ⇔ só contato;  t > 0 ⇔ interiores se sobrepõem.
   *  • Sólidos convexos com penetração rasa: t = profundidade de penetração (= distância
   *    mínima de translação). Tubo Ø d atravessando parede de espessura e: t = min(d, e).
   *  • Invariante a rotação (a métrica v1 dependia dos eixos X/Y/Z).
   * Cálculo: ramo-e-limite em células da caixa comum. f = min(sdA, sdB) é 1-Lipschitz,
   * logo numa célula de centro c e meia-diagonal h:  f ≤ f(c) + h. Isso dá limites
   * rigorosos  lb ≤ r* ≤ ub  (válidos para malhas fechadas e orientadas).
   * Para quando: lb > θ (acima do limiar, confirmado), ub ≤ θ (abaixo), lacuna ≤ precisão,
   * ou orçamento esgotado (exhausted). refine: nº de avaliações extras após a decisão
   * (true = sem limite próprio, apenas o orçamento total).
   */
  function depthBound(A, B, box, theta, budget, refine) {
    const refineBudget = refine === true ? Infinity : (refine || 0);
    let evalsAtDecision = 0;
    const ctx = { ambiguous: 0 };
    let evals = 0;
    const f = (x, y, z) => {
      evals++;
      const sa = signedDistance(A, x, y, z, ctx); if (sa <= 0) return sa; // fora de A: f ≤ 0 e o valor de A já é o mínimo correto se for menor
      const sb = signedDistance(B, x, y, z, ctx);
      return Math.min(sa, sb);
    };
    const mk = (b) => {
      const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
      const h = 0.5 * Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
      const s = f(cx, cy, cz);
      return { b, c: [cx, cy, cz], s, h, ub: s + h };
    };
    // heap máximo por ub
    const H = [];
    const push = (x) => { H.push(x); let i = H.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (H[p].ub >= H[i].ub) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
    const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < H.length && H[l].ub > H[m].ub) m = l; if (r < H.length && H[r].ub > H[m].ub) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
    const root = mk(box);
    let lb = root.s, best = root.c; push(root);
    let exhausted = false, decided = null;
    const target = () => Math.max(GEO.DEPTH_ABS, GEO.DEPTH_REL * Math.max(lb, 0));
    for (;;) {
      const ub = H.length ? Math.max(H[0].ub, lb) : lb;
      if (decided === null) {
        if (lb > theta) { decided = "acima"; evalsAtDecision = evals; }
        else if (ub <= theta) { decided = "abaixo"; break; }
      }
      if (decided === "acima" && (!refineBudget || evals - evalsAtDecision >= refineBudget)) { if (refineBudget && ub - lb > target()) exhausted = true; break; }
      if (decided !== null && ub - lb <= target()) break;
      if (!H.length) break;
      if (evals >= budget) { exhausted = true; break; }
      const c = pop();
      if (c.ub <= lb) continue;
      const b = c.b, dx = b[3] - b[0], dy = b[4] - b[1], dz = b[5] - b[2];
      const ax = dx >= dy && dx >= dz ? 0 : dy >= dz ? 1 : 2, mid = (b[ax] + b[ax + 3]) / 2;
      const b1 = b.slice(), b2 = b.slice(); b1[ax + 3] = mid; b2[ax] = mid;
      for (const nb of [b1, b2]) {
        const ch = mk(nb);
        if (ch.s > lb) { lb = ch.s; best = ch.c; }
        if (ch.ub > lb) push(ch);
      }
    }
    const ub = H.length ? Math.max(H[0].ub, lb) : lb;
    return { lb, ub, best, evals, exhausted: exhausted && decided === null, refined: !exhausted && ub - lb <= target() + 1e-15, decided, ambiguous: ctx.ambiguous };
  }

  /**
   * VOLUME DE INTERSEÇÃO por classificação de células (octree) com o mesmo critério de
   * Lipschitz: célula inteiramente dentro se f(c) ≥ h, inteiramente fora se f(c) ≤ −h,
   * senão é fronteira (subdividida enquanto houver orçamento). Resultado: intervalo
   * garantido [vmin, vmax] e a caixa da região interna (extensão da interseção).
   */
  function intersectionVolume(A, B, box, budget) {
    let evals = 0;
    const f = (x, y, z) => { evals++; const sa = signedDistance(A, x, y, z, null); if (sa <= 0) return sa; return Math.min(sa, signedDistance(B, x, y, z, null)); };
    let vin = 0, vunk = 0; const ext = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const grow = (b) => { for (let d = 0; d < 3; d++) { if (b[d] < ext[d]) ext[d] = b[d]; if (b[d + 3] > ext[d + 3]) ext[d + 3] = b[d + 3]; } };
    let queue = [box];
    while (queue.length) {
      const next = [];
      for (let qi = 0; qi < queue.length; qi++) {
        const b = queue[qi];
        const vol = (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]);
        if (evals >= budget) { vunk += vol; continue; }
        const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
        const h = 0.5 * Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
        const s = f(cx, cy, cz);
        if (s >= h) { vin += vol; grow(b); continue; }
        if (s <= -h) continue;
        if (h < GEO.EPS_LEN * 10) { vunk += vol; continue; }
        for (let k = 0; k < 8; k++) {
          next.push([k & 1 ? cx : b[0], k & 2 ? cy : b[1], k & 4 ? cz : b[2], k & 1 ? b[3] : cx, k & 2 ? b[4] : cy, k & 4 ? b[5] : cz]);
        }
      }
      queue = next;
    }
    return { vmin: vin, vmax: vin + vunk, extent: ext[0] <= ext[3] ? ext : null, evals, exhausted: evals >= budget };
  }

  /* ------------------------------------------------------------------ */
  /* Pares convexos: espessura exata (centro de Chebyshev) e volume exato */
  /* ------------------------------------------------------------------ */
  /** Planos das faces (normal unitária externa, n·x ≤ d) e teste de convexidade. Cacheado. */
  function convexInfo(mesh) {
    if (mesh._cv) return mesh._cv;
    const planes = [];
    if (mesh.closed && mesh.oriented && !mesh.surfaceOnly) {
      for (let i = 0; i < mesh.n; i++) {
        const o = i * 9, u = unitNormal(mesh.tris, o), n = [u[0] * mesh.orientSign, u[1] * mesh.orientSign, u[2] * mesh.orientSign];
        const d = n[0] * mesh.tris[o] + n[1] * mesh.tris[o + 1] + n[2] * mesh.tris[o + 2];
        if (!planes.some(p => p[0] * n[0] + p[1] * n[1] + p[2] * n[2] > 1 - 1e-9 && Math.abs(p[3] - d) < GEO.CONVEX_EPS)) planes.push([n[0], n[1], n[2], d]);
      }
    }
    let convex = planes.length >= 4;
    const T = mesh.tris;
    for (const p of planes) {
      if (!convex) break;
      for (let k = 0; k < mesh.n * 9; k += 3) if (p[0] * T[k] + p[1] * T[k + 1] + p[2] * T[k + 2] - p[3] > GEO.CONVEX_EPS) { convex = false; break; }
    }
    mesh._cv = { convex, planes: convex ? planes : null };
    return mesh._cv;
  }

  /**
   * Centro de Chebyshev de {x : nᵢ·x ≤ dᵢ}: maximiza r com nᵢ·x + r ≤ dᵢ (normais unitárias).
   * Para dois sólidos convexos, a interseção é o conjunto dos planos de ambos, e r é EXATAMENTE
   * o r* da espessura de interferência (raio da maior esfera contida nos dois).
   * Simplex denso com regra de Bland; x0 deve estar na região (ou na sua fronteira).
   */
  function chebyshev(planes, x0) {
    const m = planes.length, nv = 7, W = nv + m + 1;
    const T = [];
    for (let i = 0; i < m; i++) {
      const [nx, ny, nz, d] = planes[i], row = new Float64Array(W);
      row[0] = nx; row[1] = ny; row[2] = nz; row[3] = -nx; row[4] = -ny; row[5] = -nz; row[6] = 1; row[nv + i] = 1;
      row[W - 1] = Math.max(0, d - (nx * x0[0] + ny * x0[1] + nz * x0[2]));
      T.push(row);
    }
    const obj = new Float64Array(W); obj[6] = -1; T.push(obj);
    const basis = []; for (let i = 0; i < m; i++) basis.push(nv + i);
    for (let it = 0; it < 5000; it++) {
      let e = -1;
      for (let j = 0; j < W - 1; j++) if (obj[j] < -1e-12) { e = j; break; }
      if (e < 0) break;
      let r = -1, best = Infinity;
      for (let i = 0; i < m; i++) {
        const a = T[i][e]; if (a <= 1e-12) continue;
        const q = T[i][W - 1] / a;
        if (q < best - 1e-15 || (Math.abs(q - best) <= 1e-15 && basis[i] < basis[r])) { best = q; r = i; }
      }
      if (r < 0) return null; // ilimitado (não ocorre para sólidos limitados)
      const pr = T[r], pv = pr[e];
      for (let j = 0; j < W; j++) pr[j] /= pv;
      for (let i = 0; i <= m; i++) { if (i === r) continue; const row = T[i], f = row[e]; if (f === 0) continue; for (let j = 0; j < W; j++) row[j] -= f * pr[j]; }
      basis[r] = e;
    }
    const val = new Float64Array(nv);
    for (let i = 0; i < m; i++) if (basis[i] < nv) val[basis[i]] = T[i][W - 1];
    return { r: val[6], x: [x0[0] + val[0] - val[3], x0[1] + val[1] - val[4], x0[2] + val[2] - val[5]] };
  }

  /** Volume EXATO de A ∩ B para A e B convexos: recorte do poliedro A pelos planos de B
   *  (Sutherland–Hodgman nas faces + face de fechamento) e integração pelo teorema da divergência. */
  function convexIntersection(A, planesB, ref) {
    let faces = [];
    for (let i = 0; i < A.n; i++) {
      const o = i * 9, tri = [[A.tris[o], A.tris[o + 1], A.tris[o + 2]], [A.tris[o + 3], A.tris[o + 4], A.tris[o + 5]], [A.tris[o + 6], A.tris[o + 7], A.tris[o + 8]]];
      faces.push(A.orientSign > 0 ? tri : tri.reverse());
    }
    for (const [nx, ny, nz, d] of planesB) {
      const next = [], cap = [];
      const E = GEO.EPS_LEN;
      const sd = (p) => { const v = nx * p[0] + ny * p[1] + nz * p[2] - d; return Math.abs(v) <= E ? 0 : v; };
      // o plano só recorta se algum vértice estiver estritamente fora; senão não muda nada
      // (evita duplicar faces quando o plano coincide com uma face existente)
      if (!faces.some(poly => poly.some(p => sd(p) > 0))) continue;
      for (const poly of faces) {
        const out = [];
        for (let k = 0; k < poly.length; k++) {
          const P = poly[k], Q = poly[(k + 1) % poly.length], a = sd(P), b = sd(Q);
          if (a <= 0) out.push(P);
          if (a === 0) cap.push(P);
          if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
            const t = a / (a - b), X = [P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1]), P[2] + t * (Q[2] - P[2])];
            out.push(X); cap.push(X);
          }
        }
        if (out.length >= 3 && !out.every(p => sd(p) === 0)) next.push(out); // face inteira no plano é substituída pela face de fechamento
      }
      // face de fechamento no plano (pontos do corte, ordenados no sentido da normal +n)
      const pts = [];
      for (const p of cap) if (!pts.some(q => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) < GEO.EPS_LEN)) pts.push(p);
      if (pts.length >= 3) {
        const c = [0, 0, 0]; for (const p of pts) { c[0] += p[0] / pts.length; c[1] += p[1] / pts.length; c[2] += p[2] / pts.length; }
        const t = Math.abs(nx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        let u = [ny * t[2] - nz * t[1], nz * t[0] - nx * t[2], nx * t[1] - ny * t[0]]; const ul = Math.hypot(...u); u = u.map(v => v / ul);
        const v = [ny * u[2] - nz * u[1], nz * u[0] - nx * u[2], nx * u[1] - ny * u[0]];
        pts.sort((p, q) => Math.atan2((p[0] - c[0]) * v[0] + (p[1] - c[1]) * v[1] + (p[2] - c[2]) * v[2], (p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1] + (p[2] - c[2]) * u[2])
          - Math.atan2((q[0] - c[0]) * v[0] + (q[1] - c[1]) * v[1] + (q[2] - c[2]) * v[2], (q[0] - c[0]) * u[0] + (q[1] - c[1]) * u[1] + (q[2] - c[2]) * u[2]));
        next.push(pts); // u × v = n ⇒ ordem anti-horária vista de +n
      }
      faces = next;
      if (!faces.length) break;
    }
    let vol6 = 0; const ext = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const poly of faces) {
      for (const p of poly) for (let dd = 0; dd < 3; dd++) { if (p[dd] < ext[dd]) ext[dd] = p[dd]; if (p[dd] > ext[dd + 3]) ext[dd + 3] = p[dd]; }
      const a = poly[0];
      for (let k = 1; k + 1 < poly.length; k++) {
        const b = poly[k], c = poly[k + 1];
        const ax = a[0] - ref[0], ay = a[1] - ref[1], az = a[2] - ref[2], bx = b[0] - ref[0], by = b[1] - ref[1], bz = b[2] - ref[2], cx = c[0] - ref[0], cy = c[1] - ref[1], cz = c[2] - ref[2];
        vol6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
      }
    }
    return { volume: Math.max(0, vol6 / 6), extent: faces.length ? ext : null };
  }

  /** Volume de interseção sob demanda: exato para pares convexos, intervalo garantido nos demais. */
  function pairVolume(A, B, budget) {
    const core = overlapBox(A.box, B.box, GEO.EPS_LEN * 10);
    if (!core) return { vmin: 0, vmax: 0, extent: null, exact: true };
    const ca = convexInfo(A), cb = convexInfo(B);
    if (ca.convex && cb.convex) {
      const c = [(core[0] + core[3]) / 2, (core[1] + core[4]) / 2, (core[2] + core[5]) / 2];
      const ci = convexIntersection(A, cb.planes, c);
      return { vmin: ci.volume, vmax: ci.volume, extent: ci.extent, exact: true };
    }
    const v = intersectionVolume(A, B, core, budget || GEO.LIMITS.VOL_EVALS);
    return { vmin: v.vmin, vmax: v.vmax, extent: v.extent, exact: false };
  }

  /**
   * TESTE DE CONTENÇÃO por pontos de prova. Para cada face de X dentro da caixa, 4 pontos
   * (centroide e 3 pontos próximos aos vértices) recuados GEO.PROBE_DEPTHS para dentro de X pela
   * normal externa. Um ponto de prova que esteja dentro de X e dentro de Y (além de
   * GEO.CONTACT/2) prova sobreposição de interiores. Detecta elementos contidos e
   * coincidentes, casos em que as superfícies não se cruzam transversalmente.
   * Só é usado em malhas fechadas e orientadas.
   */
  function containmentProbe(X, Y, box, limit, counter) {
    const ids = trianglesInBox(X, box), T = X.tris, need = GEO.CONTACT / 2;
    const W = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
    for (const d of GEO.PROBE_DEPTHS) for (const i of ids) {
      const o = i * 9, n = unitNormal(T, o), sgnO = X.orientSign;
      for (const w of W) {
        if (++counter.n > limit) return { inside: false, truncated: true };
        const x = w[0] * T[o] + w[1] * T[o + 3] + w[2] * T[o + 6] - sgnO * n[0] * d;
        const y = w[0] * T[o + 1] + w[1] * T[o + 4] + w[2] * T[o + 7] - sgnO * n[1] * d;
        const z = w[0] * T[o + 2] + w[1] * T[o + 5] + w[2] * T[o + 8] - sgnO * n[2] * d;
        if (x < Y.box[0] || x > Y.box[3] || y < Y.box[1] || y > Y.box[4] || z < Y.box[2] || z > Y.box[5]) continue;
        if (signedDistance(Y, x, y, z, null) <= need) continue;
        if (windingNumber(X, x, y, z) < 0.5 || unsignedDistance(X, x, y, z) < d * 0.5) continue; // ponto não está no interior de X (peça muito fina)
        return { inside: true, truncated: false, point: [x, y, z] };
      }
    }
    return { inside: false, truncated: false };
  }

  /* ------------------------------------------------------------------ */
  /* Avaliação de um par                                                  */
  /* ------------------------------------------------------------------ */
  /**
   * A, B: malhas preparadas (prepareMesh).
   * opt: { kind: "hard" | "clearance", tol: metros, limits?: {...GEO.LIMITS}, volume?: bool }
   * Retorno (metros):
   *   state    — STATE.*
   *   value    — hard: espessura de interferência estimada (= limite inferior garantido);
   *              clearance: distância mínima entre superfícies (0 se há interpenetração)
   *   lb, ub   — limites da espessura (hard) quando calculados
   *   volume   — {vmin, vmax} m³ (conflitos confirmados, se opt.volume)
   *   extent   — caixa da região de interseção
   *   center   — ponto representativo (ponto mais profundo, ponto de cruzamento ou centro da caixa)
   *   quality  — "exata" | "aproximada" (malha aberta, orientação inconsistente, contenção ambígua)
   *   flags    — motivos legíveis
   *   stats    — avaliações e pares de triângulos usados
   */
  function evaluatePair(A, B, opt) {
    const L = Object.assign({}, GEO.LIMITS, (opt && opt.limits) || {});
    const kind = (opt && opt.kind) || "hard", tol = Math.max(0, (opt && opt.tol) || 0);
    const res = { state: null, kind, tol, method: null, value: null, lb: null, ub: null, volume: null, extent: null, center: null, quality: "exata", flags: [], stats: { evals: 0, pairs: 0 } };
    const flag = (f) => { if (!res.flags.includes(f)) res.flags.push(f); };
    for (const [M, lab] of [[A, "A"], [B, "B"]]) {
      if (!M || !M.n) { res.state = STATE.INCOMPLETO; flag("sem_geometria_valida_" + lab); return res; }
      if (M.surfaceOnly) { flag("superficie_sem_volume_" + lab); res.quality = "aproximada"; }
      else if (!M.closed) { flag("malha_aberta_" + lab); res.quality = "aproximada"; }
      else if (!M.oriented) { flag("orientacao_inconsistente_" + lab); res.quality = "aproximada"; }
      if (M.degenerate) flag("triangulos_degenerados_" + lab);
    }
    const contactR = GEO.CONTACT / 2;
    const core = overlapBox(A.box, B.box, GEO.EPS_LEN * 10);
    const search = kind === "clearance" ? overlapBox(A.box, B.box, tol + GEO.EPS_LEN * 10) : core;
    const centerOf = (b) => [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
    if (!search) { res.state = STATE.SEM_CONFLITO; return res; }
    res.center = centerOf(search);

    const exact = () => res.quality === "exata";

    // 1) Existe sobreposição de interiores?  (cruzamento transversal das superfícies
    //    ou ponto de prova interno a ambos). Responde rápido aos casos de contato.
    let cs = null, pr = null, overlap = false, overlapUnknown = false;
    if (core) {
      cs = contactSearch(A, B, core, L.TRI_PAIRS); res.stats.pairs += cs.pairs;
      if (cs.point) res.center = cs.point;
      overlap = cs.cross;
      if (!overlap && exact()) {
        const cnt = { n: 0 };
        pr = containmentProbe(A, B, core, L.PROBES, cnt);
        if (!pr.inside && !pr.truncated) pr = containmentProbe(B, A, core, L.PROBES, cnt);
        res.stats.probes = cnt.n;
        if (pr.inside) { overlap = true; res.center = pr.point; flag("contencao_ou_coincidencia"); }
      }
      overlapUnknown = !overlap && (cs.truncated || (pr && pr.truncated));
    }

    const theta = kind === "hard" ? Math.max(tol, GEO.CONTACT) / 2 : contactR;
    const finishHard = (t, center) => { // decisão a partir de uma espessura exata t
      res.lb = res.ub = res.value = t; if (center) res.center = center;
      res.state = t > 2 * theta ? STATE.CONFIRMADO : (t > GEO.CONTACT || (cs && cs.cross)) ? STATE.ABAIXO_TOL : STATE.CONTATO;
    };

    // 2a) Par convexo com sobreposição: espessura e volume EXATOS
    let bb = null;
    if (core && overlap && exact()) {
      const ca = convexInfo(A), cb = convexInfo(B);
      if (ca.convex && cb.convex) {
        const x0 = (pr && pr.point) || (cs && cs.point) || res.center;
        const lp = chebyshev(ca.planes.concat(cb.planes), x0);
        if (lp && isFinite(lp.r)) {
          res.method = "convexo_exato";
          if (kind === "clearance") { res.state = STATE.CONFIRMADO; res.value = 0; res.lb = res.ub = 2 * Math.max(0, lp.r); flag("interpenetracao"); return res; }
          finishHard(2 * Math.max(0, lp.r), lp.x);
          if (res.state === STATE.CONFIRMADO && (!opt || opt.volume !== false)) {
            const ci = convexIntersection(A, cb.planes, lp.x);
            res.volume = { vmin: ci.volume, vmax: ci.volume }; res.extent = ci.extent;
          }
          return res;
        }
      }
    }

    // 2b) Espessura por ramo-e-limite — peças não convexas com sobreposição, ou malhas
    //     aproximadas (sem teste de contenção confiável), para procurar contenção.
    if (core && (overlap || !exact() || overlapUnknown)) {
      res.method = "ramo_e_limite";
      bb = depthBound(A, B, core, theta, L.BB_EVALS + (kind === "hard" ? L.BB_REFINE : 0), kind === "hard" ? L.BB_REFINE : 0);
      res.stats.evals += bb.evals;
      res.lb = 2 * Math.max(0, bb.lb); res.ub = 2 * Math.max(0, bb.ub);
      if (bb.ambiguous) { flag("contencao_ambigua"); res.quality = "aproximada"; }
      if (bb.lb > contactR) { overlap = true; if (bb.best) res.center = bb.best; }
    } else if (core) { res.lb = 0; res.ub = 0; }

    if (kind === "hard") {
      if (!core) { res.state = STATE.SEM_CONFLITO; return res; }
      if (!overlap) {
        if (overlapUnknown) { res.state = STATE.INCOMPLETO; flag(cs.truncated ? "limite_pares_triangulos" : "limite_pontos_prova"); return res; }
        if (!exact()) flag("contencao_verificada_aproximadamente");
        res.state = cs.touch ? STATE.CONTATO : STATE.SEM_CONFLITO; res.value = 0; res.lb = 0;
        return res;
      }
      if (bb.decided === "acima") {
        res.state = STATE.CONFIRMADO; res.value = res.lb; res.center = bb.best;
        if (!bb.refined) flag("espessura_com_lacuna");
        if (!opt || opt.volume !== false) {
          const v = intersectionVolume(A, B, core, L.VOL_EVALS); res.stats.evals += v.evals;
          res.volume = { vmin: v.vmin, vmax: v.vmax }; res.extent = v.extent;
          if (v.exhausted) flag("volume_por_intervalo");
        }
        return res;
      }
      if (!exact() && bb.lb <= contactR) { // superfícies se cruzam, mas o interior não é confiável
        res.state = STATE.INCONCLUSIVO; res.value = null; flag("profundidade_indeterminada"); return res;
      }
      if (bb.decided === "abaixo") { res.state = STATE.ABAIXO_TOL; res.value = res.lb; return res; }
      res.state = STATE.INCOMPLETO; res.value = res.lb; flag("limite_avaliacoes_espessura");
      return res;
    }

    // 3) Folga (clearance)
    if (overlap) { res.state = STATE.CONFIRMADO; res.value = 0; flag("interpenetracao"); return res; }
    const md = minDistance(A, B, tol + GEO.EPS_LEN * 10, L.DIST_PAIRS, 0); res.stats.pairs += md.pairs;
    if (md.d < tol) { res.state = STATE.CONFIRMADO; res.value = md.d; if (md.truncated) flag("distancia_pode_ser_menor"); return res; }
    if (md.truncated) { res.state = STATE.INCOMPLETO; res.value = isFinite(md.d) ? md.d : null; flag("limite_pares_distancia"); return res; }
    if (!isFinite(md.d)) { md.d = null; flag("distancia_maior_que_folga"); }
    if (overlapUnknown || (bb && bb.decided === null && bb.lb <= contactR && bb.ub > contactR && !exact())) {
      res.state = STATE.INCOMPLETO; res.value = md.d; flag("contencao_nao_verificada"); return res;
    }
    res.state = STATE.SEM_CONFLITO; res.value = md.d;
    return res;
  }

  /* ------------------------------------------------------------------ */
  /* Transformações IFC                                                   */
  /* ------------------------------------------------------------------ */
  /**
   * Aplica a matriz 4×4 (coluna principal, web-ifc flatTransformation) aos vértices
   * intercalados [x,y,z,nx,ny,nz] em precisão dupla. Retorna posições Float64 e normais.
   */
  function transformVertexData(vd, t) {
    const nv = Math.floor(vd.length / 6), P = new Float64Array(nv * 3), N = new Float32Array(nv * 3);
    for (let k = 0; k < nv; k++) {
      const x = vd[k * 6], y = vd[k * 6 + 1], z = vd[k * 6 + 2];
      P[k * 3] = t[0] * x + t[4] * y + t[8] * z + t[12];
      P[k * 3 + 1] = t[1] * x + t[5] * y + t[9] * z + t[13];
      P[k * 3 + 2] = t[2] * x + t[6] * y + t[10] * z + t[14];
      const a = vd[k * 6 + 3], b = vd[k * 6 + 4], c = vd[k * 6 + 5];
      const nx = t[0] * a + t[4] * b + t[8] * c, ny = t[1] * a + t[5] * b + t[9] * c, nz = t[2] * a + t[6] * b + t[10] * c, l = Math.hypot(nx, ny, nz) || 1;
      N[k * 3] = nx / l; N[k * 3 + 1] = ny / l; N[k * 3 + 2] = nz / l;
    }
    return { P, N };
  }
  const SI_PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1, "": 1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9 };
  /**
   * Escala para metros. O web-ifc 0.0.39 entrega a geometria na unidade do arquivo;
   * a heurística verifica se a extensão bruta é compatível com essa hipótese.
   * Retorna {scale, assumed} — assumed=true quando a decisão foi heurística.
   */
  function unitScaleFor(prefix, rawExtent) {
    const f = SI_PREFIX[prefix || ""];
    if (f === undefined) return { scale: 1, assumed: true, unknown: true };
    if (f === 1) return { scale: 1, assumed: false };
    // geometria já convertida para metros pelo leitor? (extensão bruta típica de metros)
    // (mesmo critério da v1: extensão bruta ≤ 1000 unidades ⇒ assume já em metros)
    if (f < 1 && rawExtent <= 1000) return { scale: 1, assumed: true };
    return { scale: f, assumed: false };
  }

  return {
    GEO, STATE, NONE, TOUCH, CROSS,
    prepareMesh, overlapBox, boxDist2, trianglesInBox,
    unsignedDistance, windingNumber, signedDistance,
    triTriIntersect, contactSearch, triTriDist2, minDistance, ptTriDist2, segSegDist2,
    depthBound, intersectionVolume, containmentProbe, convexInfo, chebyshev, convexIntersection, pairVolume, evaluatePair,
    transformVertexData, unitScaleFor,
  };
});
