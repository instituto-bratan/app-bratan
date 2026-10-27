/* APRESENTAÇÃO DO APP DO DOUTOR — o script da v22 que morava dentro do apresentacao.html
   (a CSP do site não roda script em linha). 28/10/2026: só as fontes mudaram. */
const track=document.getElementById('track');
const scenes=[...document.querySelectorAll('.scene')];
const dotsBox=document.getElementById('dots');
const prevB=document.getElementById('prev'),nextB=document.getElementById('next');
const pageno=document.getElementById('pageno');
let cur=0;
const pad=n=>String(n+1).padStart(2,'0');

scenes.forEach((s,i)=>{
  const d=document.createElement('button');
  d.className='dot'+(i===0?' on':'');
  d.addEventListener('click',()=>go(i));
  dotsBox.appendChild(d);
});
const dots=[...document.querySelectorAll('.dot')];

function go(i){
  if(i<0||i>=scenes.length)return;
  cur=i;
  track.style.transform=`translateX(-${i*100}vw)`;
  scenes.forEach((s,k)=>s.classList.toggle('active',k===i));
  dots.forEach((d,k)=>d.classList.toggle('on',k===i));
  pageno.textContent=pad(i)+' / '+pad(scenes.length-1)+'';
  pageno.textContent=pad(i)+' / '+String(scenes.length).padStart(2,'0');
  prevB.classList.toggle('hide',i===0);
  nextB.classList.toggle('hide',i===scenes.length-1);
  if(scenes[i].querySelector('#jfill'))runJourney();
  if(scenes[i].querySelector('#chatbox'))runChat();
  if(scenes[i].querySelector('#tchart'))runTChart();
  if(scenes[i].querySelector('#bars2'))runBars();
  if(scenes[i].querySelector('#evochart'))runEvo();
}
nextB.onclick=()=>go(cur+1);
/* pular direto para a cena do construtor de valores */
const skipEl=document.getElementById('skipbtn');
if(skipEl){
  skipEl.addEventListener('click',()=>{
    const idx=scenes.findIndex(s=>s.querySelector('#bcard'));
    if(idx>-1)go(idx);
  });
}
prevB.onclick=()=>go(cur-1);
addEventListener('keydown',e=>{
  if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' ')go(cur+1);
  if(e.key==='ArrowLeft'||e.key==='PageUp')go(cur-1);
});
let tx=null;
addEventListener('touchstart',e=>{tx=e.touches[0].clientX},{passive:true});
addEventListener('touchend',e=>{
  if(tx===null)return;
  const dx=e.changedTouches[0].clientX-tx;
  if(Math.abs(dx)>55)go(cur+(dx<0?1:-1));
  tx=null;
});
addEventListener('wheel',e=>{
  if(Math.abs(e.deltaX)>Math.abs(e.deltaY)&&Math.abs(e.deltaX)>30){
    if(e.deltaX>0)go(cur+1);else go(cur-1);
  }
},{passive:true});

let jDone=false;
function runJourney(){
  if(jDone)return;jDone=true;
  document.getElementById('jfill').style.width='98%';
  document.querySelectorAll('.jm').forEach((m,i)=>setTimeout(()=>m.classList.add('on'),300+i*230));
}
let cDone=false;
function runChat(){
  if(cDone)return;cDone=true;
  document.querySelectorAll('#chatbox .msg').forEach((m,i)=>setTimeout(()=>m.classList.add('show'),400+i*640));
}
let tDone=false;
function runTChart(){
  if(tDone)return;tDone=true;
  document.getElementById('tcurve').classList.add('draw');
  document.getElementById('tarea').classList.add('show');
  ['m1','ml1','m2','ml2'].forEach((id,i)=>setTimeout(()=>document.getElementById(id).classList.add('show'),1400+i*250));
}
let barDone=false;
function runBars(){
  if(barDone)return;barDone=true;
  document.querySelectorAll('#bars2 .bfill').forEach(f=>{f.style.height=f.dataset.h;});
  document.querySelectorAll('#bars2 .bval').forEach(v=>v.classList.add('show'));
}
let evoDone=false;
function runEvo(){
  if(evoDone)return;evoDone=true;
  document.querySelectorAll('#evochart .curve').forEach(c=>c.classList.add('draw'));
  setTimeout(()=>document.querySelectorAll('#evochart .marker').forEach(m=>m.classList.add('show')),1600);
}

