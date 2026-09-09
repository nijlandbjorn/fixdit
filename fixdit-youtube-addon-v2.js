/* Fixdit YouTube Add-on V1 — isolated add-on for stable Result V19 */
(function(){
  'use strict';
  const COPY={
    nl:{title:'Zoek uitleg op YouTube',note:'Zoekresultaten, geen door Fixdit gecontroleerde video. Controleer apparaat, uitvoering en toepasbaarheid. Een video vervangt geen veiligheidsadvies.'},
    en:{title:'Search YouTube for guidance',note:'Search results, not a video verified by Fixdit. Check the device, variant and applicability. A video does not replace safety advice.'},
    de:{title:'Anleitung auf YouTube suchen',note:'Suchergebnisse, kein von Fixdit geprüftes Video. Prüfe Gerät, Ausführung und Eignung. Ein Video ersetzt keine Sicherheitshinweise.'}
  };
  function lang(){const x=(document.documentElement.lang||'nl').slice(0,2).toLowerCase();return ['nl','en','de'].includes(x)?x:'nl'}
  function clean(v){return String(v||'').trim()}
  function buildSearch(d){
    if(!d || typeof d!=='object') return null;
    const l=lang();
    const unsafe=d.route==='stop'||d.risk==='stop';
    const professional=d.route==='professional'||d.professionalRecommended===true||d.risk==='hoog';
    const repair=d.route==='self'&&d.risk==='laag'&&d.needMoreInfo===false;
    const topic=unsafe?'safety':professional?'professional':repair?'repair':'diagnosis';
    const terms={nl:{safety:'veiligheid wat te doen gevaar',professional:'uitleg professionele beoordeling',repair:'reparatie uitleg',diagnosis:'probleem herkennen uitleg'},en:{safety:'safety danger what to do',professional:'professional assessment explained',repair:'repair tutorial',diagnosis:'troubleshooting explained'},de:{safety:'Sicherheit Gefahr richtig handeln',professional:'Fachbetrieb Beurteilung erklärt',repair:'Reparatur Anleitung',diagnosis:'Fehlersuche erklärt'}};
    // Fixed host; never trust an AI-supplied URL or use proposed repair text for a stop.
    const object=clean(d.objectLabel)||clean(d.objectFamily)||'apparaat';
    const parts=[clean(d.brand),clean(d.model),object,repair?clean(d.solutionTitle):'',terms[l][topic],{nl:'Nederlands',en:'English',de:'Deutsch'}[l]];
    return 'https://www.youtube.com/results?search_query='+encodeURIComponent(parts.filter(Boolean).join(' ').slice(0,300));
  }
  function style(){
    if(document.getElementById('fixditYoutubeAddonStyle'))return;
    const s=document.createElement('style');s.id='fixditYoutubeAddonStyle';
    s.textContent='#fixditYoutubeAddon{margin:16px 0;padding:15px 16px;border:1px solid #dfe8e2;border-radius:16px;background:#f8fbf9}#fixditYoutubeAddon[hidden]{display:none!important}#fixditYoutubeAddon b{display:block;margin:0 0 5px;font-size:14px}#fixditYoutubeAddon p{margin:0 0 10px;font-size:12px;line-height:1.5;color:#607067;-webkit-text-fill-color:#607067}#fixditYoutubeAddon a{display:inline-flex;align-items:center;gap:7px;min-height:42px;padding:0 14px;border-radius:11px;background:#0b1219;color:#fff!important;-webkit-text-fill-color:#fff!important;text-decoration:none;font-size:12px;font-weight:900}';
    document.head.appendChild(s);
  }
  function card(){
    const result=document.getElementById('result');if(!result)return null;
    let el=document.getElementById('fixditYoutubeAddon');if(el)return el;
    el=document.createElement('div');el.id='fixditYoutubeAddon';el.hidden=true;
    el.innerHTML='<b></b><p></p><a target="_blank" rel="noopener noreferrer">▶ <span></span></a>';
    const completion=document.getElementById('completionBox'),help=document.getElementById('helpBox');
    if(completion&&completion.parentNode===result)completion.insertAdjacentElement('afterend',el);
    else if(help&&help.parentNode===result)result.insertBefore(el,help);else result.appendChild(el);
    return el;
  }
  function render(d){
    style();const el=card();if(!el)return;
    const url=buildSearch(d);
    if(!url){el.hidden=true;el.querySelector('a').removeAttribute('href');return}
    const t=COPY[lang()];el.querySelector('b').textContent=t.title;el.querySelector('p').textContent=t.note;
    el.querySelector('span').textContent=t.title;el.querySelector('a').href=url;el.hidden=false;
  }
  function install(){
    style();
    const original=window.renderDiagnosis;
    if(typeof original==='function'&&!original.__fixditYoutubeWrapped){
      const wrapped=function(raw){const out=original.apply(this,arguments);try{render(typeof lastDiagnosis!=='undefined'&&lastDiagnosis?lastDiagnosis:raw)}catch{render(raw)}return out};
      wrapped.__fixditYoutubeWrapped=true;window.renderDiagnosis=wrapped;
    }
    try{if(typeof lastDiagnosis!=='undefined'&&lastDiagnosis)render(lastDiagnosis)}catch{}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();