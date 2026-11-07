/* COORDIX · geometrias sintéticas para os testes do núcleo geométrico (metros).
 * Todas as malhas são fechadas e orientadas para fora, salvo quando indicado. */
"use strict";

/** Caixa alinhada aos eixos. */
function caixa(x0, y0, z0, x1, y1, z1) {
  const p = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1];
  const i = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { p64: Float64Array.from(p), i: Uint32Array.from(i) };
}

/** Cilindro (prisma de n lados) de a até b, circunscrito ao círculo de raio r: o apótema é
 *  exatamente r. Com fase = π/n (padrão) e n múltiplo de 4, há faces planas voltadas para
 *  os eixos principais perpendiculares ao tubo. */
function cilindro(a, b, r, n = 32, fase = Math.PI / n) {
  const R = r / Math.cos(Math.PI / n);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d), u = d.map(v => v / L);
  const t = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const cr = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  let v1 = cr(u, t); const l1 = Math.hypot(...v1); v1 = v1.map(x => x / l1); const v2 = cr(u, v1);
  const p = [];
  for (const base of [a, b]) for (let k = 0; k < n; k++) {
    const an = fase + 2 * Math.PI * k / n;
    p.push(...[0, 1, 2].map(j => base[j] + R * (Math.cos(an) * v1[j] + Math.sin(an) * v2[j])));
  }
  p.push(...a, ...b);
  const i = [], ca = 2 * n, cb = 2 * n + 1;
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    i.push(k, k2, n + k2, k, n + k2, n + k);
    i.push(ca, k2, k); i.push(cb, n + k, n + k2);
  }
  const g = { p64: Float64Array.from(p), i: Uint32Array.from(i) };
  return orientarParaFora(g);
}

/** Perfil I extrudado ao longo de x: altura h, mesa bf, espessuras tf (mesa) e tw (alma). */
function perfilI(x0, x1, yc, zc, h, bf, tf, tw) {
  // contorno no plano y-z (anti-horário)
  const Y = (v) => yc + v, Z = (v) => zc + v;
  const c = [[-bf / 2, -h / 2], [bf / 2, -h / 2], [bf / 2, -h / 2 + tf], [tw / 2, -h / 2 + tf], [tw / 2, h / 2 - tf], [bf / 2, h / 2 - tf],
             [bf / 2, h / 2], [-bf / 2, h / 2], [-bf / 2, h / 2 - tf], [-tw / 2, h / 2 - tf], [-tw / 2, -h / 2 + tf], [-bf / 2, -h / 2 + tf]];
  return extrusao(c.map(([y, z]) => [Y(y), Z(z)]), x0, x1);
}

/** Extrusão em x de um polígono simples no plano y-z (triangulação por recorte de orelhas). */
function extrusao(poly, x0, x1) {
  const n = poly.length, p = [];
  for (const x of [x0, x1]) for (const [y, z] of poly) p.push(x, y, z);
  const tri = earClip(poly), i = [];
  for (const [a, b, c] of tri) { i.push(a, c, b); i.push(n + a, n + b, n + c); }
  for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; i.push(k, k2, n + k2, k, n + k2, n + k); }
  return orientarParaFora({ p64: Float64Array.from(p), i: Uint32Array.from(i) });
}
function earClip(poly) {
  const idx = poly.map((_, k) => k), out = [];
  const area = (a, b, c) => (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[b][1] - poly[a][1]) * (poly[c][0] - poly[a][0]);
  let s = 0; for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; }
  const ccw = s > 0;
  const inside = (p, a, b, c) => { const d1 = area2(p, a, b), d2 = area2(p, b, c), d3 = area2(p, c, a); return (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0); };
  const area2 = (p, a, b) => (poly[a][0] - p[0]) * (poly[b][1] - p[1]) - (poly[a][1] - p[1]) * (poly[b][0] - p[0]);
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length], b = idx[k], c = idx[(k + 1) % idx.length];
      const ar = area(a, b, c); if (ccw ? ar <= 0 : ar >= 0) continue;
      let ok = true;
      for (const m of idx) { if (m === a || m === b || m === c) continue; if (inside(poly[m], a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      out.push([a, b, c]); idx.splice(k, 1); break;
    }
  }
  out.push([idx[0], idx[1], idx[2]]);
  return out;
}

