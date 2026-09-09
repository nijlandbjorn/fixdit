/* Fixdit Immediate UI Add-on V1 — state-aware tweaks for stable Result V19 */
(function(){
  'use strict';

  const COPY={
    nl:{steps:'Probeer dit alvast',hint:'Daarna beantwoord je de vraag'},
    en:{steps:'Try this first',hint:'Then answer the question'},
    de:{steps:'Probiere zuerst Folgendes',hint:'Beantworte danach die Frage'}
  };

  function lang(){
    const x=(document.documentElement.lang||'nl').slice(0,2).toLowerCase();
    return ['nl','en','de'].includes(x)?x:'nl';
  }

  function applyState(d){
    if(!d)return;

    const asking=d.needMoreInfo===true || d.route==='more_info';
    const stop=d.route==='stop' || d.risk==='stop';
    const pro=d.route==='professional' || d.professionalRecommended===true;

    const completion=document.getElementById('completionBox');
    const help=document.getElementById('helpBox');
    const stepsTitle=document.getElementById('stepsTitle');
    const stepsHint=document.getElementById('stepsHint');

    if(completion){
      completion.hidden=asking || !completion.querySelector('li');
      completion.style.display=(asking || !completion.querySelector('li'))?'none':'';
    }

    // Normal question-state should stay DIY-focused. Safety/pro routes still show help.
    if(help && asking && !stop && !pro){
      help.hidden=true;
      help.style.display='none';
    }else if(help && (stop || pro)){
      help.style.display='';
    }

    const stateCopy={
      nl:{asking:'MEER INFORMATIE NODIG',complete:'ANALYSE AFGEROND',stop:'STOP: VEILIGHEID EERST',pro:'PROFESSIONELE BEOORDELING NODIG'},
      en:{asking:'MORE INFORMATION NEEDED',complete:'ANALYSIS COMPLETE',stop:'STOP: SAFETY FIRST',pro:'PROFESSIONAL ASSESSMENT NEEDED'},
      de:{asking:'WEITERE INFORMATIONEN NÖTIG',complete:'ANALYSE ABGESCHLOSSEN',stop:'STOPP: SICHERHEIT ZUERST',pro:'FACHLICHE BEURTEILUNG NÖTIG'}
    }[d.language] || {asking:'MEER INFORMATIE NODIG',complete:'ANALYSE AFGEROND',stop:'STOP: VEILIGHEID EERST',pro:'PROFESSIONELE BEOORDELING NODIG'};
    const eyebrow=document.getElementById('resultEyebrow');
    if(eyebrow)eyebrow.textContent=stop?stateCopy.stop:pro?stateCopy.pro:asking?stateCopy.asking:stateCopy.complete;
    const icon=document.getElementById('resultStatusIcon');
    if(icon && asking && !stop && !pro)icon.textContent='?';
    if(help && (stop || pro))help.hidden=false;
    if(asking){
      const t=COPY[d.language] || COPY[lang()];
      if(stepsTitle)stepsTitle.textContent=t.steps;
      if(stepsHint)stepsHint.textContent=t.hint;
    }
  }

  function install(){
    const original=window.renderDiagnosis;
    if(typeof original==='function' && !original.__fixditImmediateUI){
      const wrapped=function(raw){
        const out=original.apply(this,arguments);
        try{
          const d=(typeof lastDiagnosis!=='undefined'&&lastDiagnosis)?lastDiagnosis:raw;
          applyState(d);
        }catch{
          applyState(raw);
        }
        return out;
      };
      wrapped.__fixditImmediateUI=true;
      window.renderDiagnosis=wrapped;
    }

    try{
      if(typeof lastDiagnosis!=='undefined'&&lastDiagnosis)applyState(lastDiagnosis);
    }catch{}
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',install,{once:true});
  }else{
    install();
  }
})();