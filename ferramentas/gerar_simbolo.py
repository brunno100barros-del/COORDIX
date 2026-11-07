"""COORDIX · gera o símbolo (olho estilizado) em SVG vetorial.
Uso:  python ferramentas/gerar_simbolo.py > trecho.svg
Escreve marca/coordix-simbolo.svg, marca/coordix-simbolo-sobrancelha.svg e marca/coordix-icone.svg,
e imprime o trecho embutido na barra superior do index.html.
A geometria foi medida sobre a fotografia de referência (canto interno, canto externo, curva das
pálpebras, centro e raio da íris, reflexo retangular da janela, cílios e sobrancelha)."""
import math
def bez(p0,p1,p2,p3,t):
    u=1-t; return tuple(u**3*a+3*u*u*t*b+3*u*t*t*c+t**3*d for a,b,c,d in zip(p0,p1,p2,p3))
def dbez(p0,p1,p2,p3,t):
    u=1-t; return tuple(3*u*u*(b-a)+6*u*t*(c-b)+3*t*t*(d-c) for a,b,c,d in zip(p0,p1,p2,p3))
import re
# proporção do olho: LARG < 1 estreita, ALT > 1 abre (aplicadas aos pontos medidos, não às espessuras,
# para que a íris continue circular e os traços mantenham o peso)
LARG=0.80; ALT=1.20; CX0,CY0=32.0,37.0
def T(p): return (CX0+(p[0]-CX0)*LARG, CY0+(p[1]-CY0)*ALT)
def TP(d): return re.sub(r"(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", lambda m: P(T((float(m.group(1)),float(m.group(2))))), d)
IN=T((7.4,40.6)); TOP=T((29.4,30.8)); OUT=T((57.0,37.4))
U1=(IN,T((13,33.4)),T((21,30.7)),TOP); U2=(TOP,T((40,30.9)),T((50.5,33.2)),OUT)
def f(v): return f"{v:.2f}".rstrip('0').rstrip('.')
def P(p): return f"{f(p[0])},{f(p[1])}"
# contorno do olho (abertura)
abertura=f"M{P(IN)} C{P(U1[1])} {P(U1[2])} {P(TOP)} C{P(U2[1])} {P(U2[2])} {P(OUT)} C{P(T((50.2,41.6)))} {P(T((40,43.7)))} {P(T((29.6,43.5)))} C{P(T((20.4,43.3)))} {P(T((12.4,42.3)))} {P(IN)}Z"
# linha da pálpebra superior: faixa afilada (fina no canto interno, espessa no externo) + prolongamento externo
def lid_pt(s):  # s em [0,2]
    return bez(*U1,s) if s<=1 else bez(*U2,s-1)
def lid_d(s):
    return dbez(*U1,s) if s<=1 else dbez(*U2,s-1)
N=40; top=[];bot=[]
for k in range(N+1):
    s=2*k/N; x,y=lid_pt(s); dx,dy=lid_d(s); L=math.hypot(dx,dy); nx,ny=dy/L,-dx/L  # normal para cima
    w=0.25+1.55*(s/2)**1.6
    top.append((x+nx*w,y+ny*w)); bot.append((x-nx*0.15,y-ny*0.15))