/** Garante orientação para fora (volume com sinal positivo). */
function orientarParaFora(g) {
  const P = g.p64, I = g.i; let v = 0;
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
    v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
  }
  if (v < 0) for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; }
  return g;
}
/** Inverte a orientação (normais para dentro). */
function inverter(g) { const I = Uint32Array.from(g.i); for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; } return { p64: g.p64, i: I }; }
/** Translada. */
function mover(g, dx, dy, dz) { const P = Float64Array.from(g.p64); for (let k = 0; k < P.length; k += 3) { P[k] += dx; P[k + 1] += dy; P[k + 2] += dz; } return { p64: P, i: g.i }; }
/** Gira em torno do eixo z passando por (cx, cy). */
function girarZ(g, ang, cx = 0, cy = 0) {
  const P = Float64Array.from(g.p64), c = Math.cos(ang), s = Math.sin(ang);
  for (let k = 0; k < P.length; k += 3) { const x = P[k] - cx, y = P[k + 1] - cy; P[k] = cx + c * x - s * y; P[k + 1] = cy + s * x + c * y; }
  return { p64: P, i: g.i };
}
/** Remove as faces cujos triângulos têm todos os vértices com coordenada eixo = valor (abre a malha). */
function removerFace(g, eixo, valor) {
  const I = [], P = g.p64;
  for (let k = 0; k < g.i.length; k += 3) {
    const vs = [g.i[k], g.i[k + 1], g.i[k + 2]];
    if (vs.every(v => Math.abs(P[v * 3 + eixo] - valor) < 1e-12)) continue;
    I.push(...vs);
  }
  return { p64: P, i: Uint32Array.from(I) };
}
/** Quadrilátero plano (superfície sem volume) no plano x = x0. */
function placaPlana(x0, y0, z0, y1, z1) {
  return { p64: Float64Array.from([x0, y0, z0, x0, y1, z0, x0, y1, z1, x0, y0, z1]), i: Uint32Array.from([0, 1, 2, 0, 2, 3]) };
}
/** Geometria somente com triângulos degenerados (colineares / repetidos). */
function degenerada() {
  return { p64: Float64Array.from([0, 0, 0, 0.5, 0, 0, 1, 0, 0, 1, 0, 0]), i: Uint32Array.from([0, 1, 2, 2, 3, 2, 1, 1, 1]) };
}
/** Acrescenta triângulos degenerados a uma geometria válida. */
function comDegenerados(g) {
  const n = g.p64.length / 3, P = Float64Array.from([...g.p64, ...g.p64.slice(0, 3), ...g.p64.slice(0, 3)]);
  const I = Uint32Array.from([...g.i, 0, n, n + 1, 1, 1, 2]);
  return { p64: P, i: I };
}

/** Área do polígono regular de n lados circunscrito ao círculo de raio r (apótema r). */
function areaPrismaCircunscrito(r, n) { return n * r * r * Math.tan(Math.PI / n); }

/** Rotação genérica: Rz(c)·Ry(b)·Rx(a) em torno do ponto o. */
function girar(g, a, b, c, o = [0, 0, 0]) {
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  const R = [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa, sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa, -sb, cb * sa, cb * ca];
  const P = Float64Array.from(g.p64);
  for (let k = 0; k < P.length; k += 3) {
    const x = P[k] - o[0], y = P[k + 1] - o[1], z = P[k + 2] - o[2];
    P[k] = o[0] + R[0] * x + R[1] * y + R[2] * z; P[k + 1] = o[1] + R[3] * x + R[4] * y + R[5] * z; P[k + 2] = o[2] + R[6] * x + R[7] * y + R[8] * z;
  }
  return { p64: P, i: g.i };
}
/** Caixa com cada face subdividida em grade de n×n quadrados (malha fina, fechada e orientada).
 *  opcoes.inconsistente = true inverte metade dos quadrados da face superior (orientação inconsistente). */
function caixaSubdividida(x0, y0, z0, x1, y1, z1, n, opcoes = {}) {
  const p = [], i = [], key = new Map();
  const v = (x, y, z) => { const k = x + "," + y + "," + z; let id = key.get(k); if (id === undefined) { id = p.length / 3; p.push(x, y, z); key.set(k, id); } return id; };
  const L = (a, b, t) => a + (b - a) * t;
  // cada face recebe a normal externa esperada e os quadrados são orientados de acordo
  const face = (f, nrm, inconsistente) => {
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const c4 = [f(a / n, b / n), f((a + 1) / n, b / n), f((a + 1) / n, (b + 1) / n), f(a / n, (b + 1) / n)];
      const u = [0, 1, 2].map(k => c4[1][k] - c4[0][k]), w = [0, 1, 2].map(k => c4[2][k] - c4[0][k]);
      const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      let q = c4.map(c => v(...c));
      if (cr[0] * nrm[0] + cr[1] * nrm[1] + cr[2] * nrm[2] < 0) q = [q[0], q[3], q[2], q[1]];
      if (inconsistente && (a + b) % 2) q = [q[0], q[3], q[2], q[1]];
      i.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    }
  };
  face((s, t) => [L(x0, x1, s), L(y0, y1, t), z1], [0, 0, 1], opcoes.inconsistente); face((s, t) => [L(x0, x1, t), L(y0, y1, s), z0], [0, 0, -1]);
  face((s, t) => [L(x0, x1, t), y0, L(z0, z1, s)], [0, -1, 0]); face((s, t) => [L(x0, x1, s), y1, L(z0, z1, t)], [0, 1, 0]);
  face((s, t) => [x0, L(y0, y1, t), L(z0, z1, s)], [-1, 0, 0]); face((s, t) => [x1, L(y0, y1, s), L(z0, z1, t)], [1, 0, 0]);
  return { p64: Float64Array.from(p), i: Uint32Array.from(i) };
}

module.exports = { caixa, cilindro, perfilI, extrusao, inverter, mover, girarZ, removerFace, placaPlana, degenerada, comDegenerados, areaPrismaCircunscrito, girar, caixaSubdividida };
