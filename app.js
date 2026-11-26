(function(){
'use strict';
/* 다른 사이트 안에 끼워 넣어 열리는 것을 막는다(화면 가로채기 방지) */
if(window.top!==window.self){try{window.top.location=window.self.location;}catch(e){document.documentElement.innerHTML='';}}
/* ───────── 설정 (공개돼도 되는 값만) ───────── */
var CFG={
  clientId:'128021235107-iqp148qakah5hcjb77k4qf9pkrc9vos6.apps.googleusercontent.com',
  sheetId:'1iqHHHy18JIorj1IhW-1ByCuijYUCYet8MZIkpLLk4y0',
  scope:'openid email https://www.googleapis.com/auth/spreadsheets.readonly',
  driveScope:'https://www.googleapis.com/auth/drive.metadata.readonly',
  domain:'linkagelab.co.kr',
  hd:'linkagelab.co.kr',
  adminTab:'위키_관리자',
  cacheMaxDays:14,
  keepKey:'ufoWikiKeep',
  tabRe:/^회의록_(\d{4})$/,
  catTab:'카테고리종합',
  pastMaxAgeDays:7,
  signedKey:'ufoWikiSignedIn'
};
var COLS={meeting:'회의',worker:'작업자',date:'논의일',admin:'어드민',name:'데이터명',issue:'이슈유형',q:'질문',concl:'내용',
  cat1:'관심사 카테고리',cat2:'업종 카테고리',inq:'문의',kakao:'카카오 운영관리자 확인',src:'원본 위치',check:'확인 필요',prev:'이전 기록'};
var API='https://sheets.googleapis.com/v4/spreadsheets/';
var $=function(id){return document.getElementById(id);};
var TODAY=(function(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());})();
var THISYEAR=+TODAY.slice(0,4);
var ME=null;

/* ───────── 공통 도우미 ───────── */
function pad(n){return String(n).padStart(2,'0');}
function ymd(x){return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate());}
function wd(d){return '일월화수목금토'[new Date(d+'T00:00:00').getDay()];}
function addMonths(d,m){var x=new Date(d+'T00:00:00');x.setMonth(x.getMonth()+m);return ymd(x);}
function monthEnd(y,m){return ymd(new Date(y,m,0));}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function norm(s){return String(s||'').toLowerCase().replace(/\s+/g,'');}
var CHO='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function cho(s){var o='';for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);o+=(c>=0xAC00&&c<=0xD7A3)?CHO[Math.floor((c-0xAC00)/588)]:s[i];}return o;}
function isCho(t){return /^[ㄱ-ㅎ]+$/.test(t);}
function rel(t){if(!t)return '';var s=(Date.now()-t)/1000;if(s<60)return '방금';if(s<3600)return Math.floor(s/60)+'분 전';if(s<86400)return Math.floor(s/3600)+'시간 전';return Math.floor(s/86400)+'일 전';}
function cmpNew(a,b){if(a.date!==b.date)return a.date<b.date?1:-1;if(a.tab!==b.tab)return a.tab<b.tab?1:-1;return a.row-b.row;}
function terms(){return S.q.trim().split(/\s+/).filter(Boolean);}
function linkify(h){return h.replace(/(https?:\/\/[^\s<>"')\]]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');}
function hl(s,link){
  var h=esc(s);if(link)h=linkify(h);
  var ts=terms().filter(function(t){return !isCho(t);});if(!ts.length)return h;
  var re=new RegExp('('+ts.map(function(t){return esc(t).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('|')+')','gi');
  return h.split(/(<[^>]+>)/).map(function(p,i){return i%2?p:p.replace(re,'<mark>$1</mark>');}).join('');
}

/* ───────── 저장소(IndexedDB): 지난 해 탭은 한 번만 받아 보관 ───────── */
function idb(){return new Promise(function(res,rej){try{var r=indexedDB.open('ufo-wiki',1);r.onupgradeneeded=function(){r.result.createObjectStore('kv');};r.onsuccess=function(){res(r.result);};r.onerror=function(){rej(r.error);};}catch(e){rej(e);}});}
function kvGet(k){return idb().then(function(db){return new Promise(function(res){var q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=function(){res(q.result||null);};q.onerror=function(){res(null);};});}).catch(function(){return null;});}
function kvSet(k,v){return idb().then(function(db){return new Promise(function(res){var t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=function(){res(true);};t.onerror=function(){res(false);};});}).catch(function(){return false;});}
function kvClear(){return idb().then(function(db){return new Promise(function(res){var t=db.transaction('kv','readwrite');t.objectStore('kv').clear();t.oncomplete=function(){res();};t.onerror=function(){res();};});}).catch(function(){});}

/* ───────── 시트 값 → 기록으로 바꾸기 ───────── */
function tokensOf(s){
  var out=[],seen={};
  String(s||'').split(/[\n,+;]+/).forEach(function(p){
    p=p.trim();var m=/^([IPN]\d{2}\d*)(?:-.*)?$/.exec(p);if(!m||seen[p])return;seen[p]=1;
    var parts=p.split('-'),code=m[1];
    out.push({raw:p,code:code,top:code.slice(0,3),dim:code[0]==='I'?'관심사':code[0]==='P'?'업종':'기타',name:parts[1]||'',label:parts.slice(1).join(' › ')||code});
  });
  return out;
}
function parseDate(s,year){
  s=String(s||'').trim();var m=/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/.exec(s);
  if(m)return m[1]+'-'+pad(+m[2])+'-'+pad(+m[3]);
  m=/^(\d{1,2})\s*[\/.]\s*(\d{1,2})$/.exec(s);if(m)return year+'-'+pad(+m[1])+'-'+pad(+m[2]);
  return '';
}
function adminKey(s){
  var m;if((m=/profiles\/(\d+)/.exec(s)))return 'p'+m[1];if((m=/app_num=(\d+)/.exec(s)))return 'a'+m[1];if((m=/pf\.kakao\.com\/(_\w+)/.exec(s)))return 'k'+m[1];return '';
}
function parseTab(t){
  var year=+CFG.tabRe.exec(t.title)[1],v=t.values||[],hdr=(v[0]||[]).map(function(x){return String(x||'').trim();}),ix={},warn=[];
  Object.keys(COLS).forEach(function(k){ix[k]=hdr.indexOf(COLS[k]);});
  ['date','name','concl'].forEach(function(k){if(ix[k]<0)warn.push(COLS[k]);});
  var rows=[];
  for(var i=1;i<v.length;i++){
    var r=v[i]||[];
    var g=function(k){var j=ix[k];return (j>=0&&r[j]!=null)?String(r[j]).replace(/\r/g,''):'';};
    var marker=String(r[0]||'').trim();
    if(marker==='예시')continue;
    var name=g('name').trim(),concl=g('concl'),q=g('q');
    if(!name&&!concl.trim()&&!q.trim())continue;
    var adminRaw=g('admin'),um=/https?:\/\/[^\s]+/.exec(adminRaw);
    var o={id:t.title+':'+(i+1),tab:t.title,year:year,row:i+1,sheetId:t.sheetId,marker:marker,
      meeting:g('meeting').trim(),worker:g('worker').trim(),date:parseDate(g('date'),year),
      adminUrl:um?um[0].replace(/[.,;]+$/,''):'',name:name||'(이름 없음)',issue:g('issue').trim(),q:q,concl:concl,
      cat1:g('cat1'),cat2:g('cat2'),inq:g('inq').trim(),kakao:g('kakao'),src:g('src'),check:g('check'),prev:g('prev')};
    o.tokens=tokensOf(o.cat1).concat(tokensOf(o.cat2));
    o.gkey=adminKey(adminRaw)||('n:'+norm(name));
    o.hayName=norm(o.name);
    o.hay=norm([o.name,o.meeting,o.worker,o.issue,o.q,o.concl,o.cat1,o.cat2,o.inq,o.kakao,o.prev,o.tab,o.adminUrl].join(' '));
    rows.push(o);
  }
  return {rows:rows,warn:warn};
}
function parseCat(values){
  var tops={관심사:[],업종:[],기타:[]},names={},subs={};
  (values||[]).slice(1).forEach(function(r){
    [[3,4,'관심사'],[6,7,'업종']].forEach(function(c){var code=String(r[c[0]]||'').trim(),full=String(r[c[1]]||'').trim();if(/^[IPN]\d{2}$/.test(code)){tops[c[2]].push(code);names[code]=full.split('-').slice(1).join('-')||code;}});
    var n=String(r[9]||'').trim();if(/^N\d{2}/.test(n)){var cd=n.split('-')[0];tops['기타'].push(cd);names[cd]=n.split('-').slice(1).join('-')||cd;}
    tokensOf(r[0]).forEach(function(t){if(t.code!==t.top){(subs[t.top]=subs[t.top]||{})[t.code]=t.label;}});
  });
  return {tops:tops,names:names,subs:subs};
}

/* ───────── 데이터 모음 ───────── */
var DB={rows:[],groups:{},tops:{관심사:[],업종:[],기타:[]},topName:{},subs:{},tabs:[],meetings:[],issues:[],years:[THISYEAR],last:'',meta:null,warn:[],admins:[]};
function parseAdmins(values){
  var out=[];if(!values||!values.length)return out;
  var h=(values[0]||[]).map(function(x){return String(x||'').trim();}),ie=h.indexOf('이메일'),ir=h.indexOf('역할');if(ie<0)return out;
  values.slice(1).forEach(function(r){var e=String(r[ie]||'').trim().toLowerCase();if(!e)return;var role=ir>=0?String(r[ir]||'').trim():'';out.push({email:e,role:role,admin:/관리자|admin/i.test(role)});});
  return out;
}
function ingest(tabs,catValues,meta,adminValues){
  var rows=[],warn=[];
  tabs.forEach(function(t){var p=parseTab(t);rows=rows.concat(p.rows);if(p.warn.length)warn.push(t.title+' 탭에서 찾지 못한 열: '+p.warn.join(', '));});
  rows.sort(cmpNew);
  var groups={};rows.forEach(function(r){(groups[r.gkey]=groups[r.gkey]||[]).push(r);});
  Object.keys(groups).forEach(function(k){groups[k].sort(cmpNew);});
  var cat=parseCat(catValues),tops={관심사:cat.tops.관심사.slice(),업종:cat.tops.업종.slice(),기타:cat.tops.기타.slice()},names=Object.assign({},cat.names),subs={};
  Object.keys(cat.subs).forEach(function(t){subs[t]=Object.assign({},cat.subs[t]);});
  rows.forEach(function(r){r.tokens.forEach(function(t){
    if(tops[t.dim].indexOf(t.top)<0)tops[t.dim].push(t.top);
    if(!names[t.top]&&t.code===t.top)names[t.top]=t.name||t.top;
    if(!names[t.top]&&t.name)names[t.top]=t.name;
    if(t.code!==t.top){(subs[t.top]=subs[t.top]||{})[t.code]=t.label;}
  });});
  var ys=rows.map(function(r){return r.date?+r.date.slice(0,4):0;}).filter(Boolean);
  var mn=ys.length?Math.min.apply(null,ys):THISYEAR,mx=Math.max(THISYEAR,ys.length?Math.max.apply(null,ys):THISYEAR);
  var dates=rows.map(function(r){return r.date;}).filter(function(d){return d&&d<=TODAY;}).sort();
  var uniq=function(f){var o={};rows.forEach(function(r){if(r[f])o[r[f]]=1;});return Object.keys(o).sort();};
  DB={rows:rows,groups:groups,tops:tops,topName:names,subs:subs,tabs:Array.from(new Set(rows.map(function(r){return r.tab;}))).sort().reverse(),
      meetings:uniq('meeting'),issues:uniq('issue'),years:[mn,mx],last:dates.length?dates[dates.length-1]:'',meta:meta||null,warn:warn,admins:parseAdmins(adminValues)};
  fillSelects();
}

/* ───────── 거르기 ───────── */
var FOLD=false;try{FOLD=localStorage.getItem('ufoWikiFold')==='1';}catch(e){}
function setFold(v){FOLD=v;try{localStorage.setItem('ufoWikiFold',v?'1':'0');}catch(e){}render();}
var S={q:'',scope:'all',view:'find',dim:'관심사',cfind:'',cat:null,preset:'all',from:'',to:'',year:THISYEAR,tab:'',meet:'',issue:'',sort:'new',sel:null,selRow:null,open:false,side:false,group:true,limit:80};
function inCat(r,c){if(!c)return true;if(c.top==='미기재')return r.tokens.length===0;return r.tokens.some(function(t){return t.top===c.top&&(!c.sub||t.code===c.sub);});}
function inQ(r){
  var ts=terms();if(!ts.length)return true;var h=S.scope==='name'?r.hayName:r.hay,ch=null;
  return ts.every(function(t){
    if(isCho(t)){ch=ch||(S.scope==='name'?(r._chn=r._chn||norm(cho(r.name))):(r._cha=r._cha||norm(cho(r.name+' '+r.concl+' '+r.q))));return ch.indexOf(t)>=0;}
    return h.indexOf(norm(t))>=0;});
}
function inP(r){return (!S.from||(r.date&&r.date>=S.from))&&(!S.to||(r.date&&r.date<=S.to));}
function inF(r){return (!S.tab||r.tab===S.tab)&&(!S.meet||r.meeting===S.meet)&&(!S.issue||r.issue===S.issue);}
function pass(r,skip){return inQ(r)&&inF(r)&&(skip==='cat'||inCat(r,S.cat))&&(skip==='period'||inP(r));}
function matched(){
  var a=DB.rows.filter(function(r){return pass(r);});
  if(S.sort==='old')a.sort(function(x,y){return cmpNew(y,x);});
  else if(S.sort==='name')a.sort(function(x,y){return x.name.localeCompare(y.name,'ko')||cmpNew(x,y);});
  return a;
}
function setPreset(p){
  S.preset=p;var y=THISYEAR;
  var map={all:['',''],last:[DB.last,DB.last],month:[TODAY.slice(0,8)+'01',TODAY],'3m':[addMonths(TODAY,-3),TODAY],year:[y+'-01-01',TODAY],prev:[(y-1)+'-01-01',(y-1)+'-12-31']};
  S.from=map[p][0];S.to=map[p][1];
  if(p==='prev')S.year=y-1;else if(p!=='all')S.year=y;
}
function periodLabel(){
  if(!S.from&&!S.to)return '';
  var n={last:'지난 회의 '+(DB.last?DB.last.slice(5).replace('-','/')+'('+wd(DB.last)+')':''),month:'이번 달','3m':'최근 3개월',year:'올해',prev:'작년'};
  if(n[S.preset])return n[S.preset];
  if(/^m-/.test(S.preset))return S.preset.slice(2,6)+'년 '+(+S.preset.slice(7))+'월';
  return (S.from||'처음')+' ~ '+(S.to||'끝');
}
function catLabel(t){return t.label;}
function topName(top){return top==='미기재'?'분류 미기재':(DB.topName[top]||top);}
function diffOf(n,o){
  var c=[],f=function(a,b,l){var A=a.tokens.map(function(t){return t.raw;}).join(' / '),B=b.tokens.map(function(t){return t.raw;}).join(' / ');return A!==B?l:null;};
  var a1=n.tokens.filter(function(t){return t.dim==='관심사';}).map(function(t){return t.label;}).join(', ')||'미기재',b1=o.tokens.filter(function(t){return t.dim==='관심사';}).map(function(t){return t.label;}).join(', ')||'미기재';
  var a2=n.tokens.filter(function(t){return t.dim!=='관심사';}).map(function(t){return t.label;}).join(', ')||'미기재',b2=o.tokens.filter(function(t){return t.dim!=='관심사';}).map(function(t){return t.label;}).join(', ')||'미기재';
  if(a1!==b1)c.push('관심사: '+b1+' → '+a1);if(a2!==b2)c.push('업종: '+b2+' → '+a2);return c;
}
function changed(rs){for(var i=1;i<rs.length;i++){if(diffOf(rs[i-1],rs[i]).length)return true;}return false;}

/* ───────── 그리기 ───────── */
function fillSelects(){
  var opt=function(id,first,list){var cur=$(id).value;$(id).innerHTML='<option value="">'+first+'</option>'+list.map(function(x){return '<option>'+esc(x)+'</option>';}).join('');$(id).value=list.indexOf(cur)>=0?cur:'';};
  opt('w-ftab','모든 연도 탭',DB.tabs);opt('w-fmeet','모든 회의',DB.meetings);opt('w-fissue','모든 이슈',DB.issues);
}
function renderHero(){
  var b=$('w-recent');if(!DB.last){b.hidden=true;return;}
  var day=DB.rows.filter(function(r){return r.date===DB.last;});
  b.hidden=false;
  b.innerHTML='<span class="e">지난 회의</span><span class="t">'+(+DB.last.slice(5,7))+'월 '+(+DB.last.slice(8))+'일 ('+wd(DB.last)+')</span><span class="s">논의 '+day.length+'건 · '+esc(Array.from(new Set(day.map(function(r){return r.meeting;}).filter(Boolean))).join(', '))+'</span><span class="g">이 회의만 모아 보기 →</span>';
}
function renderTabs(){Array.prototype.forEach.call(document.querySelectorAll('.w-tab'),function(b){b.setAttribute('aria-selected',b.dataset.v===S.view);});}
function renderSide(){
  Array.prototype.forEach.call(document.querySelectorAll('#w-dim button'),function(b){b.setAttribute('aria-pressed',b.dataset.d===S.dim);});
  var base=DB.rows.filter(function(r){return pass(r,'cat');}),f=norm(S.cfind),h='';
  var tops=DB.tops[S.dim].slice();
  var allCnt=S.dim==='기타'?base.filter(function(r){return r.tokens.some(function(t){return t.dim==='기타';})||r.tokens.length===0;}).length:base.filter(function(r){return r.tokens.some(function(t){return t.dim===S.dim;});}).length;
  h+='<li><button type="button" class="w-node" data-top="" aria-pressed="'+(!S.cat)+'"><span class="tw"></span>전체 '+S.dim+'<span class="k">'+allCnt+'</span></button></li>';
  if(S.dim==='기타'){
    var nn=base.filter(function(r){return r.tokens.length===0;}).length;
    h+='<li><button type="button" class="w-node'+(nn?'':' zero')+'" data-top="미기재" aria-pressed="'+(!!(S.cat&&S.cat.top==='미기재'))+'"><span class="tw"></span>분류 미기재<span class="k">'+nn+'</span></button></li>';
  }
  tops.forEach(function(top){
    var label=topName(top),subs=DB.subs[top]?Object.keys(DB.subs[top]).sort():[];
    if(f&&norm(label+top).indexOf(f)<0&&!subs.some(function(s){return norm(s+DB.subs[top][s]).indexOf(f)>=0;}))return;
    var c={dim:S.dim,top:top},n=base.filter(function(r){return inCat(r,c);}).length,on=S.cat&&S.cat.top===top;
    h+='<li><button type="button" class="w-node'+(n?'':' zero')+'" data-top="'+top+'" aria-pressed="'+(!!(on&&!S.cat.sub))+'"><span class="tw">'+(subs.length?(on||f?'▾':'▸'):'')+'</span>'+esc(label)+' <span class="k" style="margin-left:0">'+top+'</span><span class="k">'+n+'</span></button></li>';
    if(subs.length&&(on||f)){
      subs.forEach(function(s){
        var sc={dim:S.dim,top:top,sub:s},sn=base.filter(function(r){return inCat(r,sc);}).length;
        if(f&&!on&&norm(s+DB.subs[top][s]).indexOf(f)<0)return;
        h+='<li><button type="button" class="w-node sub'+(sn?'':' zero')+'" data-top="'+top+'" data-sub="'+esc(s)+'" aria-pressed="'+(!!(S.cat&&S.cat.sub===s))+'">'+esc(DB.subs[top][s].split(' › ').slice(1).join(' › ')||DB.subs[top][s])+'<span class="k">'+sn+'</span></button></li>';
      });
    }
  });
  $('w-tree').innerHTML=h;$('w-side').classList.toggle('open',S.side);$('w-bodywrap').classList.toggle('fold',FOLD);$('w-sunfold').classList.toggle('on',!!S.cat);$('w-sunfold').setAttribute('aria-expanded',String(!FOLD));$('w-sfold').setAttribute('aria-expanded',String(!FOLD));
}
function renderPeriod(){
  Array.prototype.forEach.call(document.querySelectorAll('#w-period .w-chip'),function(b){b.setAttribute('aria-pressed',b.dataset.p===S.preset);});
  $('w-from').value=S.from;$('w-to').value=S.to;$('w-year').textContent=S.year+'년';
  var base=DB.rows.filter(function(r){return pass(r,'period')&&r.date&&r.date.slice(0,4)===String(S.year);});
  var cnt=[0,0,0,0,0,0,0,0,0,0,0,0];base.forEach(function(r){cnt[+r.date.slice(5,7)-1]++;});
  var max=Math.max(1,Math.max.apply(null,cnt)),h='';
  for(var m=1;m<=12;m++){
    var key='m-'+S.year+'-'+pad(m),future=(S.year+'-'+pad(m))>TODAY.slice(0,7);
    h+='<button type="button" class="w-mb" data-m="'+m+'" aria-pressed="'+(S.preset===key)+'"'+(future?' disabled':'')+' aria-label="'+S.year+'년 '+m+'월 '+cnt[m-1]+'건"><span class="n">'+(cnt[m-1]||'')+'</span><i style="height:'+(cnt[m-1]?Math.round(6+cnt[m-1]/max*34):2)+'px"></i>'+m+'월</button>';
  }
  $('w-bars').innerHTML=h;$('w-ynext').disabled=S.year>=DB.years[1];$('w-yprev').disabled=S.year<=DB.years[0];
}
function renderApplied(){
  var a=[];
  if(S.q.trim())a.push(['q',(S.scope==='name'?'데이터명: ':'검색: ')+S.q.trim()]);
  var pl=periodLabel();if(pl)a.push(['period','기간: '+pl]);
  if(S.cat)a.push(['cat',S.cat.dim+': '+(S.cat.sub?(DB.subs[S.cat.top]&&DB.subs[S.cat.top][S.cat.sub]||S.cat.sub):topName(S.cat.top))]);
  if(S.tab)a.push(['tab',S.tab+' 탭']);if(S.meet)a.push(['meet',S.meet]);if(S.issue)a.push(['issue','이슈 '+S.issue]);
  $('w-applied').innerHTML=a.length?'<span class="lab">적용된 조건</span>'+a.map(function(x){return '<span class="w-ap">'+esc(x[1])+'<button type="button" data-x="'+x[0]+'" aria-label="'+esc(x[1])+' 조건 빼기">×</button></span>';}).join('')+'<button type="button" class="w-clear" data-x="all">모두 지우기</button>':'<span class="lab">조건 없이 전체 기록을 보고 있어요.</span>';
}
function tagsHtml(r){
  var h='';
  if(r.check.trim())h+='<span class="w-tag chk">확인 필요</span>';
  if(r.issue)h+='<span class="w-tag ex">'+esc(r.issue)+'</span>';
  var k=r.tokens.filter(function(t){return t.dim==='관심사';}),u=r.tokens.filter(function(t){return t.dim!=='관심사';});
  h+=k.length?k.slice(0,3).map(function(t){return '<span class="w-tag">'+esc(catLabel(t))+'</span>';}).join(''):'<span class="w-tag none">관심사 미기재</span>';
  h+=u.length?u.slice(0,3).map(function(t){return '<span class="w-tag">'+esc(catLabel(t))+'</span>';}).join(''):'<span class="w-tag none">업종 미기재</span>';
  return h;
}
function badges(r){
  if(!S.group||S.view!=='find')return '';
  var all=DB.groups[r.gkey],b='';
  if(all.length>1)b+='<span class="w-badge">논의 '+all.length+'회</span>';
  if(changed(all))b+='<span class="w-badge chg">결론 바뀜</span>';
  if(all.some(function(x){return x.prev.trim();}))b+='<span class="w-badge">고친 기록 있음</span>';
  if(all[0].id!==r.id)b+='<span class="w-badge old">더 최근 논의 있음</span>';
  return b;
}
function dateTxt(r){return r.date?(r.date+'('+wd(r.date)+')'):'날짜 없음';}
function card(r){
  var cur=S.sel&&(S.group&&S.view==='find'?S.sel===r.gkey:S.selRow===r.id);
  return '<li><button type="button" class="w-card" data-id="'+esc(r.id)+'" aria-current="'+(!!cur)+'">'+
    '<span class="w-meta">'+esc(r.meeting||'회의 미기재')+' · '+dateTxt(r)+' · '+esc(r.tab)+' · '+r.row+'행'+(r.worker?' · '+esc(r.worker):'')+'</span>'+
    '<span class="w-title">'+hl(r.name)+badges(r)+'</span>'+
    '<span class="w-snip"><b>질문</b>'+hl(r.q.slice(0,300))+'  <b>결론</b>'+hl(r.concl.slice(0,300))+'</span>'+
    '<span class="w-tags">'+tagsHtml(r)+'</span></button></li>';
}
function emptyMsg(){return '<div class="w-empty">조건에 맞는 기록이 없어요.<br>위 「적용된 조건」에서 하나씩 빼 보거나, 검색 범위를 「모든 칸」으로 바꿔 보세요.</div>';}
function moreBtn(n,total){return n<total?'<div style="text-align:center;margin-top:10px"><button type="button" class="w-btn w-more" id="w-more">더 보기 ('+n+' / '+total+')</button></div>':'';}
var BYID={};
function renderMain(list){
  var h='';
  if(S.view==='find'){
    $('w-ltitle').textContent='함께 살펴본 기록';
    var seen={},shown=[];
    (S.group?list.filter(function(r){if(seen[r.gkey])return false;seen[r.gkey]=1;return true;}):list).forEach(function(r){shown.push(r);});
    var part=shown.slice(0,S.limit);
    h=shown.length?'<ul class="w-cards">'+part.map(card).join('')+'</ul>'+moreBtn(part.length,shown.length):emptyMsg();
    S._shown=shown.length;
  }else if(S.view==='meeting'){
    $('w-ltitle').textContent='회의별 보기';
    if(!list.length)h=emptyMsg();
    else{
      var g={},order=[],lim=S.limit,n=0;
      list.some(function(r){var d=r.date||'날짜 없음';if(!g[d]){if(n>=lim)return true;g[d]=[];order.push(d);}g[d].push(r);n++;return false;});
      order.sort(function(a,b){return S.sort==='old'?a.localeCompare(b):b.localeCompare(a);});
      h=order.map(function(d){var rs=g[d];return '<div class="w-day"><b>'+d+(d!=='날짜 없음'?' ('+wd(d)+')':'')+'</b><span>'+rs.length+'건 · '+esc(Array.from(new Set(rs.map(function(r){return r.meeting;}).filter(Boolean))).join(', '))+'</span></div><ul class="w-cards">'+rs.map(card).join('')+'</ul>';}).join('')+moreBtn(n,list.length);
    }
    S._shown=list.length;
  }else{
    $('w-ltitle').textContent='카테고리 사전';
    var items=[];['관심사','업종','기타'].forEach(function(dim){DB.tops[dim].forEach(function(top){items.push({dim:dim,top:top,n:DB.rows.filter(function(r){return inCat(r,{dim:dim,top:top});}).length});});});
    h='<p class="w-meta" style="margin:0 0 6px">「카테고리종합」 탭의 분류 목록이에요. 기록이 0건인 분류도 보여요. 누르면 그 분류로 기록을 찾아요.</p><div class="w-dict">'+
      items.map(function(it){return '<button type="button" data-dim="'+it.dim+'" data-top="'+it.top+'"><span>'+esc(topName(it.top))+'</span><small>'+it.dim+' · '+it.top+' · 기록 '+it.n+'건</small></button>';}).join('')+'</div>';
  }
  $('w-main').innerHTML=h;
  var hideP=S.view==='dict';$('w-period').hidden=hideP;$('w-filters').hidden=hideP;$('w-applied').hidden=hideP;
}
function entHtml(r,i,selOpen){
  var tags='<div class="w-tags" style="margin:0">'+tagsHtml(r)+'</div>';
  var body='<div class="more">'+(r.q.trim()?'<div><div class="lab">질문</div><div class="c">'+hl(r.q,true)+'</div></div>':'')+
    (r.concl.trim()?'<div><div class="lab">결론 · 내용</div><div class="c">'+hl(r.concl,true)+'</div></div>':'')+tags+
    (r.inq?'<div class="h">문의: '+esc(r.inq)+'</div>':'')+(r.kakao.trim()?'<div><div class="lab">카카오 운영관리자 확인</div><div class="c">'+hl(r.kakao,true)+'</div></div>':'')+'</div>';
  var head='<span class="h"><b>'+(i===0?'현재 결론':'이전 결론')+'</b> · '+dateTxt(r)+' · '+esc(r.meeting||'회의 미기재')+(r.worker?' · '+esc(r.worker):'')+'</span>';
  var first='<span class="c">'+hl((r.concl.trim()||r.q.trim()).slice(0,i===0?400:90)+((r.concl.trim()||r.q.trim()).length>(i===0?400:90)?' …':''))+'</span>';
  return {head:head,first:first,body:body};
}
function closeDetail(){S.open=false;S.sel=null;S.selRow=null;try{history.replaceState(null,'',location.pathname+location.search);}catch(x){}render();}
function renderDetail(){
  var det=$('w-detail'),box=$('w-dinner');var all=S.sel&&DB.groups[S.sel];
  det.classList.toggle('open',!!(all&&S.open));$('w-bodywrap').classList.toggle('sel',!!(all&&S.open));
  if(!all){
    box.innerHTML='<div class="w-help"><b>이렇게 찾아보세요</b><p>키워드는 띄어쓰기로 나눠 입력할 수 있어요. 입력한 단어가 모두 담긴 기록을 찾아요.</p><p>초성(ㅁㅋ)으로도 찾을 수 있어요.</p><p>기간 버튼이나 월별 막대를 누르면 그 기간만 보여요. 분류·회의와 함께 걸 수 있어요.</p></div><div class="w-help"><b>카드를 누르면</b><p>이 자리에 현재 결론과, 같은 데이터를 논의한 이전 기록이 히스토리로 나와요.</p></div>';
    box.style.cssText='position:static;max-height:none;background:none;border:0;padding:0;overflow:visible';return;
  }
  box.style.cssText='';
  var cur=all[0],rows=[];
  all.forEach(function(r){rows.push({r:r,prev:false});if(r.prev.trim())rows.push({r:r,prev:true});});
  var tl='<ol class="w-tl">'+all.map(function(r,i){
    var c=i<all.length-1?diffOf(r,all[i+1]):[],e=entHtml(r,i),sel=S.selRow===r.id;
    var chg=c.length?'<span class="w-chg">'+c.map(function(t){return '<span>'+esc(t)+'</span>';}).join('')+'</span>':'';
    var main=i===0?'<li class="now'+(sel?' sel':'')+'"><div class="w-ent">'+e.head+'<span class="c">'+hl(r.concl.trim()||'(내용 없음)',true)+'</span>'+chg+'</div></li>':
      '<li class="'+(sel?'sel':'')+'"><div class="w-ent"><details'+(sel?' open':'')+'><summary>'+e.head+e.first+'</summary>'+e.body+chg+'</details></div></li>';
    var pv=r.prev.trim()?'<li class="prv"><div class="w-ent"><details><summary><span class="h"><b>이전 판</b> · '+dateTxt(r)+' 같은 행을 고치기 전</span><span class="c">'+hl(r.prev.replace(/^\[[^\]]*\]\s*/,'').slice(0,90))+(r.prev.length>90?' …':'')+'</span></summary><div class="more"><div class="c">'+hl(r.prev,true)+'</div></div></details></div></li>':'';
    return main+pv;}).join('')+'</ol>';
  var sheetUrl='https://docs.google.com/spreadsheets/d/'+CFG.sheetId+'/edit#gid='+cur.sheetId+'&range=A'+cur.row;
  box.innerHTML='<div class="w-dhead"><div><div class="w-meta">'+esc(cur.meeting||'회의 미기재')+' · '+dateTxt(cur)+(cur.worker?' · '+esc(cur.worker):'')+'</div><h3>'+hl(cur.name)+'</h3></div><button type="button" class="w-btn" id="w-dclose" title="상세 닫기 (Esc)">닫기 ✕</button></div>'+
    '<div class="w-dact">'+(cur.adminUrl?'<a class="w-btn" href="'+esc(cur.adminUrl)+'" target="_blank" rel="noopener noreferrer" style="text-decoration:none">어드민 열기 ↗</a>':'')+'<button type="button" class="w-btn" data-act="copy">링크 복사</button>'+(cur.sheetId!=null?'<a class="w-btn" href="'+esc(sheetUrl)+'" target="_blank" rel="noopener noreferrer" style="text-decoration:none">시트 '+cur.row+'행 ↗</a>':'')+'</div>'+
    (cur.issue?'<div class="w-dsec"><span>이슈</span><p>'+esc(cur.issue)+'</p></div>':'')+
    (cur.q.trim()?'<div class="w-dsec"><span>질문</span><p>'+hl(cur.q,true)+'</p></div>':'')+
    '<div class="w-dsec"><span>분류</span><div class="w-tags" style="margin:0">'+tagsHtml(cur)+'</div></div>'+
    (cur.inq?'<div class="w-dsec"><span>문의</span><p>'+esc(cur.inq)+'</p></div>':'')+
    (cur.kakao.trim()?'<div class="w-dsec"><span>카카오 운영관리자 확인</span><p>'+hl(cur.kakao,true)+'</p></div>':'')+
    (cur.check.trim()?'<div class="w-dsec"><span>확인 필요</span><p>'+esc(cur.check)+'</p></div>':'')+
    '<div class="w-dsec"><span>결론 이력 ('+all.length+'회'+(changed(all)?' · 결론 바뀜':'')+')</span>'+tl+'</div>';
}
function render(){
  var list=matched();
  renderTabs();renderSide();renderPeriod();renderApplied();renderMain(list);renderDetail();
  $('w-count').textContent=(S.group&&S.view==='find'?'데이터 '+(S._shown||0)+'개 · ':'')+'논의 '+list.length+' / '+DB.rows.length+'건';
  $('w-foot').textContent=DB.rows.length?('탭 '+DB.tabs.length+'개 · 기록 '+DB.rows.length+'건'):'';
}

/* ───────── 로그인 · 시트 읽기 ───────── */
var token=null,tokenExp=0,tc=null,waiters=[],cacheObj=null,busy=false;
function msg(html,err){var m=$('w-msg');if(!html){m.hidden=true;return;}m.hidden=false;m.className='w-msg'+(err?' err':'');m.innerHTML=html;}
function syncText(t){$('w-sync').textContent=t;}
function showLogin(on,title,text){
  $('w-login').hidden=!on;if(title)$('w-login-t').textContent=title;if(text)$('w-login-p').textContent=text;
}
function haveData(){return DB.rows.length>0;}
function setUi(){
  var has=haveData();$('w-bodywrap').hidden=!has;$('w-refresh').hidden=!has&&!token;$('w-all').hidden=!has;$('w-logout').hidden=!(has||token||localStorage.getItem(CFG.signedKey));
  $('w-refresh').disabled=busy;$('w-all').disabled=busy;
}
function describeSync(){
  var m=DB.meta;if(!m){syncText('');return;}
  var parts=Object.keys(m.tabs||{}).sort().reverse().map(function(t){var c=m.tabs[t];return t.replace('회의록_','')+' 탭 '+(Date.now()-c.fetchedAt<60000?'방금 받음':'보관본('+rel(c.fetchedAt)+')');});
  syncText((token?'● 로그인됨 · ':'○ 로그인 전 · 저장본 · ')+parts.join(' · '));
}
function initAuth(){
  if(tc)return true;if(!window.google||!google.accounts||!google.accounts.oauth2)return false;
  tc=google.accounts.oauth2.initTokenClient({client_id:CFG.clientId,scope:CFG.scope,hd:CFG.hd,callback:onTok,error_callback:onTokErr});return true;
}
function onTok(resp){
  var ws=waiters;waiters=[];
  if(!resp||resp.error){var e={code:'auth',msg:(resp&&resp.error)||'로그인이 취소됐어요.'};ws.forEach(function(w){w.rej(e);});return;}
  var t=resp.access_token,exp=Date.now()+(Math.max(60,+resp.expires_in||3600)-60)*1000;
  /* 로그인한 계정이 회사 계정이고 인증된 메일인지 확인한 뒤에만 받아들인다 */
  fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+t}}).then(function(r){
    if(!r.ok)throw {code:'auth',msg:'로그인한 계정을 확인하지 못했어요. 다시 시도해 주세요.'};
    return r.json();
  }).then(function(u){
    var em=String(u.email||'').toLowerCase(),suf='@'+CFG.domain;
    if(!u.email_verified||em.length<=suf.length||em.slice(-suf.length)!==suf){
      try{google.accounts.oauth2.revoke(t,function(){});}catch(e){}
      throw {code:'auth',msg:'링키지랩 회사 계정으로 로그인해 주세요. ('+(em||'알 수 없는 계정')+')'};
    }
    token=t;tokenExp=exp;ME={email:em,name:u.name||em.split('@')[0]};
    try{localStorage.setItem(CFG.signedKey,'1');}catch(e){}
    renderWho();
    ws.forEach(function(w){w.res(token);});
  }).catch(function(e){
    token=null;ME=null;renderWho();
    ws.forEach(function(w){w.rej(e&&e.code?e:{code:'auth',msg:'로그인한 계정을 확인하지 못했어요.'});});
  });
}
function onTokErr(err){
  var ws=waiters;waiters=[];var t=err&&err.type;
  var e={code:'auth',type:t,msg:t==='popup_failed_to_open'?'로그인 창이 막혔어요. 브라우저 주소창 오른쪽의 팝업 차단을 풀고 다시 눌러 주세요.':t==='popup_closed'?'로그인 창이 닫혔어요.':'로그인에 실패했어요.'};
  ws.forEach(function(w){w.rej(e);});
}
function getToken(){
  if(token&&Date.now()<tokenExp)return Promise.resolve(token);
  if(!initAuth())return Promise.reject({code:'gsi',msg:'구글 로그인 스크립트를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.'});
  return new Promise(function(res,rej){waiters.push({res:res,rej:rej});if(waiters.length===1)tc.requestAccessToken({});});
}
function api(url,retry){
  return getToken().then(function(t){return fetch(url,{headers:{Authorization:'Bearer '+t}});}).then(function(r){
    if(r.status===401&&!retry){token=null;return api(url,true);}
    if(!r.ok)return r.json().catch(function(){return {};}).then(function(j){throw {code:r.status,msg:(j.error&&j.error.message)||''};});
    return r.json();});
}
function errText(e){
  if(!e)return '알 수 없는 오류가 났어요.';
  if(e.code===403)return '<b>이 시트를 볼 권한이 없어요.</b> 회의록 시트를 공유받은 회사 계정으로 로그인했는지 확인하고, 아니라면 시트 소유자에게 공유를 요청해 주세요.'+(e.msg?' <span style="opacity:.7">('+esc(e.msg)+')</span>':'');
  if(e.code===404)return '<b>시트를 찾지 못했어요.</b> 시트 주소가 바뀌었는지 확인해 주세요.';
  if(e.code===429)return '<b>요청이 잠시 몰렸어요.</b> 1분쯤 뒤에 다시 눌러 주세요.';
  if(e.code==='auth'||e.code==='gsi')return '<b>'+esc(e.msg)+'</b>';
  return '<b>시트를 읽지 못했어요.</b> '+esc(e.msg||String(e.code||e.message||e));
}
function setBusy(b,text){busy=b;if(text)syncText(text);setUi();}
function keepOn(){try{return localStorage.getItem(CFG.keepKey)!=='0';}catch(e){return true;}}
function saveCache(){if(!keepOn())return kvClear();return kvSet('cache',cacheObj);}
function applyCache(){
  var tabs=Object.keys(cacheObj.tabs).sort().map(function(k){var c=cacheObj.tabs[k];return {title:k,sheetId:c.sheetId,values:c.values};});
  ingest(tabs,cacheObj.cat&&cacheObj.cat.values,{tabs:cacheObj.tabs},cacheObj.admin&&cacheObj.admin.values);
  if(!ME&&cacheObj.me)ME=cacheObj.me;
  var yrs=DB.years;if(S.year>yrs[1]||S.year<yrs[0])S.year=yrs[1];
  renderHero();render();setUi();describeSync();renderWho();
  if(DB.warn.length)msg('<b>시트 열 이름을 확인해 주세요.</b> '+esc(DB.warn.join(' / ')),true);
}
function yearOf(t){return +CFG.tabRe.exec(t)[1];}
function sync(opt){
  opt=opt||{};if(busy)return Promise.resolve();
  msg('');setBusy(true,'시트 확인 중…');
  var yt=[],hasCat=false,hasAdmin=false,metaTabs=null;
  return api(API+CFG.sheetId+'?fields=sheets.properties(sheetId,title)').then(function(meta){
    metaTabs=meta.sheets.map(function(s){return s.properties;});
    yt=metaTabs.filter(function(p){return CFG.tabRe.test(p.title);});
    hasCat=metaTabs.some(function(p){return p.title===CFG.catTab;});
    hasAdmin=metaTabs.some(function(p){return p.title===CFG.adminTab;});
    if(!yt.length)throw {code:'x',msg:'「회의록_연도」 이름의 탭을 찾지 못했어요.'};
    var maxY=Math.max.apply(null,yt.map(function(p){return yearOf(p.title);}));
    cacheObj=cacheObj||{tabs:{},cat:null};
    var need=yt.filter(function(p){var c=cacheObj.tabs[p.title],y=yearOf(p.title);
      return opt.force||!c||y>=THISYEAR||y===maxY||(Date.now()-c.fetchedAt)>CFG.pastMaxAgeDays*86400000||c.sheetId!==p.sheetId;});
    var ranges=need.map(function(p){return "'"+p.title+"'!A:V";});
    if(hasCat)ranges.push("'"+CFG.catTab+"'!A:J");
    if(hasAdmin)ranges.push("'"+CFG.adminTab+"'!A:C");
    syncText((need.length?need.map(function(p){return p.title.replace('회의록_','');}).join('·')+' 탭 받는 중…':'새로 받을 탭이 없어요'));
    if(!ranges.length)return {need:need,vr:[]};
    var url=API+CFG.sheetId+'/values:batchGet?'+ranges.map(function(r){return 'ranges='+encodeURIComponent(r);}).join('&')+'&valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS';
    return api(url).then(function(j){return {need:need,vr:j.valueRanges||[]};});
  }).then(function(res){
    var now=Date.now();
    res.need.forEach(function(p,i){cacheObj.tabs[p.title]={sheetId:p.sheetId,values:(res.vr[i]&&res.vr[i].values)||[],fetchedAt:now};});
    var k=res.need.length;
    if(hasCat){cacheObj.cat={values:(res.vr[k]&&res.vr[k].values)||[],fetchedAt:now};k++;}
    if(hasAdmin){cacheObj.admin={values:(res.vr[k]&&res.vr[k].values)||[],fetchedAt:now};}else{cacheObj.admin=null;}
    cacheObj.me=ME;
    Object.keys(cacheObj.tabs).forEach(function(t){if(!yt.some(function(p){return p.title===t;}))delete cacheObj.tabs[t];});
    cacheObj.savedAt=now;
    return saveCache();
  }).then(function(){showLogin(false);applyCache();}).catch(function(e){
    if(e&&e.code==='auth'&&haveData()){msg(opt.auto?'저장해 둔 내용을 보여 주고 있어요. 위쪽 <b>「새로 받기」</b>를 누르면 로그인해서 최신 내용으로 바꿔요.':'저장해 둔 내용을 보여 주고 있어요. <b>'+esc(e.msg)+'</b>',false);}
    else{msg(errText(e),true);}
    if(!haveData())showLogin(true,'로그인이 필요해요','아래 버튼을 눌러 회사 구글 계정으로 로그인해 주세요.');
    describeSync();
  }).then(function(){setBusy(false);describeSync();});
}
function logout(){
  try{if(token&&window.google&&google.accounts&&google.accounts.oauth2)google.accounts.oauth2.revoke(token,function(){});}catch(e){}
  try{if(dtoken&&window.google&&google.accounts&&google.accounts.oauth2)google.accounts.oauth2.revoke(dtoken,function(){});}catch(e){}
  token=null;tokenExp=0;dtoken=null;dexp=0;ME=null;cacheObj=null;try{localStorage.removeItem(CFG.signedKey);}catch(e){}
  kvClear().then(function(){
    DB={rows:[],groups:{},tops:{관심사:[],업종:[],기타:[]},topName:{},subs:{},tabs:[],meetings:[],issues:[],years:[THISYEAR],last:'',meta:null,warn:[],admins:[]};
    S.sel=null;S.open=false;$('w-admin').hidden=true;msg('');renderHero();render();syncText('');setUi();renderWho();
    showLogin(true,'로그아웃했어요','이 브라우저에 저장해 둔 회의록도 지웠어요. 다시 보려면 로그인해 주세요.');
  });
}

/* ───────── 관리자: 누가 접속할 수 있는지 보기(읽기 전용) ───────── */
var dtc=null,dtoken=null,dexp=0,dwait=null;
function isAdmin(){return !!(ME&&DB.admins.some(function(a){return a.admin&&a.email===ME.email;}));}
function renderWho(){
  var w=$('w-who'),b=$('w-admin-btn');
  if(!ME){w.textContent='';b.hidden=true;return;}
  w.innerHTML=esc(ME.name)+' <span class="w-role'+(isAdmin()?' adm':'')+'">'+(isAdmin()?'관리자':'일반')+'</span>';
  b.hidden=!isAdmin();
}
function getDriveToken(){
  if(dtoken&&Date.now()<dexp)return Promise.resolve(dtoken);
  if(!window.google||!google.accounts||!google.accounts.oauth2)return Promise.reject({msg:'구글 로그인 스크립트를 불러오지 못했어요.'});
  if(!dtc)dtc=google.accounts.oauth2.initTokenClient({client_id:CFG.clientId,scope:CFG.driveScope,hd:CFG.hd,
    callback:function(r){var w=dwait;dwait=null;if(!w)return;if(!r||r.error){w.rej({msg:(r&&r.error)||'권한 요청이 취소됐어요.'});return;}dtoken=r.access_token;dexp=Date.now()+(Math.max(60,+r.expires_in||3600)-60)*1000;w.res(dtoken);},
    error_callback:function(e){var w=dwait;dwait=null;if(w)w.rej({msg:e&&e.type==='popup_failed_to_open'?'로그인 창이 막혔어요. 팝업 차단을 풀고 다시 눌러 주세요.':'권한 요청 창이 닫혔어요.'});}});
  return new Promise(function(res,rej){dwait={res:res,rej:rej};dtc.requestAccessToken({});});
}
var ROLE={owner:'소유자',organizer:'관리자',fileOrganizer:'관리자',writer:'편집자',commenter:'댓글',reader:'뷰어'},PTYPE={user:'사용자',group:'그룹',domain:'회사 전체',anyone:'링크 공개'};
function renderAccess(list){
  var order={owner:0,organizer:1,fileOrganizer:1,writer:2,commenter:3,reader:4};
  list=list.slice().sort(function(a,b){return (order[a.role]!=null?order[a.role]:9)-(order[b.role]!=null?order[b.role]:9);});
  var any=list.filter(function(p){return p.type==='anyone';}).length,dom=list.filter(function(p){return p.type==='domain';}).length;
  var cnt={};list.forEach(function(p){cnt[p.role]=(cnt[p.role]||0)+1;});
  var h='';
  if(any)h+='<div class="w-msg err"><b>링크가 있는 모든 사람이 열 수 있는 상태예요.</b> 위키 보안이 사라져요. 시트의 「공유」에서 일반 액세스를 「제한됨」으로 바꿔 주세요.</div>';
  if(dom)h+='<div class="w-msg"><b>회사 전체('+esc(CFG.domain)+')에 공유돼 있어요.</b> UFO팀만 보게 하려면 일반 액세스를 「제한됨」으로 바꿔 주세요.</div>';
  if(!any&&!dom)h+='<div class="w-msg" style="background:var(--wsoft)"><b>일반 액세스가 「제한됨」이에요.</b> 아래 사람만 위키를 볼 수 있어요.</div>';
  h+='<div class="w-meta">총 '+list.length+'명 · '+Object.keys(cnt).map(function(r){return (ROLE[r]||r)+' '+cnt[r];}).join(' · ')+'</div>';
  h+='<div class="w-atbl"><table><thead><tr><th>이름</th><th>이메일</th><th>시트 권한</th><th>구분</th><th>위키 역할</th></tr></thead><tbody>'+
    list.map(function(p){
      var em=(p.emailAddress||'').toLowerCase(),a=DB.admins.filter(function(x){return x.email===em;})[0];
      return '<tr><td>'+esc(p.displayName||(p.type==='domain'?p.domain:'(표시 안 됨)'))+'</td><td>'+esc(p.emailAddress||'—')+'</td><td>'+esc(ROLE[p.role]||p.role)+'</td><td>'+esc(PTYPE[p.type]||p.type)+'</td><td>'+(a?(a.admin?'관리자':esc(a.role||'등록됨')):'—')+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  h+='<p class="w-meta" style="margin:0">사람을 넣거나 빼는 일은 시트의 「공유」 창에서 합니다. 이 화면은 보기만 가능해요. 「표시 안 됨」은 이름과 이메일이 가려진 계정이에요.</p>';
  $('w-admin-body').innerHTML=h;
}
function loadAccess(){
  $('w-admin').hidden=false;$('w-admin-body').innerHTML='<p class="w-meta">시트 공유 목록을 불러오는 중…</p>';
  return getDriveToken().then(function(t){
    return fetch('https://www.googleapis.com/drive/v3/files/'+CFG.sheetId+'/permissions?fields='+encodeURIComponent('permissions(id,type,role,emailAddress,displayName,domain)')+'&supportsAllDrives=true&pageSize=100',{headers:{Authorization:'Bearer '+t}});
  }).then(function(r){
    if(!r.ok)return r.json().catch(function(){return {};}).then(function(j){throw {code:r.status,msg:(j.error&&j.error.message)||''};});
    return r.json();
  }).then(function(j){renderAccess(j.permissions||[]);}).catch(function(e){
    var m=e&&e.code===403?'<b>목록을 불러오지 못했어요.</b> 시트의 소유자나 편집자 계정만 볼 수 있어요. 구글 클라우드에서 「Google Drive API」를 켜지 않았다면 먼저 켜 주세요.':'<b>목록을 불러오지 못했어요.</b>';
    $('w-admin-body').innerHTML='<div class="w-msg err">'+m+(e&&e.msg?' <span style="opacity:.7">('+esc(e.msg)+')</span>':'')+'</div>';
  });
}

/* ───────── 이벤트 ───────── */
function hashSel(){var m=/^#d=(.+)$/.exec(location.hash);if(m){var k=decodeURIComponent(m[1]);if(DB.groups[k]){S.sel=k;S.selRow=null;S.open=true;}}}
$('w-form').addEventListener('submit',function(e){e.preventDefault();S.q=$('w-q').value;S.limit=80;if(S.view==='dict')S.view='find';render();});
$('w-q').addEventListener('input',function(e){S.q=e.target.value;S.limit=80;if(S.view==='dict')S.view='find';render();});
$('w-scope').addEventListener('change',function(e){S.scope=e.target.value;S.limit=80;render();});
$('w-recent').addEventListener('click',function(){setPreset('last');S.view='meeting';S.limit=80;render();});
document.querySelector('.w-tabs').addEventListener('click',function(e){var b=e.target.closest('.w-tab');if(!b)return;S.view=b.dataset.v;S.limit=80;render();});
$('w-dim').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;S.dim=b.dataset.d;render();});
$('w-cfind').addEventListener('input',function(e){S.cfind=e.target.value;renderSide();});
$('w-creset').addEventListener('click',function(){S.cat=null;S.cfind='';$('w-cfind').value='';render();});
$('w-tree').addEventListener('click',function(e){
  var b=e.target.closest('.w-node');if(!b)return;var t=b.dataset.top,s=b.dataset.sub;
  if(!t)S.cat=null;else if(s)S.cat=(S.cat&&S.cat.sub===s)?{dim:S.dim,top:t}:{dim:S.dim,top:t,sub:s};
  else S.cat=(S.cat&&S.cat.top===t&&!S.cat.sub)?null:{dim:S.dim,top:t};
  if(S.view==='dict')S.view='find';S.limit=80;render();
});
$('w-period').addEventListener('click',function(e){
  var c=e.target.closest('.w-chip');if(c){setPreset(c.dataset.p);S.limit=80;render();return;}
  var m=e.target.closest('.w-mb');if(m&&!m.disabled){var mm=+m.dataset.m,key='m-'+S.year+'-'+pad(mm);
    if(S.preset===key)setPreset('all');else{S.preset=key;S.from=S.year+'-'+pad(mm)+'-01';S.to=monthEnd(S.year,mm);}S.limit=80;render();}
});
$('w-from').addEventListener('change',function(e){S.from=e.target.value;S.preset='custom';render();});
$('w-to').addEventListener('change',function(e){S.to=e.target.value;S.preset='custom';render();});
$('w-yprev').addEventListener('click',function(){S.year--;renderPeriod();});
$('w-ynext').addEventListener('click',function(){S.year++;renderPeriod();});
[['w-ftab','tab'],['w-fmeet','meet'],['w-fissue','issue'],['w-fsort','sort']].forEach(function(p){$(p[0]).addEventListener('change',function(e){S[p[1]]=e.target.value;S.limit=80;render();});});
$('w-fgroup').addEventListener('change',function(e){S.group=e.target.checked;render();});
$('w-applied').addEventListener('click',function(e){
  var b=e.target.closest('[data-x]');if(!b)return;var x=b.dataset.x;
  function clr(k){if(k==='q'){S.q='';$('w-q').value='';}else if(k==='period')setPreset('all');else if(k==='cat')S.cat=null;else{S[k]='';var id={tab:'w-ftab',meet:'w-fmeet',issue:'w-fissue'}[k];if(id)$(id).value='';}}
  if(x==='all')['q','period','cat','tab','meet','issue'].forEach(clr);else clr(x);S.limit=80;render();
});
$('w-main').addEventListener('click',function(e){
  if(e.target.id==='w-more'){S.limit+=80;render();return;}
  var c=e.target.closest('.w-card');
  if(c){var id=c.dataset.id,r=DB.rows.filter(function(x){return x.id===id;})[0];if(r){S.sel=r.gkey;S.selRow=r.id;S.open=true;S.side=false;try{history.replaceState(null,'','#d='+encodeURIComponent(r.gkey));}catch(x){}render();}return;}
  var d=e.target.closest('.w-dict button');if(d){S.dim=d.dataset.dim;S.cat={dim:d.dataset.dim,top:d.dataset.top};S.view='find';S.limit=80;render();}
});
$('w-detail').addEventListener('click',function(e){
  if(e.target.id==='w-dclose'){closeDetail();return;}
  var a=e.target.closest('[data-act="copy"]');
  if(a){var url=location.origin+location.pathname+'#d='+encodeURIComponent(S.sel),old=a.textContent;
    var done=function(t){a.textContent=t;setTimeout(function(){a.textContent=old;},1500);};
    try{navigator.clipboard.writeText(url).then(function(){done('복사됨');},function(){done('주소창의 주소를 복사하세요');});}catch(x){done('주소창의 주소를 복사하세요');}}
});
$('w-sopen').addEventListener('click',function(){S.side=true;S.open=false;render();});
$('w-sclose').addEventListener('click',function(){S.side=false;render();});
$('w-sfold').addEventListener('click',function(){setFold(true);$('w-sunfold').focus();});
$('w-sunfold').addEventListener('click',function(){setFold(false);$('w-sfold').focus();});
$('w-refresh').addEventListener('click',function(){sync({});});
$('w-all').addEventListener('click',function(){sync({force:true});});
$('w-logout').addEventListener('click',logout);
$('w-loginbtn').addEventListener('click',function(){msg('');sync({});});
$('w-admin-btn').addEventListener('click',function(){loadAccess();});
$('w-admin-close').addEventListener('click',function(){$('w-admin').hidden=true;});
$('w-keep').addEventListener('change',function(e){try{localStorage.setItem(CFG.keepKey,e.target.checked?'1':'0');}catch(x){}if(!e.target.checked)kvClear();});
window.addEventListener('hashchange',function(){hashSel();render();});
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&(S.open||S.side)){if(S.open)closeDetail();else{S.side=false;render();}}
  if(e.key==='/'&&!/INPUT|SELECT|TEXTAREA/.test((document.activeElement||{}).tagName||'')){e.preventDefault();$('w-q').focus();}
});