/* SYMPTOM QUIZ */
const qchips=document.querySelectorAll('.qchip');
const qcount=document.getElementById('qcount'),qfill=document.getElementById('qfill'),qtext=document.getElementById('qtext');
if(qchips.length){
  qchips.forEach(c=>c.addEventListener('click',()=>{
    c.classList.toggle('on');
    const n=document.querySelectorAll('.qchip.on').length;
    const tot=qchips.length;
    qcount.innerHTML=n+'<span>marcados</span>';
    qfill.style.width=(n/tot*100)+'%';
    if(n===0) qtext.innerHTML='Cada sinal isolado parece pequeno. Juntos, contam uma história que <b>vale investigar</b> a fundo.';
    else if(n<=2) qtext.innerHTML='Mesmo poucos sinais merecem atenção. O corpo raramente reclama à toa. <b>Vale investigar.</b>';
    else if(n<=4) qtext.innerHTML='Um padrão começa a aparecer. Esses sinais costumam ter uma causa comum, e uma causa comum <b>tem solução comum.</b>';
    else qtext.innerHTML='Vários sinais ao mesmo tempo raramente são coincidência. Esse é exatamente o quadro que <b>um plano bem desenhado transforma.</b>';
  }));
}

/* trajetorias */
document.querySelectorAll('.pt-btn').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.pt-btn').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    document.querySelectorAll('.path').forEach(p=>p.classList.remove('on'));
    document.querySelector('.path.'+b.dataset.path).classList.add('on');
  });
});

