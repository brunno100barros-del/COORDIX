const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1000,height:520},deviceScaleFactor:2});
const R=require('path').join(__dirname,'..','marca')+'/';const s=fs.readFileSync(R+'coordix-simbolo.svg','utf8'),sb=fs.readFileSync(R+'coordix-simbolo-sobrancelha.svg','utf8'),ic=fs.readFileSync(R+'coordix-icone.svg','utf8');
const fit=x=>x.replace('<svg ','<svg style="width:100%;height:100%" ');
const lado=(bg,ink,iris,limbo,label)=>`<div style="background:${bg};color:${ink};--cx-traco:${ink};--cx-iris:${iris};--cx-limbo:${limbo};flex:1;padding:28px;display:flex;flex-direction:column;gap:22px;font-family:sans-serif">
<div style="font:600 11px monospace;letter-spacing:.14em;opacity:.6">${label}</div>
<div style="height:120px">${fit(s)}</div>
<div style="display:flex;align-items:center;gap:12px"><div style="width:54px;height:25px">${fit(s)}</div><div style="font:700 22px sans-serif;letter-spacing:.14em">COORDIX<div style="font:600 9px monospace;letter-spacing:.26em;opacity:.6">BIMOFFICE</div></div></div>
<div style="display:flex;gap:18px;align-items:end">${[16,24,32].map(h=>`<div style="height:${h}px;width:${h*58/26}px">${fit(s)}</div>`).join('')}</div></div>`;
await p.setContent(`<body style="margin:0;display:flex">${lado('#fbfbfc','#12151a','#6b3a1f','#3a1f10','TEMA CLARO')}${lado('#121519','#e6e8eb','#9a5a32','#4a2a16','TEMA ESCURO')}
<div style="background:#e8eaed;width:260px;padding:28px;display:flex;flex-direction:column;gap:20px"><div style="font:600 11px monospace;letter-spacing:.14em;opacity:.6">ÍCONE · COM SOBRANCELHA</div><div style="width:150px;height:150px">${fit(ic)}</div><div style="height:110px;--cx-traco:#12151a">${fit(sb)}</div></div></body>`);
await p.screenshot({path:R+'coordix-simbolo-vitrine.png'});await b.close()})();