# prolongamento (asa) além do canto externo
wing_tip=T((60.9,38.9))
palpebra="M"+" L".join(P(p) for p in top)+f" L{P(wing_tip)} L"+" L".join(P(p) for p in reversed(bot))+"Z"
# cílios: lâminas afiladas e curvas, mais longas no centro-externo, varrendo para fora
lashes=[]
n=14
for k in range(n):
    a=k/(n-1)
    s=0.66+1.33*a                                  # posição ao longo da pálpebra
    x,y=lid_pt(s); dx,dy=lid_d(s); L=math.hypot(dx,dy); tx,ty=dx/L,dy/L; nx,ny=ty,-tx
    length=(2.6+7.6*math.sin(math.pi*(0.16+0.66*a)))*(1 if k%2==0 else 0.8)  # curto–longo–médio, alternado
    ang=math.radians(10+66*a**1.45)                 # inclinação para o canto externo
    dirx=nx*math.cos(ang)+tx*math.sin(ang); diry=ny*math.cos(ang)+ty*math.sin(ang)
    curl=0.14+0.10*a                               # curvatura para cima (cílio curvado)
    ex,ey=x+dirx*length, y+diry*length
    # ponto de controle deslocado para fora (curva)
    cx,cy=x+dirx*length*0.55 - tx*0, y+diry*length*0.55
    cx+= -diry*length*curl*-1*0; cy+= 0
    # curva: controle girado para trás (sentido contrário ao avanço) dá a curvatura do cílio
    px,py=-diry,dirx
    cx,cy=x+dirx*length*0.5+px*length*curl, y+diry*length*0.5+py*length*curl
    if py>0: cx,cy=x+dirx*length*0.5-px*length*curl, y+diry*length*0.5-py*length*curl
    b=0.42+0.18*math.sin(math.pi*a)                # meia largura na base
    lashes.append(f"M{P((x-tx*b,y-ty*b))} Q{P((cx-tx*b*0.5,cy-ty*b*0.5))} {P((ex,ey))} Q{P((cx+tx*b*0.5,cy+ty*b*0.5))} {P((x+tx*b,y+ty*b))}Z")
cilios=" ".join(lashes)
IRIS=T((29.1,37.9)); R=8.6; RP=3.2
BRx,BRy=IRIS[0]-29.1,IRIS[1]-37.9   # o reflexo acompanha a íris (sem mudar de tamanho)
BRILHO=f"M{f(26.1+BRx)},{f(33.6+BRy)}h2.5v2.1h-2.5z M{f(29.2+BRx)},{f(33.6+BRy)}h4.7v2.1h-4.7z"
INFERIOR=TP("M8.6,41.1 C13,42.6 21,43.5 29.6,43.6 C40,43.8 50,41.6 55.6,38.4")
SOB=TP("M2.6,25.2 C2,23.4 2.2,20.8 3.6,19.4 C10,15.2 24,8.6 36,5 C41,3.5 45.4,3 48.4,4.2 C52.8,6.2 56.6,11 58.8,16.4 C55.8,13.4 52,10.6 47.6,9.8 C41.4,8.8 31.4,11.6 21.2,15.8 C14,18.8 7.6,22.2 2.6,25.2Z")
def caixa(*ds):
    xs=[];ys=[]
    for d in ds:
        for a,b in re.findall(r"(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)",d): xs.append(float(a));ys.append(float(b))
    pad=0.6; x0,y0=min(xs)-pad,min(ys)-pad; return f"{f(x0)} {f(y0)} {f(max(xs)+pad-x0)} {f(max(ys)+pad-y0)}"
VB=caixa(abertura,palpebra,cilios,INFERIOR); VB_SOB=caixa(abertura,palpebra,cilios,INFERIOR,SOB)
def svg(viewbox, extra="", brow=False, size=None):
    sz=f' width="{size[0]}" height="{size[1]}"' if size else ""
    sob=""
    if brow:
        sob=f'<path class="cx-sob" d="{SOB}"/>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}"{sz} role="img" aria-label="COORDIX">
