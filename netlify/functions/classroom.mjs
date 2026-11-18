import { getStore } from '@netlify/blobs';

// One shared Netlify Blobs store; records survive redeploys.
const ROOM=/^[a-f0-9]{32}$/;
const KINDS=new Set(['pisa','quick','match','reflection']);
const PISA=[0,1,2,0,1];
const MATCH=['В','Ә','Г','А','Б'];
const QUICK=[[1,1,1],[1,1,1],[2,1,2],[2,1,2],[4,5,2],[1,5,3,4],[2,3,2,2],[2,1,2]];
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
function cleanName(raw){
 if(typeof raw!=='string')return '';
 const v=raw.normalize('NFC').trim().replace(/\s+/g,' ').replace(/[\\/\u0000-\u001f\u007f]/g,'');
 return v.length>=2 && v.length<=95?v:'';
}
function normalized(v){return v.toLocaleLowerCase('kk-KZ')}
function scorePayload(kind,payload){
 if(kind==='reflection'){
  const r={};
  for(const key of ['interesting','valuable','difficult']){
   if(typeof payload[key]!=='string'||payload[key].length>500)return null;
   r[key]=payload[key].trim();
  }
  if(!Object.values(r).some(Boolean))return null;
  return r;
 }
 if(!Array.isArray(payload.answers))return null;
 const answers=payload.answers;
 let score;
 if(kind==='pisa'){
  if(answers.length!==PISA.length || answers.some(v=>!Number.isInteger(v)||v<0||v>2))return null;
  score=Number((answers.filter((v,i)=>v===PISA[i]).length*.6).toFixed(1));
 }else if(kind==='match'){
  if(answers.length!==MATCH.length||answers.some(v=>typeof v!=='string'||v.length!==1))return null;
  score=Number((answers.filter((v,i)=>v===MATCH[i]).length*.6).toFixed(1));
 }else if(kind==='quick'){
  if(answers.length!==QUICK.length)return null;
  let hits=0;
  for(let i=0;i<QUICK.length;i++){
   const nums=answers[i];
   if(!Array.isArray(nums)||nums.length!==QUICK[i].length||nums.some(x=>!Number.isInteger(x)||x<1||x>20))return null;
   if(nums.every((n,j)=>n===QUICK[i][j]))hits++;
  }
  score=hits*.5;
 }else return null;
 return {score};
}
export default async function handler(req){
 try{
  const url=new URL(req.url);
  const store=getStore({name:'chemistry8-2026-lesson-records',consistency:'strong'});
  if(req.method==='GET'){
   const room=url.searchParams.get('room')||'';
   if(!ROOM.test(room))return reply({ok:false,error:'Сынып идентификаторы жарамсыз'},400);
   const {blobs}=await store.list({prefix:room+'/'});
   // Supports a typical classroom; public feedback is intentionally visible to the class.
   const entries=await Promise.all((blobs||[]).slice(0,600).map(async ({key})=>{
    try{return await store.get(key,{type:'json',consistency:'strong'})}catch{return null}
   }));
   return reply({ok:true,records:entries.filter(Boolean),count:entries.filter(Boolean).length});
  }
  if(req.method==='POST'){
   let body;try{body=await req.json()}catch{return reply({ok:false,error:'JSON қатесі'},400)}
   const {room,kind,payload}=body||{};
   const name=cleanName(body?.name);
   if(!ROOM.test(room||'')||!name||!KINDS.has(kind)||!payload||typeof payload!=='object')return reply({ok:false,error:'Толтырылмаған немесе қате дерек'},400);
   const result=scorePayload(kind,payload);
   if(!result)return reply({ok:false,error:'Жауаптар форматы жарамсыз'},400);
   const key=`${room}/${kind}/${normalized(name)}`;
   const entry={name,kind,payload:result,updatedAt:Date.now()};
   await store.setJSON(key,entry);
   return reply({ok:true,score:result.score??null,savedAt:entry.updatedAt});
  }
  return reply({ok:false,error:'Рұқсат етілмеген әдіс'},405);
 }catch(e){console.error('classroom',e);return reply({ok:false,error:'Онлайн сақтау уақытша қолжетімсіз'},500)}
}