/* BUILDER */
const fmt=n=>'R$ '+Math.round(n).toLocaleString('pt-BR');
/* le numero no formato brasileiro: 1.500,50 / 1500,5 / 1500 */
function parseBR(v){
  if(v===undefined||v===null)return 0;
  let s=String(v).trim();
  if(!s)return 0;
  s=s.replace(/[^0-9.,-]/g,'');
  if(s.indexOf(',')>-1){ s=s.replace(/\./g,'').replace(',','.'); }
  else if((s.match(/\./g)||[]).length>1){ s=s.replace(/\./g,''); }
  else {
    const m=s.match(/\.(\d{3})$/);
    if(m) s=s.replace(/\./g,'');
  }
  const n=parseFloat(s);
  return (isNaN(n)||n<0)?0:n;
}
/* fatores de calculo: 8% no valor a vista, e mais 12% quando parcelado em 6x */
const F_AVISTA=1.08, F_PARC=1.08*1.12;
function selectedPellets(){
  return [...document.querySelectorAll('#pelletbox .pellet.on')].map(p=>({name:p.dataset.p,price:+(p.dataset.pp||0),qty:+(p.dataset.q||1)}));
}
function rebuild(){
  const sel=[...document.querySelectorAll('.opt.sel')];
  const list=document.getElementById('blist');
  list.innerHTML='';
  let total=0;
  if(!sel.length){
    list.innerHTML='<li class="empty">Selecione os itens do protocolo</li>';
  }
  sel.forEach(o=>{
    const price=+o.dataset.price;
    const qty=+(o.dataset.qty||1);
    let sub=price*qty;
    const label=o.querySelector('.on-l').textContent;
    const unit=o.dataset.unit;
    const qlabel=(qty>1&&unit)?`<span class="bl-q">${qty} ${unit}${qty>1&&unit!=='un'?'s':''}</span>`:'';
    let extra='';
    if(o.dataset.haspellets){
      const pel=selectedPellets();
      if(pel.length){
        const pelTotal=pel.reduce((s,p)=>s+p.price*p.qty,0);
        sub+=pelTotal;
        const pelStr=pel.map(p=>`${p.name}${p.qty>1?' x'+p.qty:''}`).join(', ');
        extra=`<span class="bl-q" style="display:block;margin-left:0;margin-top:3px;color:var(--creme-faint)">Pellets: ${pelStr}</span>`;
      }
    }
    total+=sub;
    const li=document.createElement('li');
    li.innerHTML=`<span class="bl-name">${label}${qlabel}${extra}</span><span class="v">${fmt(sub)}</span>`;
    list.appendChild(li);
  });
  const parc=document.getElementById('bparc');
  const dline=document.getElementById('dline');
  // desconto
  const dv=parseBR((document.getElementById('dval')||{}).value);
  const dt=(document.getElementById('dtype')||{}).value||'reais';
  /* desconto aplicado sobre o valor a vista (soma + 8%), para bater com a linha de baixo */
  const avistaBruto=total*F_AVISTA;
  let desconto=0;
  if(dv>0&&total>0){
    desconto = dt==='pct' ? avistaBruto*(Math.min(dv,100)/100) : Math.min(dv,avistaBruto);
  }
  const totalAvista=Math.max(0,avistaBruto-desconto);
  const soma=document.getElementById('somaline');
  const avl=document.getElementById('avistaline');
  if(soma) soma.innerHTML='';
  if(avl) avl.innerHTML = (total>0&&desconto>0) ? '<span>Valor à vista</span><b>'+fmt(avistaBruto)+'</b>' : '';
  if(dline){
    if(desconto>0){
      dline.classList.add('show');
      dline.innerHTML='<span>Desconto'+(dt==='pct'?' ('+dv+'%)':'')+'</span><b>- '+fmt(desconto)+'</b>';
    }
    else dline.classList.remove('show');
  }
  if(total>0){
    const totalParc=totalAvista*1.12;
    const parcela=totalParc/6;
    document.getElementById('btotal').innerHTML=`6x de ${fmt(parcela)}`;
    parc.innerHTML=`total em 6x ${fmt(totalParc)} · ou <b>${fmt(totalAvista)}</b> à vista no Pix`;
  }else{
    document.getElementById('btotal').textContent='R$ 0';
    parc.textContent='';
  }
}
function setQty(o,q){
  q=Math.max(1,Math.min(60,q));
  o.dataset.qty=q;
  const qv=o.querySelector('.qv');
  if(qv)qv.textContent=q;
  rebuild();
}
document.querySelectorAll('.opt').forEach(o=>{
  o.dataset.qty=o.dataset.qty||1;
  o.addEventListener('click',e=>{
    if(e.target.closest('.stepper'))return;
    o.classList.toggle('sel');
    if(!o.classList.contains('sel'))setQty(o,1);
    rebuild();
  });
  const inc=o.querySelector('.inc'),dec=o.querySelector('.dec');
  if(inc)inc.addEventListener('click',e=>{e.stopPropagation();setQty(o,(+o.dataset.qty)+1);});
  if(dec)dec.addEventListener('click',e=>{e.stopPropagation();setQty(o,(+o.dataset.qty)-1);});
  const nameEl=o.querySelector('.on-l');
  const startEdit=()=>{
    const cur=+o.dataset.price;
    const nv=prompt('Ajustar valor unitário deste item (R$):',cur);
    if(nv!==null&&!isNaN(+nv)&&+nv>=0){
      o.dataset.price=+nv;
      const p=o.querySelector('.on-p');
      if(p)p.textContent=fmt(+nv);
      rebuild();
    }
  };
  if(nameEl){
    nameEl.addEventListener('dblclick',ev=>{ev.stopPropagation();startEdit();});
    let timer=null;
    nameEl.addEventListener('touchstart',()=>{timer=setTimeout(startEdit,650);},{passive:true});
    nameEl.addEventListener('touchend',()=>clearTimeout(timer));
  }
});
/* pellets */
document.querySelectorAll('#pelletbox .pellet').forEach(p=>{
  p.dataset.q=p.dataset.q||1;
  const setPQ=q=>{q=Math.max(1,Math.min(20,q));p.dataset.q=q;const v=p.querySelector('.pqv');if(v)v.textContent=q;rebuild();};
  p.addEventListener('click',e=>{
    if(e.target.closest('.pqty'))return;
    e.stopPropagation();
    p.classList.toggle('on');
    if(!p.classList.contains('on'))setPQ(1);
    rebuild();
  });
  const inc=p.querySelector('.pinc'),dec=p.querySelector('.pdec');
  if(inc)inc.addEventListener('click',e=>{e.stopPropagation();setPQ((+p.dataset.q)+1);});
  if(dec)dec.addEventListener('click',e=>{e.stopPropagation();setPQ((+p.dataset.q)-1);});
});
/* editable patient name / card title */
const ctitle=document.getElementById('bcardtitle');
if(ctitle){
  const editTitle=()=>{
    const nv=prompt('Nome do paciente (aparece no topo do plano):',ctitle.textContent);
    if(nv!==null&&nv.trim())ctitle.textContent=nv.trim();
  };
  ctitle.addEventListener('dblclick',editTitle);
  let tt=null;
  ctitle.addEventListener('touchstart',()=>{tt=setTimeout(editTitle,650);},{passive:true});
  ctitle.addEventListener('touchend',()=>clearTimeout(tt));
}
/* desconto */
const dvalEl=document.getElementById('dval'),dtypeEl=document.getElementById('dtype'),dpreEl=document.getElementById('dpre');
if(dvalEl){
  dvalEl.addEventListener('input',rebuild);
  dtypeEl.addEventListener('change',()=>{dpreEl.textContent=dtypeEl.value==='pct'?'%':'R$';rebuild();});
}
rebuild();

