/* Bé vui học lớp 1 — giao diện (chạy trên GitHub Pages, gọi máy chủ Apps Script qua API).
 * Tác giả: Phạm Văn An · 0848.355.888 */
const APP_VERSION='2026.11.11-6'; // = ngày cập nhật; nhớ đổi CACHE trong sw.js cho trùng
const $=id=>document.getElementById(id);
let TOKEN='',ME=null,BANK={words:[],sentences:[]},STATS={stars:0,sessions:0,days:{},topics:{},recent:[]};
let SUB='toan',QZ=null,PSUB='toan';
const SET=Object.assign({auto:true,sound:true,rate:0.85,rateEn:0.8,enVoice:'',cloud:true},JSON.parse(ls('hl1_set')||'{}'));

/* ================= tiện ích ================= */
function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){return null}}
function esc(s){return String(s==null?'':s).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
function busy(v){$('loading').classList.toggle('hidden',!v)}
function toast(msg,err){const t=$('toast');t.textContent=msg;t.className='toast show'+(err?' error':'');clearTimeout(toast._t);toast._t=setTimeout(()=>t.className='toast',2800)}
/* Gọi máy chủ Apps Script (API JSON). POST dạng text/plain nên không phát sinh yêu cầu "preflight" CORS. */
async function callApi(fn,args,token){let res;
  try{res=await fetch(APP_URL,{method:'POST',body:JSON.stringify({fn,args,token:token||''})})}
  catch(e){throw new Error(navigator.onLine===false?'Đang mất mạng, có mạng lại thử nhé.':'Chưa kết nối được máy chủ, thử lại sau nhé.')}
  let j;try{j=await res.json()}catch(e){throw new Error('Máy chủ trả về dữ liệu lạ. Kiểm tra link Web App (APP_URL trong config.js) và quyền "Bất kỳ ai".')}
  if(!j.ok){const e=new Error(j.error||'Lỗi máy chủ');e.session=!!j.session;throw e}return j.data}
function gas(fn,...args){return callApi(fn,args,TOKEN).catch(err=>{
  if(err.session){forgetToken();showLogin('Phiên đăng nhập đã hết hạn, đăng nhập lại nhé.');err.message='Phiên đăng nhập đã hết hạn.'}
  throw err})}
function run(fn,...args){if(fn==='changePassword')return callApi(fn,args.slice(1),args[0]);return callApi(fn,args,'')}
const R=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
function shuf(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function plain(h){const d=document.createElement('div');d.innerHTML=h;return d.textContent.trim()}
function isoToVN(s){return s?s.split('-').reverse().join('/'):''}

/* ================= giọng đọc & âm thanh ================= */
let VOICE=null,VOICE_EN=null,EN_VOICES=[];
/* Giọng tiếng Anh: ưu tiên giọng chất lượng cao có sẵn trong máy (iPhone: Samantha/Ava/Karen…, Android/Chrome: Google…,
   Edge/Windows: … Online (Natural)). Bố mẹ có thể chọn giọng khác trong Cài đặt. */
const EN_GOOD=[/natural|neural|online/i,/premium|enhanced|nâng cao|cao cấp/i,/samantha|ava|allison|karen|serena|daniel|kate|moira|tessa|nicky|joelle|zoe/i,/google (us|uk) english/i,/google/i];
function enScore(v){let sc=0;EN_GOOD.forEach((re,k)=>{if(re.test(v.name))sc+=10-k});if(/^en[-_](US|GB)/i.test(v.lang))sc+=3;if(/^en[-_](AU|IE|ZA)/i.test(v.lang))sc+=1;
  if(/compact|eloquence|grandma|grandpa|bad news|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|fred|junior|ralph|rocko|shelley|flo|reed|sandy/i.test(v.name))sc-=20;if(v.localService===false&&!/natural|online|google/i.test(v.name))sc-=1;return sc}
function loadVoice(){if(!('speechSynthesis' in window))return;const vs=speechSynthesis.getVoices();
  EN_VOICES=vs.filter(v=>/^en/i.test(v.lang)).sort((a,b)=>enScore(b)-enScore(a));
  VOICE_EN=(SET.enVoice&&EN_VOICES.find(v=>v.name===SET.enVoice))||EN_VOICES[0]||null;
  VOICE=vs.find(v=>/^vi/i.test(v.lang)&&/female|nữ|linh|hoaimy|an/i.test(v.name))||vs.find(v=>/^vi/i.test(v.lang))||null}
if('speechSynthesis' in window){loadVoice();speechSynthesis.onvoiceschanged=loadVoice}
function sayify(s){return String(s).replace(/☐|\.\.\.+|…/g,' ô trống ').replace(/\+/g,' cộng ').replace(/[−–]/g,' trừ ').replace(/=/g,' bằng ').replace(/>/g,' lớn hơn ').replace(/</g,' bé hơn ').replace(/\?/g,' ').replace(/\s+/g,' ')}
/* Tiếng Anh: từ đứng một mình đọc kèm dấu chấm để ngữ điệu tự nhiên, bỏ phần dịch trong ngoặc. */
function enSay(t){t=String(t).replace(/\(.*?\)/g,'').replace(/[“”"]/g,'').trim();return /[.!?]$/.test(t)?t:t+'.'}
/* iPhone/iPad: (1) gọi cancel() ngay trước speak() làm Safari bỏ luôn câu mới; (2) lần đọc đầu phải nằm trong 1 lần chạm;
   (3) gán voice tiếng Việt lấy từ getVoices() đôi khi câm, chỉ đặt lang='vi-VN' là iOS tự dùng giọng Linh;
   (4) khi gạt công tắc IM LẶNG, iPhone tắt tiếng "âm thanh trang web" (giọng đọc, tiếng beep). Cách xử lý: chuyển phiên âm thanh
   sang loại "phát media" như video/nhạc, bằng navigator.audioSession (Safari 16.4+) và bằng cách phát một đoạn âm thanh lặng lặp lại. */
const IOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const IN_ZALO=/Zalo/i.test(navigator.userAgent);
let SPK_UNLOCKED=false,VOICE_EL=null,SPK_SEQ=0,TTS_ON=false;
/* Một thẻ <audio> duy nhất dùng cho giọng Google: được "mở khoá" ở lần chạm đầu (phát 0,3 giây lặng),
   sau đó phát được tự động. Âm thanh phát như nghe nhạc nên KHÔNG bị công tắc im lặng của iPhone tắt. */
function silentWavUrl(){const sr=8000,n=Math.round(sr*.3),b=new ArrayBuffer(44+n*2),d=new DataView(b);const w=(o,t)=>{for(let k=0;k<t.length;k++)d.setUint8(o+k,t.charCodeAt(k))};
  w(0,'RIFF');d.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,sr,true);d.setUint32(28,sr*2,true);
  d.setUint16(32,2,true);d.setUint16(34,16,true);w(36,'data');d.setUint32(40,n*2,true);return URL.createObjectURL(new Blob([b],{type:'audio/wav'}))}
function voiceEl(){if(!VOICE_EL){VOICE_EL=document.createElement('audio');VOICE_EL.setAttribute('playsinline','');VOICE_EL.preload='auto';document.body.appendChild(VOICE_EL)}return VOICE_EL}
function mediaMode(){try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch(e){}}
function stopAll(){try{if(VOICE_EL&&!VOICE_EL.paused)VOICE_EL.pause()}catch(e){}try{if('speechSynthesis' in window&&(speechSynthesis.speaking||speechSynthesis.pending))speechSynthesis.cancel()}catch(e){}}
function unlockSpeech(){mediaMode();if(SPK_UNLOCKED)return;SPK_UNLOCKED=true;
  try{const a=voiceEl();a.src=silentWavUrl();const pr=a.play();if(pr&&pr.catch)pr.catch(()=>{SPK_UNLOCKED=false})}catch(e){}
  try{if('speechSynthesis' in window){const u=new SpeechSynthesisUtterance(' ');u.lang='vi-VN';u.volume=0;speechSynthesis.speak(u)}}catch(e){}}
['touchend','click'].forEach(ev=>document.addEventListener(ev,unlockSpeech,{passive:true}));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll()});
/* Lấy MP3 từ máy chủ (lưu tạm trong máy 300 câu gần nhất) */
const TTS_MEM=new Map();
const ttsRate=lang=>lang==='en'?Math.min(1.1,(SET.rateEn||.8)+.1):Math.min(1.15,(SET.rate||.85)+.1);
const ttsText=(text,lang)=>lang==='en'?enSay(text):sayify(text).trim();
function ttsGet(text,lang){const t=ttsText(text,lang),r=ttsRate(lang),k=lang+'|'+r+'|'+t;if(TTS_MEM.has(k))return TTS_MEM.get(k);
  const pr=gas('tts',t,lang,r).then(x=>x.a);pr.catch(()=>TTS_MEM.delete(k));TTS_MEM.set(k,pr);if(TTS_MEM.size>300)TTS_MEM.delete(TTS_MEM.keys().next().value);return pr}
function prefetch(text,lang){if(TTS_ON&&SET.cloud!==false&&text)ttsGet(text,lang==='en'?'en':'vi').catch(()=>{})}
/* done: hàm gọi khi đọc xong (dùng để đọc nối câu tiếng Việt rồi từ tiếng Anh) */
function speak(text,btn,report,lang,noVoice,done){if(!text)return;const EN=lang==='en';mediaMode();
  if(TTS_ON&&SET.cloud!==false&&!noVoice){const seq=++SPK_SEQ;stopAll();btn&&btn.classList.add('on');
    const slow=setTimeout(()=>{if(seq===SPK_SEQ)report&&report('⏳ Đang tải giọng Google…')},400);
    ttsGet(text,EN?'en':'vi').then(a=>{clearTimeout(slow);if(seq!==SPK_SEQ)return;const el=voiceEl();
      el.onended=()=>{btn&&btn.classList.remove('on');report&&report('✅ Đã đọc xong bằng giọng Google (vẫn nghe được khi iPhone để im lặng; âm lượng theo nút bên hông máy).');if(seq===SPK_SEQ&&done)done()};
      el.onerror=()=>{btn&&btn.classList.remove('on');report&&report('⚠️ Không phát được file âm thanh, chuyển sang giọng của máy.');speakLocal(text,btn,report,lang,false,done)};
      el.src='data:audio/mpeg;base64,'+a;const pr=el.play();report&&report('▶️ Đang đọc bằng giọng Google…');
      if(pr&&pr.catch)pr.catch(err=>{if(seq!==SPK_SEQ)return;btn&&btn.classList.remove('on');report&&report('⚠️ Máy chặn tự phát ('+err.name+'). Chạm vào màn hình rồi bấm 🔊 lại.');speakLocal(text,btn,report,lang,false,done)})})
     .catch(e=>{clearTimeout(slow);if(seq!==SPK_SEQ)return;btn&&btn.classList.remove('on');report&&report('⚠️ Giọng Google lỗi: '+e.message.replace(/^TTS_OFF: /,'')+' — dùng giọng của máy.');if(/^TTS_OFF/.test(e.message))setTtsOn(false);speakLocal(text,btn,report,lang,false,done)});
    return}
  speakLocal(text,btn,report,lang,noVoice,done)}
/* Đáp án là chữ tiếng Anh (có chữ cái Latin, không có dấu tiếng Việt)? */
const VI_MARK=/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const isEnText=t=>/[a-z]/i.test(t)&&!VI_MARK.test(t);
function speakLocal(text,btn,report,lang,noVoice,done){const EN=lang==='en';
  if(!('speechSynthesis' in window)){report&&report('⚠️ Trình duyệt này không hỗ trợ đọc to.');return}
  if(!text)return;
  const ss=speechSynthesis;
  const go=()=>{try{
    const u=new SpeechSynthesisUtterance(EN?enSay(text):sayify(text));u.lang=EN?(VOICE_EN?VOICE_EN.lang:'en-US'):'vi-VN';
    if(EN){if(VOICE_EN&&!noVoice)u.voice=VOICE_EN}else if(!IOS&&VOICE)u.voice=VOICE;
    u.rate=EN?(SET.rateEn||0.8):SET.rate;u.pitch=EN?1.05:1;u.volume=1;let started=false;
    u.onstart=()=>{started=true;report&&report('▶️ Đang đọc bằng giọng của máy…'+(EN&&VOICE_EN?' ('+VOICE_EN.name+')':''))};
    let retried=false;
    u.onend=()=>{if(retried)return;btn&&btn.classList.remove('on');report&&report(started?'✅ Đã đọc xong bằng giọng của máy. Giọng này bị tắt khi iPhone để im lặng.':SPK_HINT());if(started&&done)setTimeout(done,IOS?200:60)};
    u.onerror=e=>{if(retried)return;btn&&btn.classList.remove('on');report&&report('⚠️ Lỗi giọng đọc: '+(e&&e.error||'không rõ')+'. '+SPK_HINT())};
    if(btn)btn.classList.add('on');ss.speak(u);if(ss.paused)ss.resume();
    if(EN&&IOS&&VOICE_EN&&!noVoice)setTimeout(()=>{if(!started){retried=true;try{ss.cancel()}catch(e){}speakLocal(text,btn,report,lang,true,done)}},1500);
    else if(report)setTimeout(()=>{if(!started)report(SPK_HINT())},2500);
  }catch(e){report&&report('⚠️ '+e.message)}};
  if(ss.speaking||ss.pending){ss.cancel();setTimeout(go,IOS?150:30)}else go();
}
function SPK_HINT(){return '⚠️ Máy chưa phát được tiếng.'+(IN_ZALO?' Bạn đang mở trong Zalo: bấm ⋯ (góc trên) › Mở bằng trình duyệt / Safari rồi thử lại.':'')+' Kiểm tra âm lượng, tắt chế độ im lặng, rồi bấm Nghe thử lần nữa.'}
let ACTX=null;
function beep(kind){
  if(!SET.sound)return;
  try{ACTX=ACTX||new (window.AudioContext||window.webkitAudioContext)();if(ACTX.state==='suspended')ACTX.resume();const t=ACTX.currentTime;
    const notes=kind==='ok'?[[660,0],[880,.12]]:kind==='win'?[[523,0],[659,.12],[784,.24],[1046,.36]]:[[220,0],[180,.15]];
    notes.forEach(([f,d])=>{const o=ACTX.createOscillator(),g=ACTX.createGain();o.type=kind==='bad'?'triangle':'sine';o.frequency.value=f;
      g.gain.setValueAtTime(.0001,t+d);g.gain.exponentialRampToValueAtTime(.25,t+d+.02);g.gain.exponentialRampToValueAtTime(.0001,t+d+.22);o.connect(g).connect(ACTX.destination);o.start(t+d);o.stop(t+d+.25)})}catch(e){}
}
function confetti(n){const em=['🎉','⭐','🌟','🎈','✨','💖'];for(let i=0;i<(n||24);i++){const s=document.createElement('div');s.className='confetti';s.textContent=pick(em);
  s.style.left=R(0,96)+'vw';s.style.animationDelay=(Math.random()*.6)+'s';document.body.appendChild(s);setTimeout(()=>s.remove(),3200)}}
function flyStar(fromEl){try{const r=fromEl.getBoundingClientRect(),to=$('qStars').getBoundingClientRect();const s=document.createElement('div');s.className='fly-star';s.textContent='⭐';
  s.style.left=(r.left+r.width/2-20)+'px';s.style.top=(r.top)+'px';document.body.appendChild(s);requestAnimationFrame(()=>{s.style.left=(to.left-10)+'px';s.style.top=(to.top-10)+'px';s.style.transform='scale(.5)'});setTimeout(()=>s.remove(),900)}catch(e){}}

/* ================= hình vẽ ================= */
const ITEMS=[['🍎','quả táo'],['🍌','quả chuối'],['🐟','con cá'],['⭐','ngôi sao'],['🌸','bông hoa'],['🚗','chiếc ô tô'],['🎈','quả bóng bay'],['🐤','chú gà con'],['🍓','quả dâu'],['⚽','quả bóng'],['🧸','con gấu bông'],['🦋','con bướm'],['🍪','cái bánh quy'],['🐞','con bọ rùa'],['🍊','quả cam'],['✏️','cái bút chì']];
const ANIMALS=[['🐱','con mèo'],['🐶','con chó'],['🐰','con thỏ'],['🐻','con gấu'],['🐸','con ếch'],['🐵','con khỉ'],['🐼','con gấu trúc'],['🐯','con hổ'],['🐔','con gà'],['🐷','con lợn']];
const THINGS=[['⚽','quả bóng'],['📦','cái hộp'],['🌳','cái cây'],['🪑','cái ghế'],['🏠','ngôi nhà'],['🚗','chiếc ô tô']];
function emo(e,n,crossLast){let h='<div class="emo">';for(let i=0;i<n;i+=5){h+='<span class="g5">';for(let j=i;j<Math.min(n,i+5);j++)h+=`<span class="${crossLast&&j>=n-crossLast?'x':''}">${e}</span>`;h+='</span>'}return h+'</div>'}
const COLORS=['#f87171','#fbbf24','#34d399','#60a5fa','#a78bfa','#f472b6','#fb923c'];
const SHAPES={vuong:'hình vuông',tron:'hình tròn',tamgiac:'hình tam giác',chunhat:'hình chữ nhật'};
function shp(type,color,s,rot){s=s||70;rot=rot||0;const inner=type==='tron'?'<circle cx="50" cy="50" r="40"/>':type==='vuong'?'<rect x="14" y="14" width="72" height="72" rx="3"/>':type==='chunhat'?'<rect x="4" y="27" width="92" height="46" rx="3"/>':'<polygon points="50,10 92,86 8,86"/>';
  return `<svg viewBox="0 0 100 100" width="${s}" height="${s}"><g fill="${color}" stroke="#334155" stroke-width="3" transform="rotate(${rot} 50 50)">${inner}</g></svg>`}
function solid(kind,s){const w=kind==='lp'?60:110,h=kind==='lp'?60:46,d=28,W=w+d+20,H=h+d+20;s=s||130;
  return `<svg viewBox="0 0 ${W} ${H}" width="${s*W/H>220?220:s*W/H}" height="${s*W/H>220?220*H/W:s}"><g stroke="#1e3a8a" stroke-width="2.5" stroke-linejoin="round">
  <polygon fill="#bfdbfe" points="10,${10+d} ${10+d},10 ${10+d+w},10 ${10+w},${10+d}"/><polygon fill="#3b82f6" points="${10+w},${10+d} ${10+w+d},10 ${10+w+d},${10+h} ${10+w},${10+d+h}"/>
  <rect fill="#60a5fa" x="10" y="${10+d}" width="${w}" height="${h}"/></g></svg>`}
function clock(h,s){s=s||170;let nums='';for(let i=1;i<=12;i++){const a=i*Math.PI/6;nums+=`<text x="${50+38*Math.sin(a)}" y="${50-38*Math.cos(a)+4}" font-size="10" text-anchor="middle" font-weight="900" fill="#1f2a44">${i}</text>`}
  const a=(h%12)*Math.PI/6;return `<svg viewBox="0 0 100 100" width="${s}" height="${s}"><circle cx="50" cy="50" r="47" fill="#fff" stroke="#f97316" stroke-width="4"/>${nums}
  <line x1="50" y1="50" x2="50" y2="15" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/><line x1="50" y1="50" x2="${50+22*Math.sin(a)}" y2="${50-22*Math.cos(a)}" stroke="#dc2626" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="50" r="3.5" fill="#1f2a44"/></svg>`}
function pencil(len,color){const L=len;return `<svg width="${L+24}" height="26" viewBox="0 0 ${L+24} 26"><rect x="0" y="4" width="${L}" height="18" rx="3" fill="${color}" stroke="#334155" stroke-width="2"/><polygon points="${L},4 ${L+22},13 ${L},22" fill="#fde68a" stroke="#334155" stroke-width="2"/><polygon points="${L+15},10.5 ${L+22},13 ${L+15},15.5" fill="#334155"/></svg>`}
function ruler(n,color){const u=24,x0=12,W=x0*2+12*u;let t='';for(let i=0;i<=12;i++){t+=`<line x1="${x0+i*u}" y1="44" x2="${x0+i*u}" y2="56" stroke="#334155" stroke-width="2"/><text x="${x0+i*u}" y="70" font-size="12" text-anchor="middle" font-weight="800">${i}</text>`;if(i<12)t+=`<line x1="${x0+i*u+u/2}" y1="44" x2="${x0+i*u+u/2}" y2="50" stroke="#334155" stroke-width="1.5"/>`}
  return `<svg viewBox="0 0 ${W} 76" width="${Math.min(W,340)}" style="max-width:100%"><rect x="${x0}" y="10" width="${n*u}" height="22" rx="4" fill="${color}" stroke="#334155" stroke-width="2"/><rect x="2" y="40" width="${W-4}" height="34" rx="4" fill="#fef3c7" stroke="#b45309" stroke-width="2"/>${t}<text x="${W-8}" y="54" font-size="10" text-anchor="end">cm</text></svg>`}
function tensUnits(n){const t=Math.floor(n/10),u=n%10;let h='<svg width="'+(t*22+u*20+30)+'" height="120" viewBox="0 0 '+(t*22+u*20+30)+' 120">';
  for(let i=0;i<t;i++)for(let j=0;j<10;j++)h+=`<rect x="${4+i*22}" y="${4+j*11}" width="16" height="10" fill="#60a5fa" stroke="#1e3a8a"/>`;
  for(let k=0;k<u;k++)h+=`<rect x="${24+t*22+k*20}" y="104" width="14" height="12" fill="#fb923c" stroke="#9a3412"/>`;return h+'</svg>'}

/* ================= số đọc thành chữ ================= */
const DG=['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'];
function numVN(n){if(n<10)return DG[n];if(n===100)return 'một trăm';const t=Math.floor(n/10),u=n%10;
  let s=t===1?'mười':DG[t]+' mươi';if(u===1&&t>1)s+=' mốt';else if(u===5)s+=' lăm';else if(u)s+=' '+DG[u];return s}

/* ================= dựng câu hỏi ================= */
function O(h,t){return {h:String(h),t:t==null?plain(String(h)):String(t)}}
function choice(text,vis,opts,correct,extra){extra=extra||{};opts=opts.map(o=>typeof o==='object'?o:O(o));const c=typeof correct==='object'?correct:O(correct);
  const seen={};opts=opts.filter(o=>seen[o.t]?false:(seen[o.t]=1));if(!opts.some(o=>o.t===c.t))opts.push(c);
  if(!extra.keep)opts=shuf(opts);return Object.assign({type:'choice',text,vis:vis||'',opts,ans:opts.findIndex(o=>o.t===c.t)},extra)}
function numOpts(ans,lo,hi,k){k=k||4;const s=new Set([ans]);for(const x of shuf([ans-1,ans+1,ans-2,ans+2,ans+10,ans-10])){if(s.size>=k)break;if(x>=lo&&x<=hi)s.add(x)}
  let g=0;while(s.size<k&&g++<200)s.add(R(lo,hi));return [...s]}
const NAMES=['An','Bình','Mai','Lan','Hà','Nam','Minh','Hoa','Tú','Linh'];
const OBJS=[['quả bóng','quả'],['cái kẹo','cái'],['bông hoa','bông'],['quyển vở','quyển'],['viên bi','viên'],['quả táo','quả'],['cái bút','cái'],['con tem','con']];

const G={
/* ---------- Toán ---------- */
m_dem10(lv){const n=lv===1?R(1,5):lv===2?R(3,8):R(5,10),[e,nm]=pick(ITEMS);
  return choice(`Có bao nhiêu ${nm}?`,emo(e,n),numOpts(n,0,10),n,{explain:`Đếm lần lượt 1, 2, … ${n}. Có ${n} ${nm}.`})},
m_sosanh10(lv){let a=R(0,10),b=Math.random()<.2?a:R(0,10);const s=a>b?'>':a<b?'<':'=';const [e]=pick(ITEMS);
  const vis=lv===1&&a<=8&&b<=8?`<div class="rowcmp"><div><em>${a}</em>${e.repeat(a)||'&nbsp;'}</div><div><em>${b}</em>${e.repeat(b)||'&nbsp;'}</div></div>`:'';
  return choice(`Chọn dấu thích hợp: ${a} ☐ ${b}`,vis,['>','<','='],s,{keep:true,cls:'three',say:`${a} so với ${b}. Chọn dấu lớn hơn, bé hơn hay bằng?`,explain:a===b?`${a} bằng ${b} nên chọn dấu =`:`${a} ${a>b?'lớn hơn':'bé hơn'} ${b} nên chọn dấu ${s}`})},
m_nhieuit(lv){const [e1,n1]=pick(ITEMS);let [e2,n2]=pick(ITEMS);if(e2===e1)[e2,n2]=ITEMS[(ITEMS.findIndex(x=>x[0]===e1)+3)%ITEMS.length];
  const a=R(2,lv===1?6:9);let b=Math.random()<.2?a:R(2,lv===1?6:9);const more=Math.random()<.5;
  const ans=a===b?'Bằng nhau':(more?(a>b?'Hàng trên':'Hàng dưới'):(a<b?'Hàng trên':'Hàng dưới'));
  return choice(more?'Hàng nào nhiều hơn?':'Hàng nào ít hơn?',`<div class="rowcmp"><div><em>Hàng trên</em>${e1.repeat(a)}</div><div><em>Hàng dưới</em>${e2.repeat(b)}</div></div>`,['Hàng trên','Hàng dưới','Bằng nhau'],ans,{keep:true,cls:'three',txt:true,explain:`Hàng trên có ${a}, hàng dưới có ${b}.`})},
m_tachso(lv){const t=lv===1?R(2,6):R(4,10),a=R(lv===1?1:0,t-(lv===1?1:0));
  const vis=lv<3?`<div class="dots">${'<i class="a"></i>'.repeat(a)}${'<i></i>'.repeat(t-a)}</div>`:`<div class="big">${t}</div>`;
  return choice(`${t} gồm ${a} và mấy?`,vis,numOpts(t-a,0,10),t-a,{explain:`${t} gồm ${a} và ${t-a}.`,blank:`${t} gồm ${a} và ....`})},
m_thutu10(lv){const k=R(0,3);
  if(k===0){const n=R(0,9);return choice(`Số liền sau của ${n} là số mấy?`,`<div class="seq"><span>${n}</span><span class="q">?</span></div>`,numOpts(n+1,0,10),n+1,{explain:`Đếm thêm 1: sau ${n} là ${n+1}.`,blank:`Số liền sau của ${n} là ....`})}
  if(k===1){const n=R(1,10);return choice(`Số liền trước của ${n} là số mấy?`,`<div class="seq"><span class="q">?</span><span>${n}</span></div>`,numOpts(n-1,0,10),n-1,{explain:`Bớt đi 1: trước ${n} là ${n-1}.`,blank:`Số liền trước của ${n} là ....`})}
  if(k===2){const xs=shuf([...Array(11).keys()]).slice(0,4),big=Math.random()<.5,ans=big?Math.max(...xs):Math.min(...xs);
    return choice(big?'Số nào lớn nhất?':'Số nào bé nhất?','',xs,ans,{keep:true,explain:`Trong các số ${xs.join(', ')} thì số ${big?'lớn nhất':'bé nhất'} là ${ans}.`})}
  const s=R(0,lv===3?5:6),down=lv===3&&Math.random()<.5,seq=[0,1,2,3,4].map(i=>down?10-s-i:s+i),hole=R(1,3);
  return choice('Số nào còn thiếu trong ô trống?',`<div class="seq">${seq.map((x,i)=>i===hole?'<span class="q">?</span>':`<span>${x}</span>`).join('')}</div>`,numOpts(seq[hole],0,10),seq[hole],{explain:`Dãy số ${down?'giảm':'tăng'} dần: ${seq.join(', ')}.`,blank:`${seq.map((x,i)=>i===hole?'....':x).join(', ')}`})},
m_hinhphang(lv){const types=Object.keys(SHAPES),tg=pick(types);
  if(Math.random()<.5){const opts=shuf(types).map(t=>O(shp(t,pick(COLORS),70,lv===3&&t!=='tron'?R(-30,30):0),SHAPES[t]));
    return choice(`Đâu là ${SHAPES[tg]}?`,'',opts,opts.find(o=>o.t===SHAPES[tg]),{explain:`Đáp án đúng là ${SHAPES[tg]}.`})}
  return choice('Đây là hình gì?',shp(tg,pick(COLORS),120,lv===3&&tg!=='tron'?R(-25,25):0),types.map(t=>SHAPES[t]),SHAPES[tg],{txt:true,explain:`Đây là ${SHAPES[tg]}.`})},
m_demhinh(lv){const types=Object.keys(SHAPES),tg=pick(types),cells=shuf([...Array(18).keys()]);let k=0,h='';const cnt={};
  types.forEach(t=>{cnt[t]=0;const want=R(1,lv===1?3:4);for(let i=0;i<want&&k<18;i++){const c=cells[k++];cnt[t]++;h+=shp(t,pick(COLORS),48).replace('<svg ',`<svg x="${(c%6)*52+2}" y="${Math.floor(c/6)*52+2}" `)}});
  const n=cnt[tg];return choice(`Có bao nhiêu ${SHAPES[tg]}?`,`<svg width="314" height="158" viewBox="0 0 314 158" style="max-width:100%">${h}</svg>`,numOpts(n,0,10),n,{explain:`Đếm các ${SHAPES[tg]}: có ${n} hình.`})},
m_cong10(lv){let a=R(lv===1?1:0,lv===1?5:9),b=R(lv===1?1:0,10-a);if(lv===1&&a+b>10)b=10-a;const c=a+b;
  let vis='';if(lv===1){const [e]=pick(ITEMS);vis=emo(e,a)+'<span class="plus">+</span>'+emo(e,b)}
  return choice(`${a} + ${b} = ?`,vis,numOpts(c,0,10),c,{explain:`${a} thêm ${b} được ${c}. Vậy ${a} + ${b} = ${c}.`,blank:`${a} + ${b} = ....`})},
m_tru10(lv){const a=R(lv===1?2:1,10),b=R(lv===1?1:0,a),c=a-b;let vis='';if(lv===1&&a<=10){const [e]=pick(ITEMS);vis=emo(e,a,b)}
  return choice(`${a} − ${b} = ?`,vis,numOpts(c,0,10),c,{explain:`${a} bớt ${b} còn ${c}. Vậy ${a} − ${b} = ${c}.`,blank:`${a} − ${b} = ....`})},
m_dienso10(lv){const k=R(0,lv===1?1:3);let a,b,c,txt,ans;
  if(k===0){a=R(0,9);b=R(0,10-a);c=a+b;txt=`${a} + ☐ = ${c}`;ans=b}else if(k===1){a=R(0,9);b=R(0,10-a);c=a+b;txt=`☐ + ${b} = ${c}`;ans=a}
  else if(k===2){a=R(1,10);b=R(0,a);c=a-b;txt=`${a} − ☐ = ${c}`;ans=b}else{a=R(1,10);b=R(0,a);c=a-b;txt=`☐ − ${b} = ${c}`;ans=a}
  return choice('Số nào điền vào ô trống?',`<div class="big">${txt}</div>`,numOpts(ans,0,10),ans,{printVis:'',say:`Số nào điền vào ô trống: ${txt}`,explain:`Thử lại: ${txt.replace('☐',ans)}.`,blank:txt.replace('☐','....')})},
m_sosanhpt(lv){const plus=Math.random()<.5;let a,b,v;if(plus){a=R(0,9);b=R(0,10-a);v=a+b}else{a=R(1,10);b=R(0,a);v=a-b}
  const n=Math.random()<.25?v:Math.max(0,Math.min(10,v+pick([-2,-1,1,2])));const ex=plus?`${a} + ${b}`:`${a} − ${b}`;const s=v>n?'>':v<n?'<':'=';
  return choice(`Chọn dấu thích hợp: ${ex} ☐ ${n}`,'',['>','<','='],s,{keep:true,cls:'three',explain:`${ex} = ${v}, mà ${v} ${s} ${n}.`})},
m_loivan10(lv){const nm=pick(NAMES),[o,cl]=pick(OBJS),plus=Math.random()<.5;let a,b,c,txt;
  if(plus){a=R(1,7);b=R(1,10-a);c=a+b;txt=`${nm} có ${a} ${o}, mẹ cho thêm ${b} ${cl}. Hỏi ${nm} có tất cả mấy ${o}?`}
  else{a=R(3,10);b=R(1,a-1);c=a-b;txt=`${nm} có ${a} ${o}, ${nm} cho bạn ${b} ${cl}. Hỏi ${nm} còn lại mấy ${o}?`}
  if(lv===3){const right=plus?`${a} + ${b} = ${c}`:`${a} − ${b} = ${c}`,wrong1=plus?`${a} − ${b} = ${a-b}`:`${a} + ${b} = ${a+b}`,wrong2=`${a} + ${a} = ${a+a}`;
    return choice(txt+' Chọn phép tính đúng.','',[right,wrong1,wrong2],right,{txt:true,cls:'one',explain:plus?'"Cho thêm" thì làm phép cộng.':'"Cho bạn" thì còn lại ít đi, làm phép trừ.'})}
  return choice(txt,'',numOpts(c,0,10),c,{explain:plus?`${a} + ${b} = ${c}`:`${a} − ${b} = ${c}`,blank:txt+' Trả lời: ....'})},
m_hinhkhoi(lv){if(Math.random()<.3){return choice('Đồ vật nào có dạng khối lập phương?','',[O('🎲','xúc xắc'),O('⚽','quả bóng'),O('🥫','hộp sữa hình trụ'),O('🍦','cây kem')],O('🎲','xúc xắc'),{explain:'Con xúc xắc có 6 mặt đều là hình vuông: đó là khối lập phương.'})}
  const k=pick(['lp','hcn']);return choice('Đây là khối gì?',solid(k),['Khối lập phương','Khối hộp chữ nhật','Hình vuông','Hình chữ nhật'],k==='lp'?'Khối lập phương':'Khối hộp chữ nhật',{txt:true,explain:k==='lp'?'Các mặt đều là hình vuông bằng nhau: khối lập phương.':'Khối dài, các mặt là hình chữ nhật: khối hộp chữ nhật.'})},
m_vitri(lv){const k=R(0,2),[a,an]=pick(ANIMALS),[t,tn]=pick(THINGS);
  if(k===0){const left=Math.random()<.5;return choice(`${an[0].toUpperCase()+an.slice(1)} ở bên trái hay bên phải ${tn}?`,`<div class="hstack">${left?a+t:t+a}</div>`,['Bên trái','Bên phải'],left?'Bên trái':'Bên phải',{keep:true,txt:true,explain:`Nhìn hình: ${an} ở bên ${left?'trái':'phải'} ${tn}.`})}
  if(k===1){const up=Math.random()<.5;return choice(`${an[0].toUpperCase()+an.slice(1)} ở trên hay ở dưới ${tn}?`,`<div class="vstack">${up?a+'<br>'+t:t+'<br>'+a}</div>`,['Ở trên','Ở dưới'],up?'Ở trên':'Ở dưới',{keep:true,txt:true,explain:`Nhìn hình: ${an} ở ${up?'trên':'dưới'} ${tn}.`})}
  const three=shuf(ANIMALS).slice(0,3);return choice('Con vật nào ở giữa?',`<div class="hstack">${three.map(x=>x[0]).join('')}</div>`,three.map(x=>O(x[0],x[1])),O(three[1][0],three[1][1]),{explain:`${three[1][1]} đứng giữa.`})},
m_so100doc(lv){const n=lv===1?R(1,9)*10:R(11,99);const rev=n%10?(n%10)*10+Math.floor(n/10):n+1;
  if(Math.random()<.5)return choice(`Số “${numVN(n)}” viết là:`,'',numOpts(n,10,99,3).concat(rev!==n?[rev]:[]),n,{say:`Số ${numVN(n)} viết là số nào?`,explain:`${numVN(n)} viết là ${n}.`});
  const opts=[n,rev,n+1>99?n-1:n+1,n+10>99?n-10:n+10].map(x=>numVN(x));return choice(`Số ${n} đọc là:`,'',opts,numVN(n),{txt:true,say:`Số này đọc là gì?`,explain:`${n} đọc là “${numVN(n)}”.`})},
m_chuc(lv){const n=R(11,99),t=Math.floor(n/10),u=n%10;
  if(Math.random()<.5){const f=(a,b)=>`${a} chục và ${b} đơn vị`;return choice(`Số ${n} gồm mấy chục và mấy đơn vị?`,lv===1?tensUnits(n):'',[f(t,u),f(u,t),f(t+1>9?t-1:t+1,u),f(t,u+1>9?u-1:u+1)],f(t,u),{txt:true,cls:'one',explain:`${n} gồm ${t} chục và ${u} đơn vị.`,blank:`${n} gồm .... chục và .... đơn vị`})}
  return choice(`Số gồm ${t} chục và ${u} đơn vị là:`,lv===1?tensUnits(n):'',numOpts(n,10,99,3).concat(u&&u!==t?[u*10+t]:[]),n,{explain:`${t} chục và ${u} đơn vị là ${n}.`,blank:`Số gồm ${t} chục và ${u} đơn vị là ....`})},
m_sosanh100(lv){let a=R(10,99),b=lv===3?Math.floor(a/10)*10+R(0,9):R(10,99);if(Math.random()<.15)b=a;const s=a>b?'>':a<b?'<':'=';
  return choice(`Chọn dấu thích hợp: ${a} ☐ ${b}`,'',['>','<','='],s,{keep:true,cls:'three',say:`${a} so với ${b}`,explain:Math.floor(a/10)!==Math.floor(b/10)?'So sánh hàng chục trước: hàng chục lớn hơn thì số lớn hơn.':'Hàng chục bằng nhau thì so sánh hàng đơn vị.'})},
m_thutu100(lv){const k=R(0,3);
  if(k===0){const n=R(10,98);return choice(`Số liền sau của ${n} là:`,'',numOpts(n+1,10,99),n+1,{explain:`${n} thêm 1 là ${n+1}.`,blank:`Số liền sau của ${n} là ....`})}
  if(k===1){const n=R(11,99);return choice(`Số liền trước của ${n} là:`,'',numOpts(n-1,10,99),n-1,{explain:`${n} bớt 1 là ${n-1}.`,blank:`Số liền trước của ${n} là ....`})}
  if(k===2){const xs=[];while(xs.length<4){const x=R(10,99);if(!xs.includes(x))xs.push(x)}const big=Math.random()<.5,ans=big?Math.max(...xs):Math.min(...xs);
    return choice(big?'Số nào lớn nhất?':'Số nào bé nhất?','',xs,ans,{keep:true,explain:`Số ${big?'lớn nhất':'bé nhất'} là ${ans}.`})}
  const st=R(0,8)*10+1,row=[...Array(10).keys()].map(i=>st+i),hole=R(1,9);
  return choice('Bảng số: số nào còn thiếu?',`<div class="seq">${row.map((x,i)=>i===hole?'<span class="q">?</span>':`<span>${x}</span>`).join('')}</div>`,numOpts(row[hole],1,100),row[hole],{explain:`Các số tăng dần thêm 1: … ${row[hole-1]}, ${row[hole]} …`})},
m_daingan(lv){const L=shuf([60,100,140,180,220]).slice(0,3),labels=['A','B','C'],cols=shuf(COLORS).slice(0,3),long=Math.random()<.5;
  const idx=long?L.indexOf(Math.max(...L)):L.indexOf(Math.min(...L));
  return choice(long?'Bút chì nào dài nhất?':'Bút chì nào ngắn nhất?',`<div class="pencils">${L.map((l,i)=>`<div>${labels[i]} ${pencil(l,cols[i])}</div>`).join('')}</div>`,labels.map(x=>'Bút '+x),'Bút '+labels[idx],{keep:true,cls:'three',txt:true,explain:`Bút ${labels[idx]} ${long?'dài':'ngắn'} nhất.`})},
m_cm(lv){const n=lv===1?R(2,6):R(3,12);return choice('Thanh màu dài mấy xăng-ti-mét?',ruler(n,pick(COLORS)),numOpts(n,1,12).map(x=>x+' cm'),n+' cm',{say:'Thanh màu dài mấy xăng ti mét?',explain:`Đầu thanh ở vạch 0, cuối thanh ở vạch ${n}: dài ${n} cm.`})},
m_cong100(lv){let a,b;if(lv===1){a=R(1,8)*10;b=R(1,9-a/10)*10}else if(lv===2){a=R(1,9)*10+R(0,8);b=R(1,9-a%10)}else{const at=R(1,8),au=R(0,8);a=at*10+au;b=R(1,9-at)*10+R(0,9-au)}
  const c=a+b;return choice(`${a} + ${b} = ?`,'',numOpts(c,10,99),c,{explain:`Cộng đơn vị với đơn vị, chục với chục: ${a} + ${b} = ${c}.`,blank:`${a} + ${b} = ....`})},
m_tru100(lv){let a,b;if(lv===1){a=R(2,9)*10;b=R(1,a/10-1)*10}else if(lv===2){a=R(1,9)*10+R(1,9);b=R(1,a%10)}else{const at=R(2,9),au=R(0,9);a=at*10+au;b=R(1,at-1)*10+R(0,au)}
  const c=a-b;return choice(`${a} − ${b} = ?`,'',numOpts(c,0,99),c,{explain:`Trừ đơn vị với đơn vị, chục với chục: ${a} − ${b} = ${c}.`,blank:`${a} − ${b} = ....`})},
m_dattinh(lv){const plus=Math.random()<.5;let a,b,c;if(plus){const at=R(1,8),au=R(0,8);a=at*10+au;b=(lv===1?0:R(1,9-at)*10)+R(0,9-au);c=a+b}else{const at=R(2,9),au=R(1,9);a=at*10+au;b=(lv===1?0:R(1,at-1)*10)+R(0,au);c=a-b}
  const w=s=>String(s).padStart(3,' ').replace(/ /g,'&nbsp;');
  return choice('Đặt tính rồi tính: kết quả là bao nhiêu?',`<div class="vert">${w(a)}<br>${plus?'+':'−'}${w(b).slice(6)}<div class="ln"></div>${'?'}</div>`,numOpts(c,0,99),c,{say:`${a} ${plus?'cộng':'trừ'} ${b} bằng bao nhiêu?`,explain:`Viết các số thẳng cột rồi tính từ phải sang trái: ${a} ${plus?'+':'−'} ${b} = ${c}.`})},
m_loivan100(lv){const nm=pick(NAMES),k=R(0,2);let txt,a,b,c,op;
  if(k===0){a=R(1,8)*10+R(0,5);b=R(1,9-Math.floor(a/10))*10+R(0,4);c=a+b;op='+';txt=`Lớp 1A có ${a} quyển truyện, lớp 1B có ${b} quyển truyện. Hỏi cả hai lớp có bao nhiêu quyển truyện?`}
  else if(k===1){a=R(3,9)*10+R(5,9);b=R(1,Math.floor(a/10)-1)*10+R(0,5);c=a-b;op='−';txt=`Trong vườn có ${a} cây, đã chặt ${b} cây. Hỏi trong vườn còn lại bao nhiêu cây?`}
  else{a=R(2,6)*10+R(0,4);b=R(1,3)*10;c=a+b;op='+';txt=`${nm} có ${a} viên bi, anh cho ${nm} thêm ${b} viên bi. Hỏi ${nm} có tất cả bao nhiêu viên bi?`}
  return choice(txt,'',numOpts(c,0,99),c,{explain:`${a} ${op} ${b} = ${c}`,blank:txt+' Trả lời: ....'})},
m_dongho(lv){const h=R(1,12);if(lv===3&&Math.random()<.4)return choice(`Kim ngắn chỉ số ${h}, kim dài chỉ số 12. Đồng hồ chỉ mấy giờ?`,'',numOpts(h,1,12).map(x=>x+' giờ'),h+' giờ',{txt:true,explain:`Kim dài chỉ 12, kim ngắn chỉ ${h}: ${h} giờ.`});
  return choice('Đồng hồ chỉ mấy giờ?',clock(h),numOpts(h,1,12).map(x=>x+' giờ'),h+' giờ',{txt:true,explain:`Kim dài (xanh) chỉ số 12, kim ngắn (đỏ) chỉ số ${h}: ${h} giờ đúng.`})},
m_thu(lv){const D=['thứ Hai','thứ Ba','thứ Tư','thứ Năm','thứ Sáu','thứ Bảy','Chủ nhật'],k=R(0,lv===1?1:3),i=R(0,6);
  if(k===0)return choice(`Hôm nay là ${D[i]}. Ngày mai là ngày gì?`,`<div class="cal"><div>Hôm nay</div><b>${R(1,28)}</b><span>${D[i]}</span></div>`,shuf(D).slice(0,3).concat([D[(i+1)%7]]),D[(i+1)%7],{txt:true,explain:`Sau ${D[i]} là ${D[(i+1)%7]}.`});
  if(k===1)return choice(`Hôm nay là ${D[i]}. Hôm qua là ngày gì?`,'',shuf(D).slice(0,3).concat([D[(i+6)%7]]),D[(i+6)%7],{txt:true,explain:`Trước ${D[i]} là ${D[(i+6)%7]}.`});
  if(k===2)return choice('Một tuần lễ có mấy ngày?','',[5,6,7,8],7,{keep:true,explain:'Một tuần có 7 ngày: thứ Hai, thứ Ba, thứ Tư, thứ Năm, thứ Sáu, thứ Bảy, Chủ nhật.'});
  const d=R(1,20),j=R(0,4),add=R(1,2);return choice(`Hôm nay là ${D[j]} ngày ${d}. ${D[j+add][0].toUpperCase()+D[j+add].slice(1)} tuần này là ngày bao nhiêu?`,'',numOpts(d+add,1,31),d+add,{explain:`Mỗi ngày sau thêm 1: ${D[j+add]} là ngày ${d+add}.`})},
m_xepso10(lv){const k=lv===1?3:lv===2?4:5,xs=shuf([...Array(11).keys()]).slice(0,k),up=lv<3||Math.random()<.5,ans=xs.slice().sort((a,b)=>up?a-b:b-a);let mix=xs.slice();let g=0;while(mix.join()===ans.join()&&g++<10)mix=shuf(xs);
  const t=`Xếp các số theo thứ tự từ ${up?'bé đến lớn':'lớn đến bé'}:`;return {type:'order',text:t,vis:'',tokens:mix.map(String),answer:ans.map(String),punct:'',say:t,explain:`Thứ tự đúng: ${ans.join(', ')}.`}},
m_xepso100(lv){const k=lv===1?3:4,xs=[];while(xs.length<k){const x=lv===1?R(1,9)*10:R(10,99);if(!xs.includes(x))xs.push(x)}const up=lv<3||Math.random()<.5,ans=xs.slice().sort((a,b)=>up?a-b:b-a);let mix=xs.slice();let g=0;while(mix.join()===ans.join()&&g++<10)mix=shuf(xs);
  const t=`Xếp các số theo thứ tự từ ${up?'bé đến lớn':'lớn đến bé'}:`;return {type:'order',text:t,vis:'',tokens:mix.map(String),answer:ans.map(String),punct:'',say:t,explain:`So sánh hàng chục trước, rồi đến hàng đơn vị: ${ans.join(', ')}.`}},
m_quyluat(lv){const pool=shuf(ITEMS.map(x=>x[0])),pat=lv===1?[0,1]:lv===2?pick([[0,1,2],[0,0,1]]):pick([[0,1,1],[0,1,2],[0,0,1,1]]),L=pat.length*2+(lv===1?2:1);
  const seq=[...Array(L).keys()].map(i=>pool[pat[i%pat.length]]),next=pool[pat[L%pat.length]];const opts=[...new Set(pat.map(i=>pool[i]))].concat([pool[4],pool[5]]).slice(0,4);
  return choice('Hình tiếp theo là hình nào?',`<div class="seq">${seq.map(e=>`<span>${e}</span>`).join('')}<span class="q">?</span></div>`,opts,next,{say:'Tìm quy luật. Hình tiếp theo là hình nào?',explain:`Các hình lặp lại theo nhóm ${[...new Set(pat)].length===pat.length?'':''}${pat.map(i=>pool[i]).join(' ')}, nên tiếp theo là ${next}.`})},
m_dau(lv){const plus=Math.random()<.5;let a,b,c;if(lv===3){if(plus){const at=R(1,8),au=R(0,8);a=at*10+au;b=R(1,9-at)*10+R(0,9-au);c=a+b}else{const at=R(2,9),au=R(0,9);a=at*10+au;b=R(1,at-1)*10+R(0,au);c=a-b}}
  else{if(plus){a=R(0,9);b=R(1,10-a);c=a+b}else{a=R(1,10);b=R(1,a);c=a-b}}
  return choice(`Điền dấu + hay −: ${a} ☐ ${b} = ${c}`,`<div class="big">${a} ☐ ${b} = ${c}</div>`,['+','−'],plus?'+':'−',{keep:true,say:`${a} ô trống ${b} bằng ${c}. Điền dấu cộng hay dấu trừ?`,explain:`${a} ${plus?'+':'−'} ${b} = ${c}.`,printVis:'',blank:`${a} .... ${b} = ${c}`})},
m_ketqua(lv){const t=R(lv===1?2:3,10),mk=v=>{if(Math.random()<.5){const a=R(0,v);return `${a} + ${v-a}`}const a=R(v,10);return `${a} − ${a-v}`};
  const right=mk(t),vals=shuf([...Array(11).keys()].filter(v=>v!==t)).slice(0,3);return choice(`Phép tính nào có kết quả bằng ${t}?`,'',[right].concat(vals.map(mk)),right,{txt:true,explain:`${right} = ${t}.`})},
m_onhk1(lv){return G[pick(['m_dem10','m_nhieuit','m_sosanh10','m_tachso','m_thutu10','m_hinhphang','m_demhinh','m_cong10','m_tru10','m_dienso10','m_sosanhpt','m_loivan10','m_hinhkhoi','m_vitri'])](lv)},
m_oncn(lv){return G[pick(['m_cong10','m_tru10','m_dienso10','m_so100doc','m_chuc','m_sosanh100','m_thutu100','m_daingan','m_cm','m_cong100','m_tru100','m_dattinh','m_loivan100','m_dongho','m_thu','m_hinhphang','m_hinhkhoi'])](lv)},
/* ---------- Tiếng Việt ---------- */
t_chuhoa(lv){const groups=[['o','ô','ơ'],['a','ă','â'],['e','ê','c'],['u','ư','n'],['d','đ','b'],['b','d','p','q'],['m','n','h'],['i','l','t'],['g','q','y'],['s','x','r'],['k','h','l'],['v','u','y']];
  const g=pick(groups),c=pick(g),others=shuf(g.filter(x=>x!==c).concat(shuf('abcdeghiklmnopqrstuvxy'.split('')).filter(x=>!g.includes(x)).slice(0,3))).slice(0,3);
  if(Math.random()<.5)return choice(`Chữ in hoa của chữ “${c}” là:`,`<div class="word">${c}</div>`,[c].concat(others).map(x=>x.toUpperCase()),c.toUpperCase(),{say:`Chữ in hoa của chữ này là chữ nào?`,explain:`Chữ ${c} viết hoa là ${c.toUpperCase()}.`});
  return choice(`Chữ thường của chữ “${c.toUpperCase()}” là:`,`<div class="word">${c.toUpperCase()}</div>`,[c].concat(others),c,{say:`Chữ thường của chữ này là chữ nào?`,explain:`${c.toUpperCase()} viết thường là ${c}.`})},
t_amdau(lv){const ws=TV.pics(1).filter(x=>x.p.onset);if(!ws.length)return null;const x=pick(ws),on=x.p.onset;
  const pool=shuf(['b','c','d','đ','g','h','k','l','m','n','ng','nh','ph','r','s','t','th','tr','v','x','ch','kh','qu']).filter(o=>o!==on&&!(['c','k'].includes(o)&&['c','k'].includes(on))&&!(['g','gh'].includes(o)&&['g','gh'].includes(on))&&!(['ng','ngh'].includes(o)&&['ng','ngh'].includes(on)));
  return choice('Tên của hình bắt đầu bằng âm nào?',`<div class="pic">${x.e}</div>`,[on].concat(pool.slice(0,3)),on,{say:`Hình này là: ${x.w}. Tiếng ${x.w} bắt đầu bằng âm nào?`,explain:`Hình là “${x.w}”, bắt đầu bằng âm ${on}.`,speakWord:x.w})},
t_ghep(lv){const ws=TV.pics(1).filter(x=>x.p.onset&&x.p.rhyme);if(!ws.length)return null;const x=pick(ws),p=x.p,rh=x.w.slice(p.onset.length);
  const opts=[x.w];const ons=shuf(['b','c','d','g','h','l','m','n','t','v','x','s']).filter(o=>o!==p.onset);
  opts.push(ons[0]+rh);const tv=TV.toneVariants(x.w).filter(v=>v!==x.w);if(tv.length)opts.push(pick(tv));opts.push(ons[1]+rh);
  return choice(`Ghép âm và vần: ${p.onset} + ${rh} = ?`,`<div class="pic">${x.e}</div>`,opts.slice(0,4),x.w,{txt:true,say:`Ghép âm ${p.onset} với vần ${rh} được tiếng gì?`,explain:`${p.onset} + ${rh} = ${x.w}`})},
t_dau(lv){const ws=TV.pics(1).filter(x=>x.p.tone);if(!ws.length)return null;const x=pick(ws);const vs=shuf(TV.toneVariants(x.w).filter(v=>v!==x.w)).slice(0,3);
  return choice('Chọn tiếng đúng với hình:',`<div class="pic">${x.e}</div>`,[x.w].concat(vs),x.w,{txt:true,say:`Hình này là ${x.w}. Chọn tiếng viết đúng dấu thanh.`,explain:`“${x.w}” có ${TV.toneName(x.p.tone)}.`})},
t_van(lv){const ws=TV.pics(1).filter(x=>x.p.rhyme&&/[aăâeêioôơuưy]/.test(x.p.rhyme));if(!ws.length)return null;const x=pick(ws),rh=x.p.rhyme;
  const pool=shuf([...new Set(BANK.words.map(w=>TV.parse(w.w.split(' ')[0]).rhyme).filter(r=>r&&r!==rh&&/[aăâeêioôơuưy]/.test(r)))]);
  return choice(`Tiếng “${x.w}” có vần gì?`,`<div class="pic">${x.e}</div><div class="word">${x.w}</div>`,[rh].concat(pool.slice(0,3)),rh,{txt:true,say:`Tiếng ${x.w} có vần gì?`,explain:`${x.w} = ${x.p.onset||'(không có âm đầu)'} + vần ${rh}${x.p.tone?' + '+TV.toneName(x.p.tone):''}.`})},
t_chinhta(lv){const ws=BANK.words.filter(w=>!/\s/.test(w.w)).map(w=>Object.assign({p:TV.parse(w.w)},w)).filter(x=>['c','k','g','gh','ng','ngh'].includes(x.p.onset));if(!ws.length)return null;
  const x=pick(ws),on=x.p.onset,pair={c:['c','k'],k:['c','k'],g:['g','gh'],gh:['g','gh'],ng:['ng','ngh'],ngh:['ng','ngh']}[on],rest=x.w.slice(on.length);
  const rule=pair[0]==='c'?'Viết k trước i, e, ê; viết c trước các chữ còn lại.':pair[0]==='g'?'Viết gh trước i, e, ê; viết g trước các chữ còn lại.':'Viết ngh trước i, e, ê; viết ng trước các chữ còn lại.';
  return choice('Điền chữ còn thiếu:',(x.e?`<div class="pic">${x.e}</div>`:'')+`<div class="word"><u>?</u>${rest}</div>`,pair,on,{keep:true,cls:'one',printVis:x.e?`<span class="pic">${x.e}</span>`:'',say:`Tiếng ${x.w}. Điền ${pair[0]} hay ${pair[1]}?`,explain:`Viết đúng là “${x.w}”. ${rule}`,blank:`.....${rest}  (${pair.join(' hay ')})`})},
t_tuhinh(lv){const ws=TV.pics(lv===1?1:9);if(ws.length<4)return null;const four=shuf(ws).slice(0,4),x=four[0];
  if(Math.random()<.5)return choice('Hình này là gì?',`<div class="pic">${x.e}</div>`,four.map(w=>w.w),x.w,{txt:true,say:'Hình này là gì? Chọn từ đúng.',explain:`Hình ${x.e} là “${x.w}”.`});
  return choice(`Hình nào là “${x.w}”?`,'',four.map(w=>O(w.e,w.w)),O(x.e,x.w),{say:`Hình nào là ${x.w}?`,explain:`“${x.w}” là hình ${x.e}.`})},
t_dientu(lv){if(!BANK.sentences.length)return null;const s=pick(BANK.sentences),re=new RegExp('(^|\\s)'+s.k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=[\\s.,!?]|$)','i');
  const shown=s.s.replace(re,(m,a)=>a+'<u>&nbsp;</u>');const opts=[s.k].concat(s.x.slice(0,3));
  return choice('Chọn từ điền vào chỗ trống:',`<div class="sent">${shown}</div>`,opts,s.k,{txt:true,say:`Chọn từ điền vào chỗ trống: ${s.s.replace(re,(m,a)=>a+'ô trống')}`,explain:`Câu đúng: ${s.s}`,printVis:`<div class="sent">${s.s.replace(re,(m,a)=>a+'..........')}</div>`})},
t_doccau(lv){const ss=BANK.sentences.filter(s=>s.e);if(!ss.length)return null;const s=pick(ss);const em=TV.emojiOf;
  let opts=s.x.map(w=>em(w)).filter(Boolean).filter(e=>e!==s.e);const extra=shuf(TV.pics(9).map(w=>w.e).filter(e=>e!==s.e&&!opts.includes(e)));opts=opts.concat(extra).slice(0,3);
  return choice('Đọc câu rồi chọn hình đúng:',`<div class="sent">${esc(s.s)}</div>`,[s.e].concat(opts),s.e,{say:`${s.s} Chọn hình đúng.`,explain:`Câu “${s.s}” nói về ${s.k} ${s.e}.`})},
t_timvan(lv){const ws=TV.pics(1).filter(x=>x.p.rhyme&&/[aăâeêioôơuưy]/.test(x.p.rhyme));if(ws.length<6)return null;const x=pick(ws),rh=x.p.rhyme;
  const others=shuf(ws.filter(w=>w.p.rhyme!==rh&&w.w!==x.w)),seen=new Set(),opts=[];for(const w of others){if(!seen.has(w.p.rhyme)){seen.add(w.p.rhyme);opts.push(w.w)}if(opts.length>=3)break}
  return choice(`Tiếng nào có vần “${rh}”?`,'',[x.w].concat(opts),x.w,{txt:true,say:`Tiếng nào có vần ${rh}?`,explain:`“${x.w}” có vần ${rh}.`})},
t_gheptu(lv){const two=BANK.words.filter(w=>w.e&&w.w.split(' ').length===2);if(two.length<5)return null;const x=pick(two),[a,b]=x.w.split(' ');
  const real=new Set(BANK.words.map(w=>w.w)),pool=shuf([...new Set(two.map(w=>w.w.split(' ')[1]))]).filter(t=>t!==b&&!real.has(a+' '+t)).slice(0,3);
  return choice(`Ghép tiếng thành từ: ${a} + ? `,`<div class="pic">${x.e}</div>`,[b].concat(pool),b,{txt:true,say:`Hình này là ${x.w}. ${a} ghép với tiếng nào?`,explain:`${a} + ${b} = ${x.w}.`})},
t_nhomtu(lv){const LB={'con vật':'con vật','đồ ăn':'đồ ăn, hoa quả','đồ vật':'đồ vật','thiên nhiên':'cảnh vật thiên nhiên','người':'người hoặc bộ phận cơ thể'};
  const groups=Object.keys(LB).filter(g=>BANK.words.some(w=>w.g===g));if(groups.length<3)return null;const g=pick(groups),right=pick(BANK.words.filter(w=>w.g===g));
  const avoid=g==='đồ ăn'?['con vật']:[];const others=shuf(BANK.words.filter(w=>LB[w.g]&&w.g!==g&&!avoid.includes(w.g))).slice(0,3);
  const show=w=>lv===1&&w.e?O(`${w.e} ${w.w}`,w.w):O(w.w);
  return choice(`Từ nào chỉ ${LB[g]}?`,'',[show(right)].concat(others.map(show)),show(right),{txt:true,explain:`“${right.w}” chỉ ${LB[g]}.`})},
t_demtieng(lv){const ss=BANK.sentences.filter(s=>s.s.split(/\s+/).length<=(lv===1?5:9));if(!ss.length)return null;const s=pick(ss),ws=s.s.replace(/[.!?,]/g,'').split(/\s+/),n=ws.length;
  return choice('Câu dưới đây có mấy tiếng?',`<div class="sent">${esc(s.s)}</div>`,numOpts(n,2,10),n,{say:`${s.s} Câu này có mấy tiếng?`,explain:`Đếm: ${ws.join(' – ')} → ${n} tiếng.`})},
t_vietdung(lv){if(!BANK.sentences.length)return null;const s=pick(BANK.sentences).s,low=s[0].toLowerCase()+s.slice(1),noP=s.replace(/[.!?]+$/,'');
  return choice('Câu nào viết đúng?','',[s,low,noP,low.replace(/[.!?]+$/,'')],s,{txt:true,cls:'one',say:'Câu nào viết đúng?',explain:'Đầu câu viết hoa, cuối câu có dấu chấm.'})},
t_sapxep(lv){const ss=BANK.sentences.filter(s=>s.s.split(/\s+/).length<=(lv===1?4:7));if(!ss.length)return null;const s=pick(ss);
  const m=s.s.match(/^(.*?)([.!?]*)$/),words=m[1].split(/\s+/),punct=m[2]||'.';let mix=shuf(words);let g=0;while(mix.join(' ')===words.join(' ')&&g++<10)mix=shuf(words);
  return {type:'order',text:'Sắp xếp các tiếng thành câu đúng:',vis:'',tokens:mix,answer:words,punct,say:'Sắp xếp các tiếng thành câu đúng',explain:`Câu đúng: ${s.s}`}}
};


/* ================= Tiếng Anh 1 (sách Tiếng Anh 1 – Kết nối tri thức với cuộc sống) =================
   Từ vựng, nghĩa và Unit lấy từ bảng GLOSSARY trang 74–75; chữ cái và mẫu câu lấy từ BOOK MAP trang 4–5. */
const EN_G={apple:['quả táo','🍎',3],bag:['cái túi','👜',3],ball:['quả bóng','🏐',1],banana:['quả chuối','🍌',13],bell:['cái chuông','🔔',6],bike:['xe đạp','🚲',1],book:['quyển sách','📖',1],
 bus:['xe ô tô buýt','🚌',11],cake:['cái bánh','🍰',2],can:['lon đồ uống','🥫',3],car:['xe ô tô','🚗',2],cat:['con mèo','🐱',2],chicken:['thịt gà','🍗',5],chips:['khoai tây chiên','🍟',5],
 clock:['cái đồng hồ','⏰',9],cup:['cái chén','☕',2],desk:['cái bàn học sinh','',4],dog:['con chó','🐶',4],door:['cửa ra vào','🚪',4],duck:['con vịt','🦆',4],eight:['tám (8)','',16],
 face:['mặt','🙂',15],father:['bố','👨',15],fish:['cá','🐟',5],'fish and chips':['món cá tẩm bột và khoai tây chiên','',5],five:['năm (5)','',9],foot:['bàn chân','🦶',15],
 football:['bóng đá / quả bóng đá','⚽',15],four:['bốn (4)','',9],garden:['khu vườn','🏡',7],gate:['cổng ra vào','',7],girl:['cô bé','👧',7],goat:['con dê','🐐',7],hair:['tóc','💇',8],
 hand:['bàn tay','✋',8],hat:['cái mũ','👒',3],head:['đầu','',8],horse:['con ngựa','🐴',8],lake:['hồ nước','🏞️',12],leaf:['lá cây','🍃',12],lemon:['quả chanh','🍋',12],lock:['ổ khoá','🔒',9],
 milk:['sữa','🥛',5],monkey:['con khỉ','🐵',10],mango:['quả xoài','🥭',10],mop:['cây lau nhà','',9],mother:['mẹ','👩',10],mouse:['con chuột','🐭',10],nine:['chín (9)','',16],noodles:['mì','🍜',13],
 nut:['hạt lạc','🥜',13],one:['một (1)','',9],pen:['bút mực','🖊️',6],pencil:['bút chì','✏️',6],pot:['cái nồi','🍲',9],red:['màu đỏ','🔴',6],run:['chạy','🏃',11],seven:['bảy (7)','',16],
 six:['sáu (6)','',16],sun:['mặt trời','☀️',11],'teddy bear':['con gấu bông','🧸',14],ten:['mười (10)','',16],three:['ba (3)','',9],tiger:['con hổ','🐯',14],top:['con quay','',14],
 truck:['ô tô tải','🚚',11],turtle:['con rùa','🐢',14],two:['hai (2)','',9],wash:['lau','',16],water:['nước','💧',16],window:['cửa sổ','🪟',16]};
const EN_NUM=['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
const EN_PL={leaf:'leaves',lemon:'lemons',lake:'lakes',clock:'clocks',lock:'locks',mop:'mops',pot:'pots',banana:'bananas',nut:'nuts',window:'windows'};
const EN_U=[null,
 {n:'In the school playground',ph:'Bb',w:['ball','bike','book'],ic:'⚽'},
 {n:'In the dining room',ph:'Cc',w:['cake','car','cat','cup'],ic:'🍰',p:'I have a {w}.',pw:['cake','car','cat','cup']},
 {n:'At the street market',ph:'Aa',w:['apple','bag','can','hat'],ic:'🍎',p:'This is my {w}.',pw:['apple','bag','can','hat']},
 {n:'In the bedroom',ph:'Dd',w:['desk','dog','door','duck'],ic:'🐶',p:'This is a {w}.',pw:['dog','door','duck']},
 {n:'At the fish and chip shop',ph:'Ii',w:['chicken','chips','fish','milk'],ic:'🐟',p:'I like {w}.',pw:['chicken','chips','fish','milk']},
 {n:'In the classroom',ph:'Ee',w:['bell','pen','pencil','red'],ic:'✏️',p:"It's a red {w}.",pw:['bell','pen','pencil']},
 {n:'In the garden',ph:'Gg',w:['garden','gate','girl','goat'],ic:'🐐',p:"There's a {w}.",pw:['garden','girl','goat']},
 {n:'In the park',ph:'Hh',w:['hair','hand','head','horse'],ic:'🐴',p:'Touch your {w}.',pw:['hair','hand']},
 {n:'In the shop',ph:'Oo',w:['clock','lock','mop','pot','one','two','three','four','five'],ic:'⏰',count:'How many {pl}?',pw:['clock','lock','pot'],max:5},
 {n:'At the zoo',ph:'Mm',w:['mango','monkey','mother','mouse'],ic:'🐵',p:"That's a {w}.",pw:['mango','monkey','mouse']},
 {n:'At the bus stop',ph:'Uu',w:['bus','run','sun','truck'],ic:'🚌'},
 {n:'At the lake',ph:'Ll',w:['lake','leaf','lemon'],ic:'🍋',p:'Look at the {pl}.',pw:['lake','leaf','lemon']},
 {n:'In the school canteen',ph:'Nn',w:['banana','noodles','nut'],ic:'🍜',p:"She's having {w}.",pw:['noodles'],pl:{banana:'bananas',nut:'nuts'}},
 {n:'In the toy shop',ph:'Tt',w:['teddy bear','tiger','top','turtle'],ic:'🧸',p:'I can see a {w}.',pw:['teddy bear','tiger','turtle']},
 {n:'At the football match',ph:'Ff',w:['face','father','foot','football'],ic:'⚽',p:'Point to your {w}.',pw:['face','foot']},
 {n:'At home',ph:'Ww',w:['wash','water','window','six','seven','eight','nine','ten'],ic:'🪟',count:'How many windows can you see?',pw:['window'],min:6,max:10}
];
const EN_ALL=Object.keys(EN_G),EN_PICS=EN_ALL.filter(w=>EN_G[w][1]);
function enPickOthers(pool,not,k){return shuf(pool.filter(w=>!not.includes(w))).slice(0,k)}
function enWordQ(u,lv){const unitW=EN_U[u].w.filter(w=>!EN_NUM.includes(w)),pics=unitW.filter(w=>EN_G[w][1]);
  const types=['meaning','letter','missing'].concat(pics.length?['pic2word','word2pic','listen','pic2word']:[]).concat(lv>1?['meaning_rev']:[]);
  const t=pick(types),w=pick(t==='meaning'||t==='letter'||t==='meaning_rev'?unitW:pics.length?pics:unitW);
  const vn=EN_G[w][0],e=EN_G[w][1];
  if(t==='pic2word'||(t!=='meaning'&&t!=='letter'&&t!=='meaning_rev'&&!e&&t!=='missing')){const o=[w].concat(enPickOthers(EN_ALL.filter(x=>!EN_NUM.includes(x)),[w],3));
    return choice('What is it? Đây là gì?',`<div class="pic">${e||'📘'}</div>`,o,w,{txt:true,lang:'en',say:'What is it?',explain:`${e} = ${w} (${vn})`})}
  if(t==='word2pic'){const o=[w].concat(enPickOthers(EN_PICS,[w],3));return choice(`Chọn hình: “${w}”`,'',o.map(x=>O(EN_G[x][1],x)),O(e,w),{lang:'en',say:w,explain:`${w} = ${e} (${vn})`})}
  if(t==='listen'){const o=[w].concat(enPickOthers(EN_PICS,[w],3));return choice('🔊 Nghe và chọn hình đúng','',o.map(x=>O(EN_G[x][1],x)),O(e,w),{lang:'en',say:w,explain:`Từ vừa nghe là “${w}” = ${e} (${vn})`,printText:`Chọn hình: “${w}”`})}
  if(t==='meaning'){const o=[vn].concat(enPickOthers(EN_ALL,[w],3).map(x=>EN_G[x][0]));return choice(`“${w}” nghĩa là gì?`,e?`<div class="pic">${e}</div>`:'',o,vn,{txt:true,lang:'en',say:w,explain:`${w}: ${vn}`,printVis:''})}
  if(t==='meaning_rev'){const o=[w].concat(enPickOthers(EN_ALL,[w],3));return choice(`“${vn}” tiếng Anh là gì?`,'',o,w,{txt:true,lang:'en',say:'',explain:`${vn}: ${w}`})}
  if(t==='letter'){const L=w[0],others=shuf('abcdefghilmnoprstuw'.split('').filter(x=>x!==L)).slice(0,3);
    return choice(`Từ “${w}” bắt đầu bằng chữ cái nào?`,e?`<div class="pic">${e}</div>`:'',[L].concat(others).map(x=>x.toUpperCase()+x),L.toUpperCase()+L,{lang:'en',say:w,explain:`${w} bắt đầu bằng chữ ${L.toUpperCase()}${L}.`})}
  const L=w[0],others=shuf('abcdefghilmnoprstuw'.split('').filter(x=>x!==L)).slice(0,3);
  return choice('Điền chữ cái còn thiếu:',(e?`<div class="pic">${e}</div>`:'')+`<div class="word"><u>?</u>${esc(w.slice(1))}</div>`,[L].concat(others),L,{lang:'en',say:w,explain:`Viết đúng: ${w} (${vn})`,blank:`....${w.slice(1)}`,printVis:e?`<span class="pic">${e}</span>`:''})}
function enCountQ(u,lv){const U=EN_U[u],w=pick(U.pw),n=R(U.min||1,U.max||5),e=EN_G[w][1],pl=EN_PL[w]||w+'s',q=U.count.replace('{pl}',pl);
  const ans=u===16?`I can see ${EN_NUM[n]}.`:EN_NUM[n][0].toUpperCase()+EN_NUM[n].slice(1)+'.';
  const nums=numOpts(n,U.min||1,U.max||5,4),opts=nums.map(k=>u===16?`I can see ${EN_NUM[k]}.`:EN_NUM[k][0].toUpperCase()+EN_NUM[k].slice(1)+'.');
  return choice(q,emo(e,n),opts,ans,{txt:true,lang:'en',say:q,explain:`Có ${n} ${EN_G[w][0]}: ${ans}`})}
function enSentQ(u,lv){const U=EN_U[u];
  if(u===1){const hi=Math.random()<.5;return choice(hi?'Khi gặp bạn Bill, em nói:':'Khi chào tạm biệt Bill, em nói:','<div class="pic">👋</div>',["Hi, I'm Bill.",'Bye, Bill.'],hi?"Hi, I'm Bill.":'Bye, Bill.',{keep:true,txt:true,cls:'one',lang:'en',say:hi?"Hi, I'm Bill.":'Bye, Bill.',explain:hi?'Hi = xin chào.':'Bye = tạm biệt.'})}
  if(u===11){const she=Math.random()<.5;return choice('Chọn câu đúng với hình:',`<div class="pic">${she?'🏃‍♀️':'🏃‍♂️'}</div>`,["She's running.","He's running."],she?"She's running.":"He's running.",{keep:true,txt:true,cls:'one',lang:'en',say:"She's running. He's running.",explain:she?'Bạn gái: She’s running.':'Bạn trai: He’s running.'})}
  if(U.count)return enCountQ(u,lv);
  const w=pick(U.pw),fill=x=>U.p.replace('{w}',x).replace('{pl}',EN_PL[x]||x+'s'),others=shuf(EN_PICS.filter(x=>x!==w&&!EN_NUM.includes(x))).slice(0,3);
  return choice('Chọn câu đúng với hình:',`<div class="pic">${EN_G[w][1]}</div>`,[fill(w)].concat(others.map(fill)),fill(w),{txt:true,cls:'one',lang:'en',say:fill(w),explain:`${fill(w)} (${EN_G[w][0]})`})}
function enOrderQ(u){const U=EN_U[u];let s;
  if(u===1)s="Hi, I'm Bill.";else if(u===11)s=pick(["She's running.","He's running."]);
  else if(u===9)s='How many clocks?';else if(u===16)s='I can see six windows.';
  else{const w=pick(U.pw);s=U.p.replace('{w}',w).replace('{pl}',EN_PL[w]||w+'s')}
  const m=s.match(/^(.*?)([.!?]*)$/),words=m[1].split(/\s+/);if(words.length<2)return null;let mix=shuf(words),g=0;while(mix.join(' ')===words.join(' ')&&g++<10)mix=shuf(words);
  return {type:'order',text:'Sắp xếp các từ thành câu đúng:',vis:'',tokens:mix,answer:words,punct:m[2]||'.',lang:'en',say:s,explain:`Câu đúng: ${s}`}}
function enUnit(u,lv){const r=Math.random();if(lv>=2&&r<.2)return enOrderQ(u)||enWordQ(u,lv);if(r<.45)return enSentQ(u,lv);return enWordQ(u,lv)}
for(let u=1;u<=16;u++)G['e_u'+u]=lv=>enUnit(u,lv);
G.e_num=lv=>{const n=R(lv===1?1:1,lv===1?5:10),k=R(0,2),[e]=pick(ITEMS);
  if(k===0)return choice('How many? Có mấy?',emo(e,n),numOpts(n,1,10).map(x=>EN_NUM[x]),EN_NUM[n],{txt:true,lang:'en',say:'How many?',explain:`${n} = ${EN_NUM[n]}`});
  if(k===1)return choice(`Số ${n} tiếng Anh là:`,`<div class="big">${n}</div>`,numOpts(n,1,10).map(x=>EN_NUM[x]),EN_NUM[n],{txt:true,lang:'en',say:'',explain:`${n} = ${EN_NUM[n]}`});
  return choice(`“${EN_NUM[n]}” là số mấy?`,'',numOpts(n,1,10),n,{lang:'en',say:EN_NUM[n],explain:`${EN_NUM[n]} = ${n}`})};
G.e_abc=lv=>{const ph=EN_U.slice(1).map(x=>x.ph),P=pick(ph),L=P[1];
  if(Math.random()<.5){const U=EN_U.find(x=>x&&x.ph===P),starts=EN_ALL.filter(w=>w[0]===L&&!/\s/.test(w));
    if(!starts.length){const ws=U.w.filter(w=>w.includes(L)&&!EN_NUM.includes(w)),w=pick(ws),others=shuf(EN_ALL.filter(x=>!x.includes(L)&&!/\s/.test(x))).slice(0,3);
      return choice(`Từ nào có chữ ${L}?`,'',[w].concat(others).map(x=>O((EN_G[x][1]?EN_G[x][1]+' ':'')+x,x)),O((EN_G[w][1]?EN_G[w][1]+' ':'')+w,w),{txt:true,lang:'en',say:w,explain:`${w} có chữ ${L} (Unit ${EN_G[w][2]}).`})}
    const w=pick(starts),others=shuf(EN_ALL.filter(x=>x[0]!==L&&!/\s/.test(x))).slice(0,3);
    return choice(`Từ nào bắt đầu bằng chữ ${P}?`,'',[w].concat(others).map(x=>O((EN_G[x][1]?EN_G[x][1]+' ':'')+x,x)),O((EN_G[w][1]?EN_G[w][1]+' ':'')+w,w),{txt:true,lang:'en',say:P[0],explain:`${w} bắt đầu bằng chữ ${P}.`})}
  const up=Math.random()<.5,others=shuf(ph.filter(x=>x!==P)).slice(0,3);
  return choice(up?`Chữ in hoa của “${L}” là:`:`Chữ thường của “${P[0]}” là:`,`<div class="word">${up?L:P[0]}</div>`,[P].concat(others).map(x=>up?x[0]:x[1]),up?P[0]:L,{lang:'en',say:L,explain:`${P[0]} – ${L}`})};
G.e_all=lv=>enWordQ(R(1,16),lv);
G.e_sent=lv=>{const u=R(1,16);return lv>=2&&Math.random()<.35?(enOrderQ(u)||enSentQ(u,lv)):enSentQ(u,lv)};


/* ================= Tiếng Việt 1 theo sách (Kết nối tri thức) =================
   Tập 1: thứ tự âm, chữ, vần, dấu thanh lấy theo MỤC LỤC trang 4–5. Mỗi chặng chỉ hỏi tiếng mà bé đã học đủ âm, vần, dấu.
   Tập 2: 8 chủ đề theo MỤC LỤC trang 2–3; câu đọc ngắn soạn theo chủ đề. */
const TV1_SEQ=[[1,'','a',''],[2,'b','','̀'],[3,'c','','́'],[4,'','e ê',''],[6,'','o','̉'],[7,'','ô','̣'],[8,'d đ','',''],[9,'','ơ','̃'],
 [11,'k','i',''],[12,'h l','',''],[13,'','u ư',''],[14,'ch kh','',''],[16,'m n','',''],[17,'g gi','',''],[18,'gh nh','',''],[19,'ng ngh','',''],
 [21,'r s','',''],[22,'t tr','',''],[23,'th','ia',''],[24,'','ua ưa',''],[26,'ph qu','',''],[27,'v x','',''],[28,'','y',''],
 [31,'','an ăn ân',''],[32,'','on ôn ơn',''],[33,'','en ên in un',''],[34,'','am ăm âm',''],[36,'','om ôm ơm',''],[37,'','em êm im um',''],[38,'','ai ay ây',''],[39,'','oi ôi ơi',''],
 [41,'','ui ưi',''],[42,'','ao eo',''],[43,'','au âu êu',''],[44,'','iu ưu',''],[46,'','ac ăc âc',''],[47,'','oc ôc uc ưc',''],[48,'','at ăt ât',''],[49,'','ot ôt ơt',''],
 [51,'','et êt it',''],[52,'','ut ưt',''],[53,'','ap ăp âp',''],[54,'','op ôp ơp',''],[56,'','ep êp ip up',''],[57,'','anh ênh inh',''],[58,'','ach êch ich',''],[59,'','ang ăng âng',''],
 [61,'','ong ông ung ưng',''],[62,'','iêc iên iêp',''],[63,'','iêng iêm yên',''],[64,'','iêt iêu yêu',''],[66,'','uôi uôm',''],[67,'','uôc uôt',''],[68,'','uôn uông',''],[69,'','ươi ươu',''],
 [71,'','ươc ươt',''],[72,'','ươm ươp',''],[73,'','ươn ương',''],[74,'','oa oe',''],[76,'','oan oăn oat oăt',''],[77,'','oai uê uy',''],[78,'','uân uât',''],[79,'','uyên uyêt','']];
const TV1_RANGES={t_b1:[1,10],t_b2:[11,20],t_b3:[21,30],t_b4:[31,45],t_b5:[46,60],t_b6:[61,70],t_b7:[71,80]};
/* Kho tiếng/từ thường gặp để luyện đọc theo âm, vần (soạn tay, mỗi âm/vần có vài từ). */
const TV1_POOL=('a,ba,bà,bé,bê,bè,bò,bố,bơ,bờ,bế,ca,cá,cà,cò,cỏ,cọ,cô,cổ,cờ,cú,củ,cũ,dê,dế,da,dì,dỗ,đá,đò,đỏ,đồ,đê,đi,đũa,đu đủ,ô,bể,hè,'+
 'bi,kê,kể,kì,kẻ,kệ,kí,hồ,hổ,lá,lê,lọ,lò,ho,hạ,hẹ,lề,tủ,hũ,lũ,dữ,mũ,thư,sư tử,chè,chó,chú,chị,chợ,khế,kho,khỉ,khô,khe,chữ,me,mẹ,mè,má,mơ,na,nơ,no,mỏ,nụ,'+
 'gà,gỗ,gõ,gù,giá,giỏ,giò,giẻ,gió,ghế,ghi,ghé,ghẹ,nhà,nho,nhỏ,nhổ,nhớ,ngà,ngô,ngõ,ngủ,nghé,nghỉ,nghệ,nghe,rổ,rễ,rá,rẻ,rủ,sẻ,sò,số,sẽ,sợ,su su,'+
 'tổ,tô,tre,trà,trê,trí,to,tạ,thỏ,thả,thơ,thú,thì,chia,mía,tía,tỉa,thìa,đĩa,cua,rùa,mua,lúa,búa,dưa,ngựa,mưa,cửa,sữa,cưa,phà,phố,phở,quà,quê,quả,quạ,'+
 'vẽ,vó,vở,ví,xe,xa,xẻ,xô,xù,y tá,ý,quý,bàn,lan,sàn,đàn,than,chăn,khăn,ăn,rắn,cân,sân,chân,con,nón,hòn,thôn,bốn,chồn,sơn,lợn,cơn,sen,len,đèn,khen,'+
 'tên,nến,đến,lên,bến,xin,nhìn,chín,giun,phun,vun,bún,cam,tám,làm,nam,tắm,năm,chăm,cằm,nấm,tấm,mâm,đầm,khóm,đom đóm,nhóm,xóm,tôm,cốm,hôm,ốm,'+
 'cơm,rơm,bơm,thơm,kem,tem,xem,thèm,đêm,mềm,nệm,thêm,chim,tim,kim,sim,chum,chùm,tai,hai,nai,mai,chai,tay,bay,máy,chạy,váy,cây,dây,mây,đầy,còi,voi,nói,sói,gói,'+
 'đồi,tôi,chổi,gối,cối,bơi,chơi,mời,phơi,núi,túi,mùi,vui,củi,gửi,ngửi,cao,sao,táo,chào,dao,mèo,kẹo,kéo,leo,bèo,cau,rau,sau,cháu,màu,câu,sâu,trâu,đậu,cầu,'+
 'kêu,sếu,lều,phễu,rìu,địu,xíu,cừu,lựu,hưu,bác,các,lạc,nhạc,vác,mắc,bắc,mặc,gấc,bậc,nhấc,học,sóc,cóc,móc,ngọc,ốc,gốc,cốc,cúc,đục,chúc,trúc,mực,đực,sức,rực,'+
 'hát,mát,bát,cát,mắt,cắt,mặt,mật,đất,vật,thật,ngọt,hót,rót,một,cột,rốt,bột,tốt,ớt,vợt,thớt,bớt,két,vẹt,hét,nét,tết,dệt,mệt,rết,mít,vịt,thịt,ít,'+
 'bút,phút,sút,rút,nút,mứt,đứt,nứt,tháp,xe đạp,sạp,bắp,cặp,sắp,gặp,tập,nấp,họp,góp,chóp,hộp,lốp,tốp,xốp,lớp,chớp,đớp,hợp,dép,kẹp,chép,bếp,xếp,nếp,kịp,nhịp,'+
 'búp,cúp,chụp,chanh,xanh,bánh,cành,tranh,kênh,chênh,kính,xinh,tính,bình,đinh,sách,khách,gạch,vạch,ếch,lệch,lịch,xích,thích,kịch,bàng,vàng,làng,thang,sáng,'+
 'măng,trăng,răng,nắng,tầng,vâng,nâng,bóng,ong,võng,cong,sóng,công,bông,sông,trống,súng,thùng,nhung,cung,lưng,trứng,sừng,gừng,mừng,xiếc,tiệc,chiếc,việc,'+
 'tiên,biển,kiến,điện,viên,thiếp,tiếp,chiêng,miếng,tiếng,kiếm,tiêm,điểm,liềm,yên,yến,viết,biết,tiết,diều,chiếu,tiêu,nhiều,yêu,yếu,chuối,muối,suối,đuôi,tuổi,'+
 'buồm,nhuộm,đuốc,thuốc,guốc,buộc,chuột,tuốt,buốt,nuốt,chuồn chuồn,cuộn,muốn,khuôn,chuông,xuồng,muống,luống,bưởi,lưới,tưới,cười,mười,hươu,bướu,thước,nước,bước,lược,'+
 'lướt,mượt,trượt,ướt,bướm,gươm,lượm,mướp,ướp,vườn,lươn,sườn,mượn,gương,đường,phượng,hoa,loa,khoa,xòe,khỏe,loe,ngoan,khoan,toán,đoàn,xoăn,xoắn,hoạt,thoát,soát,loạt,'+
 'thoăn thoắt,loắt choắt,khoai,ngoài,xoài,loài,huệ,thuê,tuệ,thủy,huy,khuy,xuân,tuần,chuẩn,thuật,xuất,thuyền,khuyên,chuyện,truyện,tuyết,duyệt').split(',');
const TV1_SENT=['Bà bế bé.|bé|👶|cá, cỏ, đá','Bé có cờ đỏ.|cờ|🚩|cỏ, đê, hồ','Bò ăn cỏ.|cỏ|🌿|đá, ô, đê','Bố đi đò.|đò|🛶|cỏ, bê, cá','Dê ăn cỏ.|dê|🐐|ô, đò, cờ','Bé có ô đỏ.|ô|☂️|cỏ, hồ, đê',
 'Bé bị ho.|ho|🤧|ô, cỏ, đò','Bà có lá hẹ.|hẹ|🌿|đò, ô, hồ','Mẹ đi chợ.|chợ|🏪|cỏ, lá, mũ','Hà có nho.|nho|🍇|đê, hồ, ngõ','Nhà bà có ghế nhỏ.|ghế|🪑|cỏ, hồ, ngõ','Bé ngủ ở nhà bà.|nhà|🏠|cỏ, hồ, mũ',
 'Mấy chú khỉ ăn chuối.|chuối|🍌|ghế, đá, mũ','Bố đưa bé đi phố.|phố|🏙️|cỏ, ghế, lá','Bé vẽ cá.|cá|🐟|mưa, gió, ngõ','Chị Hà đi xe đạp.|xe đạp|🚲|cái ghế, quả na, con cá'];
const TV2_CD=[null,
 {n:'Tôi và các bạn',ic:'🧒',s:['Tôi là học sinh lớp 1.|học sinh|🧒|con mèo, cái ghế, quả cam','Bạn Hà tặng em một bông hoa.|hoa|🌸|con voi, ngọn núi, cái nhà','Voi con có đôi tai to.|tai|👂|cánh, vây, mỏ',
   'Chúng em là bạn thân.|bạn thân|🤝|cái bàn, con cá, quả bóng','Sinh nhật voi con có bánh kem.|bánh kem|🎂|xe tải, cái chổi, con rắn','Gió thổi mây bay.|mây|☁️|đá, ghế, tủ','Bạn bè giúp đỡ nhau.|bạn bè|🧑‍🤝‍🧑|cái bàn, hòn đá, cây cột']},
 {n:'Mái ấm gia đình',ic:'🏠',s:['Mẹ hôn lên bàn tay bé.|bàn tay|✋|cái chổi, con cá, ngọn núi','Cả nhà đi chơi núi.|núi|⛰️|bát, kéo, thìa','Bé quạt cho bà ngủ.|bà|👵|ghế, bàn, xe',
   'Bữa cơm gia đình thật vui.|cơm|🍚|đá, gỗ, cát','Anh trai bế em bé.|em bé|👶|cái tủ, ngọn núi, cây cột','Ngôi nhà của em có giàn hoa.|hoa|🌸|cá, đá, xe','Bố mẹ yêu thương em.|bố mẹ|👨‍👩‍👧|cái bàn, hòn đá, cái cốc']},
 {n:'Mái trường mến yêu',ic:'🏫',s:['Trường em có cây bàng.|cây bàng|🌳|con voi, tàu thủy, cái nồi','Bác trống trường kêu tùng tùng.|trống|🥁|quả cam, con mèo, cái thìa','Cô giáo khen em ngoan.|cô giáo|👩‍🏫|con hổ, cái tủ, ngọn núi',
   'Em yêu mái trường của em.|mái trường|🏫|con cá, cái kéo, quả trứng','Giờ ra chơi, chúng em nhảy dây.|nhảy dây|🪢|giặt áo, cày ruộng, lái xe','Em đến lớp đúng giờ.|lớp|🏫|biển, rừng, núi','Hoa trong vườn trường nở rộ.|hoa|🌸|bàn, ghế, bảng']},
 {n:'Điều em cần biết',ic:'💡',s:['Em rửa tay trước khi ăn.|rửa tay|🧼|đá bóng, leo cây, thả diều','Đèn đỏ thì dừng lại.|đèn đỏ|🚦|con cá, quả cam, cái bàn','Gặp người lớn, em chào hỏi lễ phép.|chào hỏi|👋|cãi nhau, trêu chọc, giận dỗi',
   'Khi mẹ vắng nhà, em không mở cửa cho người lạ.|người lạ||con mèo, cái cây, chiếc xe','Nếu bị lạc, em đứng yên chờ bố mẹ.|bố mẹ|👨‍👩‍👧|con mèo, cái cây, chiếc xe','Em đi bộ trên vỉa hè.|vỉa hè||mái nhà, ngọn cây, đáy hồ']},
 {n:'Bài học từ cuộc sống',ic:'🌱',s:['Chim bồ câu cứu kiến.|kiến|🐜|núi, mây, nhà','Cậu bé chăn cừu nói dối.|cừu|🐑|mây, núi, sao','Rễ cây hút nước nuôi cây.|rễ|🌱|mây, gió, đá',
   'Núi vọng lại tiếng của em.|núi|⛰️|bàn, ghế, cốc','Sói hỏi sóc nhiều câu hỏi.|sóc|🐿️|đá, ghế, nồi','Kiến chăm chỉ tha mồi về tổ.|kiến|🐜|ghế, đá, mây']},
 {n:'Thiên nhiên kì thú',ic:'🌈',s:['Cầu vồng có bảy màu.|cầu vồng|🌈|cái bàn, con chó, quả trứng','Sư tử là chúa tể rừng xanh.|sư tử|🦁|con kiến, con ốc, con sâu','Cây liễu có cành mềm mại.|cây liễu|🌿|hòn đá, cái cột, bức tường',
   'Chim hải âu bay trên biển cả.|biển|🌊|tủ, bàn, giường','Mặt trời mọc ở phía đông.|mặt trời|☀️|cái ghế, con cá, quả cam','Rừng xanh có nhiều muông thú.|rừng|🌳|bếp, tủ, cốc']},
 {n:'Thế giới trong mắt em',ic:'👀',s:['Tia nắng chiếu vào cửa sổ.|nắng|☀️|cơm, cá, kem','Hoa phượng nở đỏ rực mùa hè.|hoa phượng|🌺|cái bàn, con cá, quả trứng','Đàn cò bay trên cánh đồng.|cò|🐦|cá, ốc, cua',
   'Buổi trưa hè, ve kêu râm ran.|ve|🦗|cá, ốc, ghế','Em hỏi mẹ vì sao trời mưa.|mẹ|👩|ghế, cốc, bát','Ngày mới bắt đầu khi gà gáy.|gà|🐓|cá, bàn, cây']},
 {n:'Đất nước và con người',ic:'🏞️',s:['Chú lính cứu hỏa dập tắt đám cháy.|lính cứu hỏa|🧑‍🚒|con mèo, cái ghế, quả bóng','Ruộng bậc thang ở Sa Pa rất đẹp.|ruộng bậc thang|🌾|con voi, cái tủ, quả cam',
   'Biển Việt Nam có nhiều bãi cát đẹp.|biển|🏖️|tủ, bếp, giường','Uống nước nhớ nguồn.|nước|💧|đá, gỗ, cát','Lớn lên, em muốn làm bác sĩ.|bác sĩ|🧑‍⚕️|con cá, cái bàn, quả cam','Cậu bé thông minh trả lời giỏi.|cậu bé|👦|cái bàn, hòn đá, cây cột']}
];
const parseSent=x=>{const r=x.split('|');return {s:r[0],k:r[1],e:r[2]||'',x:(r[3]||'').split(',').map(t=>t.trim()).filter(Boolean)}};
function tv1Learned(b){const L={on:new Set(['']),rh:new Set(),tn:new Set([''])};TV1_SEQ.forEach(([n,o,r,t])=>{if(n>b)return;o.split(' ').filter(Boolean).forEach(x=>L.on.add(x));r.split(' ').filter(Boolean).forEach(x=>L.rh.add(x));if(t)L.tn.add(t)});return L}
function tv1New(a,b){const N=[];TV1_SEQ.forEach(([n,o,r])=>{if(n<a||n>b)return;o.split(' ').filter(Boolean).forEach(x=>N.push({x,on:1}));r.split(' ').filter(Boolean).forEach(x=>N.push({x,on:0}))});return N}
function sylOK(sy,L){const p=TV.parse(sy);return L.on.has(p.onset)&&L.rh.has(p.rhyme)&&L.tn.has(p.tone)}
function wordOK(w,L){return String(w).toLowerCase().replace(/[.,!?]/g,'').split(/\s+/).filter(Boolean).every(sy=>sylOK(sy,L))}
function hasX(w,X){return w.split(/\s+/).some(sy=>{const p=TV.parse(sy);return X.on?p.onset===X.x:p.rhyme===X.x})}
function tvLabel(X){return X.on||X.x.length===1?'âm '+X.x:'vần '+X.x}
function tvRange(code,lv){const [a,b]=TV1_RANGES[code],L=tv1Learned(b),N=tv1New(a,b);
  const pool=[...new Set(TV1_POOL.concat(BANK.words.map(w=>w.w)))].filter(w=>wordOK(w,L));
  const pics=BANK.words.filter(w=>w.e&&wordOK(w.w,L)).map(w=>Object.assign({p:TV.parse(w.w.split(' ')[0])},w));
  const sents=BANK.sentences.concat(TV1_SENT.map(parseSent)).filter(x=>wordOK(x.s,L));
  const kinds=['co','co','tim'];if(pics.length>=4)kinds.push('pic');if(sents.length>=3&&lv>=2)kinds.push('sent');
  const k=pick(kinds);
  if(k==='pic'){const save=BANK.words;BANK.words=save.filter(w=>wordOK(w.w,L));try{return G[pick(b>=30?['t_tuhinh','t_dau','t_ghep','t_amdau']:['t_tuhinh','t_dau'])](lv)}finally{BANK.words=save}}
  if(k==='sent'){const save=BANK.sentences;BANK.sentences=sents;try{return G[pick(['t_dientu','t_sapxep','t_doccau','t_demtieng'])](lv)}finally{BANK.sentences=save}}
  const Xs=shuf(N).filter(X=>pool.some(w=>hasX(w,X)));if(!Xs.length)return null;const X=Xs[0];
  const right=pick(pool.filter(w=>hasX(w,X)));
  if(k==='tim'&&!/\s/.test(right)){const p=TV.parse(right),same=N.filter(y=>y.on===X.on).map(y=>y.x),pool2=X.on?[...L.on].filter(Boolean):[...L.rh];
    const ans=X.on?p.onset:p.rhyme,others=shuf([...new Set(same.concat(shuf(pool2).slice(0,6)))].filter(y=>y!==ans)).slice(0,3);
    return choice(`Tiếng “${right}” có ${X.on?'âm đầu':'vần'} gì?`,`<div class="word">${esc(right)}</div>`,[ans].concat(others),ans,{txt:true,say:`Tiếng ${right} có ${X.on?'âm đầu':'vần'} gì?`,explain:`${right}: ${X.on?'âm đầu '+ans:'vần '+ans}.`})}
  const wrong=shuf(pool.filter(w=>!hasX(w,X)&&w!==right)).slice(0,3);if(wrong.length<2)return null;
  return choice(`Tiếng nào có ${tvLabel(X)}?`,'',[right].concat(wrong),right,{txt:true,say:`Tiếng nào có ${tvLabel(X)}?`,explain:`“${right}” có ${tvLabel(X)}.`})}
Object.keys(TV1_RANGES).forEach(c=>G[c]=lv=>tvRange(c,lv));
function tvTheme(n,lv){const list=TV2_CD[n].s.map(parseSent),save=BANK.sentences;BANK.sentences=list;
  try{return G[pick(lv===1?['t_dientu','t_doccau','t_vietdung']:['t_dientu','t_doccau','t_sapxep','t_demtieng','t_vietdung'])](lv)}finally{BANK.sentences=save}}
for(let n=1;n<=8;n++)G['t_cd'+n]=lv=>tvTheme(n,lv);

/* ---------- xử lý tiếng Việt: tách âm đầu, vần, dấu thanh ---------- */
const TV={
  TONES:['̀','́','̃','̉','̣'],
  ONS:['ngh','ng','gh','gi','kh','ph','th','tr','ch','nh','qu','b','c','d','đ','g','h','k','l','m','n','p','r','s','t','v','x'],
  parse(s){s=String(s).toLowerCase().normalize('NFC');const d=s.normalize('NFD');let tone='',pos=-1;
    for(let i=0;i<d.length;i++)if(TV.TONES.includes(d[i])){tone=d[i];pos=i}
    const base=d.replace(/[̣̀́̃̉]/g,'').normalize('NFC');let onset=TV.ONS.find(o=>base.startsWith(o))||'';let rhyme=base.slice(onset.length);
    if(onset==='gi'&&!rhyme){onset='g';rhyme='i'}return {s,d,base,onset,rhyme,tone,pos}},
  toneVariants(w){const p=TV.parse(w);if(!p.tone)return [w];return ['',...TV.TONES].map(t=>(p.d.slice(0,p.pos)+t+p.d.slice(p.pos+1)).normalize('NFC'))},
  toneName(t){return {'̀':'dấu huyền','́':'dấu sắc','̃':'dấu ngã','̉':'dấu hỏi','̣':'dấu nặng'}[t]||'thanh ngang'},
  pics(maxSyl){return BANK.words.filter(w=>w.e&&w.w.split(' ').length<=maxSyl).map(w=>Object.assign({p:TV.parse(w.w)},w))},
  emojiOf(word){const w=BANK.words.find(x=>x.w===String(word).toLowerCase()&&x.e);return w?w.e:''}
};

/* ================= danh sách bài (theo SGK Kết nối tri thức) ================= */
const TOPICS={
 toan:[
  {no:1,ch:'Các số từ 0 đến 10',items:[['m_dem10','Đếm số lượng','🔢','Bài 1, 2'],['m_nhieuit','Nhiều hơn, ít hơn, bằng nhau','🍎','Bài 3'],['m_sosanh10','So sánh số: >, <, =','⚖️','Bài 4'],['m_tachso','Mấy và mấy (tách số)','🔵','Bài 5'],['m_thutu10','Thứ tự các số, liền trước, liền sau','🔜','Bài 1, 2, 6'],['m_xepso10','Sắp xếp các số theo thứ tự','📶','Bài 4, 6']]},
  {no:2,ch:'Làm quen với một số hình phẳng',items:[['m_hinhphang','Hình vuông, tròn, tam giác, chữ nhật','🔺','Bài 7'],['m_demhinh','Đếm hình','🟦','Bài 7, 9'],['m_quyluat','Tìm quy luật, xếp hình','🔁','Bài 8, 9']]},
  {no:3,ch:'Phép cộng, phép trừ trong phạm vi 10',items:[['m_cong10','Phép cộng trong phạm vi 10','➕','Bài 10'],['m_tru10','Phép trừ trong phạm vi 10','➖','Bài 11'],['m_dienso10','Bảng cộng, bảng trừ: điền số','❓','Bài 12'],['m_ketqua','Phép tính nào có kết quả bằng…','🎯','Bài 12'],['m_sosanhpt','So sánh phép tính với số','🟰','Bài 13'],['m_dau','Điền dấu + hay −','➗','Bài 13'],['m_loivan10','Bài toán bằng hình, bằng lời','📝','Bài 10, 11, 13']]},
  {no:4,ch:'Làm quen với một số hình khối',items:[['m_hinhkhoi','Khối lập phương, khối hộp chữ nhật','🧊','Bài 14'],['m_vitri','Vị trí, định hướng trong không gian','↔️','Bài 15']]},
  {no:5,ch:'Ôn tập học kì 1',items:[['m_onhk1','Ôn tập học kì 1 (tổng hợp)','🏁','Bài 17–20']]},
  {no:6,ch:'Các số đến 100',items:[['m_so100doc','Số có hai chữ số: đọc, viết','💯','Bài 21'],['m_chuc','Chục và đơn vị','🔟','Bài 21'],['m_sosanh100','So sánh số có hai chữ số','⚖️','Bài 22'],['m_xepso100','Sắp xếp số có hai chữ số','📶','Bài 22, 24'],['m_thutu100','Bảng các số từ 1 đến 100','📋','Bài 23']]},
  {no:7,ch:'Độ dài và đo độ dài',items:[['m_daingan','Dài hơn, ngắn hơn','✏️','Bài 25'],['m_cm','Đơn vị đo độ dài: xăng-ti-mét','📏','Bài 26, 27']]},
  {no:8,ch:'Phép cộng, phép trừ (không nhớ) trong phạm vi 100',items:[['m_cong100','Phép cộng trong phạm vi 100','➕','Bài 29, 30'],['m_tru100','Phép trừ trong phạm vi 100','➖','Bài 31, 32'],['m_dattinh','Đặt tính rồi tính','🧮','Bài 29–32'],['m_loivan100','Bài toán có lời văn','📝','Bài 33']]},
  {no:9,ch:'Thời gian, giờ và lịch',items:[['m_dongho','Xem giờ đúng trên đồng hồ','⏰','Bài 34'],['m_thu','Các ngày trong tuần, xem lịch','📅','Bài 35, 36']]},
  {no:10,ch:'Ôn tập cuối năm',items:[['m_oncn','Ôn tập cuối năm (tổng hợp)','🏆','Bài 38–41']]}
 ],
 tv:[
  {ch:'Học âm, chữ, vần theo bài (Tập 1)',items:[['t_b1','a b c e ê o ô d đ ơ · dấu thanh','🅰️','Bài 1–10'],['t_b2','i k h l u ư ch kh m n g gi gh nh ng ngh','🔤','Bài 11–20'],
    ['t_b3','r s t tr th ia ua ưa ph qu v x y','📝','Bài 21–30'],['t_b4','an ăn ân … au âu êu iu ưu','🎵','Bài 31–45'],['t_b5','ac ăc âc … ang ăng âng','🎶','Bài 46–60'],
    ['t_b6','ong ông … ươi ươu','🎼','Bài 61–70'],['t_b7','ươc ươt … uyên uyêt','🏁','Bài 71–80']]},
  {ch:'Đọc theo chủ đề (Tập 2)',items:[1,2,3,4,5,6,7,8].map(n=>['t_cd'+n,TV2_CD[n].n,TV2_CD[n].ic,'Chủ đề '+n])},
  {ch:'Chữ cái và âm',items:[['t_chuhoa','Chữ thường – chữ in hoa','🔤'],['t_amdau','Âm đầu của tiếng','👂']]},
  {ch:'Ghép tiếng · Vần · Dấu thanh',items:[['t_ghep','Ghép âm và vần thành tiếng','🧩'],['t_van','Tìm vần của tiếng','🎵'],['t_timvan','Tiếng nào có vần…','🔎'],['t_dau','Dấu thanh','✍️'],['t_gheptu','Ghép tiếng thành từ','🔗']]},
  {ch:'Chính tả',items:[['t_chinhta','c/k, g/gh, ng/ngh','📏']]},
  {ch:'Từ ngữ',items:[['t_tuhinh','Từ và hình','🖼️'],['t_nhomtu','Xếp từ theo nhóm','🗂️']]},
  {ch:'Câu',items:[['t_dientu','Điền từ vào câu','✏️'],['t_doccau','Đọc câu, chọn hình','📖'],['t_sapxep','Sắp xếp thành câu','🔀'],['t_demtieng','Câu có mấy tiếng?','🔢'],['t_vietdung','Câu nào viết đúng?','✅']]}
 ],
 ta:[
  {ch:'Unit 1 – 4 · Review 1',items:[1,2,3,4].map(u=>['e_u'+u,'Unit '+u+'. '+EN_U[u].n,EN_U[u].ic,'Unit '+u+' · chữ '+EN_U[u].ph])},
  {ch:'Unit 5 – 8 · Review 2',items:[5,6,7,8].map(u=>['e_u'+u,'Unit '+u+'. '+EN_U[u].n,EN_U[u].ic,'Unit '+u+' · chữ '+EN_U[u].ph])},
  {ch:'Unit 9 – 12 · Review 3',items:[9,10,11,12].map(u=>['e_u'+u,'Unit '+u+'. '+EN_U[u].n,EN_U[u].ic,'Unit '+u+' · chữ '+EN_U[u].ph])},
  {ch:'Unit 13 – 16 · Review 4',items:[13,14,15,16].map(u=>['e_u'+u,'Unit '+u+'. '+EN_U[u].n,EN_U[u].ic,'Unit '+u+' · chữ '+EN_U[u].ph])},
  {ch:'Ôn tập cả sách',items:[['e_num','Numbers: số đếm 1 – 10','🔢','Unit 9, 16'],['e_abc','Letters: chữ cái và âm đầu','🔤','16 chữ cái'],['e_all','Từ vựng cả sách (Glossary)','📚','trang 74–75'],['e_sent','Mẫu câu cả sách','💬','Book map']]}
 ]
};
const TNAME={};Object.keys(TOPICS).forEach(s=>TOPICS[s].forEach(g=>g.items.forEach(it=>TNAME[it[0]]={name:it[1],icon:it[2],sub:s,ref:it[3]||''})));
const SUBNAME={toan:'Toán',tv:'Tiếng Việt',ta:'Tiếng Anh'};

/* ================= trang chính ================= */
function showView(v){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('on',x.id==='v-'+v));
  document.querySelectorAll('.nav button[data-v]').forEach(b=>b.classList.toggle('on',b.dataset.v===v));window.scrollTo(0,0)}
function goHome(){if(QZ&&!QZ.done&&!confirm('Dừng bài đang làm?'))return;QZ=null;stopSpeak();showView('home');renderHome()}
function stopSpeak(){try{speechSynthesis.cancel()}catch(e){}}
function setSub(s){SUB=s;document.body.dataset.sub=s;document.querySelectorAll('.subj-tab[data-sub]').forEach(b=>b.classList.toggle('on',b.dataset.sub===s));
  $('mixBtn').className='btn '+(s==='tv'?'orange':s==='ta'?'green':'primary');ls('hl1_sub',s);renderReview();renderTopics()}
function renderHome(){$('starTotal').textContent=STATS.stars;const nm=(ME&&ME.name)||'bé';$('helloName').textContent='Chào '+nm+'! 👋';
  const dd=new Date(),today=dd.getFullYear()+'-'+String(dd.getMonth()+1).padStart(2,'0')+'-'+String(dd.getDate()).padStart(2,'0'),done=STATS.days&&STATS.days[today]||0;
  $('helloSub').textContent=done?`Hôm nay bé đã học ${done} lượt. Giỏi lắm! ⭐ ${STATS.stars} sao`:'Hôm nay mình học gì nào? Mỗi câu đúng được 1 ⭐';
  $('helloAva').textContent=['🧒','👧','🦄','🐻','🐼','🦊'][(nm.length)%6];setSub(SUB)}
function renderTopics(){
  $('topicList').innerHTML=TOPICS[SUB].map((g,gi)=>`<div class="chapter">${g.no?'Chủ đề '+g.no+'. ':''}${esc(g.ch)}</div><div class="topics">${g.items.map(([code,name,icon])=>{
    const st=STATS.topics[code];const m=st?st.mastery:0,bl=baseLevel(code);
    return `<button class="topic" onclick="pickCount('${code}')"><div class="ic">${icon}</div><div style="flex:1;min-width:0"><div class="nm">${esc(name)}</div>${TNAME[code].ref?`<small style="margin-top:0">📘 SGK ${esc(TNAME[code].ref)}</small>`:''}<div class="bar"><i style="width:${m}%"></i></div><small>${st?`Thành thạo ${m}% · ${st.sessions} lượt`:'Chưa học'}${bl===3?' · <b style="color:#dc2626">mức Khó 🚀</b>':bl===2?' · <b style="color:#b45309">mức Vừa ⬆️</b>':''}</small></div></button>`}).join('')}</div>`).join('')}

/* Kho câu sai: lưu nguyên câu hỏi trong máy (đồng bộ qua trang GitHub), làm đúng lại thì xoá khỏi kho. */
function wbKey(){return 'hl1_wrong_'+(ME?ME.username:'')}
function wbGet(){try{return JSON.parse(ls(wbKey())||'[]')}catch(e){return []}}
function wbSet(a){ls(wbKey(),JSON.stringify(a.slice(-60)))}
function wbAdd(q){if(!q.key||!TNAME[q.code])return;const a=wbGet().filter(x=>x.k!==q.key);const c=JSON.parse(JSON.stringify(q));delete c.fromReview;a.push({k:q.key,code:q.code,q:c,t:Date.now()});wbSet(a)}
function wbDel(key){const a=wbGet();const b=a.filter(x=>x.k!==key);if(b.length!==a.length)wbSet(b)}
/* Bài hay sai: thành thạo dưới 80% hoặc sai từ 2 câu trở lên trong các lượt gần đây (lấy từ máy chủ nên máy nào cũng thấy). */
function weakCodes(sub){const cnt={};(STATS.recent||[]).forEach(r=>(r.wrong||[]).forEach(w=>{if(w.k)cnt[w.k]=(cnt[w.k]||0)+1}));
  const out=Object.keys(TNAME).filter(c=>TNAME[c].sub===sub&&((STATS.topics[c]&&STATS.topics[c].mastery<80)||cnt[c]>=2));
  return out.sort((a,b)=>((STATS.topics[a]||{}).mastery||0)-((STATS.topics[b]||{}).mastery||0))}
function renderReview(){const items=wbGet().filter(x=>TNAME[x.code]&&TNAME[x.code].sub===SUB),weak=weakCodes(SUB);
  $('reviewBox').innerHTML=items.length||weak.length?`<div style="flex:1 1 260px"><b>🔁 Ôn lại câu sai</b><div class="muted" style="font-size:14px">${items.length?`${items.length} câu bé làm sai đang chờ ôn lại`:'Chưa có câu sai lưu trên máy này'}${weak.length?` · Bài nên ôn: ${weak.slice(0,4).map(c=>esc(TNAME[c].name)).join(', ')}`:''}</div></div><button class="btn orange" onclick="pickCount('__review')">Ôn ngay</button>`
    :`<div><b>🔁 Ôn lại câu sai</b><div class="muted" style="font-size:14px">Chưa có câu sai nào. Bé giỏi quá! 🎉</div></div>`}
function reshuffle(q){q=JSON.parse(JSON.stringify(q));if(q.type==='choice'&&!q.keep){const c=q.opts[q.ans].t;q.opts=shuf(q.opts);q.ans=q.opts.findIndex(o=>o.t===c)}
  else if(q.type==='order'){let m=shuf(q.tokens),g=0;while(m.join(' ')===q.answer.join(' ')&&g++<10)m=shuf(q.tokens);q.tokens=m}q.fromReview=true;return q}
function startReview(n){closeModal();const items=wbGet().filter(x=>TNAME[x.code]&&TNAME[x.code].sub===SUB).reverse().slice(0,n).map(x=>reshuffle(x.q));
  let codes=weakCodes(SUB);if(!codes.length)codes=[...new Set(items.map(q=>q.code))];if(!codes.length)codes=TOPICS[SUB].flatMap(g=>g.items.map(x=>x[0]));
  const fill=items.length<n?buildQuestions(shuf(codes),n-items.length,false,items.map(q=>q.key)):[];const qs=shuf(items.concat(fill));
  if(!qs.length)return toast('Chưa có câu để ôn',true);
  QZ={code:'review_'+SUB,topic:'Ôn lại câu sai',sub:SUB,qs,i:0,ok:0,wrong:[],t0:Date.now(),done:false};showView('quiz');renderQ()}
function pickCount(code){const title=code==='__review'?'🔁 Ôn lại câu sai':code?TNAME[code].name:'Ôn tổng hợp '+SUBNAME[SUB];
  openModal(title,`<p class="muted" style="margin:0">Bé muốn làm bao nhiêu câu?</p><div class="count-pick">
    <button onclick="startQuiz('${code||''}',10)">10<small>Nhanh</small></button><button onclick="startQuiz('${code||''}',15)">15<small>Vừa</small></button><button onclick="startQuiz('${code||''}',20)">20<small>Nhiều</small></button></div>
    <p class="muted" style="font-size:13px;margin:0">Câu hỏi đổi mới mỗi lần, từ dễ đến khó. Bấm 🔊 để nghe đọc câu hỏi.</p>`)}

/* ================= làm bài ================= */
/* Mức bắt đầu theo thành thạo (5 lượt gần nhất, từ lượt thứ 2): ≥90% bắt đầu mức 3, ≥80% mức 2; dưới 50% thì tăng chậm hơn. */
function baseLevel(code){const st=STATS.topics[code];if(!st||st.sessions<2)return 1;return st.mastery>=90?3:st.mastery>=80?2:1}
function levelAt(code,i,n){const st=STATS.topics[code],slow=st&&st.sessions>=2&&st.mastery<50;const step=slow?(i<n/2?0:i<n*5/6?1:2):(i<n/3?0:i<n*2/3?1:2);return Math.min(3,baseLevel(code)+step)}
function qKey(code,q){return code+'|'+q.text+'|'+plain(q.vis||'').slice(0,40)+'|'+(q.type==='choice'?q.opts[q.ans].t:q.answer.join(' '))}
function buildQuestions(codes,n,forPrint,avoid){const qs=[],keys=new Set(avoid||[]);let guard=0;
  while(qs.length<n&&guard++<n*30){const i=qs.length,code=codes[i%codes.length],lv=levelAt(code,i,n);
    let q=null;try{q=G[code](lv)}catch(e){q=null}if(!q)continue;const key=qKey(code,q);if(keys.has(key)&&guard<n*25)continue;keys.add(key);q.code=code;q.key=key;qs.push(q)}
  return qs}
function startQuiz(code,n){if(code==='__review')return startReview(n);closeModal();PRAISE.forEach(p=>prefetch(p,'vi'));const codes=code?[code]:TOPICS[SUB].flatMap(g=>g.items.map(x=>x[0]));
  const qs=buildQuestions(code?[code]:shuf(codes),n);if(!qs.length)return toast('Chưa có câu hỏi cho bài này (kiểm tra sheet TU_VUNG / CAU).',true);
  QZ={code:code||(SUB+'_mix'),topic:code?TNAME[code].name:'Ôn tổng hợp',sub:code?TNAME[code].sub:SUB,qs,i:0,ok:0,wrong:[],t0:Date.now(),done:false};
  showView('quiz');renderQ()}
function quitQuiz(){if(confirm('Bé muốn dừng bài này à?')){QZ=null;stopSpeak();showView('home');renderHome()}}
function renderQ(){const q=QZ.qs[QZ.i],n=QZ.qs.length;$('qProg').style.width=(QZ.i/n*100)+'%';$('qNum').textContent=`Câu ${QZ.i+1}/${n}`;$('qStars').textContent=QZ.ok;
  QZ.lock=false;let h=`<div class="q-head"><button class="speak" id="spk" title="Nghe đọc">🔊</button><div class="q-text">${esc(q.text)}</div></div><div class="q-vis">${q.vis||''}</div>`;
  if(q.type==='choice'){const long=q.opts.some(o=>o.t.length>12);const cls=q.cls||(long||q.opts.length===2&&q.txt?'one':'');
    h+=`<div class="opts ${cls}">${q.opts.map((o,i)=>`<button class="opt${q.txt||o.t.length>3&&!/^<svg/.test(o.h)?' txt':''}" data-i="${i}">${o.h}</button>`).join('')}</div>`}
  else{h+=`<div class="order-line" id="oLine"></div><div class="chips" id="oChips">${q.tokens.map((t,i)=>`<button class="chip" data-i="${i}">${esc(t)}</button>`).join('')}</div><div class="form-actions" style="justify-content:center"><button class="btn green" id="oCheck" disabled>Kiểm tra ✓</button></div>`}
  h+='<div id="fb"></div>';$('qCard').innerHTML=h;
  const say=q.say!=null&&q.say!==''?q.say:(q.lang==='en'?'':q.text),sl=q.lang||'vi';$('spk').onclick=()=>speak(say||q.text,$('spk'),null,say?sl:'vi');
  if(q.type==='choice')$('qCard').querySelectorAll('.opt').forEach(b=>b.onclick=()=>answer(Number(b.dataset.i),b));else wireOrder(q);
  if(SET.auto&&say)setTimeout(()=>speak(say,$('spk'),null,sl),250);
  if(TTS_ON&&SET.cloud!==false){if(!say)prefetch(q.text,'vi');if(q.type==='choice'){const r=q.opts[q.ans].t;if(q.lang==='en'&&isEnText(r)){prefetch('Chưa đúng rồi. Đáp án đúng là','vi');prefetch(r,'en')}else prefetch('Chưa đúng rồi. Đáp án đúng là '+r,'vi')}else q.tokens.forEach(t=>prefetch(t,q.lang));
    const nq=QZ.qs[QZ.i+1];if(nq){const ns=nq.say!=null&&nq.say!==''?nq.say:(nq.lang==='en'?'':nq.text);if(ns)prefetch(ns,nq.lang||'vi')}}}
function wireOrder(q){const line=$('oLine'),chips=$('oChips'),chk=$('oCheck');const order=[];
  const sync=()=>{line.innerHTML=order.map((i,k)=>`<button class="chip" data-k="${k}">${esc(q.tokens[i])}</button>`).join('');chips.querySelectorAll('.chip').forEach(c=>c.classList.toggle('used',order.includes(Number(c.dataset.i))));chk.disabled=order.length!==q.tokens.length};
  chips.onclick=e=>{const c=e.target.closest('.chip');if(!c||QZ.lock)return;const i=Number(c.dataset.i);if(!order.includes(i)){order.push(i);speak(q.tokens[i],null,null,q.lang);sync()}};
  line.onclick=e=>{const c=e.target.closest('.chip');if(!c||QZ.lock)return;order.splice(Number(c.dataset.k),1);sync()};
  chk.onclick=()=>{if(QZ.lock)return;const got=order.map(i=>q.tokens[i]);const ok=got.join(' ').toLowerCase()===q.answer.join(' ').toLowerCase();finishAnswer(ok,got.join(' ')+q.punct,q.answer.join(' ')+q.punct,chk)}}
function answer(i,btn){if(QZ.lock)return;const q=QZ.qs[QZ.i],ok=i===q.ans;const all=$('qCard').querySelectorAll('.opt');
  all.forEach((b,k)=>{if(k===q.ans)b.classList.add('ok');else if(k===i)b.classList.add('bad');else b.classList.add('dim')});
  finishAnswer(ok,q.opts[i].t,q.opts[q.ans].t,btn)}
const PRAISE=['Đúng rồi!','Giỏi quá!','Tuyệt vời!','Hoan hô!','Bé làm tốt lắm!'];
function finishAnswer(ok,got,right,btn){QZ.lock=true;const q=QZ.qs[QZ.i];
  if(ok){QZ.ok++;if(q.key)wbDel(q.key);$('qStars').textContent=QZ.ok;beep('ok');flyStar(btn);const p=pick(PRAISE);speak(p);
    $('fb').innerHTML=`<div class="feedback ok"><p>✅ ${p}</p></div>`;setTimeout(nextQ,1300)}
  else{beep('bad');wbAdd(q);QZ.wrong.push({k:q.code,q:plain(q.text)+(q.type==='choice'&&q.vis&&!/<svg/.test(q.vis)?' '+plain(q.vis).slice(0,60):''),a:got,c:right});
    if(q.lang==='en'&&isEnText(right)){const qi=QZ.i;speak('Chưa đúng rồi. Đáp án đúng là',null,null,'vi',false,()=>{if(QZ&&QZ.i===qi&&!QZ.done)speak(right,null,null,'en')})}
    else speak('Chưa đúng rồi. Đáp án đúng là '+right);
    $('fb').innerHTML=`<div class="feedback bad"><p>💡 Đáp án đúng: <b>${esc(right)}</b><br><span style="font-size:15px">${esc(q.explain||'')}</span></p><button class="btn orange" onclick="nextQ()">Tiếp tục ➜</button></div>`}}
function nextQ(){if(!QZ||QZ.done)return;QZ.i++;if(QZ.i>=QZ.qs.length)return finishQuiz();renderQ()}
async function finishQuiz(){if(!QZ||QZ.done)return;QZ.done=true;stopSpeak();const n=QZ.qs.length,ok=QZ.ok,ratio=ok/n;const before=STATS.stars,earned=ok+(ok===n&&n>=10?3:0);
  const rec={sub:QZ.sub,code:QZ.code,topic:QZ.topic,n,ok,secs:Math.round((Date.now()-QZ.t0)/1000),wrong:QZ.wrong,at:Date.now()};
  const face=ratio===1?'🏆':ratio>=.8?'🌟':ratio>=.5?'😊':'💪',msg=ratio===1?'Xuất sắc! Đúng hết luôn!':ratio>=.8?'Giỏi lắm!':ratio>=.5?'Khá lắm, cố thêm chút nữa nhé!':'Cố lên, làm lại sẽ giỏi hơn!';
  const newSt=stickersBetween(before,before+earned);
  $('resultBox').innerHTML=`<div class="face">${face}</div><h2>${msg}</h2><div class="score">Bé làm đúng <b>${ok}/${n}</b> câu</div><div class="stars">+${earned} ⭐</div>
    ${ok===n&&n>=10?'<p class="muted">Thưởng thêm 3 ⭐ vì đúng hết!</p>':''}
    ${newSt.length?`<p style="margin:14px 0 0;font-size:18px">🎁 Bé nhận được sticker mới!</p><div class="newst">${newSt.join('')}</div>`:''}
    <div class="res-acts" style="margin-top:14px"><button class="btn green" onclick="startQuiz('${QZ.code.startsWith('review_')?'__review':QZ.code.endsWith('_mix')?'':QZ.code}',${n})">🔁 Làm lại</button><button class="btn" onclick="QZ=null;goHome()">🏠 Về trang chính</button></div>
    <p class="muted" id="saveNote" style="font-size:12px;margin-top:12px">Đang lưu kết quả…</p>`;
  showView('result');beep(ratio>=.5?'win':'ok');if(ratio>=.8)confetti(ratio===1?40:22);speak(msg+' Bé làm đúng '+ok+' trên '+n+' câu.');
  STATS.stars=before+earned;$('starTotal').textContent=STATS.stars;
  queuePush(rec);await flushQueue()}
function queueKey(){return 'hl1_queue_'+(ME?ME.username:'')}
function queuePush(r){const q=JSON.parse(ls(queueKey())||'[]');q.push(r);ls(queueKey(),JSON.stringify(q))}
async function flushQueue(){if(flushQueue.busy){flushQueue.again=true;return}flushQueue.busy=true;
  try{do{flushQueue.again=false;await flushQueue_()}while(flushQueue.again)}finally{flushQueue.busy=false}}
async function flushQueue_(){const q=JSON.parse(ls(queueKey())||'[]');if(!q.length)return;
  while(q.length){try{const r=await gas('saveResult',q[0]);q.shift();ls(queueKey(),JSON.stringify(q));STATS=r.stats}catch(e){if(/hết hạn/.test(e.message))return;const n=$('saveNote');if(n)n.textContent='Chưa lưu được (mất mạng?). App sẽ tự lưu lại lần sau.';return}}
  const n=$('saveNote');if(n)n.textContent='Đã lưu kết quả ✓';$('starTotal').textContent=STATS.stars}

/* ================= sticker ================= */
const STICKERS='🐶🐱🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🦄🐝🦋🐞🐢🐬🐳🦀🐙🌻🌈⭐🌙☀️🍓🍉🍦🧁🍭🎈🎁🎨🎹⚽🚀🚂🚁⛵🏰🎠👑💎🏆🥇'.match(/\p{Extended_Pictographic}/gu);
const PER_STICKER=15;
function stickersBetween(a,b){const out=[];for(let k=Math.floor(a/PER_STICKER);k<Math.floor(b/PER_STICKER)&&k<STICKERS.length;k++)out.push(STICKERS[k]);return out}
function showStickers(){if(QZ&&!QZ.done&&!confirm('Dừng bài đang làm?'))return;QZ=null;showView('stickers');const have=Math.min(STICKERS.length,Math.floor(STATS.stars/PER_STICKER));
  $('stickerNote').textContent=`Bé có ${STATS.stars} ⭐ – cứ ${PER_STICKER} sao được 1 sticker. Đã có ${have}/${STICKERS.length}. Còn ${PER_STICKER-STATS.stars%PER_STICKER} sao nữa là có sticker mới!`;
  $('stickerGrid').innerHTML=STICKERS.map((s,i)=>i<have?`<div class="sticker">${s}</div>`:`<div class="sticker lock">🔒</div>`).join('')}

/* ================= tiến bộ ================= */
let PROG_USER='';
async function showProgress(){if(QZ&&!QZ.done&&!confirm('Dừng bài đang làm?'))return;QZ=null;showView('progress');
  if(ME.role==='Quản trị'){try{const kids=await gas('kids');$('kidPick').innerHTML=kids.map(k=>`<button data-u="${esc(k.username)}" onclick="loadProgress('${esc(k.username)}')">${k.role==='Học sinh'?'🧒':'👤'} ${esc(k.name)} · ⭐${k.stars}<br><small class="muted">${k.week} lượt / 7 ngày</small></button>`).join('');
      loadProgress(PROG_USER||(kids.find(k=>k.role==='Học sinh')||kids[0]).username)}catch(e){toast(e.message,true)}}
  else{$('kidPick').innerHTML='';loadProgress(ME.username)}}
async function loadProgress(u){PROG_USER=u;document.querySelectorAll('#kidPick button').forEach(b=>b.classList.toggle('on',b.dataset.u===u));$('progBox').innerHTML='<p class="muted">Đang tải…</p>';
  try{const r=await gas('progress',u);renderProgress(r)}catch(e){$('progBox').innerHTML='';toast(e.message,true)}}
function renderProgress(r){const s=r.stats,days=Object.keys(s.days||{}),D=['CN','T2','T3','T4','T5','T6','T7'];let week='';
  for(let i=6;i>=0;i--){const d=new Date(Date.now()-i*864e5),k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),c=s.days[k]||0;week+=`<span class="${c?'on':''}">${D[d.getDay()]}<b>${c||'·'}</b></span>`}
  let totN=0,totOk=0;s.recent.forEach(x=>{totN+=x.n;totOk+=x.ok});
  const rows=Object.keys(TNAME).filter(c=>s.topics[c]).map(c=>{const t=s.topics[c];return `<tr><td>${TNAME[c].icon} ${esc(TNAME[c].name)}<br><small class="muted">${SUBNAME[TNAME[c].sub]}</small></td><td>${t.sessions}</td><td><span class="bar" style="--subc:${t.mastery>=80?'#16a34a':t.mastery>=50?'#f59e0b':'#dc2626'};--sub2:${t.mastery>=80?'#86efac':t.mastery>=50?'#fde68a':'#fca5a5'}"><i style="width:${t.mastery}%"></i></span>${t.mastery}%</td><td><small>${esc(t.last)}</small></td></tr>`}).join('');
  const weak=Object.keys(TNAME).filter(c=>s.topics[c]&&s.topics[c].mastery<70).map(c=>TNAME[c].name);
  $('progBox').innerHTML=`<div class="panel"><h3>📈 Tiến bộ của ${esc(r.user.name)}</h3><div class="kpis"><div class="kpi"><b>⭐ ${s.stars}</b><small>tổng số sao</small></div><div class="kpi"><b>${s.sessions}</b><small>lượt học</small></div><div class="kpi"><b>${days.length}</b><small>ngày đã học</small></div><div class="kpi"><b>${totN?Math.round(totOk*100/totN):0}%</b><small>đúng (40 lượt gần nhất)</small></div></div>
    <h3 style="margin-top:14px">7 ngày qua</h3><div class="week">${week}</div>${weak.length?`<p style="margin:12px 0 0">💡 Nên ôn thêm: <b>${weak.map(esc).join(', ')}</b></p>`:''}</div>
    <div class="panel"><h3>Mức thành thạo từng bài</h3>${rows?`<div style="overflow:auto"><table class="ptable"><tr><th>Bài</th><th>Lượt</th><th>Thành thạo (5 lượt gần nhất)</th><th>Học lần cuối</th></tr>${rows}</table></div>`:'<p class="muted">Chưa học bài nào.</p>'}</div>
    <div class="panel"><h3>Các lượt học gần đây</h3>${s.recent.map(x=>`<details class="sess"><summary><b>${esc(x.t)}</b> · ${esc(x.topic)} · <span style="color:${x.ok===x.n?'#16a34a':x.ok/x.n>=.5?'#b45309':'#dc2626'}">${x.ok}/${x.n} đúng</span> · ⭐${x.stars}${x.wrong.length?' · <u>xem câu sai</u>':''}</summary>
      ${x.wrong.map(w=>`<div class="w">❌ ${esc(w.q)} — bé chọn <b>${esc(w.a)}</b>, đúng là <b>${esc(w.c)}</b></div>`).join('')}</details>`).join('')||'<p class="muted">Chưa có lượt học nào.</p>'}</div>`}

/* ================= in phiếu ================= */
function showPrint(){if(QZ&&!QZ.done&&!confirm('Dừng bài đang làm?'))return;QZ=null;showView('print');setPrintSub(PSUB)}
function setPrintSub(s){PSUB=s;document.querySelectorAll('[data-psub]').forEach(b=>b.classList.toggle('on',b.dataset.psub===s));
  $('prTopics').innerHTML=TOPICS[s].map(g=>g.items.map(([c,n,ic])=>`<label><input type="checkbox" value="${c}"> ${ic} ${esc(n)}</label>`).join('')).join('')}
function prAll(v){$('prTopics').querySelectorAll('input').forEach(i=>i.checked=v)}
const LET='ABCD';
const EMO_ONLY=/^\p{Extended_Pictographic}\uFE0F?$/u;
const PV=q=>q.printVis!=null?q.printVis:(q.vis||'');
function makePaper(){const codes=[...$('prTopics').querySelectorAll('input:checked')].map(i=>i.value);if(!codes.length)return toast('Chọn ít nhất 1 bài',true);
  const n=Number($('prN').value),qs=buildQuestions(shuf(codes),n,true);
  const title='PHIẾU BÀI TẬP '+SUBNAME[PSUB].toUpperCase()+' LỚP 1';
  let h=`<h2>${title}</h2><div class="meta"><span>Họ và tên: ................................................</span><span>Ngày: ........ / ........ / ............</span></div>`;
  const keys=[];
  qs.forEach((q,i)=>{h+=`<div class="pq"><div class="t">Câu ${i+1}. ${esc(q.type==='order'?q.text:q.blank&&!q.vis?'Tính / điền vào chỗ chấm:':q.printText||q.text)}</div>`;
    if(q.type==='order'){h+=`<div class="v"><span class="sent">${q.tokens.map(esc).join(' / ')}</span></div><div class="wl"></div>`;keys.push(q.answer.join(' ')+q.punct)}
    else if(q.blank){h+=(PV(q)?`<div class="v">${PV(q)}</div>`:'')+`<div class="v"><span class="big" style="font-size:22px">${esc(q.blank)}</span></div>`;keys.push(q.opts[q.ans].t)}
    else{h+=(PV(q)?`<div class="v">${PV(q)}</div>`:'')+`<div class="po">${q.opts.map((o,k)=>`<span>☐ ${LET[k]}. ${o.h.startsWith('<svg')?o.h.replace(/width="\d+" height="\d+"/,'width="44" height="44"'):EMO_ONLY.test(o.h)?'<span class="em">'+o.h+'</span>':o.h}</span>`).join('')}</div>`;keys.push(LET[q.ans]+(/^<svg/.test(q.opts[q.ans].h)?'':' ('+q.opts[q.ans].t+')'))}
    h+='</div>'});
  if($('prKey').checked)h+=`<div class="keys"><h3>ĐÁP ÁN</h3><div>${keys.map((k,i)=>`<p style="margin:2px 0">Câu ${i+1}: ${esc(k)}</p>`).join('')}</div></div>`;
  $('paper').innerHTML=h;$('prActs').classList.remove('hidden');toast('Đã tạo phiếu '+qs.length+' câu')}
function doPrint(){$('printArea').innerHTML='<div class="paper">'+$('paper').innerHTML+'</div>';setTimeout(()=>{try{window.print()}catch(e){toast('Không mở được hộp in, hãy bấm Tải PDF',true)}},100)}
function loadPdfLib(){return window.html2pdf?Promise.resolve():new Promise((ok,no)=>{const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';sc.onload=ok;sc.onerror=()=>no(new Error('Chưa tải được thư viện PDF, kiểm tra mạng rồi thử lại'));document.head.appendChild(sc)})}
async function savePdf(){busy(true);try{await loadPdfLib()}catch(e){busy(false);return toast(e.message,true)}
  const name=({toan:'Phieu Toan lop 1',tv:'Phieu Tieng Viet lop 1',ta:'Phieu Tieng Anh lop 1'}[PSUB])+' '+new Date().toLocaleDateString('vi-VN').replace(/\D/g,'-')+'.pdf';
  html2pdf().set({margin:[10,10,10,10],filename:name,image:{type:'jpeg',quality:.95},html2canvas:{scale:2,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4'},pagebreak:{mode:['css','legacy'],avoid:'.pq'}})
    .from($('paper')).save().then(()=>{busy(false);toast('Đã tải PDF')}).catch(e=>{busy(false);toast('Lỗi tạo PDF: '+e.message,true)})}

/* ================= cài đặt ================= */
function cloudBoxHtml(){return TTS_ON?`<label class="chk"><input type="checkbox" id="sCloud" ${SET.cloud!==false?'checked':''}> Dùng giọng Google (hay hơn, vẫn đọc khi iPhone để im lặng)</label>`:'<p class="muted" style="font-size:13px;margin:0 0 8px">🔇 Đang dùng giọng có sẵn của máy: iPhone để im lặng sẽ không nghe. Quản trị nhập khoá Google Cloud để đọc được cả khi im lặng.</p>'}
/* Đổi trạng thái giọng Google và ghi luôn vào dữ liệu lưu trong máy (lần mở sau đúng ngay) */
function setTtsOn(on){TTS_ON=on;TTS_MEM.clear();try{const b=JSON.parse(ls('hl1_boot')||'null');if(b){b.tts=on;ls('hl1_boot',JSON.stringify(b))}}catch(e){}}
/* ===== 📊 Mức dùng giọng Google & chi phí (chỉ Quản trị) ===== */
const nf=n=>Math.round(n||0).toLocaleString('vi-VN'),vnd=n=>nf(n)+' đ',isoVN=s=>s?s.split('-').reverse().join('/'):'';
async function openUsage(){busy(true);try{renderUsage(await gas('ttsUsage'))}catch(e){toast(e.message,true)}finally{busy(false)}}
function renderUsage(r){const c=r.cfg,u=r.use,day=Math.max(1,r.day),dim=r.daysInMonth,[yy,mm]=r.month.split('-');
  const capTxt=c.capPct>=1000?'không giới hạn':c.capPct+'%';
  const tier=(k,name,price)=>{const used=u[k],free=r.free[k],pct=used/free*100,lim=c.capPct>=1000?Infinity:free*c.capPct/100;
    const avg=used/day,proj=avg*dim,over=Math.max(0,proj-free),cost=over/1e6*price*c.usd;
    let fc;if(used>=lim)fc=`🛑 Đã chạm giới hạn an toàn: tạm ngừng loại giọng này đến hết tháng.`;
    else if(avg>0&&lim!==Infinity&&used+avg*(dim-day)>=lim){const d=Math.min(dim,day+Math.ceil((lim-used)/avg));fc=`⏳ Theo tốc độ hiện nay sẽ chạm giới hạn an toàn khoảng <b>${d}/${+mm}</b>, sau đó app tự đổi giọng (không mất tiền).`}
    else fc=avg>0?`✅ Dự báo cả tháng ~${nf(proj)} ký tự (${Math.round(proj/free*100)}%) — vẫn trong phần miễn phí.`:'✅ Chưa dùng tháng này.';
    const col=pct>=c.capPct?'#dc2626':pct>=80?'#f59e0b':'#16a34a';
    return `<div style="border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin:0 0 10px"><b>${name}</b>
      <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:4px"><span>${nf(used)} / ${nf(free)} ký tự</span><b style="color:${col}">${pct<10?pct.toFixed(1):Math.round(pct)}%</b></div>
      <div class="bar" style="height:12px"><i style="width:${Math.min(100,pct)}%;background:${col}"></i></div>
      <p style="font-size:13px;margin:6px 0 0">${fc}</p>
      <p class="muted" style="font-size:12.5px;margin:4px 0 0">Trung bình ${nf(avg)} ký tự/ngày · Nếu bỏ giới hạn, tiền dự kiến tháng này: <b>${vnd(cost)}</b> (giá ${price} USD / 1 triệu ký tự vượt mức)</p></div>`};
  let trial='';if(c.trialEnd){const left=Math.ceil((new Date(c.trialEnd+'T00:00:00')-new Date())/864e5);
    trial=`<p style="font-size:13.5px;margin:0 0 6px">🎁 Tín dụng dùng thử: <b>${vnd(c.trialCredit)}</b> · hết hạn <b>${isoVN(c.trialEnd)}</b> (${left>0?'còn '+left+' ngày':'đã hết hạn — vào Google Cloud bấm “Nâng cấp” để giọng Google chạy tiếp'})</p>`}
  const hist=r.hist.map(h=>`<tr><td>${h.m.split('-').reverse().join('/')}</td><td style="text-align:right">${nf(h.premium)}</td><td style="text-align:right">${nf(h.standard)}</td><td style="text-align:right">${nf(h.req)}</td></tr>`).join('');
  const sel=(v,l)=>`<option value="${v}"${Number(c.capPct)===v?' selected':''}>${l}</option>`;
  openModal('📊 Mức dùng giọng Google',`<div class="u-form">
    <p style="font-size:14px;margin:0 0 8px">Tháng <b>${+mm}/${yy}</b> · ngày ${day}/${dim} · giới hạn an toàn: <b>${capTxt}</b> phần miễn phí ${r.on?'':'· <span style="color:#dc2626">giọng Google đang tắt</span>'}</p>
    <div style="background:#ecfdf5;border-radius:12px;padding:8px 12px;margin:0 0 10px;font-size:14px">💰 Tiền phải trả tháng này: <b>${c.capPct<=100?'0 đ':'có thể phát sinh nếu vượt phần miễn phí'}</b>${c.capPct<=100?' — app tự dừng trước khi hết phần miễn phí.':''}</div>
    ${tier('premium','🎙️ Giọng hay (Neural2 / WaveNet)',c.pPremium)}
    ${tier('standard','🔈 Giọng thường (Standard) — dùng khi giọng hay chạm giới hạn',c.pStandard)}
    ${trial}
    <p class="muted" style="font-size:12.5px;margin:0 0 10px">Một câu hỏi ~30–60 ký tự → 1 triệu ký tự ≈ 20.000 lần đọc. Câu đọc lại trong 6 giờ lấy từ bộ nhớ đệm, không tính. Email cảnh báo gửi tới chủ Apps Script khi đạt 50%, 80% và khi chạm giới hạn.</p>
    <details style="margin:0 0 10px"><summary style="cursor:pointer;font-weight:700">Lịch sử 6 tháng</summary>
      <table class="ptable" style="width:100%;font-size:13px;margin-top:6px"><tr><th style="text-align:left">Tháng</th><th>Giọng hay</th><th>Giọng thường</th><th>Lượt gọi</th></tr>${hist}</table></details>
    <details><summary style="cursor:pointer;font-weight:700">⚙️ Cài đặt giới hạn & giá</summary>
      <label>Giới hạn an toàn<select id="uCap" class="select">${sel(50,'50% phần miễn phí')}${sel(80,'80% phần miễn phí')}${sel(90,'90% phần miễn phí (khuyên dùng)')}${sel(100,'100% phần miễn phí')}${sel(1000,'Không giới hạn (CÓ THỂ MẤT TIỀN)')}</select></label>
      <label>Tín dụng dùng thử còn (đ)<input id="uCredit" class="input" type="number" min="0" value="${c.trialCredit||''}" placeholder="vd 7754701"></label>
      <label>Ngày hết hạn dùng thử<input id="uEnd" class="input" type="date" value="${c.trialEnd||''}"></label>
      <label>Tỷ giá 1 USD (đ)<input id="uUsd" class="input" type="number" value="${c.usd}"></label>
      <label>Giá giọng hay (USD / 1 triệu ký tự)<input id="uPP" class="input" type="number" step="0.1" value="${c.pPremium}"></label>
      <label>Giá giọng thường (USD / 1 triệu ký tự)<input id="uPS" class="input" type="number" step="0.1" value="${c.pStandard}"></label>
      <p class="muted" style="font-size:12px;margin:0 0 8px">Giá & phần miễn phí theo bảng giá Google Cloud Text-to-Speech; Google đổi giá thì sửa ở đây.</p>
      <div class="form-actions" style="justify-content:flex-start"><button class="btn primary" type="button" onclick="saveUsageCfg()">Lưu cài đặt</button></div></details></div>`)}
async function saveUsageCfg(){const cap=Number($('uCap').value);
  if(cap>100&&!confirm('Bỏ giới hạn thì khi dùng quá phần miễn phí Google sẽ TÍNH TIỀN vào thẻ. Vẫn bỏ giới hạn?'))return;
  busy(true);try{const r=await gas('ttsUsageCfg',{capPct:cap,trialCredit:$('uCredit').value,trialEnd:$('uEnd').value,usd:$('uUsd').value,pPremium:$('uPP').value,pStandard:$('uPS').value});
    renderUsage(r);toast('Đã lưu ✓');gas('ttsStatus').then(s=>setTtsOn(!!s.on)).catch(()=>{})}catch(e){toast(e.message,true)}finally{busy(false)}}
function openSettings(){const has=!!VOICE;loadVoice();
  const enOpts=EN_VOICES.slice(0,25).map(v=>`<option value="${esc(v.name)}"${VOICE_EN&&v.name===VOICE_EN.name?' selected':''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('');
  openModal('⚙️ Cài đặt',`<div class="u-form"><label class="chk"><input type="checkbox" id="sAuto" ${SET.auto?'checked':''}> Tự đọc câu hỏi khi sang câu mới</label>
    <label class="chk"><input type="checkbox" id="sSound" ${SET.sound?'checked':''}> Âm thanh khi đúng / sai</label>
    <div id="cloudBox">${cloudBoxHtml()}</div>
    ${ME&&ME.role==='Quản trị'?`<div style="border:2px dashed var(--line);border-radius:14px;padding:10px 12px;margin:0 0 12px"><b>🎙️ Giọng Google Cloud (chỉ Quản trị)</b>
      <p class="muted" style="font-size:12.5px;margin:4px 0 8px" id="ttsInfo">Đang kiểm tra…</p>
      <div style="display:flex;gap:8px"><input id="ttsKey" class="input" placeholder="Dán khoá API (AIza…)" autocomplete="off"><button class="btn primary" type="button" onclick="saveTtsKey()">Lưu</button></div>
      <p class="muted" style="font-size:12px;margin:6px 0 0">Cách lấy khoá: xem mục “Giọng Google Cloud” trong HUONG_DAN.md. Để trống rồi Lưu = tắt.</p>
      <div class="form-actions" style="justify-content:flex-start;margin:8px 0 0"><button class="btn" type="button" onclick="openUsage()">📊 Mức dùng & chi phí</button></div></div>`:''}
    <label>Tốc độ đọc tiếng Việt<select id="sRate" class="select"><option value="0.7">Chậm</option><option value="0.85">Vừa</option><option value="1">Nhanh</option></select></label>
    <p class="muted" style="font-size:13px;margin:0 0 8px">${has?(TTS_ON&&SET.cloud!==false?'Giọng tiếng Việt của máy (dự phòng): ':'Giọng tiếng Việt: ')+esc(VOICE.name):'⚠️ Máy này chưa có giọng đọc tiếng Việt. iPhone: Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói › Tiếng Việt. Android: cài “Dịch vụ chuyển văn bản thành giọng nói của Google” và tải tiếng Việt.'}${IN_ZALO?'<br>📱 Đang mở trong Zalo – nên bấm ⋯ › Mở bằng Safari / Chrome để đọc to ổn định hơn.':''}</p>
    <div class="form-actions" style="justify-content:flex-start;margin:0 0 12px"><button class="btn" type="button" onclick="speak('Xin chào bé! Mình cùng học nhé.',null,m=>{$('spkStat').textContent=m})">🔊 Nghe thử tiếng Việt</button></div>
    ${TTS_ON&&SET.cloud!==false?'<p style="font-size:13px;margin:0 0 8px;color:#047857">✅ Đang đọc cả tiếng Việt và tiếng Anh bằng <b>giọng Google</b>. Các giọng của máy bên dưới chỉ dùng khi mất mạng.</p>':''}
    <label>${TTS_ON&&SET.cloud!==false?'Giọng tiếng Anh của máy (dự phòng)':'Giọng tiếng Anh'}${enOpts?`<select id="sEnVoice" class="select">${enOpts}</select>`:'<span class="muted" style="font-weight:600">Máy chưa có giọng tiếng Anh.</span>'}</label>
    <label>Tốc độ đọc tiếng Anh<select id="sRateEn" class="select"><option value="0.65">Rất chậm</option><option value="0.8">Chậm</option><option value="0.9">Vừa</option><option value="1">Bình thường</option></select></label>
    <p class="muted" style="font-size:12.5px;margin:0 0 8px">Mẹo: chọn giọng có chữ <b>Enhanced / Nâng cao / Premium</b> (iPhone), <b>Google US English</b> (Android) hoặc <b>Natural</b> (máy tính, trình duyệt Edge) là đọc hay nhất.
      iPhone tải thêm giọng hay: Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói › Tiếng Anh › chọn <b>Samantha (Nâng cao)</b> hoặc <b>Ava (Cao cấp)</b> › tải về.</p>
    <div class="form-actions" style="justify-content:flex-start;margin:0 0 6px"><button class="btn" type="button" onclick="speak('Hello! I have a car. This is a dog.',null,m=>{$('spkStat').textContent=m},'en')">🔊 Nghe thử tiếng Anh</button></div>
    <p id="spkStat" style="font-size:14px;margin:0 0 6px;color:#b45309"></p>
    <div class="form-actions" style="justify-content:flex-end;flex-wrap:wrap"><button class="btn" type="button" onclick="openChangePw()">🔑 Đổi mật khẩu</button> <button class="btn" type="button" onclick="logout()">Đăng xuất</button></div></div>`);
  $('sRate').value=String(SET.rate);$('sRateEn').value=String(SET.rateEn||0.8);
  /* Hỏi thẳng máy chủ (không dựa vào dữ liệu cũ lưu trong máy): Quản trị vừa dán khoá thì máy bé bật ngay */
  gas('ttsStatus').then(r=>{
    if(!!r.on!==TTS_ON){setTtsOn(!!r.on);if($('cloudBox')){$('cloudBox').innerHTML=cloudBoxHtml();if($('sCloud'))$('sCloud').onchange=save}}
    const v=r.voices||{};if($('ttsInfo'))$('ttsInfo').textContent=r.on?`Đang bật · khoá ${r.masked||''} · giọng ${v.vi||''} / ${v.en||''}`:'Chưa có khoá: đang dùng giọng của máy.'})
   .catch(e=>{if($('ttsInfo'))$('ttsInfo').textContent=e.message;
    if($('cloudBox'))$('cloudBox').insertAdjacentHTML('beforeend',`<p style="font-size:12.5px;margin:0 0 8px;color:#b91c1c">⚠️ Chưa hỏi được máy chủ: ${esc(e.message)}</p>`)});
  const save=()=>{SET.auto=$('sAuto').checked;SET.sound=$('sSound').checked;if($('sCloud'))SET.cloud=$('sCloud').checked;SET.rate=Number($('sRate').value);SET.rateEn=Number($('sRateEn').value);
    if($('sEnVoice'))SET.enVoice=$('sEnVoice').value;ls('hl1_set',JSON.stringify(SET));loadVoice()};
  ['sAuto','sSound','sCloud','sRate','sRateEn','sEnVoice'].forEach(id=>{if($(id))$(id).onchange=save})}

async function saveTtsKey(){const k=$('ttsKey').value.trim();try{busy(true);const r=await gas('ttsSetKey',k);setTtsOn(!!r.on);
  $('ttsInfo').textContent=r.on?`Đang bật · khoá ${r.masked} · giọng ${r.voices.vi} / ${r.voices.en}`:'Đã tắt giọng Google.';$('ttsKey').value='';toast(r.on?'Đã bật giọng Google ✓':'Đã tắt giọng Google')}
  catch(e){toast(e.message,true);$('ttsInfo').textContent='⚠️ '+e.message}finally{busy(false)}}
/* ================= đăng nhập & tài khoản ================= */
function openModal(t,h){$('mTitle').textContent=t;$('mBody').innerHTML=h;$('uModal').classList.remove('hidden')}
function closeModal(){$('uModal').classList.add('hidden');$('mBody').innerHTML=''}
function forgetToken(){TOKEN='';ls('hl1_token',null);ls('hl1_boot',null)}
function showLogin(msg){document.body.classList.add('locked');$('loginBox').classList.remove('hidden');$('lUser').value=ls('hl1_lastUser')||'';$('lPass').value='';$('lMsg').textContent=msg||''}
function doLogin(){const u=$('lUser').value.trim().toLowerCase(),p=$('lPass').value,b=$('lBtn');b.disabled=true;b.textContent='Đang vào…';$('lMsg').textContent='';
  run('login',u,p).then(r=>{if((ls('hl1_lastUser')||'')!==u)ls('hl1_boot',null);TOKEN=r.token;ls('hl1_token',r.token);ls('hl1_lastUser',u);setMe(r.me);startApp()}).catch(e=>{$('lMsg').textContent=e.message}).finally(()=>{b.disabled=false;b.textContent='Vào học thôi! 🚀'})}
function setMe(me){ME=me;document.body.classList.toggle('role-admin',me.role==='Quản trị');document.querySelectorAll('.need-admin').forEach(x=>x.classList.toggle('hidden',me.role!=='Quản trị'));
  document.body.classList.remove('locked');$('loginBox').classList.add('hidden')}
function logout(){if(!confirm('Đăng xuất khỏi app?'))return;closeModal();forgetToken();QZ=null;showView('home');showLogin()}
function todayISO(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function applyBoot(b){ME=b.me;BANK=b.bank||BANK;STATS=b.stats||STATS;TTS_ON=!!b.tts;setMe(b.me)}
/* Mở app: nếu máy đã lưu dữ liệu lần trước thì hiện NGAY (không chờ máy chủ), rồi tải bản mới ở nền.
   Mất mạng vẫn học được; kết quả được giữ trong máy và tự gửi khi có mạng. */
async function startApp(){let cached=null;try{cached=JSON.parse(ls('hl1_boot')||'null')}catch(e){}
  if(cached&&cached.me){
    if(cached.me.expires&&todayISO()>cached.me.expires){forgetToken();return showLogin('Tài khoản đã hết hạn sử dụng (dùng đến '+isoToVN(cached.me.expires)+'). Nhờ bố mẹ liên hệ để gia hạn nhé.')}
    applyBoot(cached);SUB=ls('hl1_sub')||'toan';showView('home');renderHome()
  }else busy(true);
  try{const b=await gas('bootstrap');ls('hl1_boot',JSON.stringify(b));applyBoot(b);BOOT_AT=Date.now();
    if(!cached){SUB=ls('hl1_sub')||'toan';showView('home');renderHome()}
    else if($('v-home').classList.contains('on')&&!QZ)renderHome();
    flushQueue()}
  catch(e){if(!cached)toast(e.message,true)}
  finally{busy(false)}}
/* Điện thoại hay để app mở ngầm nhiều ngày: mỗi lần quay lại app (cách lần trước > 2 phút) thì lấy lại dữ liệu
   từ máy chủ (giọng Google vừa bật, bài/từ mới, sao…), không làm gián đoạn bài đang làm. */
let BOOT_AT=0;
function refreshBoot(){if(!TOKEN||!BOOT_AT||Date.now()-BOOT_AT<120000||navigator.onLine===false)return;BOOT_AT=Date.now();
  gas('bootstrap').then(b=>{ls('hl1_boot',JSON.stringify(b));applyBoot(b);
    if($('v-home').classList.contains('on')&&!(QZ&&!QZ.done))renderHome()}).catch(()=>{})}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshBoot()});
function openChangePw(){openModal('🔑 Đổi mật khẩu',`<form class="u-form" id="pwForm"><label>Mật khẩu hiện tại<input id="pwOld" class="input" type="password" autocomplete="current-password"></label>
  <label>Mật khẩu mới (ít nhất 6 ký tự)<input id="pwNew" class="input" type="password" autocomplete="new-password"></label><label>Nhập lại mật khẩu mới<input id="pwNew2" class="input" type="password" autocomplete="new-password"></label>
  <div class="form-actions"><button class="btn primary" type="submit">Đổi mật khẩu</button></div></form>`);
  $('pwForm').onsubmit=e=>{e.preventDefault();if($('pwNew').value!==$('pwNew2').value)return toast('Hai lần nhập mật khẩu mới chưa khớp',true);
    run('changePassword',TOKEN,$('pwOld').value,$('pwNew').value).then(r=>{TOKEN=r.token;ls('hl1_token',r.token);closeModal();toast('Đã đổi mật khẩu')}).catch(err=>toast(err.message,true))}}
let USERS={list:[],url:''};
async function showAccounts(){if(QZ&&!QZ.done&&!confirm('Dừng bài đang làm?'))return;QZ=null;showView('accounts');try{busy(true);renderUsers(await gas('listUsers'))}catch(e){toast(e.message,true)}finally{busy(false)}}
function renderUsers(r){USERS={list:r.users||[],url:r.url||''};$('pubUrl').value=USERS.url;
  $('userList').innerHTML=USERS.list.map((u,i)=>`<div class="urow${u.active&&!u.expired?'':' off'}"><div class="nm"><b>${u.role==='Học sinh'?'🧒':'👤'} ${esc(u.name||u.username)}</b><small>${esc(u.username)} · ${esc(u.role)}${u.expired?` · <span class="exp-red">hết hạn từ ${isoToVN(u.expires)}</span>`:u.expires?' · dùng đến '+isoToVN(u.expires):''}${u.active?'':' · đã khóa'}${u.lastLogin?' · vào lần cuối '+esc(u.lastLogin):''}</small></div>
    <button class="btn sm" onclick="editUser(${i})">Sửa</button><button class="btn sm" onclick="showCreds(USERS.list[${i}].username,null,USERS.list[${i}].expires)">📋 Gửi thông tin</button>
    ${ME&&u.username===ME.username?'':`<button class="btn sm" onclick="resetUserPw(${i})">Đặt lại MK</button><button class="btn sm" onclick="delUser(${i})">Xóa</button>`}</div>`).join('')||'<p class="muted">Chưa có tài khoản.</p>'}
function editUser(i){const u=i>=0?USERS.list[i]:{username:'',name:'',role:'Học sinh',active:true,expires:''};
  openModal(i>=0?'Sửa tài khoản':'Thêm tài khoản',`<form class="u-form" id="uForm">
    <label>Tên đăng nhập<input id="uName" class="input" value="${esc(u.username)}" ${i>=0?'disabled':''} placeholder="vd: 0848355888 hoặc be.na" autocapitalize="off"></label>
    <label>Tên của bé<input id="uFull" class="input" value="${esc(u.name)}" maxlength="60" placeholder="vd: Bé Na"></label>
    <label>Vai trò<select id="uRole" class="select"><option value="Học sinh"${u.role==='Học sinh'?' selected':''}>Học sinh – học, in phiếu, xem tiến bộ của mình</option><option value="Quản trị"${u.role==='Quản trị'?' selected':''}>Quản trị – tạo tài khoản, xem tiến bộ mọi bé</option></select></label>
    ${i>=0?'':'<label>Mật khẩu<input id="uPass" class="input" placeholder="trùng tên đăng nhập" autocomplete="off"><small class="muted">Để trống = trùng tên đăng nhập.</small></label>'}
    <label class="chk"><input type="checkbox" id="uNoExp" ${u.expires?'':'checked'}> Không giới hạn ngày dùng</label>
    <label id="uExpBox">Ngày cuối cùng được dùng<input id="uExp" class="input" type="date" value="${esc(u.expires||'')}"></label>
    <label class="chk"><input type="checkbox" id="uAct" ${u.active?'checked':''}> Đang hoạt động (bỏ tick = khóa)</label>
    <div class="form-actions"><button class="btn primary" type="submit">Lưu</button></div></form>`);
  const showExp=()=>{$('uExpBox').style.display=$('uNoExp').checked?'none':''};$('uNoExp').onchange=showExp;showExp();
  $('uForm').onsubmit=async e=>{e.preventDefault();const noExp=$('uNoExp').checked,exp=noExp?'':$('uExp').value;if(!noExp&&!exp)return toast('Chọn ngày cuối cùng hoặc tick Không giới hạn',true);
    const x={isNew:i<0,username:$('uName').value.trim().toLowerCase(),name:$('uFull').value,role:$('uRole').value,active:$('uAct').checked,expires:exp};if(i<0)x.password=$('uPass').value.trim()||x.username;
    try{busy(true);const r=await gas('saveUser',x);renderUsers(r);if(x.isNew)showCreds(x.username,x.password,x.expires);else{closeModal();toast('Đã lưu tài khoản')}}catch(err){toast(err.message,true)}finally{busy(false)}}}
async function resetUserPw(i){const u=USERS.list[i];if(!confirm(`Đặt lại mật khẩu của ${u.username} thành "${u.username}"?`))return;
  try{busy(true);renderUsers(await gas('resetPassword',u.username));showCreds(u.username,u.username,u.expires)}catch(e){toast(e.message,true)}finally{busy(false)}}
async function delUser(i){const u=USERS.list[i];if(!confirm('Xóa tài khoản '+u.username+'? (kết quả học cũ vẫn giữ trong sheet KET_QUA)'))return;
  try{busy(true);renderUsers(await gas('deleteUser',u.username));toast('Đã xóa tài khoản')}catch(e){toast(e.message,true)}finally{busy(false)}}
async function savePubUrl(){try{busy(true);renderUsers(await gas('setPublicUrl',$('pubUrl').value));toast('Đã lưu link')}catch(e){toast(e.message,true)}finally{busy(false)}}
function showCreds(username,pw,expires){const again=pw==null;
  const text=['Bé vui học lớp 1 – thông tin đăng nhập','Link: '+(USERS.url||'(dán link app)'),'Tên đăng nhập: '+username,'Mật khẩu: '+(again?'như đã gửi lần trước (quên thì báo để cấp lại)':pw),
    'Thời hạn: '+(expires?'dùng đến hết ngày '+isoToVN(expires):'không giới hạn'),'Mở link trên điện thoại, đăng nhập là học được ngay.'].join('\n');
  openModal(again?'Gửi lại thông tin đăng nhập':'Thông tin đăng nhập',`<p class="muted" style="margin-top:0">${again?'App không xem lại được mật khẩu cũ (đã mã hóa). Quên thì bấm Đặt lại MK.':'Sao chép rồi gửi qua Zalo. Mật khẩu chỉ hiện ở đây.'}</p>
    <textarea id="credTxt" class="cred-box" readonly></textarea><div class="form-actions"><button class="btn primary" type="button" id="credCopy">📋 Sao chép</button></div>`);
  $('credTxt').value=text;
  $('credCopy').onclick=()=>{const t=$('credTxt');t.focus();t.select();let ok=false;try{ok=document.execCommand('copy')}catch(e){}if(ok)return toast('Đã sao chép – mở Zalo và dán để gửi');
    if(navigator.clipboard)navigator.clipboard.writeText(t.value).then(()=>toast('Đã sao chép'),()=>toast('Chữ đã bôi đen, nhấn giữ để sao chép',true));else toast('Chữ đã bôi đen, nhấn giữ để sao chép',true)}}

/* Bản trước chạy trong khung (iframe) của trang GitHub; trang đó giữ hộ các khoá hl1_* trong 'bridge_hoclop1'.
   Nay app chạy thẳng trên GitHub (cùng địa chỉ) nên chép các khoá đó sang để bé không phải đăng nhập lại. */
function migrateBridge(){try{const o=JSON.parse(localStorage.getItem('bridge_hoclop1')||'{}')||{};
  Object.keys(o).forEach(k=>{if(k.startsWith('hl1_')&&localStorage.getItem(k)===null)localStorage.setItem(k,o[k])})}catch(e){}}
function fmtVer(v){const p=v.split('-');return 'Phiên bản: '+p[0].split('.').reverse().join('/')+(p[1]?' (lần '+p[1]+')':'')}
/* Service worker: app mở ngay từ bộ nhớ đệm, chạy offline; tự kiểm tra bản mới khi quay lại app và mỗi 5 phút. */
function swInit(){if(!('serviceWorker' in navigator)||!(location.protocol==='https:'||location.hostname==='localhost'))return;
  const had=!!navigator.serviceWorker.controller;let reg=null,pending=false;
  const check=()=>{if(reg&&navigator.onLine!==false)reg.update().catch(()=>{})};
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>{reg=r;check()}).catch(()=>{});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check()});
  window.addEventListener('online',check);setInterval(check,5*60*1000);
  const reload=()=>{try{sessionStorage.setItem('hl1_updated','1')}catch(e){}location.reload()};
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!had||pending)return;pending=true;
    if(QZ&&!QZ.done){toast('Đã có phiên bản mới, sẽ cập nhật khi bé làm xong bài này.');const t=setInterval(()=>{if(!QZ||QZ.done){clearInterval(t);reload()}},2000)}else reload()});
  try{if(sessionStorage.getItem('hl1_updated')){sessionStorage.removeItem('hl1_updated');setTimeout(()=>toast('Đã cập nhật phiên bản mới ✨'),500)}}catch(e){}}

document.addEventListener('DOMContentLoaded',()=>{
  $('appVer').textContent=fmtVer(APP_VERSION);
  $('loginForm').onsubmit=e=>{e.preventDefault();doLogin()};
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
  window.addEventListener('online',()=>{if(TOKEN)flushQueue()});
  swInit();migrateBridge();
  Object.assign(SET,JSON.parse(ls('hl1_set')||'{}'));
  if(typeof APP_URL==='undefined'||/DAN_MA/.test(APP_URL))return showLogin('Chưa cấu hình máy chủ: sửa APP_URL trong tệp config.js.');
  TOKEN=ls('hl1_token')||'';if(!TOKEN)return showLogin();
  startApp();
});
