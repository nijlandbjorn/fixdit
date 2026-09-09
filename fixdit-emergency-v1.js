/* Fixdit emergency precheck V1. Does not call emergency services automatically. */
(function(){'use strict';

function fixditEmergencyKind(value){
  const text=String(value||'').toLowerCase().replace(/\s+/g,' ').trim();
  const fire=/\b(staat|staan)\s+(?:nu\s+)?in brand\b|\b(huis|woning|kamer|keuken|auto|house|home)\s+(?:brandt|on fire)\b|\b(woningbrand|house fire|haus brennt)\b/;
  const life=/\b(ademt niet|ademt niet meer|kan niet ademen|stikt|bewusteloos|ernstige bloeding|hevig bloedt|not breathing|unconscious|cannot breathe|bewusstlos|atmet nicht)\b/;
  const injury=/\b(ongeval|ongeluk|aanrijding|accident|crash|unfall)\b.{0,100}\b(gewond|bekneld|slachtoffer|injured|trapped|verletzt)\b|\b(ernstig ongeval|ernstig ongeluk|serious accident)\b/;
  if(fire.test(text)||life.test(text)||injury.test(text))return 'acute';
  if(/\b(ongeval|ongeluk|aanrijding|accident|unfall)\b/.test(text))return 'accident';
  return null;
}
function fixditEmergencyCopy(kind,lang){
  const copy={
    nl:{title:'Acuut gevaar: bel 112',body:'Stop met Fixdit. Breng jezelf in veiligheid en bel 112. Geef door wat er gebeurt en waar hulp nodig is. Volg de aanwijzingen van de meldkamer.',uncertain:'Ongeval: is er direct gevaar of iemand gewond?',uncertainBody:'Bel 112 bij acuut gevaar of als iemand dringend medische hulp nodig heeft. Is er alleen materiële schade zonder direct gevaar, dan is 112 niet bedoeld voor deze situatie. Fixdit geeft geen medische beoordeling.',call:'Bel 112',close:'Sluiten'},
    en:{title:'Immediate danger: call 112',body:'Stop using Fixdit. Get to safety and call 112. Explain what is happening and where help is needed. Follow the emergency operator’s instructions.',uncertain:'Accident: is anyone injured or in immediate danger?',uncertainBody:'Call 112 for immediate danger or urgent medical help. Property damage alone without immediate danger is not a 112 emergency. Fixdit does not assess medical conditions.',call:'Call 112',close:'Close'},
    de:{title:'Akute Gefahr: 112 anrufen',body:'Beende Fixdit. Bringe dich in Sicherheit und rufe 112 an. Sage, was passiert ist und wo Hilfe benötigt wird. Folge den Anweisungen der Leitstelle.',uncertain:'Unfall: Ist jemand verletzt oder in akuter Gefahr?',uncertainBody:'Rufe bei akuter Gefahr oder dringend notwendiger medizinischer Hilfe 112 an. Reiner Sachschaden ohne akute Gefahr ist kein 112-Notfall. Fixdit beurteilt keine medizinischen Zustände.',call:'112 anrufen',close:'Schließen'}
  };
  const c=copy[lang]||copy.nl;
  return {...c,title:kind==='acute'?c.title:c.uncertain,body:kind==='acute'?c.body:c.uncertainBody};
}

function show(kind){
 const lang=(document.documentElement.lang||'nl').slice(0,2),c=fixditEmergencyCopy(kind,lang);
 let dialog=document.getElementById('fixditEmergency');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='fixditEmergency';dialog.setAttribute('aria-labelledby','fixditEmergencyTitle');document.body.append(dialog);}
 dialog.replaceChildren();dialog.style.cssText='box-sizing:border-box;width:min(540px,calc(100% - 28px));max-height:90dvh;overflow:auto;border:3px solid #a51e22;border-radius:20px;padding:24px;background:white;color:#171717;text-align:center;';
 const title=document.createElement('h2');title.id='fixditEmergencyTitle';title.textContent=c.title;
 const body=document.createElement('p');body.textContent=c.body;body.style.lineHeight='1.6';
 const call=document.createElement('a');call.href='tel:112';call.textContent=c.call;call.style.cssText='display:block;padding:16px;background:#a51e22;color:white;border-radius:12px;font-size:22px;font-weight:bold;text-decoration:none;margin:20px 0;';
 const close=document.createElement('button');close.type='button';close.textContent=c.close;close.onclick=()=>dialog.close();
 dialog.append(title,body,call,close);if(!dialog.open)dialog.showModal();call.focus();
}
document.addEventListener('click',event=>{
 if(!(event.target instanceof Element)||!event.target.closest('#analyzeBtn'))return;
 const kind=fixditEmergencyKind(document.getElementById('problem')?.value);
 if(!kind)return;
 event.preventDefault();event.stopImmediatePropagation();show(kind);
},true);
})();
