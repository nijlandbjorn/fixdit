export const V9_TESTER_PATH = '/v9-tester';
export const V9_TESTER_API_PATH = '/v9-tester/api';

export function testerModeEnabled(env = {}) {
  return String(env.V9_TESTER_ENABLED || '').toLowerCase() === 'true';
}

export function isTesterPath(pathname = '') {
  return pathname === V9_TESTER_PATH || pathname === `${V9_TESTER_PATH}/`;
}

export function isTesterApiPath(pathname = '') {
  return pathname === V9_TESTER_API_PATH;
}

export function renderV9TesterHtml() {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f6fbf7">
<title>FixDit V9 Tester</title>
<style>
:root{--ink:#152019;--muted:#637068;--green:#13834b;--soft:#edf8f1;--line:#dce8df;--paper:#fff;--danger:#a62929;--danger-soft:#fff0ef;--warn:#8a5700;--warn-soft:#fff8e8;--shadow:0 18px 50px rgba(21,70,40,.09)}
*{box-sizing:border-box}body{margin:0;background:#f6fbf7;color:var(--ink);font:16px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}button,textarea,input{font:inherit}.shell{width:min(720px,100%);margin:auto;padding:18px 16px 72px}.preview{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 12px;border:1px solid #e7c969;border-radius:12px;background:#fff9df;color:#684a00;font-size:12px;font-weight:900;letter-spacing:.06em}.brand{margin:30px 0 22px}.brand h1{margin:0;font-size:clamp(34px,10vw,52px);line-height:1;letter-spacing:-.055em}.brand h1 span{color:var(--green)}.brand p{margin:14px 0 0;color:var(--muted);font-size:17px}.card{background:var(--paper);border:1px solid var(--line);border-radius:22px;padding:20px;box-shadow:var(--shadow);margin:14px 0}.card h2,.card h3{margin:0 0 12px;letter-spacing:-.02em}.label{display:block;font-weight:850;margin-bottom:8px}.problem{width:100%;min-height:132px;resize:vertical;border:1px solid #cfdcd2;border-radius:15px;padding:14px;color:var(--ink);background:#fff}.problem:focus{outline:3px solid rgba(19,131,75,.16);border-color:var(--green)}.actions{display:grid;gap:10px;margin-top:12px}.primary,.secondary,.answer{border:0;border-radius:14px;padding:13px 16px;font-weight:850}.primary{background:var(--green);color:#fff}.secondary,.answer{background:var(--soft);color:#175c36}.primary:disabled,.secondary:disabled,.answer:disabled{opacity:.55;cursor:not-allowed}.upload{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:14px}.upload input{max-width:100%}.status{min-height:24px;margin-top:10px;color:var(--muted);font-size:14px}.error{color:var(--danger);font-weight:750}.hidden{display:none!important}.safety{border-color:#efb6b2;background:var(--danger-soft);box-shadow:none}.safety h2{color:var(--danger)}.professional{border-color:#ecd38f;background:var(--warn-soft);box-shadow:none}.professional h2{color:var(--warn)}.facts{list-style:none;padding:0;margin:0;display:grid;gap:9px}.facts li{padding-left:27px;position:relative}.facts li:before{content:'✓';position:absolute;left:0;color:var(--green);font-weight:950}.hypotheses{margin:0;padding-left:22px;display:grid;gap:10px}.hypotheses small{display:block;color:var(--muted)}.next{border:2px solid #79bd93;background:#f8fffa}.next .question{font-size:20px;font-weight:850;line-height:1.35}.answers{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}.free-answer{display:flex;gap:8px;margin-top:9px}.free-answer input{min-width:0;flex:1;border:1px solid #cfdcd2;border-radius:12px;padding:11px}.gate{box-shadow:none}.gate.closed{background:#f7f8f7}.gate.open{border-color:#79bd93;background:#f1fbf4}.repair-steps{padding-left:22px}.meta{font-size:13px}.meta summary{cursor:pointer;font-weight:850}.meta pre{overflow:auto;max-height:440px;padding:12px;border-radius:12px;background:#111a14;color:#d7f6df;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.timeline{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.pill{padding:5px 9px;border-radius:999px;background:var(--soft);font-size:12px;font-weight:750}.footer-note{text-align:center;color:var(--muted);font-size:12px;margin-top:24px}@media(min-width:560px){.actions{grid-template-columns:1fr auto}.shell{padding-top:28px}.card{padding:25px}}
</style>
</head>
<body>
<main class="shell">
  <div class="preview"><span>V9 TESTER · PREVIEW</span><span>Geen productie</span></div>
  <header class="brand"><h1>Iets kapot? <span>Eerst FixDit.</span></h1><p>Ontdek eerst wat er echt mis is voordat je onderdelen koopt, gaat sleutelen of een reparateur belt.</p></header>
  <section class="card" id="startCard">
    <label class="label" for="problem">Wat is er kapot?</label>
    <textarea class="problem" id="problem" placeholder="Beschrijf wat je ziet, hoort of merkt…" maxlength="500"></textarea>
    <div class="upload"><input id="photo" type="file" accept="image/*"><span id="photoLabel">Foto toevoegen (optioneel)</span></div>
    <div class="actions"><button class="primary" id="start">Diagnose starten</button><button class="secondary" id="reset" type="button">Opnieuw beginnen</button></div>
    <div class="status" id="status" role="status" aria-live="polite"></div>
  </section>
  <div id="results" class="hidden">
    <section class="card hidden" id="safetyCard"></section>
    <section class="card"><h2>Wat we weten</h2><ul class="facts" id="facts"></ul></section>
    <section class="card"><h2>Mogelijke oorzaken</h2><ol class="hypotheses" id="hypotheses"></ol></section>
    <section class="card next hidden" id="nextCard"><h2>Beste volgende controle</h2><div class="question" id="nextQuestion"></div><p id="nextWhy"></p><div class="answers"><button class="answer" data-answer="Ja">Ja</button><button class="answer" data-answer="Nee">Nee</button><button class="answer" data-answer="Weet ik niet">Weet ik niet</button></div><form class="free-answer" id="answerForm"><input id="freeAnswer" placeholder="Of geef een kort antwoord"><button class="primary">Stuur</button></form></section>
    <section class="card gate closed" id="gateCard"></section>
    <section class="card hidden" id="repairCard"><h2>Veilige reparatiestappen</h2><ol class="repair-steps" id="repairSteps"></ol></section>
    <div class="timeline" id="timeline"></div>
    <details class="card meta"><summary>Technisch tester-paneel</summary><div class="toolbar"><button class="secondary" id="copyDebug">Kopieer run</button><button class="secondary" id="downloadDebug">Exporteer JSON</button></div><pre id="debug"></pre></details>
  </div>
  <p class="footer-note">Interne Preview. Resultaten zijn diagnostische aanwijzingen en geen productierelease.</p>
</main>
<script>
const api='/v9-tester/api';
const el=id=>document.getElementById(id);
let analysisId=''; let lastPayload=null; let turn=0; let busy=false;
const deviceId='v9-tester-'+(localStorage.getItem('fixdit-v9-device')||crypto.randomUUID());
localStorage.setItem('fixdit-v9-device',deviceId.replace('v9-tester-',''));
function text(value){return String(value??'').replace(/[<>]/g,'');}
function setBusy(value,label=''){busy=value; document.querySelectorAll('button,input,textarea').forEach(node=>node.disabled=value); el('status').textContent=label;}
function activeEvidence(v9){return (v9?.ledger?.entries||[]).filter(e=>e.status==='active'&&['user_text','previous_user_text','vision_structured'].includes(e.source));}
function evidenceLabel(e){if(e.predicate==='raw_text')return text(e.value); return [e.subject,e.predicate,typeof e.value==='string'?e.value:JSON.stringify(e.value)].filter(Boolean).map(text).join(': ');}
function safetyReason(v9){const codes=(v9?.safety?.flags||[]).map(flag=>flag.code); if(codes.includes('fire_smoke'))return 'Je beschrijft rook, vuur, vonken of een brandlucht.'; if(codes.includes('gas'))return 'Je beschrijft een mogelijke gaslucht of gaslekkage.'; if(codes.includes('water_electricity'))return 'Je beschrijft water bij een stekker of stopcontact.'; if(codes.some(code=>code.startsWith('battery_')))return 'Je beschrijft schade of extreme hitte bij een batterij.'; return 'De beschreven situatie kan onveilig zijn.'}
function renderSafety(v9){const card=el('safetyCard'); const route=v9?.safety?.route; card.className='card hidden'; card.innerHTML=''; if(route==='stop'){card.className='card safety'; card.innerHTML='<h2>Stop met gebruiken</h2><p>'+text(safetyReason(v9))+' Gebruik het voorwerp niet opnieuw. Schakel het alleen uit of trek de stekker alleen uit als dat veilig kan.</p>'; return true} if(route==='professional'){card.className='card professional';card.innerHTML='<h2>Laat dit professioneel beoordelen</h2><p>De veiligheidscontrole wijst op een situatie die niet geschikt is voor zelf repareren.</p>'} else if(route==='caution'){card.className='card professional';card.innerHTML='<h2>Wees voorzichtig</h2><p>Gebruik het niet verder totdat de volgende veilige controle is uitgevoerd.</p>'} return false}
function render(data){lastPayload=data; const v9=data?.diagnosis?.diagnosticV9; if(!v9)throw new Error('V9 Tester-resultaat ontbreekt.'); analysisId=data.analysisId||analysisId; el('results').classList.remove('hidden'); const stopped=renderSafety(v9); const facts=activeEvidence(v9); el('facts').innerHTML=facts.length?facts.map(e=>'<li>'+evidenceLabel(e)+'</li>').join(''):'<li>Nog geen concrete gebruikerswaarnemingen vastgelegd.</li>'; const hypotheses=(v9.hypotheses||[]).slice(0,3); el('hypotheses').innerHTML=hypotheses.length?hypotheses.map(h=>'<li>'+text(h.statement)+'<small>Hypothese · '+Math.round((Number(h.score)||0)*100)+'% ondersteuningsscore</small></li>').join(''):'<li>Nog onvoldoende bewijs voor een bruikbare hypothese.</li>'; const next=v9.nextTest; el('nextCard').classList.toggle('hidden',stopped||!next); if(next){el('nextQuestion').textContent=next.prompt||'';el('nextWhy').textContent=next.rationale?'Waarom deze controle? '+next.rationale:''} const gate=v9.repairGate||{}; el('gateCard').className='card gate '+(gate.open?'open':'closed'); el('gateCard').innerHTML=gate.open?'<h2>Diagnose voldoende onderbouwd</h2><p>De Repair Gate is veilig geopend.</p>':'<h2>Nog onvoldoende bewijs</h2><p>Nog niet genoeg zekerheid om veilig reparatieadvies te geven.</p>'; const canRepair=gate.open===true&&v9.critic?.approved===true&&!stopped; const steps=canRepair?(v9.plan?.steps||[]):[]; el('repairCard').classList.toggle('hidden',!steps.length); el('repairSteps').innerHTML=steps.map(s=>'<li>'+text(s.action)+'</li>').join(''); turn+=1; el('timeline').insertAdjacentHTML('beforeend','<span class="pill">Beurt '+turn+' · '+text(v9.state?.phase||'analyse')+'</span>'); el('debug').textContent=JSON.stringify({requestId:data.requestId||null,analysisId:data.analysisId,runId:v9.runId,state:v9.state,safety:v9.safety,evidence:v9.ledger?.entries,hypotheses:v9.hypotheses,nextBestTest:v9.nextTest,contradictions:v9.contradictions,repairGate:v9.repairGate,critic:v9.critic,comparator:v9.comparison,persistence:v9.persistence,v8Result:{...data.diagnosis,diagnosticV9:undefined},v9Result:v9},null,2); window.scrollTo({top:el('results').offsetTop-12,behavior:'smooth'})}
async function photoData(){const file=el('photo').files[0]; if(!file)return ''; if(!file.type.startsWith('image/'))throw new Error('Kies een geldig afbeeldingsbestand.'); if(file.size>6_000_000)throw new Error('De foto is te groot (maximaal 6 MB).'); return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('De foto kon niet worden gelezen.'));reader.readAsDataURL(file)})}
async function send(problem,{followup=false}={}){if(busy)return; const value=problem.trim(); if(!value&&!el('photo').files[0]){el('status').innerHTML='<span class="error">Beschrijf eerst het probleem.</span>';return} setBusy(true,followup?'Antwoord verwerken…':'Diagnose uitvoeren…'); try{const requestId=crypto.randomUUID(); const body={requestId,deviceId,language:'nl',problem:value,image:await photoData()}; if(followup){body.action='followup';body.analysisId=analysisId} const response=await fetch(api,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); const data=await response.json().catch(()=>({})); if(!response.ok||!data.ok)throw new Error(data.error||'De aanvraag is mislukt.'); data.requestId=requestId; render(data); el('problem').value='';el('freeAnswer').value='';el('photo').value='';el('photoLabel').textContent='Foto toevoegen (optioneel)';el('status').textContent='Analyse bijgewerkt.'}catch(error){el('status').innerHTML='<span class="error">'+text(error.message||error)+'</span>'}finally{setBusy(false,el('status').textContent)}}
el('start').addEventListener('click',()=>send(el('problem').value)); document.querySelectorAll('[data-answer]').forEach(button=>button.addEventListener('click',()=>send(button.dataset.answer,{followup:true}))); el('answerForm').addEventListener('submit',event=>{event.preventDefault();send(el('freeAnswer').value,{followup:true})}); el('photo').addEventListener('change',()=>{el('photoLabel').textContent=el('photo').files[0]?.name||'Foto toevoegen (optioneel)'}); el('reset').addEventListener('click',()=>{analysisId='';lastPayload=null;turn=0;el('results').classList.add('hidden');el('timeline').innerHTML='';el('problem').value='';el('status').textContent='Nieuwe diagnose gestart.'}); el('copyDebug').addEventListener('click',async()=>{await navigator.clipboard.writeText(el('debug').textContent);el('status').textContent='Tester-run gekopieerd.'}); el('downloadDebug').addEventListener('click',()=>{const blob=new Blob([el('debug').textContent],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='fixdit-v9-tester-run.json';link.click();URL.revokeObjectURL(link.href)});
</script>
</body>
</html>`;
}
