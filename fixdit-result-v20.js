/* Fixdit Result V20 — diagnostic-state UI + grounded YouTube guidance */
(function(){
  const copy={
    nl:{
      needKicker:'VOORBEREIDING',
      needTitle:'Wat heb je nodig?',
      planKicker:'AAN DE SLAG',
      planTitle:'Zo los je het op',
      diagnosticTitle:'Zo onderzoek je het probleem',
      details:'Meer details over deze diagnose',
      youtubeTitle:'Bekijk hoe je dit doet',
      youtubeSub:'Fixdit opent een gerichte YouTube-zoekopdracht. Controleer of de uitleg bij jouw exacte merk, model en uitvoering past.'
    },
    en:{
      needKicker:'PREPARATION',
      needTitle:'What do you need?',
      planKicker:'GET STARTED',
      planTitle:'How to fix it',
      diagnosticTitle:'How to investigate the problem',
      details:'More details about this diagnosis',
      youtubeTitle:'Watch how to do this',
      youtubeSub:'Fixdit opens a targeted YouTube search. Check that the instructions match your exact brand, model and variant.'
    },
    de:{
      needKicker:'VORBEREITUNG',
      needTitle:'Was brauchst du?',
      planKicker:'LOSLEGEN',
      planTitle:'So löst du das Problem',
      diagnosticTitle:'So untersuchst du das Problem',
      details:'Mehr Details zu dieser Diagnose',
      youtubeTitle:'Sieh dir an, wie es geht',
      youtubeSub:'Fixdit öffnet eine gezielte YouTube-Suche. Prüfe, ob die Anleitung zu deiner genauen Marke, deinem Modell und deiner Ausführung passt.'
    }
  };

  function getLang(){
    const x=(document.documentElement.lang||'').slice(0,2).toLowerCase();
    return ['nl','en','de'].includes(x)?x:'nl';
  }

  function currentDiagnosis(){
    try{
      return typeof lastDiagnosis!=='undefined' ? lastDiagnosis : null;
    }catch{
      return null;
    }
  }

  function isDiagnostic(d){
    return !!d && (d.needMoreInfo===true || d.route==='more_info' || d.resolutionMode==='guided_branch');
  }

  function isVisible(el){
    if(!el || el.hidden) return false;
    return getComputedStyle(el).display!=='none';
  }

  function stage(number,kicker,title){
    const el=document.createElement('div');
    el.className='repairStageV19';
    el.innerHTML='<span class="stageNo">'+number+'</span><div><small></small><b></b></div>';
    el.querySelector('small').textContent=kicker;
    el.querySelector('b').textContent=title;
    return el;
  }

  function youtubeCard(){
    const el=document.createElement('div');
    el.className='youtubeGuideV20';
    el.id='youtubeGuideV20';
    el.hidden=true;
    el.innerHTML=
      '<div class="youtubeGuideIconV20">▶</div>'+
      '<div class="youtubeGuideBodyV20">'+
        '<b class="youtubeGuideTitleV20"></b>'+
        '<p class="youtubeGuideSubV20"></p>'+
        '<a class="youtubeGuideLinkV20" target="_blank" rel="noopener noreferrer"></a>'+
      '</div>';
    return el;
  }

  function enhance(){
    const result=document.getElementById('result');
    if(!result || result.dataset.resultV20==='1') return;
    result.dataset.resultV20='1';

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

    const t=copy[getLang()];
    const needStage=stage('1',t.needKicker,t.needTitle);
    needStage.id='resultNeedStageV20';

    const planStage=stage('2',t.planKicker,t.planTitle);
    planStage.id='resultPlanStageV20';

    const details=document.createElement('details');
    details.className='resultDetailsV19';
    details.innerHTML='<summary><span class="detailsLabel"></span><span class="detailsChevron">+</span></summary><div class="detailsBody"></div>';
    const detailsBody=details.querySelector('.detailsBody');
    [smart,metrics,info].filter(Boolean).forEach(el=>detailsBody.appendChild(el));

    const youtube=youtubeCard();

    [
      top,
      next,
      details,
      more,
      needStage,
      needs,
      danger,
      planStage,
      steps,
      completion,
      youtube,
      pro,
      feedback,
      actions
    ].filter(Boolean).forEach(el=>result.appendChild(el));

    function sync(){
      const lang=getLang();
      const tx=copy[lang];
      const d=currentDiagnosis();
      const diagnostic=isDiagnostic(d);

      needStage.querySelector('small').textContent=tx.needKicker;
      needStage.querySelector('b').textContent=tx.needTitle;
      planStage.querySelector('small').textContent=tx.planKicker;
      planStage.querySelector('b').textContent=diagnostic?tx.diagnosticTitle:tx.planTitle;
      details.querySelector('.detailsLabel').textContent=tx.details;

      needStage.hidden=!isVisible(needs);

      const hasSteps=!!document.querySelector('#steps .step');
      planStage.hidden=!hasSteps;

      // A diagnostic check is not a completed repair.
      if(completion){
        const hasCompletion=!!completion.querySelector('li');
        completion.hidden=diagnostic || !hasCompletion;
        completion.style.display=(diagnostic || !hasCompletion)?'none':'';
      }

      const y=d?.youtube;
      const showYoutube=
        !diagnostic &&
        !!y?.available &&
        !!y?.url &&
        ['self','caution'].includes(d?.route);

      youtube.hidden=!showYoutube;
      if(showYoutube){
        youtube.querySelector('.youtubeGuideTitleV20').textContent=tx.youtubeTitle;
        youtube.querySelector('.youtubeGuideSubV20').textContent=tx.youtubeSub;
        const a=youtube.querySelector('.youtubeGuideLinkV20');
        a.textContent=y.label||tx.youtubeTitle;
        a.href=y.url;
      }else{
        youtube.querySelector('.youtubeGuideLinkV20').removeAttribute('href');
      }
    }

    details.open=false;
    sync();

    const observer=new MutationObserver(sync);
    observer.observe(result,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','style']});
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',enhance,{once:true});
  }else{
    enhance();
  }
})();