/* reveal toggle */
const rt=document.getElementById('revToggle'),bcard=document.getElementById('bcard');
rt.addEventListener('click',()=>{
  rt.classList.toggle('on');
  bcard.classList.toggle('masked');
});

/* NUMERO DE PROTOCOLO (sequencial por dia) */
function protocoloNum(){
  const d=new Date();
  const ymd=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  let seq=1;
  try{
    const k='bratan_prot_'+ymd;
    seq=(parseInt(localStorage.getItem(k)||'0',10))+1;
    localStorage.setItem(k,seq);
  }catch(e){ seq=Math.floor(Math.random()*900)+100; }
  return 'BRA-'+ymd+'-'+String(seq).padStart(3,'0');
}

/* GERADOR DE RELATORIO (tema: 'dark' tela | 'print' impressao) */
function gerarRelatorio(tema){
  const sel=[...document.querySelectorAll('.opt.sel')];
  let title=document.getElementById('bcardtitle').textContent.trim();
  if(!title||title==='Seu plano Bratan'){
    const nv=prompt('Nome do paciente para este protocolo:','');
    if(nv===null)return;
    if(nv.trim()){title=nv.trim();document.getElementById('bcardtitle').textContent=title;}
  }
  const items=sel.map(o=>{
    const price=+o.dataset.price, qty=+(o.dataset.qty||1), unit=o.dataset.unit||'';
    const label=o.querySelector('.on-l').textContent;
    let sub=`${label}`;
    if(qty>1)sub+=` · ${qty} ${unit}${unit&&unit!=='un'?'s':''}`;
    let pel='', val=price*qty;
    if(o.dataset.haspellets){
      const p=selectedPellets();
      if(p.length){
        val+=p.reduce((s,x)=>s+x.price*x.qty,0);
        pel=p.map(x=>`${x.name}${x.qty>1?' x'+x.qty:''} (${fmt(x.price*x.qty)})`).join(', ');
      }
    }
    return {label:sub,val,pel};
  });
  if(!items.length){alert('Selecione ao menos um item antes de gerar o relatório.');return;}
  const totalBruto=items.reduce((s,i)=>s+i.val,0);
  const avistaBrutoR=totalBruto*F_AVISTA;
  const dvR=parseBR((document.getElementById('dval')||{}).value);
  const dtR=(document.getElementById('dtype')||{}).value||'reais';
  let descR=0;
  if(dvR>0&&totalBruto>0) descR = dtR==='pct' ? avistaBrutoR*(Math.min(dvR,100)/100) : Math.min(dvR,avistaBrutoR);
  const totalAvista=Math.max(0,avistaBrutoR-descR);
  const total=totalAvista;
  const totalParc=totalAvista*1.12;
  const parcela=totalParc/6;
  const now=new Date();
  const dstr=now.toLocaleDateString('pt-BR')+' '+now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const prot=protocoloNum();

  // PALETAS
  const P = tema==='print' ? {
    bg:'#FFFFFF', topbar:'#4D563B', accentbar:'#C6A862',
    eyebrow:'#7A895E', h1:'#2B3323', meta:'#5C6650',
    div:'rgba(77,86,59,.35)', rowline:'rgba(77,86,59,.14)',
    item:'#2B3323', value:'#4D563B', pellet:'#6B7459',
    totlbl:'#5C6650', big:'#4D563B', sub:'#3D4533',
    desc:'#4D563B', foot:'#7A8570'
  } : {
    bg:'#171B12', topbar:'#0E1108', accentbar:'#C6A862',
    eyebrow:'#C6A862', h1:'#F8EDBD', meta:'rgba(248,237,189,.6)',
    div:'rgba(198,168,98,.3)', rowline:'rgba(248,237,189,.08)',
    item:'#F8EDBD', value:'#D9C08A', pellet:'rgba(248,237,189,.5)',
    totlbl:'rgba(248,237,189,.6)', big:'#C6A862', sub:'rgba(248,237,189,.7)',
    desc:'#D9C08A', foot:'rgba(248,237,189,.35)'
  };

  const scale=2, W=720, pad=48;
  let H=486 + items.length*54 + (items.filter(i=>i.pel).length*20) + (descR>0?54:0);
  const c=document.createElement('canvas');
  c.width=W*scale; c.height=H*scale;
  const x=c.getContext('2d'); x.scale(scale,scale);
  // fundo
  x.fillStyle=P.bg; x.fillRect(0,0,W,H);
  x.fillStyle=P.topbar; x.fillRect(0,0,W,7);
  x.fillStyle=P.accentbar; x.fillRect(0,0,W,4);
  // cabecalho
  x.fillStyle=P.eyebrow; x.font='600 13px Jost, "Avenir Next", Avenir, sans-serif';
  x.fillText('INSTITUTO BRATAN · RELATÓRIO COMERCIAL', pad, 52);
  x.fillStyle=P.h1; x.font='600 30px "Cormorant Garamond", "Iowan Old Style", Palatino, Georgia, serif';
  x.fillText('Protocolo fechado', pad, 88);
  x.fillStyle=P.meta; x.font='300 13px Jost, "Avenir Next", Avenir, sans-serif';
  x.fillText('Paciente: '+title, pad, 112);
  x.fillText('Protocolo nº '+prot, pad, 132);
  x.fillText('Emitido em '+dstr+'  ·  Dr. Daniel Bratan · CRM 168649', pad, 152);
  x.strokeStyle=P.div; x.lineWidth=1; x.beginPath(); x.moveTo(pad,172); x.lineTo(W-pad,172); x.stroke();
  // itens
  let y=208;
  x.font='600 11px Jost, "Avenir Next", Avenir, sans-serif'; x.fillStyle=P.eyebrow;
  x.fillText('ITEM', pad, y-14);
  x.textAlign='right'; x.fillText('VALOR', W-pad, y-14); x.textAlign='left';
  items.forEach(it=>{
    x.fillStyle=P.item; x.font='400 15px Jost, "Avenir Next", Avenir, sans-serif';
    x.fillText(it.label, pad, y+10);
    x.textAlign='right'; x.fillStyle=P.value; x.font='500 15px Jost, "Avenir Next", Avenir, sans-serif';
    x.fillText(fmt(it.val), W-pad, y+10); x.textAlign='left';
    y+=26;
    if(it.pel){
      x.fillStyle=P.pellet; x.font='300 12px Jost, "Avenir Next", Avenir, sans-serif';
      x.fillText('Pellets: '+it.pel, pad+10, y+6); y+=22;
    }
    x.strokeStyle=P.rowline; x.beginPath(); x.moveTo(pad,y); x.lineTo(W-pad,y); x.stroke();
    y+=22;
  });
  // total
  y+=10;
  x.strokeStyle=P.div; x.beginPath(); x.moveTo(pad,y); x.lineTo(W-pad,y); x.stroke();
  y+=28;
  x.fillStyle=P.sub; x.font='400 13px Jost, "Avenir Next", Avenir, sans-serif';
  x.fillText('Soma dos itens', pad, y);
  x.textAlign='right'; x.fillText(fmt(totalBruto), W-pad, y); x.textAlign='left';
  y+=24;
  if(descR>0){
    x.fillStyle=P.sub; x.font='400 13px Jost, "Avenir Next", Avenir, sans-serif';
    x.fillText('Valor à vista', pad, y);
    x.textAlign='right'; x.fillText(fmt(avistaBrutoR), W-pad, y); x.textAlign='left';
    y+=24;
    x.fillStyle=P.desc; x.font='400 13px Jost, "Avenir Next", Avenir, sans-serif';
    x.fillText('Desconto'+(dtR==='pct'?' ('+dvR+'%)':''), pad, y);
    x.textAlign='right'; x.fillText('- '+fmt(descR), W-pad, y); x.textAlign='left';
    y+=24;
  }
  y+=6;
  x.fillStyle=P.totlbl; x.font='600 11px Jost, "Avenir Next", Avenir, sans-serif';
  x.fillText('INVESTIMENTO EM ATÉ 6X', pad, y);
  x.fillStyle=P.big; x.font='700 40px "Cormorant Garamond", "Iowan Old Style", Palatino, Georgia, serif';
  x.textAlign='right'; x.fillText('6x de '+fmt(parcela), W-pad, y+8); x.textAlign='left';
  y+=40;
  x.fillStyle=P.sub; x.font='300 14px Jost, "Avenir Next", Avenir, sans-serif';
  x.fillText('Total em 6x '+fmt(totalParc)+'  ·  à vista no Pix '+fmt(totalAvista), pad, y);
  y+=34;
  x.fillStyle=P.foot; x.font='300 11px Jost, "Avenir Next", Avenir, sans-serif';
  x.fillText('Itens pelo valor de tabela. Condições de pagamento calculadas sobre a soma dos itens.', pad, y);
  x.fillText('À vista no Pix há condição melhor. Valores sujeitos a confirmação.', pad, y+16);

  const url=c.toDataURL('image/png');
  const a=document.createElement('a');
  const safe=title.replace(/[^a-z0-9]/gi,'_').slice(0,40);
  a.download=(tema==='print'?'Protocolo_Impressao_':'Protocolo_Bratan_')+safe+'_'+prot+'.png';
  a.href=url; a.click();
  salvarHistorico({prot,title,items,total,totalParc,totalPix:totalAvista,descR,dstr});
}
document.getElementById('bprint').addEventListener('click',()=>gerarRelatorio('print'));

