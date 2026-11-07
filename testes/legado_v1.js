/* Núcleo geométrico da v1 (BIMORA), extraído sem alterações do index.html do commit inicial,
 * para o comparativo de regressão. Não é usado pelo app. */
"use strict";
/* ---- Teste geométrico fino (malha de triângulos) ---- */
function trisIn(el,b){ // triângulos do elemento cuja caixa toca a caixa b → [ax,ay,az,bx,by,bz,cx,cy,cz,...]
  const out=[];
  for(const g of el.geoms){const P=g.p,I=g.i;
    for(let k=0;k<I.length;k+=3){const a=I[k]*3,bb=I[k+1]*3,c=I[k+2]*3;
      const x0=Math.min(P[a],P[bb],P[c]),x1=Math.max(P[a],P[bb],P[c]);if(x1<b[0]||x0>b[3]) continue;
      const y0=Math.min(P[a+1],P[bb+1],P[c+1]),y1=Math.max(P[a+1],P[bb+1],P[c+1]);if(y1<b[1]||y0>b[4]) continue;
      const z0=Math.min(P[a+2],P[bb+2],P[c+2]),z1=Math.max(P[a+2],P[bb+2],P[c+2]);if(z1<b[2]||z0>b[5]) continue;
      out.push(P[a],P[a+1],P[a+2],P[bb],P[bb+1],P[bb+2],P[c],P[c+1],P[c+2]);}}
  return out;
}
function segTri(px,py,pz,qx,qy,qz,T,o,out){ // segmento PQ × triângulo T[o..o+8]; empilha o ponto de cruzamento
  const ax=T[o],ay=T[o+1],az=T[o+2];
  const e1x=T[o+3]-ax,e1y=T[o+4]-ay,e1z=T[o+5]-az,e2x=T[o+6]-ax,e2y=T[o+7]-ay,e2z=T[o+8]-az;
  const dx=qx-px,dy=qy-py,dz=qz-pz;
  const hx=dy*e2z-dz*e2y,hy=dz*e2x-dx*e2z,hz=dx*e2y-dy*e2x;
  const det=e1x*hx+e1y*hy+e1z*hz;if(Math.abs(det)<1e-14) return false;
  const inv=1/det,sx=px-ax,sy=py-ay,sz=pz-az;
  const u=(sx*hx+sy*hy+sz*hz)*inv;if(u<0||u>1) return false;
  const qx2=sy*e1z-sz*e1y,qy2=sz*e1x-sx*e1z,qz2=sx*e1y-sy*e1x;
  const v=(dx*qx2+dy*qy2+dz*qz2)*inv;if(v<0||u+v>1) return false;
  const t=(e2x*qx2+e2y*qy2+e2z*qz2)*inv;if(t<0||t>1) return false;
  if(out) out.push(px+dx*t,py+dy*t,pz+dz*t);
  return true;
}
function triBoxOverlap(T,i,U,j){
  for(let k=0;k<3;k++){const a0=Math.min(T[i+k],T[i+3+k],T[i+6+k]),a1=Math.max(T[i+k],T[i+3+k],T[i+6+k]);
    const b0=Math.min(U[j+k],U[j+3+k],U[j+6+k]),b1=Math.max(U[j+k],U[j+3+k],U[j+6+k]);if(a1<b0||b1<a0) return false}
  return true;
}
function crossPoints(TA,TB,out,limit=40000){ // pontos da curva de interseção entre as duas malhas
  let n=0;
  for(let i=0;i<TA.length;i+=9) for(let j=0;j<TB.length;j+=9){
    if(++n>limit) return;
    if(!triBoxOverlap(TA,i,TB,j)) continue;
    for(let e=0;e<3;e++){const p=i+e*3,q=i+((e+1)%3)*3;segTri(TA[p],TA[p+1],TA[p+2],TA[q],TA[q+1],TA[q+2],TB,j,out)}
    for(let e=0;e<3;e++){const p=j+e*3,q=j+((e+1)%3)*3;segTri(TB[p],TB[p+1],TB[p+2],TB[q],TB[q+1],TB[q+2],TA,i,out)}
  }
}
function allTris(el){if(el._tris) return el._tris;el._tris=trisIn(el,[-Infinity,-Infinity,-Infinity,Infinity,Infinity,Infinity]);return el._tris}
function pointInside(x,y,z,el){ // paridade de um raio levemente inclinado
  const T=allTris(el);let c=0;const L=1e4;
  for(let o=0;o<T.length;o+=9) if(segTri(x,y,z,x+L,y+L*0.00131,z+L*0.00071,T,o,null)) c++;
  return (c&1)===1;
}
function insideVerts(src,dst,b,out,cap=160){
  let n=0;
  for(const g of src.geoms){const P=g.p;for(let k=0;k<P.length;k+=3){
    const x=P[k],y=P[k+1],z=P[k+2];
    if(x<b[0]||x>b[3]||y<b[1]||y>b[4]||z<b[2]||z>b[5]) continue;
    if(++n>cap) return;
    if(pointInside(x,y,z,dst)) out.push(x,y,z);
  }}
}
function ptTriDist2(px,py,pz,T,o){ // Ericson, ponto mais próximo no triângulo
  const ax=T[o],ay=T[o+1],az=T[o+2],bx=T[o+3],by=T[o+4],bz=T[o+5],cx=T[o+6],cy=T[o+7],cz=T[o+8];
  const abx=bx-ax,aby=by-ay,abz=bz-az,acx=cx-ax,acy=cy-ay,acz=cz-az,apx=px-ax,apy=py-ay,apz=pz-az;
  const d1=abx*apx+aby*apy+abz*apz,d2=acx*apx+acy*apy+acz*apz;let rx,ry,rz;
  if(d1<=0&&d2<=0){rx=ax;ry=ay;rz=az}else{
  const bpx=px-bx,bpy=py-by,bpz=pz-bz,d3=abx*bpx+aby*bpy+abz*bpz,d4=acx*bpx+acy*bpy+acz*bpz;
  if(d3>=0&&d4<=d3){rx=bx;ry=by;rz=bz}else{
  const vc=d1*d4-d3*d2;
  if(vc<=0&&d1>=0&&d3<=0){const v=d1/(d1-d3);rx=ax+v*abx;ry=ay+v*aby;rz=az+v*abz}else{
  const cpx=px-cx,cpy=py-cy,cpz=pz-cz,d5=abx*cpx+aby*cpy+abz*cpz,d6=acx*cpx+acy*cpy+acz*cpz;
  if(d6>=0&&d5<=d6){rx=cx;ry=cy;rz=cz}else{
  const vb=d5*d2-d1*d6;
  if(vb<=0&&d2>=0&&d6<=0){const w=d2/(d2-d6);rx=ax+w*acx;ry=ay+w*acy;rz=az+w*acz}else{
  const va=d3*d6-d5*d4;
  if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0){const w=(d4-d3)/((d4-d3)+(d5-d6));rx=bx+w*(cx-bx);ry=by+w*(cy-by);rz=bz+w*(cz-bz)}else{
  const den=1/(va+vb+vc),v=vb*den,w=vc*den;rx=ax+abx*v+acx*w;ry=ay+aby*v+acy*w;rz=az+abz*v+acz*w}}}}}}
  return (px-rx)**2+(py-ry)**2+(pz-rz)**2;
}
function segSegDist2(p1,q1,p2,q2){ // Ericson
  const d1=[q1[0]-p1[0],q1[1]-p1[1],q1[2]-p1[2]],d2=[q2[0]-p2[0],q2[1]-p2[1],q2[2]-p2[2]],r=[p1[0]-p2[0],p1[1]-p2[1],p1[2]-p2[2]];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];const a=dot(d1,d1),e=dot(d2,d2),f=dot(d2,r);let s,t;
  if(a<=1e-12&&e<=1e-12){s=t=0}else if(a<=1e-12){s=0;t=Math.min(1,Math.max(0,f/e))}else{const c=dot(d1,r);
    if(e<=1e-12){t=0;s=Math.min(1,Math.max(0,-c/a))}else{const b=dot(d1,d2),den=a*e-b*b;s=den!==0?Math.min(1,Math.max(0,(b*f-c*e)/den)):0;t=(b*s+f)/e;
      if(t<0){t=0;s=Math.min(1,Math.max(0,-c/a))}else if(t>1){t=1;s=Math.min(1,Math.max(0,(b-c)/a))}}}
  const x=p1[0]+d1[0]*s-(p2[0]+d2[0]*t),y=p1[1]+d1[1]*s-(p2[1]+d2[1]*t),z=p1[2]+d1[2]*s-(p2[2]+d2[2]*t);return x*x+y*y+z*z;
}
function meshDistance(TA,TB,limit=60000){
  let best=Infinity,n=0;
  for(let i=0;i<TA.length;i+=9) for(let j=0;j<TB.length;j+=9){
    if(++n>limit) return Math.sqrt(best);
    for(let k=0;k<3;k++){best=Math.min(best,ptTriDist2(TA[i+k*3],TA[i+k*3+1],TA[i+k*3+2],TB,j),ptTriDist2(TB[j+k*3],TB[j+k*3+1],TB[j+k*3+2],TA,i))}
    for(let e=0;e<3;e++) for(let f=0;f<3;f++){
      const p1=[TA[i+e*3],TA[i+e*3+1],TA[i+e*3+2]],q1=[TA[i+((e+1)%3)*3],TA[i+((e+1)%3)*3+1],TA[i+((e+1)%3)*3+2]];
      const p2=[TB[j+f*3],TB[j+f*3+1],TB[j+f*3+2]],q2=[TB[j+((f+1)%3)*3],TB[j+((f+1)%3)*3+1],TB[j+((f+1)%3)*3+2]];
      best=Math.min(best,segSegDist2(p1,q1,p2,q2));}
  }
  return Math.sqrt(best);
}
/* retorna {hit:boolean, value(mm), center:[x,y,z]} usando a geometria real */
function exactTest(a,b,kind,tolM){
  const pad=kind==="clearance"?tolM:0.0005;
  const bx=[Math.max(a.box.min.x,b.box.min.x)-pad,Math.max(a.box.min.y,b.box.min.y)-pad,Math.max(a.box.min.z,b.box.min.z)-pad,
            Math.min(a.box.max.x,b.box.max.x)+pad,Math.min(a.box.max.y,b.box.max.y)+pad,Math.min(a.box.max.z,b.box.max.z)+pad];
  if(bx[0]>bx[3]||bx[1]>bx[4]||bx[2]>bx[5]) return null;
  const TA=trisIn(a,bx),TB=trisIn(b,bx);if(!TA.length&&!TB.length) return null;
  const pts=[];if(TA.length&&TB.length) crossPoints(TA,TB,pts);
  insideVerts(a,b,bx,pts);insideVerts(b,a,bx,pts);
  if(pts.length){
    let x0=Infinity,y0=Infinity,z0=Infinity,x1=-Infinity,y1=-Infinity,z1=-Infinity;
    for(let k=0;k<pts.length;k+=3){const x=pts[k],y=pts[k+1],z=pts[k+2];if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;if(z<z0)z0=z;if(z>z1)z1=z}
    const depth=Math.min(x1-x0,y1-y0,z1-z0)*1000;
    return {inter:true,value:depth,center:[(x0+x1)/2,(y0+y1)/2,(z0+z1)/2]};
  }
  if(kind!=="clearance"||!TA.length||!TB.length) return null;
  const d=meshDistance(TA,TB);
  return d<tolM?{inter:false,value:d*1000,center:[(bx[0]+bx[3])/2,(bx[1]+bx[4])/2,(bx[2]+bx[5])/2]}:null;
}

module.exports={exactTest,pointInside};
