function clean(v){return String(v||'').trim()}
function routeFrom(p,c,safety){
 if(safety.route==='stop'||p.risk==='stop')return 'stop';
 if(safety.route==='professional'||p.risk==='hoog'||p.professionalRecommended||Number(p.difficulty)>=4)return 'professional';
 const guidedReady=p.guidedRepairReady===true;
 if(!guidedReady&&(c.needsDetail||p.needMoreInfo||p.confidence==='laag'||c.symptom==='unknown'))return 'more_info';
 if(p.risk==='middel'||Number(p.difficulty)===3)return 'caution';
 return 'self';
}
function youtube(d,g){
 if(!d||!['self','caution'].includes(d.route)||d.needMoreInfo===true||d.professionalRecommended===true||d.risk==='stop')return false;
 return !!clean(d.objectLabel)&&!!clean(d.solutionTitle);
}
function toolActionCompatible(tool,steps){
 const t=String(tool||'').toLowerCase(),s=(steps||[]).join(' ').toLowerCase();
 if(/\bschaar\b/.test(t))return /\b(knip\w*|snij\w*|cut\w*)\b/.test(s);
 if(/\bschroevendraaier\b/.test(t))return /(\w*schroef\w*|screw\w*|fastener|vastdraai\w*|losdraai\w*)/.test(s);
 return true;
}
const tests=[
 ['guided ready advances despite old needsDetail',routeFrom({guidedRepairReady:true,needMoreInfo:false,confidence:'middel',risk:'laag',difficulty:2,professionalRecommended:false},{needsDetail:true,symptom:'not_working'},{route:null})==='self'],
 ['guided question remains transient',routeFrom({guidedRepairReady:false,needMoreInfo:true,confidence:'middel',risk:'laag',difficulty:1,professionalRecommended:false},{needsDetail:true,symptom:'not_working'},{route:null})==='more_info'],
 ['hard stop wins',routeFrom({guidedRepairReady:true,needMoreInfo:false,confidence:'hoog',risk:'laag',difficulty:1},{needsDetail:false,symptom:'not_working'},{route:'stop'})==='stop'],
 ['youtube for concrete DIY',youtube({route:'self',needMoreInfo:false,professionalRecommended:false,risk:'laag',objectLabel:'koplamp',solutionTitle:'Rechter dimlicht vervangen'},{})===true],
 ['no youtube while asking question',youtube({route:'more_info',needMoreInfo:true,professionalRecommended:false,risk:'laag',objectLabel:'koplamp',solutionTitle:'Nog één detail'},{})===false],
 ['scissors rejected for tightening',toolActionCompatible('schaar',['Draai de deurhendel vast'])===false],
 ['scissors allowed for cutting',toolActionCompatible('schaar',['Knip de losse draad af'])===true],
 ['screwdriver allowed for screw step',toolActionCompatible('schroevendraaier',['Draai de bevestigingsschroef vast'])===true]
];
let failed=0;
for(const [name,ok] of tests){
 console.log(ok?'PASS':'FAIL',name);
 if(!ok)failed++;
}
process.exitCode=failed?1:0;