/* HISTORICO DE PROTOCOLOS */
function lerHistorico(){
  try{ return JSON.parse(localStorage.getItem('bratan_historico')||'[]'); }catch(e){ return []; }
}
function salvarHistorico(reg){
  try{
    const h=lerHistorico();
    h.unshift({
      p:reg.prot, n:reg.title, d:reg.dstr,
      it:reg.items.map(i=>({l:i.label,v:i.val,pel:i.pel})),
      t:reg.total, tp:reg.totalParc, tx:reg.totalPix, ds:reg.descR
    });
    localStorage.setItem('bratan_historico', JSON.stringify(h.slice(0,200)));
  }catch(e){}
}
document.getElementById('bhist').addEventListener('click',()=>{
  const h=lerHistorico();
  const w=document.createElement('div');
  w.style.cssText='position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(8,10,5,.85);backdrop-filter:blur(6px);padding:24px';
  let linhas='';
  if(!h.length){
    linhas='<div style="text-align:center;color:rgba(248,237,189,.5);font-style:italic;padding:40px 0">Nenhum protocolo gerado ainda.</div>';
  }else{
    linhas=h.map((r,idx)=>{
      const itens=r.it.map(i=>`<div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;color:rgba(248,237,189,.62);padding:2px 0"><span>${i.l}${i.pel?'<br><span style="font-size:11px;opacity:.75">Pellets: '+i.pel+'</span>':''}</span><span>${fmt(i.v)}</span></div>`).join('');
      return `<div style="border:1px solid rgba(198,168,98,.22);border-radius:14px;padding:16px 18px;margin-bottom:10px;background:rgba(42,50,32,.45)">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
          <div><div style="font-size:15.5px;color:#F8EDBD;font-weight:500">${r.n}</div>
          <div style="font-size:11.5px;color:rgba(248,237,189,.45);letter-spacing:.04em">${r.p} · ${r.d}</div></div>
          <div style="text-align:right"><div style="font-family:'Cormorant Garamond','Iowan Old Style',Palatino,Georgia,serif;font-size:23px;color:#C6A862;font-weight:700">6x de ${fmt(r.tp/6)}</div>
          <div style="font-size:11.5px;color:rgba(248,237,189,.55)">Pix ${fmt(r.tx)}</div></div>
        </div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(248,237,189,.1)">${itens}
        ${r.ds>0?'<div style="font-size:12px;color:#D9C08A;margin-top:6px">Desconto aplicado: '+fmt(r.ds)+'</div>':''}</div>
        <button data-rest="${idx}" style="margin-top:10px;background:transparent;border:1px solid rgba(198,168,98,.4);color:#D9C08A;border-radius:100px;padding:7px 16px;font-family:'Jost','Avenir Next',Avenir,system-ui,sans-serif;font-size:12px;cursor:pointer">Ver no relatório</button>
      </div>`;
    }).join('');
  }
  w.innerHTML=`<div style="background:linear-gradient(160deg,#2A3220,#141810);border:1px solid #C6A862;border-radius:20px;padding:28px;max-width:640px;width:100%;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,.6)">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
      <div style="font-family:'Cormorant Garamond','Iowan Old Style',Palatino,Georgia,serif;font-size:26px;color:#F8EDBD">Histórico de protocolos</div>
      <div style="font-size:12px;color:rgba(248,237,189,.5)">${h.length} registro${h.length===1?'':'s'}</div>
    </div>
    <div style="font-size:12.5px;color:rgba(248,237,189,.55);font-weight:300;margin-bottom:16px">Protocolos gerados neste aparelho, do mais recente para o mais antigo.</div>
    <div style="overflow-y:auto;flex:1;padding-right:6px">${linhas}</div>
    <div style="display:flex;gap:10px;justify-content:space-between;margin-top:16px;padding-top:14px;border-top:1px solid rgba(248,237,189,.1)">
      <button id="hclear" style="background:transparent;color:rgba(248,237,189,.55);border:1px solid rgba(248,237,189,.2);border-radius:100px;padding:11px 20px;font-family:'Jost','Avenir Next',Avenir,system-ui,sans-serif;font-size:12.5px;cursor:pointer">Limpar histórico</button>
      <button id="hclose" style="background:#C6A862;color:#0E1108;border:none;border-radius:100px;padding:11px 26px;font-family:'Jost','Avenir Next',Avenir,system-ui,sans-serif;font-weight:600;font-size:13px;cursor:pointer">Fechar</button>
    </div>
  </div>`;
  document.body.appendChild(w);
  w.querySelector('#hclose').onclick=()=>w.remove();
  w.onclick=e=>{if(e.target===w)w.remove();};
  const cl=w.querySelector('#hclear');
  if(cl)cl.onclick=()=>{
    if(confirm('Apagar todo o histórico deste aparelho?')){
      try{localStorage.removeItem('bratan_historico');}catch(e){}
      w.remove();
    }
  };
  w.querySelectorAll('[data-rest]').forEach(btn=>{
    btn.onclick=()=>{
      const r=h[+btn.dataset.rest];
      let txt='PROTOCOLO '+r.p+'\n'+r.n+'\n'+r.d+'\n\n';
      r.it.forEach(i=>{txt+=i.l+'  '+fmt(i.v)+'\n'+(i.pel?'   Pellets: '+i.pel+'\n':'');});
      if(r.ds>0)txt+='\nDesconto: '+fmt(r.ds);
      txt+='\n\n6x de '+fmt(r.tp/6)+'  |  Pix '+fmt(r.tx);
      alert(txt);
    };
  });
});

