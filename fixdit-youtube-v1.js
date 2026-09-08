/* Fixdit YouTube Guidance V1 — renders a safe YouTube search link from diagnosis.youtube */
(function(){
  const copy={
    nl:{title:'Bekijk hoe je dit doet',sub:'Fixdit opent een gerichte YouTube-zoekopdracht. Controleer altijd of de video bij jouw exacte merk/model past.'},
    en:{title:'Watch how to do this',sub:'Fixdit opens a targeted YouTube search. Always verify that the video matches your exact brand/model.'},
    de:{title:'Sieh dir an, wie es geht',sub:'Fixdit öffnet eine gezielte YouTube-Suche. Prüfe immer, ob das Video zu deiner genauen Marke/deinem Modell passt.'}
  };

  function lang(){
    const x=(document.documentElement.lang||'nl').slice(0,2).toLowerCase();
    return ['nl','en','de'].includes(x)?x:'nl';
  }

  function ensureCard(){
    const result=document.getElementById('result');
    if(!result) return null;
    let card=document.getElementById('youtubeGuideCard');
    if(card) return card;

    card=document.createElement('div');
    card.id='youtubeGuideCard';
    card.className='youtubeGuideCard';
    card.hidden=true;
    card.innerHTML='<div class="youtubeGuideIcon">▶</div><div class="youtubeGuideCopy"><b></b><p></p><a target="_blank" rel="noopener noreferrer"></a></div>';

    const completion=document.getElementById('completionBox');
    const pro=document.getElementById('helpBox');
    if(completion?.parentNode===result) result.insertBefore(card, completion.nextSibling);
    else if(pro?.parentNode===result) result.insertBefore(card, pro);
    else result.appendChild(card);
    return card;
  }

  function sync(){
    const card=ensureCard();
    if(!card) return;
    let d=null;
    try{
      // lastDiagnosis is declared by the main classic script and is available
      // in the shared global lexical environment.
      d=typeof lastDiagnosis!=='undefined'?lastDiagnosis:null;
    }catch{}
    const y=d?.youtube;
    if(!y?.available || !y?.url){
      card.hidden=true;
      return;
    }

    const t=copy[lang()];
    card.querySelector('b').textContent=t.title;
    card.querySelector('p').textContent=t.sub;
    const a=card.querySelector('a');
    a.textContent=y.label || t.title;
    a.href=y.url;
    card.hidden=false;
  }

  const result=document.getElementById('result');
  if(result){
    new MutationObserver(sync).observe(result,{subtree:true,childList:true,attributes:true});
  }
  document.addEventListener('click',e=>{
    if(e.target?.id==='youtubeGuideCard') sync();
  });
  document.documentElement.addEventListener?.('languagechange',sync);
  setInterval(sync,1200);
  sync();
})();