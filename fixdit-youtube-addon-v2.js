/* Fixdit YouTube Add-on V2 — isolated enhancement for stable Result V19 */
(function(){
  'use strict';

  const COPY={
    nl:{
      title:'Bekijk passende uitleg op YouTube',
      note:'Gerichte zoekopdracht op basis van jouw reparatie. Controleer of de video bij jouw exacte uitvoering past.'
    },
    en:{
      title:'Watch relevant instructions on YouTube',
      note:'Targeted search based on your repair. Verify that the video matches your exact variant.'
    },
    de:{
      title:'Passende Anleitung auf YouTube ansehen',
      note:'Gezielte Suche anhand deiner Reparatur. Prüfe, ob das Video zu deiner genauen Ausführung passt.'
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
    const show=
      !!y?.available &&
      !!y?.url &&
      ['self','caution'].includes(d?.route) &&
      d?.needMoreInfo!==true;

    if(!show){
      el.hidden=true;
      el.querySelector('a').removeAttribute('href');
      return;
    }

    const t=COPY[lang()];
    el.querySelector('b').textContent=t.title;
    el.querySelector('p').textContent=t.note;
    el.querySelector('span').textContent=y.label||t.title;
    el.querySelector('a').href=y.url;
    el.hidden=false;
  }

  function install(){
    ensureStyle();

    const original=window.renderDiagnosis;

    if(
      typeof original==='function' &&
      !original.__fixditYoutubeV2
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

      wrapped.__fixditYoutubeV2=true;
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