/* GERAR CÓDIGO para o Closer */
document.getElementById('bcode').addEventListener('click',()=>{
  const sel=[...document.querySelectorAll('.opt.sel')];
  const title=document.getElementById('bcardtitle').textContent.trim();
  const items=sel.map(o=>{
    const price=+o.dataset.price, qty=+(o.dataset.qty||1);
    const label=o.querySelector('.on-l').textContent;
    let val=price*qty, pel=[];
    if(o.dataset.haspellets){
      const p=selectedPellets();
      if(p.length){val+=p.reduce((s,x)=>s+x.price*x.qty,0);pel=p.map(x=>x.name+(x.qty>1?' x'+x.qty:'')+' ('+fmt(x.price*x.qty)+')');}
    }
    return {l:label,q:qty,v:val,p:pel};
  });
  if(!items.length){alert('Selecione ao menos um item antes de gerar o código.');return;}
  const dvC=parseBR((document.getElementById('dval')||{}).value);
  const dtC=(document.getElementById('dtype')||{}).value||'reais';
  const payload={t:title,i:items,dv:dvC,dt:dtC,d:new Date().toISOString()};
  const code='BRA'+btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  // copia para a área de transferência e mostra
  const show=()=>{
    const w=document.createElement('div');
    w.style.cssText='position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(8,10,5,.85);backdrop-filter:blur(6px);padding:24px';
    w.innerHTML=`<div style="background:linear-gradient(160deg,#2A3220,#141810);border:1px solid #C6A862;border-radius:20px;padding:34px;max-width:520px;width:100%;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.6)">
      <div style="font-family:'Cormorant Garamond','Iowan Old Style',Palatino,Georgia,serif;font-size:26px;color:#F8EDBD;margin-bottom:8px">Código do protocolo</div>
      <div style="font-size:13px;color:rgba(248,237,189,.7);font-weight:300;line-height:1.6;margin-bottom:18px">Copie e envie ao Estevão. No app do Closer, ele cola em "Receber plano do Dr." e o protocolo aparece montado.</div>
      <textarea readonly style="width:100%;height:120px;background:rgba(14,17,8,.7);border:1px solid rgba(198,168,98,.3);border-radius:12px;color:#D9C08A;font-size:12px;padding:14px;font-family:monospace;resize:none;margin-bottom:16px">${code}</textarea>
      <div style="display:flex;gap:10px;justify-content:center">
        <button id="ccopy" style="background:#C6A862;color:#0E1108;border:none;border-radius:100px;padding:13px 26px;font-family:'Jost','Avenir Next',Avenir,system-ui,sans-serif;font-weight:600;font-size:13px;cursor:pointer">Copiar código</button>
        <button id="cclose" style="background:transparent;color:#F8EDBD;border:1px solid rgba(198,168,98,.4);border-radius:100px;padding:13px 26px;font-family:'Jost','Avenir Next',Avenir,system-ui,sans-serif;font-size:13px;cursor:pointer">Fechar</button>
      </div>
    </div>`;
    document.body.appendChild(w);
    const ta=w.querySelector('textarea');
    w.querySelector('#ccopy').onclick=()=>{ta.select();try{navigator.clipboard.writeText(code);}catch(e){document.execCommand('copy');}w.querySelector('#ccopy').textContent='Copiado ✓';};
    w.querySelector('#cclose').onclick=()=>w.remove();
    w.onclick=e=>{if(e.target===w)w.remove();};
  };
  show();
});

/* atmosphere particles */
const cv=document.getElementById('atmo'),ctx=cv.getContext('2d');
let W,H,parts=[];
function resize(){W=cv.width=innerWidth;H=cv.height=innerHeight;}
resize();addEventListener('resize',resize);
const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
const N=reduce?0:64;
for(let i=0;i<N;i++)parts.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*1.7+.4,s:Math.random()*.32+.07,o:Math.random()*.5+.14,ph:Math.random()*6.28});
function tick(t){
  ctx.clearRect(0,0,W,H);
  for(const p of parts){
    p.y-=p.s;p.x+=Math.sin(t/2600+p.ph)*.2;
    if(p.y<-8){p.y=H+8;p.x=Math.random()*W;}
    const tw=.55+.45*Math.sin(t/900+p.ph*3);
    ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);
    ctx.fillStyle=`rgba(198,168,98,${(p.o*tw).toFixed(3)})`;ctx.fill();
  }
  requestAnimationFrame(tick);
}
if(N)requestAnimationFrame(tick);
go(0);