/* ───────── 시작 ───────── */
function start(){
  fillSelects();renderHero();render();setUi();renderWho();
  var keep=keepOn(),expired=false;$('w-keep').checked=keep;
  kvGet('cache').then(function(c){
    if(!c)return null;
    var has=c.tabs&&Object.keys(c.tabs).length;
    var fresh=has&&c.savedAt&&(Date.now()-c.savedAt)<=CFG.cacheMaxDays*86400000;
    if(!has||!fresh||!keep){expired=!!has&&!fresh;return kvClear().then(function(){return null;});}
    return c;
  }).then(function(c){
    if(c){
      cacheObj=c;applyCache();hashSel();render();
      var signed=false;try{signed=!!localStorage.getItem(CFG.signedKey);}catch(e){}
      if(signed){syncText('저장본을 보여 주고 있어요 · 로그인 확인 중…');sync({auto:true});}
    }else{
      showLogin(true,expired?'저장본 보관 기간이 지났어요':'',expired?'보안을 위해 '+CFG.cacheMaxDays+'일이 지난 저장본은 지웠어요. 다시 로그인해 주세요.':'');
    }
    setUi();
  });
}
var gs=document.createElement('script');gs.src='https://accounts.google.com/gsi/client';gs.async=true;gs.defer=true;
gs.onerror=function(){msg('<b>구글 로그인 스크립트를 불러오지 못했어요.</b> 인터넷 연결이나 사내 보안 설정을 확인해 주세요.',true);};
document.head.appendChild(gs);
start();
})();
