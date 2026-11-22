/* MORPHOS: a small underwater score, synthesised entirely on this device. */
(() => {
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const hz=n=>440*Math.pow(2,(n-69)/12);
// An original 16-bar, 75 BPM theme. Each event is [eighth-note position,
// semitones above the tonic, length in beats]. The third phrase answers the
// opening motif; the final phrase returns home and leaves room to breathe.
const MUSIC_MELODY=[
[[0,24,1.2],[2,27,.9],[4,31,.9],[6,29,.45],[7,27,.65]],
[[0,24,1.8],[3,22,.9],[5,27,1.3]],
[[0,22,1.2],[2,27,.9],[4,31,.9],[6,29,.45],[7,27,.65]],
[[0,26,1.1],[2,24,.9],[4,22,2.3]],
[[0,24,1.2],[2,27,.9],[4,31,.9],[6,34,.45],[7,31,.65]],
[[0,27,2],[4,24,1],[6,22,.45],[7,24,.65]],
[[0,31,1.2],[2,29,.9],[4,27,1],[6,24,.9]],
[[0,26,1.5],[3,22,1.2],[6,24,.9]],
[[0,32,1.2],[2,31,.9],[4,29,1],[6,24,.9]],
[[0,27,1.8],[3,24,1.4],[6,27,.45],[7,31,.65]],
[[0,31,1.2],[2,34,.9],[4,31,.9],[6,29,.45],[7,27,.65]],
[[0,29,1.5],[3,26,1],[5,24,1],[7,22,.65]],
[[0,24,1.2],[2,27,.9],[4,31,1],[6,27,.9]],
[[0,24,1.8],[3,22,.9],[5,27,1.3]],
[[0,26,1.2],[2,29,.9],[4,24,1],[6,22,.9]],
[[0,24,3.1]]
];
const MUSIC_CHORDS=[
{bass:0,notes:[12,19,22,27]},       // Minor ninth.
{bass:-4,notes:[8,15,19,24]},      // Relative major seventh.
{bass:3,notes:[15,19,22,26]},
{bass:-2,notes:[10,17,24,26]},
{bass:5,notes:[12,17,20,27]},
{bass:-5,notes:[15,19,22,26]}
];
const MUSIC_HARMONY=[0,1,2,3,0,1,2,3,4,1,5,3,0,1,3,0];
class MorphosAudio {
constructor(){
this.context=null;this.enabled=false;this._token=0;this._timer=null;
this._nodes=[];this._voices=new Set();this._limits={};this._pads=[];
this._lastUpdate=-1;this._lastDrop=-10;this._lastHeart=-10;
this._root=40;this._seed=-1;this._biome=-1;this._bossTheme='';this._state=null;
this._musicVoices=new Set();this._musicStart=null;this._musicCursor=0;this._musicRoot=40;
}
_build(){
this._drone=null;
const Audio=window.AudioContext||window.webkitAudioContext;
if(!Audio)throw new Error('Web Audio is unavailable.');
const c=this.context=new Audio();
const keep=n=>(this._nodes.push(n),n);
this._bus=keep(c.createGain());this._ambient=keep(c.createGain());
this._ambient.gain.value=.8;
this._filter=keep(c.createBiquadFilter());this._filter.type='lowpass';
this._filter.frequency.value=2300;this._filter.Q.value=.3;
const mix=keep(c.createGain()),comp=keep(c.createDynamicsCompressor());
comp.threshold.value=-18;comp.knee.value=18;comp.ratio.value=4;
comp.attack.value=.008;comp.release.value=.25;
this._master=keep(c.createGain());this._master.gain.value=0;
this._bus.connect(this._filter);this._filter.connect(mix);
this._ambient.connect(mix);mix.connect(comp);comp.connect(this._master);
this._master.connect(c.destination);
let rng=73193;
const rnd=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)/4294967296*2-1;};
this._noise=c.createBuffer(1,c.sampleRate,c.sampleRate);
const noise=this._noise.getChannelData(0);let smooth=0;
for(let i=0;i<noise.length;i++){smooth=smooth*.35+rnd()*.65;noise[i]=smooth;}
const water=keep(c.createBufferSource()),waterFilter=keep(c.createBiquadFilter()),waterGain=keep(c.createGain());
water.buffer=this._noise;water.loop=true;water.playbackRate.value=.47;
waterFilter.type='lowpass';waterFilter.frequency.value=360;waterGain.gain.value=.005;
water.connect(waterFilter);waterFilter.connect(waterGain);waterGain.connect(this._ambient);water.start();
const room=keep(c.createConvolver()),wet=keep(c.createGain());
const impulse=c.createBuffer(2,Math.ceil(c.sampleRate*1.8),c.sampleRate);
for(let ch=0;ch<2;ch++){const a=impulse.getChannelData(ch);for(let i=0;i<a.length;i++){const t=i/c.sampleRate;a[i]=rnd()*Math.exp(-t*4)*Math.min(1,t*60);}}
room.buffer=impulse;wet.gain.value=.22;this._bus.connect(room);room.connect(wet);wet.connect(mix);
// Music has its own bus and voice pool, so it cannot consume warning/effect voices.
this._musicBus=keep(c.createGain());this._musicBus.gain.value=1.08;
this._musicFilter=keep(c.createBiquadFilter());this._musicFilter.type='lowpass';
this._musicFilter.frequency.value=3300;this._musicFilter.Q.value=.18;
const musicRoom=keep(c.createConvolver()),musicWet=keep(c.createGain());
musicRoom.buffer=impulse;musicWet.gain.value=.19;
this._musicBus.connect(this._musicFilter);this._musicFilter.connect(mix);
this._musicFilter.connect(musicRoom);musicRoom.connect(musicWet);musicWet.connect(mix);
this._musicStart=null;this._musicCursor=0;this._musicVoices.clear();
}
async enable(){
const token=++this._token;clearTimeout(this._timer);
try{
if(!this.context||this.context.state==='closed')this._build();
const c=this.context;await c.resume();
if(token!==this._token||c.state!=='running')return false;
this.enabled=true;this._lastDrop=c.currentTime;this._lastHeart=c.currentTime;
this._master.gain.cancelScheduledValues(c.currentTime);
this._master.gain.setTargetAtTime(.8,c.currentTime,.25);
this._lastUpdate=-1;
if(this._state)this.update(this._state,0);else this._scheduleMusic(c.currentTime);
return true;
}catch(_){if(token===this._token)this.enabled=false;return false;}
}
disable(){
const token=++this._token;this.enabled=false;clearTimeout(this._timer);
const c=this.context;if(!c||c.state==='closed')return;
this._master.gain.cancelScheduledValues(c.currentTime);
this._master.gain.setTargetAtTime(0,c.currentTime,.045);
this._stopMusic();
this._timer=setTimeout(()=>{if(token===this._token&&!this.enabled&&c.state==='running')c.suspend().catch(()=>{});},350);
}
async suspend(){
if(this.context&&this.context.state==='running'){try{await this.context.suspend();}catch(_){}}
}
async resume(){
if(!this.enabled||!this.context)return false;
const c=this.context,token=this._token;
try{await c.resume();this._lastDrop=c.currentTime;this._lastHeart=c.currentTime;
const ready=this.enabled&&token===this._token&&c.state==='running';
if(ready){this._lastUpdate=-1;if(this._state)this.update(this._state,0);else this._scheduleMusic(c.currentTime);}
return ready;}catch(_){return false;}
}
update(state,dt){
this._state=state;
const c=this.context;if(!this.enabled||!c||c.state!=='running')return;
const now=c.currentTime;if(now-this._lastUpdate<.12)return;this._lastUpdate=now;
const seed=(state&&state.seedNumber||1)>>>0,biome=state&&state.biome||0;
if(seed!==this._seed||biome!==this._biome){
this._seed=seed;this._biome=biome;this._bossTheme=null;this._root=[38,40,41,43,45][seed%5];
}
// The audio clock keeps the tune moving on the title and paused panels.
this._scheduleMusic(now);
if(!state||!state.player){
this._ambient.gain.setTargetAtTime(.3,now,.4);
this._musicBus.gain.setTargetAtTime(1.08,now,.5);return;
}
const p=state.player;
const calm=state.paused||state.pendingEvolution||state.status!=='playing';
const boss=state.bossEncounter&&state.bossEncounter.hp>0?state.bossEncounter:null,bossTheme=boss?boss.type+':'+boss.phase:'';
this._bossTheme=bossTheme;
let danger=clamp(1-p.hp/Math.max(1,p.maxHp),0,1);
if(boss&&!calm)danger=Math.max(danger,boss.phase>1?.86:.72);
if(!calm)for(const o of state.organisms||[]){
if(o.dead||!MorphosGame.isHostile(o))continue;
const edible=o.kind!=='apex'&&o.kind!=='jelly'&&o.kind!=='sentinel'&&o.r<p.r*(.78+(p.traits.predator||0)*.035)&&o.hp<=o.maxHp*.4&&!p.sprinting;if(edible)continue;
const d=Math.hypot(o.x-p.x,o.y-p.y)-o.r-p.r;
const pressure=(o.recoverTime||0)>0?.18:(o.windup||0)>0||(o.lungeTime||0)>0?.92:o.kind==='armoured'?.57:.72;
danger=Math.max(danger,clamp(1-d/250,0,1)*pressure);
}
// A legendary approaching: the music thins to nothing and a drone rises, then an ominous theme takes over when it is in sight.
let ld=1e9;if(!calm)for(const o of state.organisms||[]){if(o.dead||!o.species||MorphosGame.SPECIES[o.species]?.rarity!=='legendary')continue;ld=Math.min(ld,Math.hypot(o.x-p.x,o.y-p.y));}
const dreadTarget=ld<1e9?clamp((2000-ld)/1200,0,1):0;this._dread=(this._dread||0)+(dreadTarget-(this._dread||0))*.18;const dread=this._dread,ominous=dread>.8;
if(ominous&&!this._ominous){this._tone(62,31,2.4,.07);this._tone(93,46,2.2,.03,0,'triangle',.05);this._swish(1.4,.03,220,60);}this._ominous=ominous;
this._droneLevel(dread>.04?(ominous?.022:.012+dread*.02):0,now);
const conceal=clamp(p.stealth||0,0,1);
this._ambient.gain.setTargetAtTime((calm?.3:.72+Math.sin(state.time*.16)*.08)*(1-conceal*.3)*(1-Math.min(.6,(this._dread||0)*.7)),now,.4);
this._filter.frequency.setTargetAtTime(2400-danger*1100-conceal*400-(p.exhausted?280:0),now,.3);
this._musicBus.gain.setTargetAtTime(1.08*(1-(calm?0:danger*.12))*(this._ominous?.95:1-Math.min(.97,(this._dread||0)*1.7)),now,this._dread>.05?1.6:.65);
this._musicFilter.frequency.setTargetAtTime(3300-clamp(biome,0,2)*180-danger*250,now,1);
if(!calm&&danger>.62&&now-this._lastHeart>(boss&&boss.phase>1?1.25:1.65)){
this._lastHeart=now;this._tone(84,54,.28,.019*(1-conceal*.4));
this._tone(80,50,.23,.011*(1-conceal*.4),0,'sine',.25);
}
}
// A low, slowly beating drone for the quiet before a legendary arrives. Built on first use.
_droneLevel(level,now){
const c=this.context;if(!c)return;
if(!this._drone){if(level<=0)return;const g=c.createGain();g.gain.value=0;const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=180;
 const oscs=[[41.2,'sine'],[41.9,'sine'],[61.7,'triangle']].map(([hz,type])=>{const o=c.createOscillator();o.type=type;o.frequency.value=hz;o.connect(f);o.start();return o;});
 f.connect(g);g.connect(this._ambient);this._drone={g,f,oscs};this._nodes.push(g,f,...oscs);}
this._drone.g.gain.setTargetAtTime(level,now,1.8);
}
_scheduleMusic(now){
if(!this.enabled||!this.context||this.context.state!=='running')return;
const eighth=.4,lookAhead=.44;
if(this._musicStart===null){this._musicStart=now+.06;this._musicCursor=0;this._musicRoot=this._root;}
// A stalled tab skips missed beats; it never dumps overdue notes into one frame.
if(this._musicStart+this._musicCursor*eighth<now-.025)
this._musicCursor=Math.max(this._musicCursor,Math.ceil((now+.025-this._musicStart)/eighth));
for(let count=0;count<4;count++){
const when=this._musicStart+this._musicCursor*eighth;
if(when>now+lookAhead)break;
const tick=this._musicCursor%8,bar=Math.floor(this._musicCursor/8)%16;
if(tick===0)this._musicRoot=this._root;
const key=this._musicRoot,chord=MUSIC_CHORDS[MUSIC_HARMONY[bar]];
const t=Math.max(now+.008,when);
if(this._ominous){
 // The ominous theme: a low octave and a tritone, a heavy pulse, and a thin high minor ninth.
 if(tick===0)this._musicNote(key-12,t,4,.034,0,'bass');
 if(tick===4&&bar%2===0)this._musicNote(key-6,t,3,.026,0,'bass');
 if(tick===2||tick===6)this._musicNote(key-24,t,.5,.024,0,'bass');
 if(tick===0&&bar%4===0)this._musicNote(key+13,t,4,.009,.3,'arp');
 if(tick===4&&bar%4===2)this._musicNote(key+12,t,3,.008,-.3,'arp');
 this._musicCursor++;continue;
}
for(const note of MUSIC_MELODY[bar])if(note[0]===tick)
this._musicNote(key+note[1],t,note[2],.034*(tick===0?1:.91),-.1,'melody');
if(tick===0)this._musicNote(key+chord.bass,t+.008,2.65,.017,0,'bass');
if(tick===1||tick===5||(tick===3&&bar%2===0)){
const index=tick===1?0:tick===3?1:2;
this._musicNote(key+chord.notes[index],t+.012,1.5,.0125,index%2?.3:-.3,'arp');
}
this._musicCursor++;
}
}
_musicNote(midi,when,beats,amp,pan,part){
const c=this.context;if(!this.enabled||!c||c.state!=='running'||this._musicVoices.size>=32)return;
const duration=Math.min(3.2,beats*.8+.55),gain=c.createGain(),stereo=c.createStereoPanner();
gain.gain.value=.00001;
gain.gain.setValueAtTime(.00001,when);
gain.gain.exponentialRampToValueAtTime(amp,when+(part==='bass'?.035:.012));
gain.gain.exponentialRampToValueAtTime(amp*.5,when+.22);
gain.gain.exponentialRampToValueAtTime(.00001,when+duration);
stereo.pan.value=pan;gain.connect(stereo);stereo.connect(this._musicBus);
const sources=[],nodes=[gain,stereo],weights=part==='bass'?[.9,.1]:[.72,.22,.06];
for(let i=0;i<weights.length;i++){
const osc=c.createOscillator(),partial=c.createGain();osc.type='sine';
osc.frequency.value=hz(midi)*[1,2.001,3.004][i];
partial.gain.setValueAtTime(weights[i],when);
if(i)partial.gain.exponentialRampToValueAtTime(.00001,when+Math.max(.16,duration*(i===1?.52:.29)));
osc.connect(partial);partial.connect(gain);sources.push(osc);nodes.push(osc,partial);
osc.start(when);osc.stop(when+duration+.04);
}
const voice={sources,nodes,gain,end:when+duration+.04};this._musicVoices.add(voice);
sources[0].onended=()=>{for(const n of nodes){try{n.disconnect();}catch(_){}}this._musicVoices.delete(voice);};
}
_stopMusic(){
const c=this.context;this._musicStart=null;this._musicCursor=0;
if(!c)return;
const now=c.currentTime;
for(const voice of this._musicVoices){
const g=voice.gain.gain;
if(typeof g.cancelAndHoldAtTime==='function')g.cancelAndHoldAtTime(now);
else{g.cancelScheduledValues(now);g.setValueAtTime(Math.max(.00001,g.value),now);}
g.setTargetAtTime(.00001,now,.008);
for(const source of voice.sources){try{source.stop(now+.06);}catch(_){}}
}
}
_can(){return this.enabled&&this.context&&this.context.state==='running'&&this._voices.size<24;}
_track(source,nodes){
const voice={source,nodes};this._voices.add(voice);
source.onended=()=>{for(const n of nodes){try{n.disconnect();}catch(_){}}this._voices.delete(voice);};
}
_tone(f,to,d,amp,pan=0,type='sine',delay=0){
if(!this._can())return;
const c=this.context,t=c.currentTime+delay,osc=c.createOscillator(),gain=c.createGain(),stereo=c.createStereoPanner();
osc.type=type;osc.frequency.setValueAtTime(Math.max(20,f),t);
osc.frequency.exponentialRampToValueAtTime(Math.max(20,to),t+d*.8);
gain.gain.setValueAtTime(.00001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.00002,amp),t+Math.min(.018,d*.2));
gain.gain.exponentialRampToValueAtTime(.00001,t+d);
stereo.pan.value=clamp(pan,-1,1);osc.connect(gain);gain.connect(stereo);stereo.connect(this._bus);
this._track(osc,[osc,gain,stereo]);osc.start(t);osc.stop(t+d+.04);
}
_swish(d,amp,f,to,pan=0){
if(!this._can())return;
const c=this.context,t=c.currentTime,src=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain(),stereo=c.createStereoPanner();
src.buffer=this._noise;filter.type='bandpass';filter.Q.value=.65;
filter.frequency.setValueAtTime(f,t);filter.frequency.exponentialRampToValueAtTime(to,t+d);
gain.gain.setValueAtTime(.00001,t);gain.gain.exponentialRampToValueAtTime(amp,t+.018);gain.gain.exponentialRampToValueAtTime(.00001,t+d);
stereo.pan.value=clamp(pan,-1,1);src.connect(filter);filter.connect(gain);gain.connect(stereo);stereo.connect(this._bus);
this._track(src,[src,filter,gain,stereo]);src.start(t);src.stop(t+d+.03);
}
event(e){
if(!e||!this._can())return;
const now=this.context.currentTime,type=e.type;
const listener=this._state&&this._state.player,warningDistance=listener&&Number.isFinite(e.x)&&Number.isFinite(e.y)?Math.hypot(e.x-listener.x,e.y-listener.y):0;
if(type==='windup'&&warningDistance>760)return;
const gate={eat:.065,hit:.12,rupture:.15,pounce:.2,nearMiss:.3,frenzy:.2,devour:.2,pulse:.14,dash:.35,kill:.12,warning:2.5,evolve:.5,biome:.5,death:1,win:1,special:.25,discovery:1.3,encounter:.8,objective:.8,checkpoint:3,upgrade:.2,exhausted:1,recovered:1,secondWind:1,shadowMetabolism:1,critical:.18,rearHit:.1,reflect:.18,parry:.13,chain:.2,mutationUnlocked:.8,mutation:.35,bossAwakened:2,bossPhase:2,bossDefeated:2,bossRetreated:1,eliteDefeated:.8,bossWindup:.55,bossExposed:1.2,glassCounter:.4,windup:.7}[type]||.1;
if(now-(this._limits[type]??-100)<gate)return;this._limits[type]=now;
const pan=this._state&&Number.isFinite(e.x)?clamp((e.x-this._state.player.x)/350,-.6,.6):0;
if(type==='eat'){
const n=[0,3,7,10,12][Math.floor(now*13)%5],f=hz(this._root+24+n);
this._tone(f*1.7,f,.13,.026,pan);this._tone(f*.5,f*.85,.19,.012,pan);
}else if(type==='pulse'){
if(e.shape==='riptide'){this._swish(.16,.03,1800,420);this._tone(420,260,.1,.016,0,'sine');}else if(e.shape==='spikes'){this._tone(1500,900,.04,.012);this._swish(.05,.012,3000,1200);}
else if(e.shape==='spores'){this._swish(.22,.03,700,240);this._tone(150,90,.2,.025,0,'sine');}
else{this._tone(180,48,.38,.065);this._swish(.25,.038,1100,180);}
}else if(type==='whirlpool'){
this._swish(.9,.04,240,900);this._tone(70,130,.8,.03,0,'sine');
}else if(type==='dash'){
this._swish(.34,.049,380,1700,pan);this._tone(90,180,.25,.018,pan);
}else if(type==='exhausted'){
this._swish(.42,.023,850,160);this._tone(120,65,.48,.021);
}else if(type==='recovered'){
this._tone(hz(this._root+19),hz(this._root+24),.3,.017,-.1);this._tone(hz(this._root+31),hz(this._root+31),.6,.01,.1,'sine',.09);
}else if(type==='secondWind'){
this._swish(.4,.027,260,1400);this._tone(110,250,.38,.021);
}else if(type==='shadowMetabolism'){
const f=hz(this._root+15);this._tone(f*.93,f,.42,.016,-.12);this._tone(f*1.5,f*1.5,.7,.009,.12,'sine',.08);
}else if(type==='rearHit'){
this._tone(105,34,.32,.07,pan);this._tone(62,30,.4,.05,pan,'triangle');this._swish(.12,.05,900,140,pan);
}else if(type==='critical'){
this._tone(840,310,.12,.024,pan,'triangle');this._tone(1260,640,.18,.013,pan,'sine',.04);
}else if(type==='reflect'){
this._tone(530,840,.17,.021,pan);this._tone(950,640,.24,.013,-pan,'sine',.04);
}else if(type==='parry'){
this._swish(.10,.027,1400,380,pan);
if(e.reflected){this._tone(680,1020,.17,.032,pan);this._tone(1120,1400,.25,.017,-pan,'sine',.055);}
else{this._tone(420,620,.13,.028,pan);this._tone(780,560,.20,.013,-pan,'sine',.045);}
}else if(type==='chain'){
this._tone(430,680,.12,.013,pan,'triangle');
}else if(type==='mutationUnlocked'||type==='mutation'){
[12,19,26].forEach((n,i)=>{const f=hz(this._root+n);this._tone(f*.92,f,.9,.016,(i-1)*.27,'sine',i*.12);});
}else if(type==='bossWindup'||type==='windup'){
const level=type==='bossWindup'?1:clamp(1-warningDistance/950,.2,.8),kind=e.attackKind||(['lancer','hunter','armoured'].includes(e.kind)?'lunge':'fan');
if(kind==='lunge'||kind==='bite'){
const duration=type==='windup'?clamp((e.duration||.75)*.42,.18,.36):.27;
this._tone(kind==='bite'?135:160,kind==='bite'?280:340,duration,.023*level,pan,'triangle');this._swish(duration+.05,.017*level,350,1000,pan);
}else if(kind==='pull'){
this._swish(.5,.025*level,1500,290,pan);this._tone(210,110,.48,.015*level,pan);
}else if(kind==='hatch'){
this._tone(190,245,.20,.018*level,pan);this._tone(235,300,.23,.013*level,-pan,'sine',.16);
}else if(kind==='burst'||kind==='ring'){
for(let i=0;i<3;i++)this._tone(470+i*110,390+i*85,.18,.015*level,clamp(pan+(i-1)*.15,-.7,.7),'sine',i*.09);
}else{
this._tone(330,620,.28,.019*level,pan);this._tone(495,750,.24,.010*level,pan,'sine',.10);
}
}else if(type==='glassCounter'){
this._tone(520,780,.24,.018,pan);this._tone(1040,1170,.31,.010,pan,'sine',.08);
}else if(type==='bossExposed'&&e.bossType==='brood'){
const f=hz(this._root+24);this._swish(.28,.013,520,1300,pan);this._tone(f*.75,f,.45,.018,pan);this._tone(f*1.5,f*1.5,.72,.011,-pan,'sine',.09);
}else if(type==='bossAwakened'){
this._swish(1.1,.032,180,650);[0,7,14].forEach((n,i)=>{const f=hz(this._root+n);this._tone(f*1.04,f,1.5,.027-i*.004,(i-1)*.25,'sine',i*.22);});
}else if(type==='bossPhase'){
this._swish(.75,.04,210,1200);this._tone(115,58,.65,.034);this._tone(174,91,.8,.02,.25,'triangle',.1);
}else if(type==='bossDefeated'){
this._swish(.85,.035,900,160);[0,7,12,19,24,26].forEach((n,i)=>{const f=hz(this._root+12+n);this._tone(f*.98,f,2.2,.025-i*.002,((i%2)*2-1)*.34,'sine',i*.15);});
}else if(type==='bossRetreated'){
this._tone(hz(this._root+12),hz(this._root+7),.7,.015,-.15);this._swish(.6,.015,500,180);
}else if(type==='eliteDefeated'){
[12,19,24].forEach((n,i)=>{const f=hz(this._root+n);this._tone(f,f,1.1,.019,(i-1)*.24,'sine',i*.11);});
}else if(type==='special'){
if(e.trait==='venomist'){
for(let i=0;i<3;i++)this._tone(350+i*70,90+i*20,.19,.028,(i-1)*.2,'triangle',i*.07);
this._swish(.28,.045,1800,700);
}else if(e.trait==='predator'){
this._swish(.32,.06,400,1600);this._tone(160,70,.25,.03,0,'triangle',.05);
}else if(e.trait==='riptide'){
this._swish(.8,.065,250,2200);
this._tone(100,240,.7,.022,-.3);this._tone(150,360,.65,.012,.3,'sine',.08);
}else if(e.trait==='summoner'){
[0,7,12].forEach((n,i)=>{const f=hz(this._root+12+n);this._tone(f*.7,f,.18,.022,(i-1)*.35,'sine',i*.06);});
}else if(e.trait==='stalker'){
this._swish(.45,.022,1200,240);
this._tone(720,350,.2,.024,-.65);this._tone(720,350,.2,.017,.65,'sine',.16);
}
}else if(type==='rupture'){
this._tone(220,60,.4,.035,pan,'sawtooth');this._swish(.35,.05,900,200);
}else if(type==='pounce'){
this._tone(140,55,.22,.04,pan,'triangle');
}else if(type==='nearMiss'){
this._swish(.25,.035,2400,900);this._tone(880,1320,.12,.012,pan,'sine');
}else if(type==='frenzy'){
this._tone(hz(this._root+12+(e.stacks||1)*2),hz(this._root+12+(e.stacks||1)*2),.18,.018,0,'triangle');
}else if(type==='devour'){
this._tone(300,120,.2,.03,0,'sine');
}else if(type==='hit'){
if(e.target==='player'){this._tone(128,42,.3,.06);this._swish(.16,.06,560,180);}
else if(e.target==='boss'&&e.protected===true){if(e.bossType==='glass')this._tone(280,170,.10,.012,pan,'triangle');else if(e.bossType==='undertow')this._tone(125,90,.13,.013,pan);else this._tone(115,61,.10,.014,pan,'triangle');}
else this._tone(230,80,.12,.022,pan,'triangle');
}else if(type==='kill'){
this._tone(410,145,.22,.033,pan);this._tone(640,290,.19,.02,-pan,'sine',.07);
}else if(type==='divided'){
[0,7,12].forEach((n,i)=>{const f=hz(this._root+n);this._tone(f,f*1.5,1.1,.022,((i%2)*2-1)*.25,'sine',i*.09);});this._swish(.4,.015,300,900);
}else if(type==='evolve'||type==='win'){
const notes=type==='win'?[0,7,12,16,19,24]:[0,7,12,14,19];
notes.forEach((n,i)=>{const f=hz(this._root+12+n);this._tone(f,f,2.4,.027,((i%2)*2-1)*.3,'sine',i*.12);});
this._swish(.7,.023,220,1500);
}else if(type==='death'){
[0,7,12].forEach((n,i)=>this._tone(hz(this._root+n),hz(this._root+n-12),1.6,.026,(i-1)*.3,'sine',i*.07));
}else if(type==='biome'){
[12,19,24].forEach((n,i)=>this._tone(hz(this._root+n),hz(this._root+n),1.6,.015,(i-1)*.4,'sine',i*.19));
}else if(type==='discovery'){
[24,31].forEach((n,i)=>{const f=hz(this._root+n);this._tone(f*1.012,f,.9,.019-i*.004,pan,'sine',i*.18);});
}else if(type==='encounter'||type==='objective'){
const notes=type==='encounter'?[12,19,24]:[19,26];
notes.forEach((n,i)=>{const f=hz(this._root+n);this._tone(f,f,1.15,.016,((i%2)*2-1)*.22,'sine',i*.12);});
}else if(type==='checkpoint'){
[12,19].forEach((n,i)=>{const f=hz(this._root+n);this._tone(f,f,.75+i*.15,.014-i*.003,i?.12:-.12,'sine',i*.15);});
}else if(type==='upgrade'){
const f=hz(this._root+19+Math.min(3,e.rank||1)*2);
this._tone(f*.6,f,.2,.022,-.15);this._tone(f*1.5,f*1.5,.75,.013,.15,'sine',.09);
}else if(type==='warning'){
this._tone(95,66,.65,.025,-.1);this._tone(100,69,.65,.018,.1,'sine',.35);
}
}
dispose(){
this._drone=null;
++this._token;this.enabled=false;clearTimeout(this._timer);
for(const v of this._musicVoices){for(const s of v.sources){try{s.stop();}catch(_){}}for(const n of v.nodes){try{n.disconnect();}catch(_){}}}
this._musicVoices.clear();this._musicStart=null;this._musicCursor=0;
for(const v of this._voices){try{v.source.stop();}catch(_){}for(const n of v.nodes){try{n.disconnect();}catch(_){}}}
this._voices.clear();
for(const n of this._nodes){if(typeof n.stop==='function'){try{n.stop();}catch(_){}}try{n.disconnect();}catch(_){}}
if(this.context&&this.context.state!=='closed')this.context.close().catch(()=>{});
this.context=null;this._nodes=[];this._pads=[];this._limits={};this._lastUpdate=-1;this._seed=-1;this._biome=-1;this._bossTheme='';
}
}
window.MorphosAudio=MorphosAudio;
})();
