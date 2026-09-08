/* Fixdit Result V19 — restructure the existing diagnosis UI without changing API contracts */
(function(){
  const copy = {
    nl:{
      needKicker:'VOORBEREIDING',
      needTitle:'Wat heb je nodig?',
      planKicker:'AAN DE SLAG',
      planTitle:'Zo los je het op',
      details:'Meer details over deze diagnose'
    },
    en:{
      needKicker:'PREPARATION',
      needTitle:'What do you need?',
      planKicker:'GET STARTED',
      planTitle:'How to fix it',
      details:'More details about this diagnosis'
    },
    de:{
      needKicker:'VORBEREITUNG',
      needTitle:'Was brauchst du?',
      planKicker:'LOSLEGEN',
      planTitle:'So löst du das Problem',
      details:'Mehr Details zu dieser Diagnose'
    }
  };

  function getLang(){
    const fromHtml=(document.documentElement.lang||'').slice(0,2).toLowerCase();
    return ['nl','en','de'].includes(fromHtml)?fromHtml:'nl';
  }

  function stage(number,kicker,title){
    const el=document.createElement('div');
    el.className='repairStageV19';
    el.innerHTML='<span class="stageNo">'+number+'</span><div><small></small><b></b></div>';
    el.querySelector('small').textContent=kicker;
    el.querySelector('b').textContent=title;
    return el;
  }

  function isVisible(el){
    if(!el || el.hidden) return false;
    return getComputedStyle(el).display!=='none';
  }

  function enhance(){
    const result=document.getElementById('result');
    if(!result || result.dataset.resultV19==='1') return;
    result.dataset.resultV19='1';

    const top=result.querySelector('.resultTop');
    const next=result.querySelector('.nextAction');
    const more=document.getElementById('moreInfoBox');
    const needs=document.getElementById('universalNeeds');
    const danger=document.getElementById('dangerBox');
    const steps=result.querySelector('.resultSection.v10');
    const completion=document.getElementById('completionBox');
    const pro=document.getElementById('helpBox');
    const feedback=result.querySelector('.feedback');
    const actions=result.querySelector('.resultActionBar');
    const smart=result.querySelector('.smartRow');
    const metrics=result.querySelector('.metrics.v10');
    const info=result.querySelector('.infoGrid');

    if(!top || !next || !steps) return;

    const lang=getLang();
    const t=copy[lang];

    const needStage=stage('1',t.needKicker,t.needTitle);
    needStage.id='resultNeedStageV19';

    const planStage=stage('2',t.planKicker,t.planTitle);
    planStage.id='resultPlanStageV19';

    const details=document.createElement('details');
    details.className='resultDetailsV19';
    details.innerHTML='<summary><span class="detailsLabel"></span><span class="detailsChevron">+</span></summary><div class="detailsBody"></div>';
    details.querySelector('.detailsLabel').textContent=t.details;
    const detailsBody=details.querySelector('.detailsBody');

    [smart,metrics,info].filter(Boolean).forEach(el=>detailsBody.appendChild(el));

    // Rebuild the visual order, keeping every original element/ID intact for renderDiagnosis().
    [
      top,
      next,
      more,
      needStage,
      needs,
      danger,
      planStage,
      steps,
      completion,
      pro,
      feedback,
      actions,
      details
    ].filter(Boolean).forEach(el=>result.appendChild(el));

    function sync(){
      const langNow=getLang();
      const tx=copy[langNow];

      needStage.querySelector('small').textContent=tx.needKicker;
      needStage.querySelector('b').textContent=tx.needTitle;
      planStage.querySelector('small').textContent=tx.planKicker;
      planStage.querySelector('b').textContent=tx.planTitle;
      details.querySelector('.detailsLabel').textContent=tx.details;

      needStage.hidden=!isVisible(needs);

      // A steps heading is useful only when there is at least one rendered step.
      const hasSteps=!!document.querySelector('#steps .step');
      planStage.hidden=!hasSteps;
    }

    sync();

    // renderDiagnosis changes hidden states and rebuilds the steps list after every diagnosis/follow-up.
    const observer=new MutationObserver(sync);
    if(needs) observer.observe(needs,{attributes:true,attributeFilter:['hidden','style']});
    const stepList=document.getElementById('steps');
    if(stepList) observer.observe(stepList,{childList:true});
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});

    // Keep the essential plan open and the diagnostic dashboard secondary.
    details.open=false;
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',enhance,{once:true});
  }else{
    enhance();
  }
})();