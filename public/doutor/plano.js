/* APP DO DOUTOR — o script da v22 (13/10/2026), que morava dentro do index.html.
   A CSP do site é script-src 'self': script em linha não roda, então ele mora aqui.
   Mudanças de 28/10/2026, todas pequenas e marcadas: fontes do aparelho no relatório,
   caminhos absolutos (/doutor/…), o evento 'bratan:plano' e window.BratanPlano para a ponte. */
(function(){
'use strict';
var $=function(s){return document.querySelector(s)};
var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};
var reduced=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var EMB=document.querySelector('.brand img').getAttribute('src');

/* ===== regras de valor: 8% sobre a soma no valor à vista, e mais 12% no parcelado em 6x ===== */
var F_AVISTA=1.08, F_PARC=1.12;
function fmt(n){return 'R$ '+Math.round(n).toLocaleString('pt-BR')}
function parseBR(v){
  if(v===undefined||v===null)return 0;
  var s=String(v).trim(); if(!s)return 0;
  s=s.replace(/[^0-9.,-]/g,'');
  if(s.indexOf(',')>-1){s=s.replace(/\./g,'').replace(',','.')}
  else if((s.match(/\./g)||[]).length>1){s=s.replace(/\./g,'')}
  else if(/\.\d{3}$/.test(s)){s=s.replace(/\./g,'')}
  var n=parseFloat(s); return (isNaN(n)||n<0)?0:n;
}
function pctTxt(v){return String(Math.round(v*100)/100).replace('.',',')}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function longDate(){return new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'})}

/* ===== ícones ===== */
function SV(d,w){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(w||1.5)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>'}
var UI={
  plus:SV('<path d="M12 5v14M5 12h14"/>',1.7), minus:SV('<path d="M5 12h14"/>',1.7),
  check:SV('<path d="M5 12.5l4.2 4.2L19 7"/>',1.8), x:SV('<path d="M6 6l12 12M18 6L6 18"/>',1.6),
  search:SV('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  clock:SV('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  fresh:SV('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>'),
  eye:SV('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff:SV('<path d="M3 3l18 18"/><path d="M10.6 5.6c.46-.07.93-.1 1.4-.1 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 4.1M6.3 6.9C3.9 8.6 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.5 0 2.9-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  print:SV('<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>'),
  code:SV('<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>'),
  share:SV('<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/>'),
  back:SV('<path d="M15 18l-6-6 6-6"/>',1.7),
  present:SV('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  download:SV('<path d="M12 4v11M7 10.5l5 5 5-5"/><path d="M5 20h14"/>',1.6),
  spark:SV('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',1.3)
};
var CI={
  proj:SV('<path d="M4 19c3.5-7 6.5-2.5 8.5-8S17 5.5 20 5"/><circle cx="4" cy="19" r="1.6"/><circle cx="20" cy="5" r="1.6"/>'),
  cons:SV('<path d="M6 3v6a5 5 0 0 0 10 0V3"/><path d="M11 14v2a4 4 0 0 0 8 0v-2.5"/><circle cx="19" cy="11.5" r="2"/>'),
  horm:SV('<path d="M12 3l7 4v8l-7 4-7-4V7z"/><circle cx="12" cy="11" r="2.4"/>'),
  vit:SV('<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>'),
  perf:SV('<path d="M13 3L5 13.5h6l-1 7.5 8-10.5h-6z"/>'),
  ev:SV('<path d="M8 3h8v9a4 4 0 0 1-8 0z"/><path d="M8 7.5h8M12 16v5"/>'),
  peso:SV('<path d="M6.5 8v8M17.5 8v8M6.5 12h11M3.5 10v4M20.5 10v4"/>'),
  esp:SV('<path d="M8 3c0 6 8 6 8 12s-8 6-8 6"/><path d="M16 3c0 6-8 6-8 12 0 3 2 4.8 4 5.6"/><path d="M9.5 7h5M9.5 17h5"/>'),
  imp:SV('<rect x="3.5" y="9" width="17" height="6" rx="3"/><path d="M12 9v6"/>'),
  est_av:SV('<circle cx="12" cy="8.5" r="4.5"/><path d="M4.5 20.5c1.4-3.8 4.3-5.8 7.5-5.8s6.1 2 7.5 5.8"/>'),
  est_inj:SV('<path d="M17 3.5l3.5 3.5M15.5 5l3.5 3.5M16.8 6.8L9 14.6 6.4 12l7.8-7.8M7.7 13.3l-4.2 4.2 2 2 4.2-4.2"/>'),
  est_pele:SV('<path d="M11 3l1.7 4.6L17 9.3l-4.3 1.7L11 15.6l-1.7-4.6L5 9.3l4.3-1.7z"/><path d="M18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
  est_dep:SV('<path d="M12 3v5M7.5 4.5l2 3.6M16.5 4.5l-2 3.6"/><rect x="6.5" y="10.5" width="11" height="10" rx="2.5"/>'),
  est_corp:SV('<path d="M8.5 3c0 4.5 1.2 6.5 1.2 9S8.5 17 8.5 21M15.5 3c0 4.5-1.2 6.5-1.2 9s1.2 5 1.2 9"/><path d="M10.5 11.5h3"/>')
};

/* ===== catálogo (valores de tabela) ===== */
var CATS=[
  {id:'proj',label:'Projetos',dl:'Projetos e mentoria',pl:'Acompanhamento'},
  {id:'cons',label:'Consultas',dl:'Consultas e agendamento',pl:'Consultas e avaliações'},
  {id:'horm',label:'Hormonal',dl:'Protocolo hormonal',pl:'Protocolo hormonal'},
  {id:'vit',label:'Vitaminas',dl:'Vitaminas intramusculares',pl:'Vitaminas'},
  {id:'perf',label:'Performance',dl:'Vitalidade e performance',pl:'Vitalidade e performance'},
  {id:'ev',label:'Endovenoso',dl:'Terapia endovenosa',pl:'Terapia endovenosa'},
  {id:'peso',label:'Peso',dl:'Composição corporal e peso',pl:'Composição corporal'},
  {id:'esp',label:'Específicos',dl:'Tratamentos específicos',pl:'Tratamentos específicos'},
  {id:'imp',label:'Implante',dl:'Implante hormonal',pl:'Implante hormonal'},
  {id:'est_av',fam:'est',label:'Estética',dl:'Avaliações estéticas',pl:'Avaliação estética',by:1},
  {id:'est_inj',fam:'est',label:'Estética',dl:'Toxina botulínica e preenchimento',pl:'Harmonização facial',by:1},
  {id:'est_pele',fam:'est',label:'Estética',dl:'Pele e cabelo',pl:'Pele e cabelo',by:1},
  {id:'est_dep',fam:'est',label:'Estética',dl:'Depilação a laser',pl:'Depilação a laser',by:1},
  {id:'est_corp',fam:'est',label:'Estética',dl:'Abdominal Sculpt',pl:'Contorno corporal',by:1}
];
var INCL_PROJ=['3 consultas completas com o Dr. Daniel','6 checkpoints com o assistente de performance do Dr. Daniel','3 mapeamentos corporais','Revisão de meio de jornada','Canal direto com a equipe'];
var INCL_MAT=['3 consultas completas com o Dr. Daniel','6 checkpoints com o assistente de performance do Dr. Daniel','Revisão de meio de jornada','Canal direto com a equipe'];
function D(id,cat,name,desc,price,unit,qty,extra){var o={id:id,cat:cat,name:name,desc:desc,price:price,unit:unit,qty:qty};for(var k in (extra||{}))o[k]=extra[k];return o}
var CATALOG=[
  D('proj','proj','Projeto de Acompanhamento · 6 meses','3 consultas, 6 checkpoints, 3 mapeamentos corporais, revisão e canal direto',6997,'un',false,{pname:'Projeto de Acompanhamento',pnote:'6 meses',incl:INCL_PROJ,inclLabel:'Você tem direito a'}),
  D('materno','proj','Projeto Materno · 6 meses','Para gestantes: 3 consultas, 6 checkpoints, revisão e canal direto, sem mapeamento corporal',6997,'un',false,{pname:'Projeto Materno',pnote:'6 meses de acompanhamento na gestação',incl:INCL_MAT,inclLabel:'Você tem direito a'}),
  D('mentoria','proj','Mentoria Dra. Andrya','6 encontros em 3 meses',5400,'un',false,{incl:['6 encontros com a Dra. Andrya','3 meses de acompanhamento']}),
  D('sinal','cons','Sinal de consulta','Garante a agenda; se faltar, perde o valor',500,'un',true,{pnote:'reserva da sua agenda'}),
  D('avulsa','cons','Consulta avulsa + bioimpedância','Sem retorno; 1ª consulta com voucher',2500,'un',true,{pname:'Consulta avulsa',pnote:'com bioimpedância'}),
  D('black','cons','Consulta Black','Somente 5% de desconto em tratamentos',1500,'un',true),
  D('diamond','cons','Consulta Diamond','Consulta',1100,'un',true),
  D('mapa','cons','Mapeamento Corporal','Exame',200,'un',true,{pname:'Mapeamento corporal',pnote:'exame de composição corporal'}),
  D('gessica','cons','Dra. Géssica','Consulta',600,'un',true,{pname:'Consulta com a Dra. Géssica'}),
  D('barbara','cons','Dra. Bárbara','4 sessões',790,'un',true,{pname:'Sessões com a Dra. Bárbara',pnote:'4 sessões'}),
  D('tbase','horm','Testosterona base / cipionato / enantato','Até 2ml, por dose',490,'dose',true,{pname:'Testosterona injetável'}),
  D('tblend','horm','Testosterona Blend','Junção de 2 ou acima de 2ml, por dose',590,'dose',true,{pname:'Testosterona blend'}),
  D('thcg','horm','Testosterona + HCG','Mesmo dia, por dose',790,'dose',true,{pname:'Testosterona com HCG'}),
  D('undec','horm','Undecilato de Testosterona','Longa duração, por dose',590,'dose',true,{pnote:'longa duração'}),
  D('nandro','horm','Nandrolona','50mg/ml, por dose',590,'dose',true),
  D('hcg','horm','HCG','Por frasco',590,'frasco',true),
  D('vitd','vit','Vitamina D','600.000UI, por dose',590,'dose',true,{pnote:'600.000 UI'}),
  D('b12','vit','Metilcobalamina · B12','Por dose',590,'dose',true,{pname:'Vitamina B12',pnote:'metilcobalamina'}),
  D('b9','vit','Metilfolato · B9','Por dose',590,'dose',true,{pname:'Vitamina B9',pnote:'metilfolato'}),
  D('b6','vit','Piridoxina · B6','Por dose',590,'dose',true,{pname:'Vitamina B6',pnote:'piridoxina'}),
  D('nadh','perf','NADH','Por dose',590,'dose',true),
  D('q10','perf','Coenzima Q10','Por dose',590,'dose',true),
  D('nori','perf','Noripurum','Por dose',590,'dose',true),
  D('ferin','perf','Ferinject','Por dose',1990,'dose',true),
  D('ev6','ev','Endovenoso até 6 componentes','Por dose',1190,'dose',true,{pname:'Terapia endovenosa',pnote:'até 6 componentes'}),
  D('ev7','ev','Endovenoso acima de 7 componentes','Por dose',1390,'dose',true,{pname:'Terapia endovenosa',pnote:'acima de 7 componentes'}),
  D('impeso','peso','Injeção IM para peso','Por dose',590,'dose',true,{pname:'Aplicação intramuscular',pnote:'composição corporal'}),
  D('tirzf','peso','Tirzepatida · frasco','Por frasco',3170,'frasco',true,{pname:'Tirzepatida'}),
  D('tirz30','peso','Tirzepatida · até 30 un','Por dose',390,'dose',true,{pname:'Tirzepatida',pnote:'até 30 unidades por dose'}),
  D('tirz49','peso','Tirzepatida · 31 a 49 un','Por dose',590,'dose',true,{pname:'Tirzepatida',pnote:'de 31 a 49 unidades por dose'}),
  D('tirz50','peso','Tirzepatida · acima de 50 un','Por dose',790,'dose',true,{pname:'Tirzepatida',pnote:'acima de 50 unidades por dose'}),
  D('beta','esp','Beta Glucana','Por dose',1190,'dose',true,{pname:'Beta glucana'}),
  D('zoled','esp','Ácido Zoledrônico','Por dose',3490,'dose',true,{pname:'Ácido zoledrônico'}),
  D('genet','esp','Teste Genético','Inclui consulta de 20 min para leitura',3900,'un',false,{pname:'Teste genético',incl:['Consulta de leitura do resultado']}),
  D('painelmama','esp','Painel Câncer de mama e ovário','Painel genético',4399,'un',false,{pname:'Painel genético',pnote:'câncer de mama e ovário'}),
  D('painelhered','esp','Painel Câncer hereditário','Painel genético',4399,'un',false,{pname:'Painel genético',pnote:'câncer hereditário'}),
  D('implante','imp','Honorários de Implante','Selecione os pellets no plano',5700,'un',false,{pel:true,pname:'Implante hormonal'}),
  D('mo_avcap','est_av','Avaliação capilar com tricoscopia','Avaliação de 60 minutos',550,'un',false,{pname:'Avaliação capilar',pnote:'com tricoscopia'}),
  D('mo_avfac','est_av','Avaliação facial','Avaliação de 60 minutos',550,'un',false),
  D('mo_avcorp','est_av','Avaliação corporal · Abdominal Sculpt','Avaliação de 60 minutos',550,'un',false,{pname:'Avaliação corporal',pnote:'Abdominal Sculpt'}),
  D('mo_botox','est_inj','Toxina botulínica · Botox Allergan 100U','Um frasco por paciente',2500,'frasco',true,{pname:'Toxina botulínica',pnote:'Botox Allergan 100U'}),
  D('mo_dysport','est_inj','Toxina botulínica · Dysport 300U','Um frasco por paciente',2500,'frasco',true,{pname:'Toxina botulínica',pnote:'Dysport 300U'}),
  D('mo_volux','est_inj','Ácido hialurônico · Juvéderm Volux','Preenchimento facial, por mL',2000,'ml',true,{pname:'Preenchimento com ácido hialurônico',pnote:'Juvéderm Volux'}),
  D('mo_defyne','est_inj','Ácido hialurônico · Restylane Defyne','Preenchimento facial, por mL',2000,'ml',true,{pname:'Preenchimento com ácido hialurônico',pnote:'Restylane Defyne'}),
  D('mo_belotero','est_inj','Ácido hialurônico · Belotero Intense Lido','Preenchimento facial, por mL',2000,'ml',true,{pname:'Preenchimento com ácido hialurônico',pnote:'Belotero Intense'}),
  D('mo_mafac','est_pele','Microagulhamento facial','Por sessão',900,'sessao',true),
  D('mo_macap','est_pele','Microagulhamento capilar','Por sessão',600,'sessao',true),
  D('mo_intracap','est_pele','Intradermoterapia capilar','Mesoterapia capilar, por sessão',800,'sessao',true,{pnote:'mesoterapia capilar'}),
  D('mo_lavieen','est_pele','Lavieen facial','Laser de túlio 1927 nm, por sessão',1500,'sessao',true,{pnote:'laser de túlio 1927 nm'}),
  D('mo_lavprem','est_pele','Lavieen + ativo premium','Por sessão',1800,'sessao',true,{pname:'Lavieen com ativo premium'}),
  D('mo_jornada','est_pele','Jornada Lavieen + peeling','2 encontros sequenciais',2350,'un',false,{pname:'Jornada Lavieen e peeling',pnote:'2 encontros sequenciais'}),
  D('mo_dface','est_dep','Depilação a laser · full face','Fiber Deep, por sessão',290,'sessao',true,{pname:'Depilação a laser',pnote:'full face'}),
  D('mo_daxi','est_dep','Depilação a laser · axilas','Fiber Deep, por sessão',220,'sessao',true,{pname:'Depilação a laser',pnote:'axilas'}),
  D('mo_dvir','est_dep','Depilação a laser · virilha completa','Fiber Deep, por sessão',390,'sessao',true,{pname:'Depilação a laser',pnote:'virilha completa'}),
  D('mo_dbarba','est_dep','Depilação a laser · barba + pescoço','Fiber Deep, por sessão',290,'sessao',true,{pname:'Depilação a laser',pnote:'barba e pescoço'}),
  D('mo_dbra','est_dep','Depilação a laser · braços completos','Fiber Deep, por sessão',350,'sessao',true,{pname:'Depilação a laser',pnote:'braços completos'}),
  D('mo_dpei','est_dep','Depilação a laser · peitoral','Fiber Deep, por sessão',350,'sessao',true,{pname:'Depilação a laser',pnote:'peitoral'}),
  D('mo_dabd','est_dep','Depilação a laser · abdômen','Fiber Deep, por sessão',350,'sessao',true,{pname:'Depilação a laser',pnote:'abdômen'}),
  D('mo_dpeiabd','est_dep','Depilação a laser · peitoral + abdômen','Fiber Deep, por sessão',450,'sessao',true,{pname:'Depilação a laser',pnote:'peitoral e abdômen'}),
  D('mo_dcos','est_dep','Depilação a laser · costas completas','Fiber Deep, por sessão',450,'sessao',true,{pname:'Depilação a laser',pnote:'costas completas'}),
  D('mo_dper','est_dep','Depilação a laser · pernas completas','Fiber Deep, por sessão',450,'sessao',true,{pname:'Depilação a laser',pnote:'pernas completas'}),
  D('mo_asbase','est_corp','Abdominal Sculpt · sessão base','Reduction + Definition, por sessão',1290,'sessao',true,{pname:'Abdominal Sculpt',pnote:'sessão base, Reduction e Definition'}),
  D('mo_asint','est_corp','Abdominal Sculpt · sessão intensive','Intensive + Definition, quando indicada',1290,'sessao',true,{pname:'Abdominal Sculpt',pnote:'sessão intensive, Intensive e Definition'})
];
var PELLETS=[
  {id:'t50',name:'Testosterona 50mg',price:123},{id:'t75',name:'Testosterona 75mg',price:168},
  {id:'t100',name:'Testosterona 100mg',price:190},{id:'t125',name:'Testosterona 125mg',price:224},
  {id:'t150',name:'Testosterona 150mg',price:280},{id:'t200',name:'Testosterona 200mg',price:336},
  {id:'e25',name:'Estradiol 25mg',price:213},{id:'g35',name:'Gestrinona 35mg',price:381},{id:'g50',name:'Gestrinona 50mg',price:538}
];
var byId={},IDX={};
CATALOG.forEach(function(it,i){byId[it.id]=it;IDX[it.id]=i});
var CAT_ORDER={}; CATS.forEach(function(c,i){CAT_ORDER[c.id]=i});

function qtyText(it,q){
  if(it.unit==='dose')return q+(q>1?' doses':' dose');
  if(it.unit==='frasco')return q+(q>1?' frascos':' frasco');
  if(it.unit==='ml')return q+' mL';
  if(it.unit==='sessao')return q+(q>1?' sessões':' sessão');
  return q>1?q+'x':'';
}
function unitWord(it){return {dose:'dose',frasco:'frasco',ml:'mL',sessao:'sessão'}[it.unit]||''}
function shortDesc(it){return /^por (dose|frasco|ml|sessão)$/i.test(it.desc)?'':it.desc.replace(/,\s*por (dose|frasco|ml|sessão)$/i,'')}

/* ===== estado ===== */
var KEY='bratan_rascunho_v2';
function DEFAULT(){return {name:'',lines:[{id:'proj',qty:1,price:6997}],pellets:{},dt:'reais',dv:'',lastProt:null}}
function load(){
  try{
    var s=JSON.parse(localStorage.getItem(KEY)||'null');
    if(!s||!Array.isArray(s.lines))return null;
    s.lines=s.lines.filter(function(l){return byId[l.id]}).map(function(l){return {id:l.id,qty:Math.max(1,l.qty|0||1),price:typeof l.price==='number'?l.price:byId[l.id].price}});
    s.pellets=s.pellets||{}; s.dt=s.dt==='pct'?'pct':'reais'; s.dv=s.dv||''; s.name=s.name||''; s.lastProt=s.lastProt||null;
    return s;
  }catch(e){return null}
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}avisarPonte('mudou')}
/* ponte com o sistema (28/10/2026): public/doutor/ponte → src/doutor/ponte.ts escuta este evento */
function avisarPonte(motivo){try{document.dispatchEvent(new CustomEvent('bratan:plano',{detail:{motivo:motivo}}))}catch(e){}}
var state=load()||DEFAULT();

function hasLine(id){return state.lines.some(function(l){return l.id===id})}
function getLine(id){for(var i=0;i<state.lines.length;i++)if(state.lines[i].id===id)return state.lines[i];return null}
function pelletSum(){if(!hasLine('implante'))return 0;return PELLETS.reduce(function(s,p){return s+(state.pellets[p.id]||0)*p.price},0)}
function lineValue(l){var v=l.price*l.qty;if(byId[l.id].pel)v+=pelletSum();return v}
function totals(){
  var total=state.lines.reduce(function(s,l){return s+lineValue(l)},0);
  var avB=total*F_AVISTA;
  var dv=parseBR(state.dv), desc=0;
  if(dv>0&&total>0) desc=state.dt==='pct'?avB*(Math.min(dv,100)/100):Math.min(dv,avB);
  var pix=Math.max(0,avB-desc), parcTot=pix*F_PARC;
  return {total:total,avB:avB,desc:desc,pix:pix,parcTot:parcTot,parc:parcTot/6,dv:dv};
}
function sortedLines(){return state.lines.slice().sort(function(a,b){return IDX[a.id]-IDX[b.id]})}
function selPellets(){return PELLETS.filter(function(p){return state.pellets[p.id]>0})}
function pelletNames(){return selPellets().map(function(p){var n=state.pellets[p.id];return p.name+(n>1?' x'+n:'')}).join(', ')}
function pelletStrings(){return selPellets().map(function(p){var n=state.pellets[p.id];return p.name+(n>1?' x'+n:'')+' ('+fmt(p.price*n)+')'})}

/* ===== mutações ===== */
var justAdded=null;
function dirty(){state.lastProt=null}
function addLine(id){if(hasLine(id))return;state.lines.push({id:id,qty:1,price:byId[id].price});justAdded=id;dirty();commit()}
function removeLine(id){
  var el=document.querySelector('.line[data-id="'+id+'"]');
  if(el&&el.classList.contains('leave'))return;
  var done=function(){state.lines=state.lines.filter(function(l){return l.id!==id});if(byId[id].pel)state.pellets={};dirty();commit()};
  if(el&&!reduced){el.classList.add('leave');setTimeout(done,240)}else done();
}
function setQty(id,q){var l=getLine(id);if(!l)return;if(q<1){removeLine(id);return}l.qty=Math.min(99,q);dirty();commit()}
function setPel(pid,q){if(q<=0)delete state.pellets[pid];else state.pellets[pid]=Math.min(20,q);dirty();commit()}
function commit(o){o=o||{};save();if(o.lines!==false){syncCatalog();renderLines()}renderTotals();renderMeta()}

/* ===== catálogo ===== */
var activeCat='all';
function buildCatalog(){
  $('#catNote').textContent=CATALOG.length+' itens, com valores de tabela';
  var chips='<button class="chip on" data-cat="all" role="tab">Todos<span class="ct">'+CATALOG.length+'</span></button>';
  var famDone={};
  CATS.forEach(function(c){
    if(c.fam){if(famDone[c.fam])return;famDone[c.fam]=1;
      var ids=CATS.filter(function(x){return x.fam===c.fam}).map(function(x){return x.id});
      var nf=CATALOG.filter(function(i){return ids.indexOf(i.cat)>-1}).length;
      chips+='<button class="chip" data-cat="fam:'+c.fam+'" role="tab">'+c.label+'<span class="ct">'+nf+'</span></button>';return}
    var n=CATALOG.filter(function(i){return i.cat===c.id}).length;chips+='<button class="chip" data-cat="'+c.id+'" role="tab">'+c.label+'<span class="ct">'+n+'</span></button>'});
  $('#chips').innerHTML=chips;
  var html='';
  CATS.forEach(function(c){
    var items=CATALOG.filter(function(i){return i.cat===c.id});
    html+='<section class="group" data-cat="'+c.id+'"'+(c.fam?' data-fam="'+c.fam+'"':'')+'><div class="group-h"><h2>'+c.dl+(c.by?'<em class="g-by">Dr. Moisés Victor</em>':'')+'</h2><span>'+items.length+(items.length>1?' itens':' item')+'</span></div>';
    items.forEach(function(it){
      var uw=unitWord(it);
      html+='<div class="row" data-id="'+it.id+'" role="button" tabindex="0" aria-label="'+esc(it.name)+'">'+
        '<div><div class="r-name">'+esc(it.name)+'</div>'+(shortDesc(it)?'<div class="r-desc">'+esc(shortDesc(it))+'</div>':'')+'</div>'+
        '<div class="r-price num">'+fmt(it.price)+(uw?'<em>por '+uw+'</em>':'')+'</div>'+
        '<div class="r-act"></div></div>';
    });
    html+='</section>';
  });
  $('#groups').innerHTML=html;
}
function syncCatalog(){
  $$('.row').forEach(function(r){
    var id=r.dataset.id,it=byId[id],l=getLine(id),act=r.querySelector('.r-act'),inn=!!l;
    r.classList.toggle('in',inn);
    var want=!inn?'add':(it.qty?'step':'tag');
    if(want==='step'){
      if(act.dataset.mode==='step'){act.querySelector('.sv').textContent=l.qty;return}
      act.innerHTML='<span class="stepper" data-act="step"><button data-act="dec" aria-label="Menos uma">'+UI.minus+'</button><span class="sv num">'+l.qty+'</span><button data-act="inc" aria-label="Mais uma">'+UI.plus+'</button></span>';
    }else if(want==='tag'){
      if(act.dataset.mode==='tag')return;
      act.innerHTML='<span class="tag">'+UI.check+'No plano</span>';
    }else{
      if(act.dataset.mode==='add')return;
      act.innerHTML='<button class="add" data-act="add" tabindex="-1">'+UI.plus+'Adicionar</button>';
    }
    act.dataset.mode=want;
  });
}
function applyFilter(){
  var q=norm($('#q').value.trim()),any=false;
  $$('.group').forEach(function(g){
    var vis=0,catOk=q?true:(activeCat==='all'||g.dataset.cat===activeCat||(g.dataset.fam&&activeCat==='fam:'+g.dataset.fam));
    g.querySelectorAll('.row').forEach(function(r){
      var it=byId[r.dataset.id],ok=catOk&&(!q||norm(it.name+' '+it.desc).indexOf(q)>-1);
      r.hidden=!ok;if(ok)vis++;
    });
    g.hidden=!vis;if(vis)any=true;
  });
  $('#noRes').hidden=any;
}
function rowAction(row,target){
  var id=row.dataset.id,a=target&&target.closest('[data-act]'),act=a?a.dataset.act:null;
  if(act==='inc')return setQty(id,getLine(id).qty+1);
  if(act==='dec')return setQty(id,getLine(id).qty-1);
  if(act==='step')return;
  if(!hasLine(id))addLine(id);
  else if(!byId[id].qty)removeLine(id);
  else flashLine(id);
}
function flashLine(id){
  var el=document.querySelector('.line[data-id="'+id+'"]');if(!el)return;
  el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');
  el.scrollIntoView({block:'nearest',behavior:reduced?'auto':'smooth'});
}

/* ===== plano ===== */
function lineHTML(l){
  var it=byId[l.id],uw=unitWord(it);
  var meta='<button class="unit num" data-act="price" title="Ajustar valor unitário">'+fmt(l.price)+(uw?' por '+uw:'')+'</button>';
  if(l.price!==it.price)meta+='<span class="edited">valor ajustado</span>';
  var step=it.qty?'<span class="stepper sm"><button data-act="dec" aria-label="Menos uma">'+UI.minus+'</button><span class="sv num">'+l.qty+'</span><button data-act="inc" aria-label="Mais uma">'+UI.plus+'</button></span>':'';
  var pel='';
  if(it.pel){
    pel='<div class="l-p"><span class="hint">'+(selPellets().length?'Pellets do implante':'Toque nos pellets que serão aplicados')+'</span>'+PELLETS.map(function(p){
      var q=state.pellets[p.id]||0;
      return '<span class="pel'+(q?' on':'')+'" data-pel="'+p.id+'" role="button" tabindex="0"><span>'+p.name+'</span><span class="pp num">'+fmt(p.price)+'</span>'+
        '<span class="pq"><button data-pact="dec" aria-label="Menos um">'+UI.minus+'</button><b class="num">'+(q||1)+'</b><button data-pact="inc" aria-label="Mais um">'+UI.plus+'</button></span></span>';
    }).join('')+'</div>';
  }
  return '<div class="line" data-id="'+l.id+'"><div class="l-n">'+esc(it.name)+'</div><b class="l-t num">'+fmt(lineValue(l))+'</b>'+
    '<button class="l-x" data-act="rm" aria-label="Remover '+esc(it.name)+'">'+UI.x+'</button>'+
    '<div class="l-m">'+meta+'</div><div class="l-s">'+step+'</div>'+pel+'</div>';
}
function renderLines(){
  var box=$('#lines');
  if(!state.lines.length){
    box.innerHTML='<div class="plan-empty"><img src="'+EMB+'" alt=""><p>Nenhum item no plano.<br>Toque em um tratamento do catálogo para adicionar.</p></div>';
    return;
  }
  box.innerHTML=state.lines.map(lineHTML).join('');
  if(justAdded){
    var el=box.querySelector('.line[data-id="'+justAdded+'"]');
    if(el){el.classList.add('enter');el.scrollIntoView({block:'nearest',behavior:reduced?'auto':'smooth'})}
    justAdded=null;
  }
}
function editPrice(id,btn){
  var l=getLine(id),inp=document.createElement('input'),done=false;
  inp.className='unit-input num';inp.inputMode='decimal';inp.value=String(l.price).replace('.',',');inp.setAttribute('aria-label','Valor unitário');
  btn.replaceWith(inp);inp.focus();inp.select();
  function fin(ok){if(done)return;done=true;if(ok&&inp.value.trim()!==''){l.price=parseBR(inp.value);dirty()}commit()}
  inp.addEventListener('keydown',function(ev){
    if(ev.key==='Enter'){ev.preventDefault();fin(true)}
    if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();fin(false)}
  });
  inp.addEventListener('blur',function(){fin(true)});
}
var lastK=null;
function renderTotals(){
  var T=totals(),hasD=T.desc>0;
  $('#tSoma').textContent=fmt(T.total);
  $('#rAv').hidden=!hasD;$('#rDesc').hidden=!hasD;
  $('#tAv').textContent=fmt(T.avB);
  $('#tDesc').textContent='- '+fmt(T.desc)+(state.dt==='pct'&&hasD?' ('+pctTxt(T.dv)+'%)':'');
  $('#tPix').textContent=fmt(T.pix);
  $('#tParc').textContent='6x de '+fmt(T.parc);
  $('#tParcTot').textContent=T.total?'total de '+fmt(T.parcTot):'';
  var k=Math.round(T.parc);
  if(lastK!==null&&k!==lastK&&!reduced){var t=$('#tots');t.classList.remove('bump');void t.offsetWidth;t.classList.add('bump')}
  lastK=k;
  $('#btnPresent').disabled=!state.lines.length;$('#mbGo').disabled=!state.lines.length;
  var n=state.lines.length;$('#mbN').textContent=n?n+(n>1?' itens no plano':' item no plano'):'Plano vazio';$('#mbV').textContent='6x de '+fmt(T.parc);
}
function renderMeta(){
  $('#pDate').textContent=longDate();
  var n=state.lines.length;
  $('#pInfo').textContent=state.lastProt?'Protocolo '+state.lastProt:(n?n+(n>1?' itens':' item'):'Sem itens');
}
function syncInputs(){
  $('#pName').value=state.name;$('#dVal').value=state.dv;
  $$('#dType button').forEach(function(b){b.classList.toggle('on',b.dataset.dt===state.dt)});
}

/* ===== tela do paciente ===== */
function pDetail(it,l){
  var parts=[];
  if(it.unit!=='un')parts.push(qtyText(it,l.qty));else if(l.qty>1)parts.push(l.qty+' vezes');
  if(it.pnote)parts.push(it.pnote);
  var d=parts.join(', ');return d?d.charAt(0).toUpperCase()+d.slice(1):'';
}
function renderPatient(){
  var nm=state.name.trim();
  $('#pcKicker').textContent=nm?'Plano personalizado':'Instituto Bratan';
  $('#pcName').textContent=nm||'Seu plano personalizado';
  $('#pcSub').textContent='Desenhado pelo Dr. Daniel Bratan em '+longDate();
  var html='',gi=0;
  CATS.forEach(function(c){
    var ls=state.lines.filter(function(l){return byId[l.id].cat===c.id});if(!ls.length)return;
    html+='<div class="pg" style="animation-delay:'+(0.32+gi*0.1).toFixed(2)+'s"><div class="pg-l">'+c.pl+'</div>'+(c.by?'<div class="pg-by">Com o Dr. Moisés Victor, biomédico</div>':'');
    ls.forEach(function(l){
      var it=byId[l.id],det=pDetail(it,l),chips='';
      if(it.pel){var sp=selPellets();chips=sp.map(function(p){var n=state.pellets[p.id];return '<span>'+p.name+(n>1?', '+n+' pellets':'')+'</span>'}).join('');if(sp.length)det='Pellets definidos para você'}
      else if(it.incl){chips=(it.inclLabel?'<em class="pi-inc">'+it.inclLabel+'</em>':'')+it.incl.map(function(x){return '<span>'+x+'</span>'}).join('')}
      html+='<div class="pi">'+CI[c.id]+'<div><div class="pi-n">'+esc(it.pname||it.name)+'</div>'+(det?'<div class="pi-d">'+esc(det)+'</div>':'')+(chips?'<div class="pi-chips">'+chips+'</div>':'')+'</div></div>';
    });
    html+='</div>';gi++;
  });
  $('#pcBody').innerHTML=html;
  var T=totals();
  $('#invBig').textContent='6x de '+fmt(T.parc);
  $('#invAlt').innerHTML='Total de <b>'+fmt(T.parcTot)+'</b> em 6x, <span class="nw">ou <b>'+fmt(T.pix)+'</b> à vista no Pix</span>';
  $('#invBadge').hidden=!(T.desc>0);
  fitInv();
  $('#pcInv').style.animationDelay=(0.42+gi*0.1).toFixed(2)+'s';
  document.querySelector('.pc-fine').style.animationDelay=(0.55+gi*0.1).toFixed(2)+'s';
}
function fitInv(){
  var el=$('#invBig');if(!el)return;el.style.fontSize='';
  var w=el.parentElement.clientWidth;if(!w)return;
  var tw=el.scrollWidth,cs=parseFloat(getComputedStyle(el).fontSize);
  if(tw>w)el.style.fontSize=Math.max(34,Math.floor(cs*w/tw*0.97))+'px';
}
function countUp(el,to,render,dur){
  if(reduced){el.textContent=render(to);return}
  var from=to*0.35,t0=performance.now();
  function ease(t){return t>=1?1:1-Math.pow(2,-10*t)}
  function f(now){var p=Math.min(1,(now-t0)/dur);el.textContent=render(from+(to-from)*ease(p));if(p<1)requestAnimationFrame(f);else el.textContent=render(to)}
  requestAnimationFrame(f);
}
function setReveal(on){
  var c=$('#pcard'),eye=$('#eye');
  c.classList.toggle('revealed',on);
  eye.setAttribute('aria-pressed',String(on));eye.innerHTML=on?UI.eyeOff:UI.eye;
  eye.setAttribute('aria-label',on?'Ocultar investimento':'Revelar investimento');
  $('#eyeCap').textContent=on?'Ocultar':'Revelar';
  var T=totals();
  if(on)countUp($('#invBig'),T.parc,function(v){return '6x de '+fmt(v)},1400);
  else $('#invBig').textContent='6x de '+fmt(T.parc);
}

/* ===== tela cheia ===== */
function isFull(){return !!(document.fullscreenElement||document.webkitFullscreenElement)}
function goFull(){var d=document.documentElement,f=d.requestFullscreen||d.webkitRequestFullscreen;if(!f||isFull())return;try{var r=f.call(d);if(r&&r.catch)r.catch(function(){})}catch(e){}}
function exitFull(){var f=document.exitFullscreen||document.webkitExitFullscreen;if(!f||!isFull())return;try{var r=f.call(document);if(r&&r.catch)r.catch(function(){})}catch(e){}}

/* ===== navegação entre telas ===== */
var view='doctor',pendingReload=false;
function moveSeg(v){
  var b=document.querySelector('.seg-btn[data-go="'+v+'"]');if(!b)return;
  $$('.seg-btn').forEach(function(x){x.classList.toggle('on',x===b)});
  var r=b.getBoundingClientRect(),p=$('#seg').getBoundingClientRect(),ind=$('#segInd');
  if(!r.width)return;
  ind.style.left=(r.left-p.left)+'px';ind.style.width=r.width+'px';
}
function setView(v){
  if(v==='show'){openShow();return}
  if(v==='patient'&&!state.lines.length){toast('Monte o plano antes de apresentar');return}
  if(v==='doctor'&&pendingReload){location.reload();return}
  view=v;document.body.dataset.view=v;
  $('#vDoctor').classList.toggle('on',v==='doctor');
  $('#vPatient').classList.toggle('on',v==='patient');
  moveSeg(v);
  if(v==='patient')goFull();else exitFull();
  if(v==='patient'){
    renderPatient();setReveal(false);
    var c=$('#pcard');c.classList.remove('enter');void c.offsetWidth;c.classList.add('enter');
    $('#vPatient').scrollTop=0;
    setTimeout(function(){$('#eye').focus({preventScroll:true})},900);
  }
}
function openShow(){
  var f=$('#showFrame');if(!f.getAttribute('src'))f.setAttribute('src','/doutor/apresentacao.html');
  $('#vShow').classList.add('on');$('#vShow').setAttribute('aria-hidden','false');moveSeg('show');
  setTimeout(function(){try{f.focus()}catch(e){}},450);
}
function closeShow(){
  $('#vShow').classList.remove('on');$('#vShow').setAttribute('aria-hidden','true');moveSeg(view);
  if(pendingReload&&view==='doctor')location.reload();
}

/* ===== avisos, modal ===== */
function toast(msg){
  var t=document.createElement('div');t.className='toast';t.innerHTML=UI.check+'<span></span>';t.querySelector('span').textContent=msg;
  $('#toasts').appendChild(t);
  setTimeout(function(){t.classList.add('out');setTimeout(function(){t.remove()},400)},2600);
}
function openModal(html,onClick){
  var m=$('#mcard');m.innerHTML=html;m.onclick=onClick||null;$('#modal').classList.add('on');
  var f=m.querySelector('[data-focus]')||m.querySelector('button');setTimeout(function(){if(f)f.focus()},60);
}
function closeModal(){$('#modal').classList.remove('on')}
function confirmBox(o,cb){
  openModal('<h3>'+o.title+'</h3><p>'+o.text+'</p><div class="mbtns"><button class="btn" data-m="no">Cancelar</button><button class="btn '+(o.danger?'dang':'pri')+'" data-m="ok" data-focus>'+o.ok+'</button></div>',
    function(e){var b=e.target.closest('[data-m]');if(!b)return;closeModal();if(b.dataset.m==='ok')cb()});
}

/* ===== protocolo, relatório, histórico ===== */
function protocoloNum(){
  var d=new Date(),ymd=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0'),seq=1;
  try{var k='bratan_prot_'+ymd;seq=(parseInt(localStorage.getItem(k)||'0',10))+1;localStorage.setItem(k,seq)}catch(e){seq=Math.floor(Math.random()*900)+100}
  return 'BRA-'+ymd+'-'+String(seq).padStart(3,'0');
}
function reportItems(){
  return sortedLines().map(function(l){
    var it=byId[l.id],q=qtyText(it,l.qty),label=it.name+(l.qty>1&&q?' · '+q:''),pArr=it.pel?pelletStrings():[];
    return {id:l.id,name:it.name,qty:l.qty,label:label,val:lineValue(l),pArr:pArr,pel:pArr.join(', '),pelNP:it.pel?pelletNames():''};
  });
}
function lerHist(){try{return JSON.parse(localStorage.getItem('bratan_historico')||'[]')}catch(e){return []}}
function salvarHist(r){try{var h=lerHist();h.unshift(r);localStorage.setItem('bratan_historico',JSON.stringify(h.slice(0,200)))}catch(e){}}
function gerarRelatorio(){
  if(!state.lines.length){toast('Adicione itens ao plano');return}
  var name=state.name.trim();
  if(!name){if(view==='doctor'){toast('Informe o nome do paciente');$('#pName').focus()}else toast('Informe o nome do paciente na montagem do plano');return}
  var ready=(document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve();
  ready.then(function(){drawReport(name)});
}
function drawReport(name){
  var T=totals(),items=reportItems(),prot=protocoloNum(),now=new Date();
  var dstr=now.toLocaleDateString('pt-BR')+' '+now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  var P={bg:'#FFFFFF',top:'#4D563B',acc:'#C6A862',eye:'#7A895E',h1:'#2B3323',meta:'#5C6650',div:'rgba(77,86,59,.35)',row:'rgba(77,86,59,.14)',
    item:'#2B3323',val:'#4D563B',pel:'#6B7459',lbl:'#5C6650',big:'#4D563B',sub:'#3D4533',desc:'#4D563B',foot:'#7A8570'};
  var S=2,W=720,pad=48,HMAX=700+items.length*120;
  var c=document.createElement('canvas');c.width=W*S;c.height=HMAX*S;
  var x=c.getContext('2d');x.scale(S,S);
  function F(w,s,serif){return w+' '+s+'px '+(serif?'"Cormorant Garamond", "Iowan Old Style", Palatino, Georgia, serif':'Jost, "Avenir Next", Avenir, Arial, sans-serif')}
  function rule(y,col){x.strokeStyle=col;x.lineWidth=1;x.beginPath();x.moveTo(pad,y);x.lineTo(W-pad,y);x.stroke()}
  function wrap(t,max){var w=t.split(' '),out=[],cur='';w.forEach(function(p){var tt=cur?cur+' '+p:p;if(x.measureText(tt).width>max&&cur){out.push(cur);cur=p}else cur=tt});if(cur)out.push(cur);return out}
  x.fillStyle=P.bg;x.fillRect(0,0,W,HMAX);
  x.fillStyle=P.top;x.fillRect(0,0,W,7);x.fillStyle=P.acc;x.fillRect(0,0,W,4);
  x.fillStyle=P.eye;x.font=F(600,13);x.fillText('INSTITUTO BRATAN · RELATÓRIO COMERCIAL',pad,52);
  x.fillStyle=P.h1;x.font=F(600,30,true);x.fillText('Protocolo fechado',pad,88);
  x.fillStyle=P.meta;x.font=F(300,13);
  x.fillText('Paciente: '+name,pad,112);x.fillText('Protocolo nº '+prot,pad,132);
  x.fillText('Emitido em '+dstr+'  ·  Dr. Daniel Bratan · CRM 168649',pad,152);
  rule(172,P.div);
  var y=208;
  x.font=F(600,11);x.fillStyle=P.eye;x.fillText('ITENS DO PROTOCOLO',pad,y-14);
  items.forEach(function(it){
    x.font=F(400,15);x.fillStyle=P.item;
    var lab=it.label;while(x.measureText(lab).width>W-pad*2&&lab.length>4)lab=lab.slice(0,-2);if(lab!==it.label)lab+='…';
    x.fillText(lab,pad,y+10);
    y+=26;
    if(it.pelNP){x.fillStyle=P.pel;x.font=F(300,12);wrap('Pellets: '+it.pelNP,W-pad*2-10).forEach(function(t){x.fillText(t,pad+10,y+6);y+=18});y+=4}
    rule(y,P.row);y+=22;
  });
  y+=10;rule(y,P.div);y+=34;
  x.fillStyle=P.lbl;x.font=F(600,11);x.fillText('INVESTIMENTO EM ATÉ 6X',pad,y);
  x.fillStyle=P.big;x.font=F(700,40,true);x.textAlign='right';x.fillText('6x de '+fmt(T.parc),W-pad,y+8);x.textAlign='left';
  y+=40;
  x.fillStyle=P.sub;x.font=F(300,14);x.fillText('Total em 6x '+fmt(T.parcTot)+'  ·  à vista no Pix '+fmt(T.pix),pad,y);
  y+=34;
  if(T.desc>0){x.fillStyle=P.acc;x.font=F(500,12.5);x.fillText('✦  Condição especial aplicada',pad,y-6);y+=22}
  x.fillStyle=P.foot;x.font=F(300,11);
  x.fillText('Protocolo elaborado pelo Dr. Daniel Bratan. Condições de pagamento válidas para o conjunto dos itens acima.',pad,y);
  x.fillText('À vista no Pix há condição melhor. Valores sujeitos a confirmação.',pad,y+16);
  var H=Math.ceil(y+16+44),out=document.createElement('canvas');out.width=W*S;out.height=H*S;out.getContext('2d').drawImage(c,0,0);
  var a=document.createElement('a');a.href=out.toDataURL('image/png');
  a.download='Protocolo_Impressao_'+name.replace(/[^a-z0-9]/gi,'_').slice(0,40)+'_'+prot+'.png';
  document.body.appendChild(a);a.click();a.remove();
  salvarHist({p:prot,n:name,d:dstr,it:items.map(function(i){return {l:i.label,v:i.val,pel:i.pel}}),t:T.total,tp:T.parcTot,tx:T.pix,ds:T.desc,
    sel:state.lines.map(function(l){return {id:l.id,qty:l.qty,price:l.price}}),pl:JSON.parse(JSON.stringify(state.pellets)),dt:state.dt,dv:state.dv});
  state.lastProt=prot;save();renderMeta();
  toast('Relatório baixado, protocolo '+prot);
}
function codigoDoCloser(){
  var items=reportItems().map(function(i){return {l:i.name,q:i.qty,v:i.val,p:i.pArr}});
  var payload={t:state.name.trim()||'Seu plano Bratan',i:items,dv:parseBR(state.dv),dt:state.dt,d:new Date().toISOString()};
  return 'BRA'+btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}
function openCode(){
  if(!state.lines.length){toast('Adicione itens antes de gerar o código');return}
  var code=codigoDoCloser();
  var share=navigator.share?'<button class="btn" data-m="share">'+UI.share+'Compartilhar</button>':'';
  openModal('<h3>Código para o Closer</h3><p>Envie ao Estevão. No app comercial, ele toca em Receber plano do Dr. e cola o código: o protocolo aparece montado.</p>'+
    '<textarea readonly id="codeTa" aria-label="Código do protocolo">'+code+'</textarea><div class="mbtns">'+share+'<button class="btn" data-m="close">Fechar</button><button class="btn pri" data-m="copy" data-focus>Copiar código</button></div>',
    function(e){
      var b=e.target.closest('[data-m]');if(!b)return;var m=b.dataset.m;
      if(m==='close')closeModal();
      if(m==='copy'){
        var ok=function(){b.textContent='Copiado';toast('Código copiado')};
        if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(code).then(ok,function(){$('#codeTa').select();document.execCommand('copy');ok()});
        else{$('#codeTa').select();document.execCommand('copy');ok()}
      }
      if(m==='share'){navigator.share({title:'Protocolo Bratan',text:code}).catch(function(){})}
    });
}
function renderHist(){
  var h=lerHist(),q=norm($('#hq').value.trim()),box=$('#hList');
  if(!h.length){box.innerHTML='<div class="dr-empty">Nenhum protocolo gerado ainda.<br>Cada relatório baixado fica registrado aqui.</div>';return}
  var list=h.map(function(r,i){return {r:r,i:i}}).filter(function(o){return !q||norm((o.r.n||'')+' '+(o.r.p||'')).indexOf(q)>-1});
  if(!list.length){box.innerHTML='<div class="dr-empty">Nenhum registro para essa busca.</div>';return}
  box.innerHTML=list.map(function(o){
    var r=o.r,its=(r.it||[]).map(function(it){return '<div class="he-i"><span>'+esc(it.l)+(it.pel?'<small>Pellets: '+esc(it.pel)+'</small>':'')+'</span><span class="num">'+fmt(it.v)+'</span></div>'}).join('');
    if(r.ds>0)its+='<div class="he-i"><span>Desconto</span><span class="num">- '+fmt(r.ds)+'</span></div>';
    return '<div class="he" data-i="'+o.i+'"><div class="he-top" data-h="toggle"><div><div class="he-n">'+esc(r.n||'Paciente')+'</div><div class="he-m">'+esc(r.p||'')+', '+esc(r.d||'')+'</div></div>'+
      '<div class="he-v"><b class="num">6x de '+fmt((r.tp||0)/6)+'</b><span class="num">Pix '+fmt(r.tx||0)+'</span></div></div>'+
      '<div class="he-d">'+its+(r.sel?'<div class="he-a"><button data-h="open">Reabrir plano</button></div>':'')+'</div></div>';
  }).join('');
}
function openDrawer(){renderHist();$('#drawer').classList.add('on');$('#scrim').classList.add('on')}
function closeDrawer(){$('#drawer').classList.remove('on');$('#scrim').classList.remove('on')}
function reabrir(r){
  var apply=function(){
    state={name:r.n||'',lines:r.sel.filter(function(s){return byId[s.id]}).map(function(s){return {id:s.id,qty:s.qty||1,price:typeof s.price==='number'?s.price:byId[s.id].price}}),
      pellets:r.pl||{},dt:r.dt==='pct'?'pct':'reais',dv:r.dv||'',lastProt:r.p||null};
    avisarPonte('reaberto');syncInputs();commit();closeDrawer();setView('doctor');toast('Plano de '+(r.n||'paciente')+' reaberto');
  };
  if(state.lines.length&&!(state.lines.length===1&&state.lines[0].id==='proj'&&!state.name))
    confirmBox({title:'Reabrir este plano?',text:'O plano em montagem será substituído por este registro.',ok:'Reabrir plano'},apply);
  else apply();
}

/* ===== eventos ===== */
function wire(){
  $('#btnHist').innerHTML=UI.clock;$('#btnNew').innerHTML=UI.fresh;$('#drClose').innerHTML=UI.x;
  $('#icSearch').innerHTML=UI.search;$('#icPresent').innerHTML=UI.present;$('#icPrint').innerHTML=UI.print;$('#icCode').innerHTML=UI.code;
  $('#patBack').innerHTML=UI.x;$('#icBack2').innerHTML=UI.back;$('#icSpark').innerHTML=UI.spark;$('#icDl').innerHTML=UI.print;$('#eye').innerHTML=UI.eye;

  $('#seg').addEventListener('click',function(e){var b=e.target.closest('[data-go]');if(b)setView(b.dataset.go)});
  $('#chips').addEventListener('click',function(e){
    var b=e.target.closest('.chip');if(!b)return;activeCat=b.dataset.cat;
    $$('.chip').forEach(function(x){x.classList.toggle('on',x===b)});
    if($('#q').value){$('#q').value=''}
    applyFilter();$('#catalog').scrollTo({top:0,behavior:reduced?'auto':'smooth'});
  });
  $('#q').addEventListener('input',applyFilter);
  $('#groups').addEventListener('click',function(e){var row=e.target.closest('.row');if(row)rowAction(row,e.target)});
  $('#groups').addEventListener('keydown',function(e){
    if((e.key==='Enter'||e.key===' ')&&e.target.classList.contains('row')){e.preventDefault();rowAction(e.target,null)}
  });
  $('#lines').addEventListener('click',function(e){
    var pel=e.target.closest('.pel');
    if(pel){var pid=pel.dataset.pel,pa=e.target.closest('[data-pact]'),cur=state.pellets[pid]||0;
      if(pa&&pa.dataset.pact==='inc')setPel(pid,cur+1);else if(pa&&pa.dataset.pact==='dec')setPel(pid,cur-1);else if(!pa)setPel(pid,cur?0:1);return}
    var line=e.target.closest('.line');if(!line)return;
    var id=line.dataset.id,a=e.target.closest('[data-act]');if(!a)return;
    if(a.dataset.act==='inc')setQty(id,getLine(id).qty+1);
    else if(a.dataset.act==='dec')setQty(id,getLine(id).qty-1);
    else if(a.dataset.act==='rm')removeLine(id);
    else if(a.dataset.act==='price')editPrice(id,a);
  });
  $('#lines').addEventListener('keydown',function(e){
    var pel=e.target.classList&&e.target.classList.contains('pel')?e.target:null;
    if(pel&&(e.key==='Enter'||e.key===' ')){e.preventDefault();var pid=pel.dataset.pel;setPel(pid,state.pellets[pid]?0:1)}
  });
  $('#pName').addEventListener('input',function(){state.name=this.value;save()});
  $('#dType').addEventListener('click',function(e){
    var b=e.target.closest('[data-dt]');if(!b)return;state.dt=b.dataset.dt;
    $$('#dType button').forEach(function(x){x.classList.toggle('on',x===b)});dirty();commit({lines:false});
  });
  $('#dVal').addEventListener('input',function(){state.dv=this.value;dirty();commit({lines:false})});
  $('#btnPresent').addEventListener('click',function(){setView('patient')});
  $('#mbGo').addEventListener('click',function(){setView('patient')});
  $('#mbPlan').addEventListener('click',function(){document.querySelector('.plan').scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'})});
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(en){$('#mbar').classList.toggle('away',en[0].isIntersecting)},{threshold:.35}).observe(document.querySelector('.plan-foot'));
  }
  $('#btnReport').addEventListener('click',gerarRelatorio);
  $('#btnCode').addEventListener('click',openCode);
  $('#patBack').addEventListener('click',function(){setView('doctor')});
  $('#pcDl').addEventListener('click',gerarRelatorio);
  $('#eye').addEventListener('click',function(){setReveal(!$('#pcard').classList.contains('revealed'))});
  $('#showClose').addEventListener('click',closeShow);
  $('#btnHist').addEventListener('click',openDrawer);
  $('#drClose').addEventListener('click',closeDrawer);
  $('#scrim').addEventListener('click',closeDrawer);
  $('#hq').addEventListener('input',renderHist);
  $('#hList').addEventListener('click',function(e){
    var he=e.target.closest('.he');if(!he)return;var a=e.target.closest('[data-h]');if(!a)return;
    if(a.dataset.h==='toggle')he.classList.toggle('open');
    if(a.dataset.h==='open'){var r=lerHist()[+he.dataset.i];if(r&&r.sel)reabrir(r)}
  });
  $('#hClear').addEventListener('click',function(){
    if(!lerHist().length){toast('O histórico já está vazio');return}
    confirmBox({title:'Limpar o histórico?',text:'Todos os protocolos registrados neste aparelho serão apagados. Essa ação não pode ser desfeita.',ok:'Limpar histórico',danger:true},
      function(){try{localStorage.removeItem('bratan_historico')}catch(e){}renderHist();toast('Histórico limpo')});
  });
  $('#btnNew').addEventListener('click',function(){
    confirmBox({title:'Começar um novo plano?',text:'O plano atual será descartado. Os relatórios já gerados continuam no histórico.',ok:'Novo plano'},function(){
      state=DEFAULT();avisarPonte('novo');syncInputs();$('#q').value='';applyFilter();commit();setView('doctor');$('#lines').scrollTop=0;toast('Novo plano iniciado');
    });
  });
  $('#modal').addEventListener('click',function(e){if(e.target.id==='modal')closeModal()});
  document.addEventListener('keydown',function(e){
    var tag=(document.activeElement&&document.activeElement.tagName)||'',typing=/INPUT|TEXTAREA|SELECT/.test(tag);
    if(e.key==='Escape'){
      if($('#modal').classList.contains('on'))return closeModal();
      if($('#drawer').classList.contains('on'))return closeDrawer();
      if($('#vShow').classList.contains('on'))return closeShow();
      if(view==='patient')return setView('doctor');
      if(typing)document.activeElement.blur();return;
    }
    if(typing||e.metaKey||e.ctrlKey||e.altKey)return;
    if(e.key==='/'&&view==='doctor'){e.preventDefault();$('#q').focus()}
    else if((e.key==='p'||e.key==='P')&&view==='doctor'&&!$('#modal').classList.contains('on'))setView('patient');
  });
  window.addEventListener('resize',function(){moveSeg($('#vShow').classList.contains('on')?'show':view);if(view==='patient')fitInv()});
}


/* ===== ponte com o sistema (28/10/2026) =====
   O app continua offline e fazendo a conta como sempre. O sistema só lê o
   retrato do plano por aqui e manda ao comercial (src/doutor/ponte.ts). */
function retrato(){
  var T=totals();
  return {
    versao:'v22',
    nome:state.name.trim(),
    linhas:sortedLines().map(function(l){
      var it=byId[l.id],cat=CATS.filter(function(c){return c.id===it.cat})[0];
      return {id:l.id,nome:it.name,nomeParaPaciente:it.pname||it.name,quantidadeTexto:qtyText(it,l.qty),nota:it.pnote||'',
        categoria:cat?cat.pl:it.cat,unidade:it.unit,quantidade:l.qty,precoUnitario:l.price,precoDeTabela:it.price,valor:lineValue(l),
        pellets:it.pel?selPellets().map(function(p){var n=state.pellets[p.id];return {id:p.id,nome:p.name,quantidade:n,precoUnitario:p.price,valor:p.price*n}}):[]};
    }),
    totais:{soma:T.total,avistaSemDesconto:T.avB,desconto:T.desc,pix:T.pix,parceladoTotal:T.parcTot,parcela:T.parc,parcelas:6,fatorAvista:F_AVISTA,fatorParcelado:F_PARC},
    desconto:{tipo:state.dt,informado:T.dv,texto:state.dv},
    numeroBra:state.lastProt||null,
    codigoBra:state.lines.length?codigoDoCloser():'',
    estado:JSON.parse(JSON.stringify(state))
  };
}
window.BratanPlano={
  retrato:retrato,
  nome:function(){return state.name},
  temItens:function(){return state.lines.length>0},
  definirPaciente:function(nome){state.name=String(nome||'');$('#pName').value=state.name;save();renderMeta()},
  aviso:function(msg){toast(msg)}
};

/* ===== início ===== */
buildCatalog();wire();syncInputs();applyFilter();commit();
moveSeg('doctor');
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){moveSeg(view)});

/* ===== app instalável: atualiza sozinho sem interromper uma apresentação ===== */
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    var had=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('/doutor/sw.js',{scope:'/doutor/'}).then(function(reg){setInterval(function(){reg.update()},60*60*1000)}).catch(function(){});
    navigator.serviceWorker.addEventListener('controllerchange',function(){
      if(!had){had=true;return}
      if(view==='doctor'&&!$('#vShow').classList.contains('on'))location.reload();else pendingReload=true;
    });
  });
}
})();
