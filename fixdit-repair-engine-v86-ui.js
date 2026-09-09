/* Fixdit Repair Engine V8.6 UI — additive only, stable Result V19 compatible */
(function(){
  'use strict';

  const COPY={
    nl:{
      method:'Gekozen reparatiemethode',
      evidence:'Onderbouwing / bronnen',
      control:'Controle',
      why:'Waarom',
      statuses:{
        DIY_CONFIDENT:'Zelf te repareren',
        DIY_AFTER_DETAILS:'Zelf te repareren na één detail',
        DIY_WITH_CAUTION:'Zelf te repareren met extra voorzichtigheid',
        PROFESSIONAL_REQUIRED:'Vakman vereist'
      }
    },
    en:{
      method:'Selected repair method',
      evidence:'Evidence / sources',
      control:'Check',
      why:'Why',
      statuses:{
        DIY_CONFIDENT:'DIY repair',
        DIY_AFTER_DETAILS:'DIY after one more detail',
        DIY_WITH_CAUTION:'DIY with caution',
        PROFESSIONAL_REQUIRED:'Professional required'
      }
    },
    de:{
      method:'Gewählte Reparaturmethode',
      evidence:'Belege / Quellen',
      control:'Kontrolle',
      why:'Warum',
      statuses:{
        DIY_CONFIDENT:'Selbst reparierbar',
        DIY_AFTER_DETAILS:'DIY nach einem weiteren Detail',
        DIY_WITH_CAUTION:'DIY mit Vorsicht',
        PROFESSIONAL_REQUIRED:'Fachbetrieb erforderlich'
      }
    }
  };

  function lang(){
    const x=(document.documentElement.lang||'nl').slice(0,2).toLowerCase();
    return ['nl','en','de'].includes(x)?x:'nl';
  }

  function ensureStyle(){
    if(document.getElementById('fixditV86Style'))return;

    const s=document.createElement('style');
    s.id='fixditV86Style';
    s.textContent=
      '#repairMethodV86{margin:14px 0;padding:15px 16px;border:1px solid #dfe8e2;border-radius:16px;background:#fbfdfb}'+
      '#repairMethodV86 .v86Top{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}'+
      '#repairMethodV86 small{display:block;margin-bottom:4px;font-size:10px;font-weight:900;letter-spacing:.08em;color:#14834d;-webkit-text-fill-color:#14834d}'+
      '#repairMethodV86 b{font-size:15px}'+
      '#repairMethodV86 p{margin:7px 0 0;font-size:12px;line-height:1.5;color:#596b61;-webkit-text-fill-color:#596b61}'+
      '#repairMethodV86 .v86Status{flex:0 0 auto;border:1px solid #dbe8df;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:800;background:#fff}'+
      '#steps .step > .v86StepExtra{grid-column:1 / -1;min-width:0;width:100%;box-sizing:border-box;margin-top:9px;padding-top:9px;border-top:1px dashed #dfe8e2;font-size:12px;line-height:1.45}'+
      '.v86StepExtra b{font-size:11px}'+
      '.v86StepExtra p{margin:4px 0 0;color:#596b61;-webkit-text-fill-color:#596b61}'+
      '#repairEvidenceV86{margin-top:14px;padding-top:12px;border-top:1px solid #e5ece7}'+
      '#repairEvidenceV86 b{display:block;margin-bottom:7px;font-size:12px}'+
      '#repairEvidenceV86 a{display:block;margin:5px 0;font-size:12px;word-break:break-word}';
    document.head.appendChild(s);
  }

  function removeOld(){
    document.getElementById('repairMethodV86')?.remove();
    document.getElementById('repairEvidenceV86')?.remove();
    document.querySelectorAll('.v86StepExtra').forEach(x=>x.remove());
  }

  function render(d){
    ensureStyle();
    removeOld();

    const e=d?.repairEngine;
    if(!e)return;

    const result=document.getElementById('result');
    if(!result)return;

    const t=COPY[d.language] || COPY[lang()];
    const method=e?.technique?.name;
    const status=e?.repairability?.status;

    if(method){
      const card=document.createElement('div');
      card.id='repairMethodV86';

      const reason=
        (e?.technique?.whySelected||[]).slice(0,2).join(' ') ||
        e?.technique?.mechanism ||
        '';

      card.innerHTML=
        '<div class="v86Top">'+
          '<div><small></small><b></b></div>'+
          '<span class="v86Status"></span>'+
        '</div>'+
        '<p></p>';

      card.querySelector('small').textContent=t.method;
      card.querySelector('b').textContent=method;
      card.querySelector('.v86Status').textContent=t.statuses[status]||status||'';
      card.querySelector('p').textContent=reason;

      const planStage=document.getElementById('resultPlanStageV19');
      if(planStage&&planStage.parentNode===result){
        result.insertBefore(card,planStage);
      }else{
        result.appendChild(card);
      }
    }

    const structured=Array.isArray(e?.steps)?e.steps:[];
    const cards=[...document.querySelectorAll('#steps .step')];

    cards.forEach((card,index)=>{
      const step=structured[index];
      if(!step)return;

      const extra=document.createElement('div');
      extra.className='v86StepExtra';

      const why=step.why||'';
      const question=step?.check?.question||'';

      let html='';
      if(why){
        html+='<b>'+t.why+'</b><p class="v86Why"></p>';
      }
      if(question){
        html+='<b>'+t.control+'</b><p class="v86Check"></p>';
      }

      extra.innerHTML=html;
      if(why)extra.querySelector('.v86Why').textContent=why;
      if(question)extra.querySelector('.v86Check').textContent=question;

      card.appendChild(extra);
    });

    const sources=Array.isArray(e?.research?.sources)?e.research.sources:[];
    if(sources.length){
      const detailsBody=document.querySelector('.resultDetailsV19 .detailsBody');
      if(detailsBody){
        const box=document.createElement('div');
        box.id='repairEvidenceV86';
        box.innerHTML='<b></b>';
        box.querySelector('b').textContent=t.evidence;

        sources.slice(0,4).forEach(source=>{
          const a=document.createElement('a');
          try { if (new URL(source.url).protocol !== 'https:') return; } catch { return; }
          a.href=source.url;
          a.target='_blank';
          a.rel='noopener noreferrer';
          a.textContent=(source.title||source.domain||source.url);
          box.appendChild(a);
        });

        detailsBody.appendChild(box);
      }
    }
  }

  function install(){
    const original=window.renderDiagnosis;

    if(typeof original==='function'&&!original.__fixditV86){
      const wrapped=function(raw){
        const out=original.apply(this,arguments);
        try{
          const d=raw?.repairEngine ? raw : ((typeof lastDiagnosis!=='undefined'&&lastDiagnosis)?lastDiagnosis:raw);
          render(d);
        }catch{
          render(raw);
        }
        return out;
      };

      wrapped.__fixditV86=true;
      window.renderDiagnosis=wrapped;
    }

    try{
      if(typeof lastDiagnosis!=='undefined'&&lastDiagnosis)render(lastDiagnosis);
    }catch{}
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',install,{once:true});
  }else{
    install();
  }
})();
