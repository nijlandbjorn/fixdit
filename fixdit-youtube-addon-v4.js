/* Fixdit YouTube Add-on V4 — immediate troubleshooting + final repair, stable Result V19 */
(function(){
  'use strict';

  const COPY={
    nl:{
      troubleshootingTitle:'Bekijk alvast uitleg op YouTube',
      troubleshootingNote:'Dit is een gerichte zoekopdracht op basis van wat Fixdit nu al weet. Na je antwoord kan de zoekopdracht specifieker worden.',
      repairTitle:'Bekijk passende reparatie-uitleg op YouTube',
      repairNote:'Gerichte zoekopdracht op basis van jouw concrete reparatieroute. Controleer of de video bij jouw exacte uitvoering past.'
    },
    en:{
      troubleshootingTitle:'Watch troubleshooting on YouTube',
      troubleshootingNote:'This is a targeted search based on what Fixdit already knows. After your answer, the search can become more specific.',
      repairTitle:'Watch relevant repair instructions on YouTube',
      repairNote:'Targeted search based on your concrete repair route. Verify that the video matches your exact variant.'
    },
    de:{
      troubleshootingTitle:'Anleitung zur Fehlersuche auf YouTube ansehen',
      troubleshootingNote:'Dies ist eine gezielte Suche auf Basis dessen, was Fixdit bereits weiß. Nach deiner Antwort kann die Suche genauer werden.',
      repairTitle:'Passende Reparaturanleitung auf YouTube ansehen',
      repairNote:'Gezielte Suche anhand deines konkreten Reparaturwegs. Prüfe, ob das Video zu deiner genauen Ausführung passt.'
    }
  };

  function lang(){
    const x=(document.documentElement.lang||'nl').slice(0,2).toLowerCase();
    return ['nl','en','de'].includes(x)?x:'nl';
  }

  function ensureStyle(){
    if(document.getElementById('fixditYoutubeAddonStyle'))return;

    const s=document.createElement('style');
    s.id='fixditYoutubeAddonStyle';
    s.textContent=
      '#fixditYoutubeAddon{margin:16px 0;padding:15px 16px;border:1px solid #dfe8e2;border-radius:16px;background:#f8fbf9}'+
      '#fixditYoutubeAddon[hidden]{display:none!important}'+
      '#fixditYoutubeAddon b{display:block;margin:0 0 5px;font-size:14px}'+
      '#fixditYoutubeAddon p{margin:0 0 10px;font-size:12px;line-height:1.5;color:#607067;-webkit-text-fill-color:#607067}'+
      '#fixditYoutubeAddon a{display:inline-flex;align-items:center;gap:7px;min-height:42px;padding:0 14px;border-radius:11px;background:#0b1219;color:#fff!important;-webkit-text-fill-color:#fff!important;text-decoration:none;font-size:12px;font-weight:900}';

    document.head.appendChild(s);
  }

  function ensureCard(){
    const result=document.getElementById('result');
    if(!result)return null;

    let el=document.getElementById('fixditYoutubeAddon');
    if(el)return el;

    el=document.createElement('div');
    el.id='fixditYoutubeAddon';
    el.hidden=true;
    el.innerHTML='<b></b><p></p><a target="_blank" rel="noopener noreferrer">▶ <span></span></a>';

    const completion=document.getElementById('completionBox');
    const help=document.getElementById('helpBox');

    if(completion&&completion.parentNode===result){
      completion.insertAdjacentElement('afterend',el);
    }else if(help&&help.parentNode===result){
      result.insertBefore(el,help);
    }else{
      result.appendChild(el);
    }

    return el;
  }

  function renderYoutube(d){
    ensureStyle();

    const el=ensureCard();
    if(!el)return;

    const y=d?.youtube;

    const blocked=
      d?.route==='stop' ||
      d?.route==='professional' ||
      d?.professionalRecommended===true ||
      d?.risk==='stop';

    let validUrl=false;
    try { const u=new URL(y?.url); validUrl=u.protocol==='https:' && u.hostname==='www.youtube.com' && u.pathname==='/results'; } catch {}
    const show=validUrl &&
      !blocked &&
      !!y?.available &&
      !!y?.url &&
      ['troubleshooting','repair'].includes(y?.mode);

    if(!show){
      el.hidden=true;
      el.querySelector('a').removeAttribute('href');
      return;
    }

    const t=COPY[d.language] || COPY[lang()];
    const troubleshooting=y.mode==='troubleshooting';

    el.querySelector('b').textContent=
      troubleshooting
        ? t.troubleshootingTitle
        : t.repairTitle;

    el.querySelector('p').textContent=
      troubleshooting
        ? t.troubleshootingNote
        : t.repairNote;

    el.querySelector('span').textContent=
      y.label ||
      (
        troubleshooting
          ? t.troubleshootingTitle
          : t.repairTitle
      );

    el.querySelector('a').href=y.url;
    el.hidden=false;
  }

  function install(){
    ensureStyle();

    const original=window.renderDiagnosis;

    if(
      typeof original==='function' &&
      !original.__fixditYoutubeV4
    ){
      const wrapped=function(raw){
        const out=original.apply(this,arguments);

        try{
          const d=
            (typeof lastDiagnosis!=='undefined'&&lastDiagnosis)
              ? lastDiagnosis
              : raw;

          renderYoutube(d);
        }catch{
          renderYoutube(raw);
        }

        return out;
      };

      wrapped.__fixditYoutubeV4=true;
      window.renderDiagnosis=wrapped;
    }

    try{
      if(typeof lastDiagnosis!=='undefined'&&lastDiagnosis){
        renderYoutube(lastDiagnosis);
      }
    }catch{}
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',install,{once:true});
  }else{
    install();
  }
})();