<title>COORDIX</title>
<defs><clipPath id="cx-abertura"><path d="{abertura}"/></clipPath></defs>
<g class="cx-olho">
{sob}<g clip-path="url(#cx-abertura)">
<circle class="cx-iris" cx="{f(IRIS[0])}" cy="{f(IRIS[1])}" r="{R}"/>
<circle class="cx-limbo" cx="{f(IRIS[0])}" cy="{f(IRIS[1])}" r="{R-0.45}" fill="none" stroke-width="0.9"/>
<circle class="cx-pupila" cx="{f(IRIS[0])}" cy="{f(IRIS[1]+0.3)}" r="{RP}"/>
<path class="cx-brilho" d="{BRILHO}"/>
</g>
<path class="cx-inferior" d="{INFERIOR}" fill="none" stroke-width="0.55" stroke-linecap="round"/>
<path class="cx-palpebra" d="{palpebra}"/>
<path class="cx-cilios" d="{cilios}"/>
</g>
{extra}</svg>'''

import os, sys
R_=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","marca")+os.sep
ESTILO='''<style>
.cx-palpebra,.cx-cilios,.cx-sob{fill:var(--cx-traco,#15181d)}
.cx-inferior{stroke:var(--cx-traco,#15181d);opacity:.55}
.cx-iris{fill:var(--cx-iris,#6b3a1f)}
.cx-limbo{stroke:var(--cx-limbo,#3a1f10)}
.cx-pupila{fill:var(--cx-pupila,#140b06)}
.cx-brilho{fill:var(--cx-brilho,#ffffff)}
@media (prefers-color-scheme:dark){
.cx-palpebra,.cx-cilios,.cx-sob{fill:var(--cx-traco,#e8eaed)}
.cx-inferior{stroke:var(--cx-traco,#e8eaed)}
.cx-iris{fill:var(--cx-iris,#9a5a32)}
.cx-limbo{stroke:var(--cx-limbo,#4a2a16)}}
</style>'''
def com_estilo(x): return x.replace("<defs>",ESTILO+"<defs>",1)
HDR="<!-- COORDIX · símbolo (olho estilizado a partir da fotografia de referência). Vetorial, fundo transparente.\n     Cores por variáveis CSS (--cx-traco, --cx-iris, --cx-limbo, --cx-pupila, --cx-brilho), com padrão claro/escuro. -->\n"
open(R_+"coordix-simbolo.svg","w").write(HDR+com_estilo(svg(VB)))
open(R_+"coordix-simbolo-sobrancelha.svg","w").write(HDR+com_estilo(svg(VB_SOB,brow=True)))
# ícone do aplicativo: símbolo sobre placa grafite (cores fixas, legível em qualquer fundo)
corpo=svg(VB)
ini=corpo.index("<defs>"); fim=corpo.rindex("</svg>")
miolo=corpo[ini:fim].replace('class="cx-palpebra"','class="cx-palpebra" fill="#eceef1"').replace('class="cx-cilios"','class="cx-cilios" fill="#eceef1"').replace('class="cx-inferior"','class="cx-inferior" stroke="#eceef1" opacity=".55"').replace('class="cx-iris"','class="cx-iris" fill="#9a5a32"').replace('class="cx-limbo"','class="cx-limbo" stroke="#4a2a16"').replace('class="cx-pupila"','class="cx-pupila" fill="#140b06"').replace('class="cx-brilho"','class="cx-brilho" fill="#ffffff"')
miolo=miolo.replace('class="cx-','class="cxi-').replace('cx-abertura','cxi-abertura')  # nomes próprios: o ícone não herda estilos de uma página que use o símbolo
icone=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="COORDIX">
<title>COORDIX</title>
<rect width="512" height="512" rx="64" fill="#15181d"/>
<rect x="24" y="24" width="464" height="464" rx="44" fill="none" stroke="#2c323b" stroke-width="2"/>
<svg x="56" y="86" width="400" height="340" viewBox="{VB}" preserveAspectRatio="xMidYMid meet">{miolo}</svg>
</svg>'''
open(R_+"coordix-icone.svg","w").write("<!-- COORDIX · ícone do aplicativo (512×512) -->\n"+icone)
# trecho para embutir no index.html (sem <style>: as cores vêm dos tokens do app)
inl=svg(VB).replace(' role="img" aria-label="COORDIX">\n<title>COORDIX</title>',' class="logo-mark" aria-hidden="true" focusable="false">')
import sys as _s; _s.stderr.write("viewBox "+VB+"\n")
print(inl)  # trecho para colar no index.html (barra superior)
