import { useState, useEffect, useRef } from "react";
import "./dashboard.css";
import {
  useGetMe, useGetOnlineFriendsSummary, useGetPartyActivityFeed,
  useListPartyInvites, useBlockUser, useAcceptPartyInvite, useDeclinePartyInvite,
  customFetch,
  getGetOnlineFriendsSummaryQueryKey, getGetPartyActivityFeedQueryKey,
  getListPartyInvitesQueryKey, getGetMeQueryKey,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVoice } from "@/voice/voice-context";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

// ── Palette helpers ────────────────────────────────────────────────────────────
const PALETTE = ["#EC4899","#06B6D4","#A855F7","#22C55E","#F97316","#FFD700","#EF4444","#38BDF8"];
const fColor = (id: number) => PALETTE[id % PALETTE.length];

// ── Static data (no API equivalent) ───────────────────────────────────────────
const SPIN_PRIZES = [
  { label:"500 XP",     color:"#22C55E", icon:"⚡" },
  { label:"MISS",       color:"#333",    icon:"💨" },
  { label:"Pro يوم",    color:"#FFD700", icon:"👑" },
  { label:"200 XP",     color:"#06B6D4", icon:"🎯" },
  { label:"MISS",       color:"#333",    icon:"💨" },
  { label:"شارة نادرة", color:"#A855F7", icon:"🏅" },
  { label:"1000 XP",    color:"#EF4444", icon:"🔥" },
  { label:"100 XP",     color:"#F97316", icon:"🎁" },
];
const WEEK_GRAPH = [3,7,2,9,5,11,8];
const WEEK_DAYS  = ["أح","إث","ث","أر","خ","ج","س"];
const MOODS = [
  { icon:"😤", label:"يلا نلعب" },{ icon:"😎", label:"كاجوال" },
  { icon:"🎯", label:"تدريب" },{ icon:"🏆", label:"Ranked" },{ icon:"😴", label:"سأنام" },
];
const FEATURED_GAME = { name:"Valorant", mode:"RANKED • ACT III", players:"4.2M نشط", update:"تحديث Episode 9 متاح!", accent:"#FF4655" };
const NEWS_ITEMS = [
  { tag:"UPDATE", color:"#22C55E", text:"Valorant EP9 — خريطة جديدة + عميل جديد" },
  { tag:"ESPORTS",color:"#FFD700", text:"فريق LOUD يفوز ببطولة VCT Americas 2026" },
  { tag:"PATCH",  color:"#F97316", text:"CS2 — تعديل توازن السلاح Premier Season 4" },
  { tag:"EVENT",  color:"#A855F7", text:"Apex: موسم الصياد يبدأ 22 يوليو" },
];
const TOURNAMENTS = [
  { name:"GWH Cup — Final",   date:"غداً 8م",   prize:"5,000 ريال", game:"Valorant",    color:"#EF4444", hot:true  },
  { name:"CS2 Weekly Open",   date:"الجمعة 9م",  prize:"1,000 ريال", game:"CS2",         color:"#F97316", hot:false },
  { name:"Apex Legends Solo", date:"السبت 7م",   prize:"2,500 ريال", game:"Apex Legends",color:"#A855F7", hot:false },
];
const HIGHLIGHTS = [
  { user:"Khalid",  clip:"Ace Round Valorant 🔥",          views:"12K", ago:"2m", color:"#EC4899" },
  { user:"Sara",    clip:"Apex Predator Montage ⚡",        views:"8.4K",ago:"7m", color:"#06B6D4" },
  { user:"Faisal2", clip:"5K AWP في CS2 Premier 💥",       views:"21K", ago:"15m",color:"#22C55E" },
  { user:"Reem",    clip:"Overwatch Triple Elimination 🎯", views:"5.1K",ago:"28m",color:"#F97316" },
];

// ── LiveTicker ─────────────────────────────────────────────────────────────────
function LiveTicker({ events }: { events: Array<{text:string;color:string}> }) {
  const [offset, setOffset] = useState(0);
  const items = events.length ? events : [{ text:"🎮 مرحباً في Game World Hub", color:"#22C55E" }];
  const text = items.map(e=>e.text).join("   ◆   ");
  useEffect(() => {
    const id = setInterval(() => setOffset(o => (o + 0.9) % (text.length * 7.2)), 20);
    return () => clearInterval(id);
  }, [text]);
  return (
    <div className="ticker-bar">
      <div className="ticker-live-pill"><span className="ticker-dot"/>LIVE</div>
      <div className="ticker-track">
        <div className="ticker-inner" style={{ transform:`translateX(-${offset}px)` }}>
          {[...items,...items].map((e,i) => (
            <span key={i} className="ticker-item">
              <span style={{ color:e.color }}>{e.text}</span>
              <span className="ticker-sep">◆</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── XpBar ──────────────────────────────────────────────────────────────────────
function XpBar({ me }: { me:any }) {
  if (!me) return null;
  const pct = me.xpForNext > 0 ? Math.round((me.xpIntoLevel / me.xpForNext) * 100) : 0;
  return (
    <div className="xp-wrap">
      <div className="xp-header">
        <span className="xp-level">LVL {me.tierLevel ?? 1}</span>
        <span className="xp-nums">{(me.xpIntoLevel??0).toLocaleString()} / {(me.xpForNext??1000).toLocaleString()} XP</span>
      </div>
      <div className="xp-track">
        <div className="xp-fill" style={{ width:`${pct}%` }}><div className="xp-shimmer"/></div>
        <div className="xp-glow" style={{ left:`${pct}%` }}/>
      </div>
    </div>
  );
}

// ── StatCard ───────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color, sub }: { icon:string;value:string|number;label:string;color:string;sub?:string }) {
  const str = String(value);
  const target = parseInt(str.replace(/\D/g,"")) || 0;
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!target) { setCount(0); return; }
    let s=0; const inc=target/28;
    const id = setInterval(()=>{ s+=inc; if(s>=target){setCount(target);clearInterval(id);}else setCount(Math.floor(s)); },28);
    return ()=>clearInterval(id);
  },[target]);
  const display = str.replace(/\d+/, String(count));
  return (
    <div className="stat-card" style={{"--sc":color} as any}>
      <div className="stat-top"><span className="stat-icon">{icon}</span><div className="stat-corner" style={{background:color}}/></div>
      <div className="stat-value" style={{color}}>{display}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      <div className="stat-glow" style={{background:color}}/>
    </div>
  );
}

// ── MoodStatus ─────────────────────────────────────────────────────────────────
function MoodStatus() {
  const [selected, setSelected] = useState(0);
  return (
    <div className="mood-bar">
      <span className="mood-title">حالتك:</span>
      {MOODS.map((m,i)=>(
        <button key={i} className={`mood-btn${selected===i?" mood-btn--on":""}`} onClick={()=>setSelected(i)}>
          {m.icon} {m.label}
        </button>
      ))}
    </div>
  );
}

// ── QuickDock ──────────────────────────────────────────────────────────────────
function QuickDock({ inviteCount, streak }: { inviteCount:number; streak:number }) {
  const [,nav] = useLocation();
  const ITEMS = [
    { icon:"⚔️", label:"بارتي جديد", href:"/parties", color:"#22C55E", badge:inviteCount||null },
    { icon:"📡", label:"نشر LFG",    href:"/lfg",     color:"#EC4899", badge:null },
    { icon:"👥", label:"الأصدقاء",   href:"/friends", color:"#06B6D4", badge:null },
    { icon:"💬", label:"الرسائل",    href:"/chat",    color:"#A855F7", badge:null },
    { icon:"🏆", label:"التحديات",   href:"/challenges",color:"#FFD700",badge:null },
    { icon:"⭐", label:"الإنجازات",  href:"/achievements",color:"#F97316",badge:null },
  ];
  const [hov, setHov] = useState<string|null>(null);
  return (
    <div className="dock-bar">
      {ITEMS.map(d=>(
        <Link key={d.href} href={d.href}
          className={`dock-item${hov===d.href?" dock-item--active":""}`}
          style={{"--dc":d.color} as any}
          onMouseEnter={()=>setHov(d.href)} onMouseLeave={()=>setHov(null)}>
          <span className="dock-icon">{d.icon}</span>
          <span className="dock-label">{d.label}</span>
          {d.badge ? <span className="dock-badge" style={{background:d.color}}>{d.badge}</span> : null}
          {hov===d.href && <div className="dock-underline" style={{background:d.color}}/>}
        </Link>
      ))}
      {streak > 0 && (
        <div className="dock-streak">
          <span className="streak-fire">🔥</span>
          <span className="streak-num">{streak}</span>
          <span className="streak-label">يوم</span>
        </div>
      )}
    </div>
  );
}

// ── DailySpin ──────────────────────────────────────────────────────────────────
function DailySpin({ userId }: { userId?:number }) {
  const today = new Date().toISOString().slice(0,10);
  const key = `gwh_spin_${userId??0}_${today}`;
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle]       = useState(0);
  const [result, setResult]     = useState<typeof SPIN_PRIZES[0]|null>(null);
  const [done, setDone]         = useState(() => !!localStorage.getItem(key));

  const spin = () => {
    if (spinning||done) return;
    setSpinning(true); setResult(null);
    const idx = Math.floor(Math.random()*SPIN_PRIZES.length);
    const target = angle+1440+(360/SPIN_PRIZES.length)*idx+(360/SPIN_PRIZES.length/2);
    setAngle(target);
    setTimeout(()=>{ setResult(SPIN_PRIZES[idx]); setSpinning(false); setDone(true); localStorage.setItem(key,"1"); },3200);
  };
  const sliceAngle = 360/SPIN_PRIZES.length;
  return (
    <div className="spin-box section-box">
      <div className="section-hd">
        <span className="section-title">🎰 عجلة اليوم</span>
        {done ? <span className="spin-reset">عودة غداً</span> : <span className="spin-free-badge">مجاناً!</span>}
      </div>
      <div className="spin-inner">
        <div className="spin-wrap">
          <div className="spin-pointer"/>
          <div className="spin-wheel" style={{transform:`rotate(${angle}deg)`,transition:spinning?"transform 3.2s cubic-bezier(.17,.67,.12,1)":"none"}}>
            {SPIN_PRIZES.map((p,i)=>(
              <div key={i} className="spin-slice" style={{transform:`rotate(${i*sliceAngle}deg)`,background:i%2===0?`${p.color}22`:`${p.color}14`,borderTop:`1px solid ${p.color}40`}}>
                <div className="spin-slice-content" style={{transform:`rotate(${sliceAngle/2}deg) translateY(-52px)`}}>
                  <div className="spin-slice-icon">{p.icon}</div>
                  <div className="spin-slice-label" style={{color:p.color}}>{p.label}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="spin-center" onClick={spin}>
            {spinning?<div className="spin-center-ring"/>:<span className="spin-center-text">{done?"✓":"GO"}</span>}
          </div>
        </div>
        {result && (
          <div className="spin-result" style={{borderColor:result.color,background:`${result.color}12`}}>
            <div className="spin-result-icon">{result.icon}</div>
            <div style={{color:result.color}} className="spin-result-label">
              {result.label==="MISS"?"😅 حظاً أوفر غداً!":`🎉 فزت بـ ${result.label}`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── WeeklyGraph ────────────────────────────────────────────────────────────────
function WeeklyGraph({ stats }: { stats?:any }) {
  const max = Math.max(...WEEK_GRAPH);
  const total = WEEK_GRAPH.reduce((a,b)=>a+b,0);
  const bestIdx = WEEK_GRAPH.indexOf(max);
  const todayIdx = new Date().getDay(); // 0=Sun
  const [hov, setHov] = useState<number|null>(null);
  const kd = stats?.kd ?? 2.4;
  const wr = stats?.winRate ?? 67;
  return (
    <div className="section-box wg-box">
      <div className="section-hd">
        <span className="section-title">📈 انتصارات الأسبوع</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span className="wg-up-badge">▲ 31%</span>
          <span style={{fontSize:9,color:"#555"}}>vs الأسبوع الماضي</span>
        </div>
      </div>
      <div className="wg-body">
        <div className="wg-summary">
          <div className="wg-sum-item"><span className="wg-sum-val" style={{color:"#22C55E"}}>{total}</span><span className="wg-sum-label">انتصار</span></div>
          <div className="wg-divider"/>
          <div className="wg-sum-item"><span className="wg-sum-val" style={{color:"#FFD700"}}>{kd}</span><span className="wg-sum-label">K/D</span></div>
          <div className="wg-divider"/>
          <div className="wg-sum-item"><span className="wg-sum-val" style={{color:"#06B6D4"}}>{wr}%</span><span className="wg-sum-label">Win Rate</span></div>
        </div>
        <div className="wg-bars">
          {WEEK_GRAPH.map((v,i)=>{
            const pct=(v/max)*100;
            const isToday=i===todayIdx, isBest=i===bestIdx, isHov=hov===i;
            const color=isToday?"#22C55E":isBest?"#FFD700":"#06B6D4";
            return (
              <div key={i} className="wg-bar-col" onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}>
                {isHov&&<div className="wg-tooltip" style={{borderColor:color,color}}>{v}W{isBest&&<span className="wg-best-tag">🏆 أفضل</span>}</div>}
                <div className="wg-track">
                  <div className="wg-fill" style={{height:`${pct}%`,background:isToday?"linear-gradient(180deg,#4ADE80,#22C55E)":isBest?"linear-gradient(180deg,#FDE68A,#FFD700)":"linear-gradient(180deg,#38BDF8,#06B6D4)",boxShadow:isHov?`0 0 12px ${color}80`:"none",opacity:isHov?1:0.75}}>
                    <div className="wg-fill-shine"/>
                  </div>
                  {(isToday||isBest)&&<div className="wg-marker" style={{background:color,boxShadow:`0 0 8px ${color}`}}/>}
                </div>
                <div className="wg-day" style={{color:isToday?"#22C55E":isBest?"#FFD700":"#444",fontWeight:isToday||isBest?900:400}}>{WEEK_DAYS[i]}</div>
                {isToday&&<div className="wg-today-tag">اليوم</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── HubCard ────────────────────────────────────────────────────────────────────
function HubCard({ lfgPosts, parties }: { lfgPosts:any[]; parties:any[] }) {
  const [tab, setTab] = useState<"game"|"lfg"|"news"|"party">("game");
  const TABS = [
    {id:"game",icon:"🎮",label:"اليوم"},{id:"lfg",icon:"📡",label:"LFG"},
    {id:"news",icon:"📰",label:"أخبار"},{id:"party",icon:"⚔️",label:"بارتيات"},
  ] as const;
  const [responded, setResponded] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  const respond = async (id:number) => {
    try {
      await customFetch(`/api/lfg/${id}/respond`,{method:"POST"});
      setResponded(p=>new Set([...p,id]));
      toast({title:"تم الانضمام!"});
    } catch { toast({title:"حدث خطأ",variant:"destructive"}); }
  };

  return (
    <div className="hub-card section-box">
      <div className="hub-tabs">
        {TABS.map(t=><button key={t.id} className={`hub-tab${tab===t.id?" hub-tab--on":""}`} onClick={()=>setTab(t.id)}><span>{t.icon}</span>{t.label}</button>)}
      </div>

      {tab==="game"&&(
        <div className="hub-pane hub-game">
          <div className="hub-game-bg"/><div className="hub-game-grid"/>
          <div className="hub-game-tag">🔥 لعبة اليوم</div>
          <div className="hub-game-name">{FEATURED_GAME.name}</div>
          <div className="hub-game-mode">{FEATURED_GAME.mode}</div>
          <div className="hub-game-row">
            <span className="hub-game-players">👥 {FEATURED_GAME.players}</span>
            <span className="hub-game-update">⚡ {FEATURED_GAME.update}</span>
          </div>
          <Link href="/lfg" className="hub-game-btn" style={{background:FEATURED_GAME.accent}}>انضم الآن ↗</Link>
        </div>
      )}

      {tab==="lfg"&&(
        <div className="hub-pane">
          <div className="hub-pane-hd">
            <span style={{fontSize:9,color:"#555"}}>طلبات مفتوحة</span>
            <span className="hub-live-dot-wrap"><span className="online-dot"/>مباشر</span>
          </div>
          {lfgPosts.slice(0,3).map((p:any,i)=>{
            const color=fColor(p.author?.id??i);
            const done=responded.has(p.id)||p.viewerHasResponded;
            return (
              <div key={p.id} className="hub-lfg-row" style={{borderColor:`${color}20`}}>
                <div className="hub-lfg-av" style={{background:`${color}22`,borderColor:`${color}50`,color}}>{(p.author?.displayName??"?").charAt(0)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div className="hub-lfg-user">{p.author?.displayName}</div>
                  <div className="hub-lfg-game" style={{color}}>{p.game}{p.rank?` • ${p.rank}`:""}</div>
                </div>
                <div style={{textAlign:"end",flexShrink:0}}>
                  {p.neededPlayers&&<div className="hub-lfg-need">{p.neededPlayers} مقاعد</div>}
                  <div className="hub-lfg-ago">{p.ago??""}</div>
                </div>
                <button className="hub-lfg-btn" style={{borderColor:color,color}} disabled={done} onClick={()=>respond(p.id)}>
                  {done?"✓":"انضم"}
                </button>
              </div>
            );
          })}
          {!lfgPosts.length&&<p style={{fontSize:10,color:"#444",textAlign:"center",padding:"12px 0"}}>لا يوجد طلبات الآن</p>}
          <Link href="/lfg" className="hub-see-all">عرض كل الطلبات ↗</Link>
        </div>
      )}

      {tab==="news"&&(
        <div className="hub-pane">
          <div className="hub-pane-hd">
            <span style={{fontSize:9,color:"#555"}}>آخر الأخبار</span>
            <span style={{fontSize:9,color:"#22C55E"}}>Gaming News</span>
          </div>
          {NEWS_ITEMS.map((n,i)=>(
            <div key={i} className="hub-news-row">
              <span className="hub-news-tag" style={{color:n.color,borderColor:`${n.color}40`,background:`${n.color}10`}}>{n.tag}</span>
              <span className="hub-news-text">{n.text}</span>
            </div>
          ))}
        </div>
      )}

      {tab==="party"&&(
        <div className="hub-pane">
          <div className="hub-pane-hd">
            <span style={{fontSize:9,color:"#555"}}>بارتيات نشطة الآن</span>
            <span className="hub-live-dot-wrap"><span className="online-dot"/>LIVE</span>
          </div>
          {parties.slice(0,3).map((p:any,i)=>{
            const color=fColor(p.id??i);
            const members=p.members?.slice(0,3)??[];
            const slots=Math.max(0,(p.maxSize??4)-members.length);
            return (
              <div key={p.id??i} className="hub-party-row" style={{borderColor:`${color}20`}}>
                <div style={{flex:1}}>
                  <div className="hub-party-game" style={{color}}>{p.game??p.name}</div>
                  <div className="hub-party-mode">{p.mode??""} • {slots} أماكن فارغة</div>
                  <div className="hub-party-avs">
                    {members.map((m:any,j:number)=><div key={j} className="hub-party-av" style={{background:`${color}30`,borderColor:color,color}}>{m.displayName?.charAt(0)??"?"}</div>)}
                    {[...Array(slots)].map((_,j)=><div key={`e${j}`} className="hub-party-av hub-party-av--empty">+</div>)}
                  </div>
                </div>
                <Link href={`/party/${p.id}`} className="hub-party-btn" style={{background:color}}>انضم</Link>
              </div>
            );
          })}
          {!parties.length&&<p style={{fontSize:10,color:"#444",textAlign:"center",padding:"12px 0"}}>لا يوجد بارتيات نشطة</p>}
          <Link href="/parties" className="hub-see-all">استعراض كل البارتيات ↗</Link>
        </div>
      )}
    </div>
  );
}

// ── FriendsGrid ────────────────────────────────────────────────────────────────
function FriendsGrid({ friends, onCall, onDm, onBlock }: {
  friends:any[];
  onCall:(f:any)=>void;
  onDm:(f:any)=>void;
  onBlock:(f:any)=>void;
}) {
  const online = friends.filter(e=>e.friend.status==="online").length;
  const [hov, setHov] = useState<number|null>(null);
  return (
    <div className="section-box">
      <div className="section-hd">
        <span className="section-title">🗺️ الأصدقاء</span>
        <div className="section-hd-right">
          <span className="online-pill"><span className="online-dot"/>{online} نشط</span>
          <Link href="/friends" className="section-link">عرض الكل →</Link>
        </div>
      </div>
      <div className="friends-grid">
        {friends.map(entry=>{
          const f=entry.friend;
          const color=(f as any).profileFrameColor??fColor(f.id);
          const isHov=hov===f.id;
          return (
            <Link key={f.id} href={`/profile/${f.id}`}
              className={`fc${isHov?" fc--hov":""}`}
              style={{"--fc":color} as any}
              onMouseEnter={()=>setHov(f.id)} onMouseLeave={()=>setHov(null)}>
              <div className="fc-top" style={{background:`linear-gradient(135deg,${color}30,${color}06)`}}>
                <span className="fc-rank-tag" style={{color,borderColor:`${color}40`}}>{f.tier??"—"}</span>
              </div>
              <div className="fc-av-wrap">
                <div className="fc-av" style={{borderColor:color,boxShadow:isHov?`0 0 14px ${color}80`:"none"}}>
                  {f.avatarUrl?<img src={f.avatarUrl} alt={f.displayName}/>:f.displayName.charAt(0).toUpperCase()}
                </div>
                <div className={`fc-dot fc-dot--${f.status}`}/>
              </div>
              <div className="fc-info">
                <div className="fc-name">{f.displayName}</div>
                <div className="fc-user">@{f.username}</div>
                {f.currentGame
                  ?<div className="fc-game" style={{color}}>▶ {f.currentGame}</div>
                  :<div className="fc-idle">{f.status==="away"?"بعيد":f.status==="busy"?"مشغول":"أونلاين"}</div>
                }
              </div>
              <div className={`fc-actions${isHov?" fc-actions--show":""}`}>
                <button className="fc-act" style={{color,borderColor:`${color}60`}} onClick={e=>{e.preventDefault();onCall(f);}}>📞</button>
                <button className="fc-act" style={{color,borderColor:`${color}60`}} onClick={e=>{e.preventDefault();onDm(f);}}>💬</button>
                <button className="fc-act" style={{color:"#EF4444",borderColor:"#EF444460"}} onClick={e=>{e.preventDefault();onBlock(f);}}>🚫</button>
              </div>
            </Link>
          );
        })}
        {!friends.length&&(
          <div style={{gridColumn:"1/-1",textAlign:"center",padding:"24px 0",color:"#333",fontSize:11}}>
            لا يوجد أصدقاء أونلاين الآن
          </div>
        )}
      </div>
    </div>
  );
}

// ── CommunityHighlights ────────────────────────────────────────────────────────
function CommunityHighlights({ activity }: { activity:any[] }) {
  const highlights = activity.length
    ? activity.slice(0,4).map((a:any,i:number)=>({
        user: a.actor.displayName,
        clip: `${a.actor.displayName} ${a.action==="created"?"أنشأ":a.action==="joined"?"انضم لـ":"غادر"} ${a.party.name}`,
        views: `${Math.floor(Math.random()*20+1)}K`,
        ago: `${Math.floor((Date.now()-new Date(a.createdAt).getTime())/60000)}m`,
        color: fColor(a.actor.id),
      }))
    : HIGHLIGHTS;
  const [active, setActive] = useState(0);
  useEffect(()=>{const id=setInterval(()=>setActive(a=>(a+1)%highlights.length),3500);return()=>clearInterval(id);},[highlights.length]);
  return (
    <div className="section-box">
      <div className="section-hd">
        <span className="section-title">🔥 لحظات حماسية</span>
        <span style={{fontSize:9,color:"#EF4444"}}>TRENDING</span>
      </div>
      <div style={{padding:"8px 10px",display:"flex",flexDirection:"column",gap:4}}>
        {highlights.map((h,i)=>(
          <div key={i} className={`highlight-row${i===active?" highlight-row--active":""}`}
            style={{borderColor:i===active?h.color:"transparent"}} onClick={()=>setActive(i)}>
            <div className="hl-av" style={{background:`linear-gradient(135deg,${h.color}80,${h.color}20)`,borderColor:h.color}}>
              {h.user.charAt(0)}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div className="hl-clip">{h.clip}</div>
              <div className="hl-meta"><span style={{color:h.color}}>@{h.user}</span> • {h.ago}</div>
            </div>
            <div className="hl-right">
              <div className="hl-views">👁 {h.views}</div>
              {i===active&&<button className="hl-watch-btn" style={{color:h.color,borderColor:`${h.color}60`}}>▶ شاهد</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SmartMatch ─────────────────────────────────────────────────────────────────
function SmartMatch({ friends }: { friends:any[] }) {
  const [joined, setJoined] = useState(false);
  const [cd, setCd] = useState(180);
  useEffect(()=>{if(joined)return;const id=setInterval(()=>setCd(c=>c>0?c-1:0),1000);return()=>clearInterval(id);},[joined]);
  const mm=String(Math.floor(cd/60)).padStart(2,"0"), ss=String(cd%60).padStart(2,"0");
  const pct=(cd/180)*100;
  const shown=friends.slice(0,3);
  return (
    <div className="section-box match-box">
      <div className="match-pulse-ring"/>
      <div className="section-hd">
        <span className="section-title">🎯 فرصة انضمام</span>
        <div className="match-live-badge"><span className="match-live-dot"/>LIVE</div>
      </div>
      <div className="match-game">Valorant</div>
      <div className="match-meta">"Rush Squad" • {shown.length||3} لاعبين ينتظرون</div>
      <div className="match-avatars">
        {shown.length?shown.map((e:any)=>{const f=e.friend;const color=fColor(f.id);return(
          <div key={f.id} className="match-av" style={{background:`linear-gradient(135deg,${color}88,${color}33)`,borderColor:color}}>
            {f.avatarUrl?<img src={f.avatarUrl} alt=""/>:f.displayName.charAt(0)}
          </div>
        )}):[<div key="a" className="match-av" style={{background:"#1a1a1a",borderColor:"#333"}}>K</div>,<div key="b" className="match-av" style={{background:"#1a1a1a",borderColor:"#333"}}>S</div>,<div key="c" className="match-av" style={{background:"#1a1a1a",borderColor:"#333"}}>F</div>]}
      </div>
      {!joined&&<div className="match-countdown"><div className="match-cd-track"><div className="match-cd-fill" style={{width:`${pct}%`,background:pct<30?"#EF4444":pct<60?"#FFD700":"#22C55E"}}/></div><span className="match-cd-time" style={{color:pct<30?"#EF4444":"#ccc"}}>⏱ {mm}:{ss}</span></div>}
      <button className={`match-btn${joined?" match-btn--done":""}`} onClick={()=>setJoined(j=>!j)}>{joined?"✓ انضممت!":"⚡ انضم الآن"}</button>
    </div>
  );
}

// ── ChallengeVs ────────────────────────────────────────────────────────────────
function ChallengeVs({ me, friends }: { me:any; friends:any[] }) {
  const [sel, setSel] = useState<any>(null);
  const [sent, setSent] = useState(false);
  const online = friends.filter(e=>e.friend.status==="online");
  const myColor = "#06B6D4";
  return (
    <div className="section-box vs-box">
      <div className="section-hd">
        <span className="section-title">⚔️ تحدي 1v1</span>
        <span style={{fontSize:9,color:"#EF4444",letterSpacing:1}}>مباشر</span>
      </div>
      <div className="vs-inner">
        <div className="vs-you">
          <div className="vs-av" style={{background:`linear-gradient(135deg,${myColor},${myColor}30)`,borderColor:myColor}}>
            {me?.avatarUrl?<img src={me.avatarUrl} alt=""/>:(me?.displayName??"?").charAt(0)}
          </div>
          <div className="vs-name">أنت</div>
          <div className="vs-rank">LVL {me?.tierLevel??1}</div>
        </div>
        <div className="vs-middle">
          <div className="vs-text">VS</div>
          {sent&&<div className="vs-sent">✓ تم الإرسال!</div>}
        </div>
        <div className="vs-enemy">
          {sel?(
            <>
              <div className="vs-av" style={{background:`linear-gradient(135deg,${fColor(sel.id)},${fColor(sel.id)}30)`,borderColor:fColor(sel.id)}}>
                {sel.avatarUrl?<img src={sel.avatarUrl} alt=""/>:sel.displayName.charAt(0)}
              </div>
              <div className="vs-name">{sel.displayName}</div>
              <div className="vs-rank" style={{color:fColor(sel.id)}}>{sel.tier??""}</div>
            </>
          ):<div className="vs-pick">اختر خصماً</div>}
        </div>
      </div>
      <div className="vs-friends">
        {online.map(e=>{const f=e.friend;return(
          <button key={f.id} className={`vs-chip${sel?.id===f.id?" vs-chip--on":""}`}
            style={{borderColor:sel?.id===f.id?fColor(f.id):"#222",color:sel?.id===f.id?fColor(f.id):"#666"}}
            onClick={()=>{setSel(f);setSent(false);}}>
            {f.displayName.charAt(0)} {f.displayName}
          </button>
        );})}
      </div>
      <button className={`vs-send-btn${(!sel||sent)?" vs-send-btn--dis":""}`} onClick={()=>sel&&setSent(true)}>
        {sent?"✓ تحدي مُرسل!":"⚔️ أرسل التحدي"}
      </button>
    </div>
  );
}

// ── TournamentCard ─────────────────────────────────────────────────────────────
function TournamentCard() {
  const [joined, setJoined] = useState<number|null>(null);
  return (
    <div className="section-box">
      <div className="section-hd">
        <span className="section-title">🏟️ البطولات القادمة</span>
        <span className="trn-hot-tag">🔥 HOT</span>
      </div>
      {TOURNAMENTS.map((t,i)=>(
        <div key={i} className={`trn-row${t.hot?" trn-row--hot":""}`} style={{"--tc":t.color} as any}>
          {t.hot&&<div className="trn-hot-bar" style={{background:t.color}}/>}
          <div className="trn-main">
            <div>
              <div className="trn-name" style={{color:t.hot?t.color:"#ccc"}}>{t.name}</div>
              <div className="trn-game">{t.game} • {t.date}</div>
            </div>
            <div style={{textAlign:"end"}}>
              <div className="trn-prize" style={{color:t.color}}>{t.prize}</div>
              <button className={`trn-join-btn${joined===i?" trn-join-btn--done":""}`}
                style={{borderColor:t.color,color:joined===i?"#000":t.color,background:joined===i?t.color:"transparent"}}
                onClick={()=>setJoined(i)}>
                {joined===i?"✓ مسجّل":"سجّل الآن"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── ChallengeCard ──────────────────────────────────────────────────────────────
function ChallengeCard({ challenges }: { challenges:any[] }) {
  const [animated, setAnimated] = useState(false);
  useEffect(()=>{setTimeout(()=>setAnimated(true),400);},[]);
  const active = challenges.find(c=>c.status==="active");
  if (!active && !challenges.length) return null;
  const c = active ?? { title:"فاتح البارتيات", description:"انضم لـ 5 بارتيات مختلفة هذا الأسبوع", progress:3, goal:5, xpReward:200, expiresAt:"" };
  const pct = Math.min(100, Math.round((c.progress/c.goal)*100));
  return (
    <div className="section-box challenge-box">
      <div className="section-hd">
        <span className="section-title">⚡ تحدي الأسبوع</span>
        <span className="challenge-timer">🔥 يومان</span>
      </div>
      <div className="challenge-name">{c.title}</div>
      <div className="challenge-desc">{c.description}</div>
      <div className="challenge-track">
        <div className="challenge-fill" style={{width:animated?`${pct}%`:"0%",transition:"width 1.2s cubic-bezier(.4,0,.2,1)"}}><div className="challenge-shimmer"/></div>
        <span className="challenge-num">{c.progress} / {c.goal}</span>
      </div>
      <div className="challenge-rewards">
        <span className="reward-chip">🎁 {c.xpReward} XP</span>
        <span className="reward-chip">🏅 شارة حصرية</span>
        <span className="reward-chip">👑 Pro أسبوع</span>
      </div>
    </div>
  );
}

// ── Leaderboard ────────────────────────────────────────────────────────────────
function Leaderboard({ me, friends }: { me:any; friends:any[] }) {
  const base = friends.map(e=>({
    name: e.friend.displayName,
    pts: Math.floor(Math.random()*3000+1500), // decorative
    color: fColor(e.friend.id),
    isMe: false,
    id: e.friend.id,
  }));
  const myEntry = { name: me?.displayName??"أنت", pts:3990, color:"#06B6D4", isMe:true, id:0 };
  const all = [...base, myEntry].sort((a,b)=>b.pts-a.pts).slice(0,5);
  const max = all[0]?.pts??1;
  return (
    <div className="section-box">
      <div className="section-hd">
        <span className="section-title">🏆 الترتيب</span>
        <span className="section-link">هذا الأسبوع</span>
      </div>
      <div className="lb-list">
        {all.map((p,i)=>(
          <div key={p.name+i} className={`lb-row${p.isMe?" lb-row--me":""}`}>
            <span className="lb-pos" style={{color:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#555"}}>
              {i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}
            </span>
            <span className="lb-name" style={{color:p.isMe?p.color:"#ccc"}}>{p.name}{p.isMe?" ★":""}</span>
            <div className="lb-bar-wrap"><div className="lb-bar" style={{width:`${(p.pts/max)*100}%`,background:p.color,boxShadow:`0 0 8px ${p.color}60`}}/></div>
            <span className="lb-pts" style={{color:p.color}}>{p.pts.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AchievementShowcase ────────────────────────────────────────────────────────
function AchievementShowcase({ achievements }: { achievements:any[] }) {
  const fallback = [
    {icon:"🏆",name:"Apex Predator",description:"وصلت للرتبة الأعلى في Apex",rarity:"LEGENDARY",color:"#FFD700"},
    {icon:"⚡",name:"Rush Master",  description:"فزت بـ 10 مباريات متتالية",  rarity:"EPIC",     color:"#A855F7"},
    {icon:"🎯",name:"Party Leader", description:"قدت 50 بارتي للفوز",          rarity:"RARE",     color:"#06B6D4"},
  ];
  const items = achievements.length ? achievements.slice(0,3).map((a:any)=>({
    icon: a.icon??"🏆", name:a.name, description:a.description??a.name,
    rarity: a.rarity??"RARE", color: a.color??"#06B6D4",
  })) : fallback;
  const [active, setActive] = useState(0);
  useEffect(()=>{const id=setInterval(()=>setActive(a=>(a+1)%items.length),3000);return()=>clearInterval(id);},[items.length]);
  const ach=items[active];
  return (
    <div className="section-box" style={{"--ac":ach.color} as any}>
      <div className="section-hd">
        <span className="section-title">🎖️ إنجازاتك</span>
        <div className="ach-dots">{items.map((_,i)=><span key={i} className={`ach-dot${i===active?" ach-dot--on":""}`} onClick={()=>setActive(i)}/>)}</div>
      </div>
      <div className="ach-body">
        <div className="ach-icon">{ach.icon}</div>
        <div className="ach-info">
          <div className="ach-rarity" style={{color:ach.color}}>{ach.rarity}</div>
          <div className="ach-name">{ach.name}</div>
          <div className="ach-desc">{ach.description}</div>
        </div>
        <div className="ach-glow" style={{background:ach.color}}/>
      </div>
    </div>
  );
}

// ── ProCard ────────────────────────────────────────────────────────────────────
function ProCard({ me }: { me:any }) {
  if (!me?.isPro) return null;
  return (
    <div className="pro-card">
      <div className="pro-bg"/>
      <div className="pro-particles">{[...Array(6)].map((_,i)=><div key={i} className="pro-particle" style={{animationDelay:`${i*0.4}s`,left:`${15+i*14}%`}}/>)}</div>
      <div className="pro-header">
        <div className="pro-crown-wrap"><span className="pro-crown">👑</span><div className="pro-crown-glow"/></div>
        <div><div className="pro-title">PRO MEMBER</div><div className="pro-exp">عضوية نشطة</div></div>
        <div className="pro-active-pill">ACTIVE ✓</div>
      </div>
      <div className="pro-perks">
        <div className="pro-perk"><span>🎙️</span><span>غرفتي الصوتية</span><span className="perk-on">نشطة</span></div>
        <div className="pro-perk"><span>🤖</span><span>بوت LFG</span><span className="perk-on">مفعّل</span></div>
        <div className="pro-perk"><span>🎨</span><span>إطار مخصص</span><span className="perk-on">مفعّل</span></div>
        <div className="pro-perk"><span>🎁</span><span>إهداء Pro</span><span className="perk-avail">متاح</span></div>
      </div>
      <Link href="/pro" className="pro-manage">إدارة Pro ←</Link>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { t } = useTranslation("dashboard");
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const [, navigate] = useLocation();
  const { callUser, activeRoom } = useVoice();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const blockUser = useBlockUser();

  const { data: friendsSummary } = useGetOnlineFriendsSummary({
    query: { refetchInterval:5000, queryKey:getGetOnlineFriendsSummaryQueryKey() }
  });
  const { data: partyActivity } = useGetPartyActivityFeed({
    query: { refetchInterval:10000, queryKey:getGetPartyActivityFeedQueryKey() }
  });
  const { data: invites } = useListPartyInvites({
    query: { refetchInterval:10000, queryKey:getListPartyInvitesQueryKey() }
  });
  const acceptInvite  = useAcceptPartyInvite();
  const declineInvite = useDeclinePartyInvite();

  const { data: lfgSuggestions } = useQuery<any[]>({
    queryKey: ["lfg-suggestions"],
    queryFn: () => customFetch("/api/lfg/suggestions"),
    refetchInterval: 30000,
  });
  const { data: challenges } = useQuery<any[]>({
    queryKey: ["challenges-dash"],
    queryFn: () => customFetch("/api/challenges"),
    refetchInterval: 60000,
  });
  const { data: achievements } = useQuery<any[]>({
    queryKey: ["achievements-dash"],
    queryFn: () => customFetch("/api/achievements"),
    staleTime: 120000,
  });
  const { data: parties } = useQuery<any[]>({
    queryKey: ["parties-active-dash"],
    queryFn: () => customFetch("/api/parties?status=open"),
    refetchInterval: 15000,
  });
  const { data: stats } = useQuery<any>({
    queryKey: ["stats-me-dashboard"],
    queryFn: () => customFetch("/api/stats/me"),
    staleTime: 60000,
  });

  // Ticker events: real activity + static filler so the bar is never empty
  const TICKER_COLORS = ["#EC4899","#FFD700","#22C55E","#A855F7","#F97316","#06B6D4"];
  const STATIC_TICKER = [
    { text:"🏆 فريق LOUD يفوز ببطولة VCT Americas 2026",      color:"#FFD700" },
    { text:"⚡ Valorant EP9 — خريطة جديدة + عميل جديد",       color:"#06B6D4" },
    { text:"🎯 GWH Cup الليلة 8م — Prize: 5,000 ريال",        color:"#22C55E" },
    { text:"🔥 Apex: موسم الصياد يبدأ 22 يوليو",              color:"#F97316" },
    { text:"👑 اشتراك Pro متاح الآن بأسعار جديدة",            color:"#A855F7" },
    { text:"📡 2,400 لاعب يبحثون عن بارتي الآن",              color:"#EC4899" },
    { text:"🎮 CS2 تحديث توازن السلاح — Premier Season 4",    color:"#38BDF8" },
    { text:"⭐ موسم Ranked الجديد بدأ — تسلق الرتب الآن",     color:"#EF4444" },
  ];
  const realEvents = (partyActivity??[]).slice(0,8).map((a:any,i:number)=>({
    text: `${a.actor.displayName} ${a.action==="created"?"أنشأ بارتي":a.action==="joined"?"انضم لـ":a.action==="left"?"غادر":"دُعي إلى"} ${a.party.name}`,
    color: TICKER_COLORS[i % TICKER_COLORS.length],
  }));
  // interleave real + static so there's always ≥12 items
  const tickerEvents: {text:string;color:string}[] = [];
  const combined = [...realEvents];
  const fillCount = Math.max(0, 10 - combined.length);
  for (let i = 0; i < fillCount; i++) tickerEvents.push(STATIC_TICKER[i % STATIC_TICKER.length]);
  for (let i = 0; i < combined.length; i++) { tickerEvents.push(combined[i]); if (i < STATIC_TICKER.length) tickerEvents.push(STATIC_TICKER[i]); }

  const friends = friendsSummary?.friends ?? [];
  const onlineCount = friendsSummary?.onlineCount ?? 0;

  const hour = new Date().getHours();
  const greeting = hour<5?"🌙 ليلة طيبة":hour<12?"🌅 صباح الخير":hour<17?"☀️ مساء النور":"🌙 مساء الخير";

  const openDm = async (f: any) => {
    try {
      const conv = await customFetch<{ id:number }>(`/api/conversations/direct/${f.id}`);
      navigate(`/chat/${conv.id}`);
    } catch { toast({ title:"حدث خطأ", variant:"destructive" }); }
  };

  return (
    <div className="dash-root">
      <div className="dash-scanlines"/>

      <LiveTicker events={tickerEvents}/>

      {/* ── Party Invites Banner ── */}
      {invites && invites.length > 0 && (
        <div className="invite-banner">
          <span className="invite-badge">دعوات • {invites.length}</span>
          {invites.slice(0,2).map(inv=>(
            <div key={inv.id} className="invite-card">
              <div>
                <div className="invite-card-name">{inv.party.name}</div>
                <div className="invite-card-game">{inv.party.game??""} • {inv.invitedBy.username}</div>
              </div>
              <button className="invite-btn invite-btn--accept"
                onClick={()=>acceptInvite.mutate({inviteId:inv.id},{onSuccess:()=>queryClient.invalidateQueries({queryKey:getListPartyInvitesQueryKey()})})}>
                قبول
              </button>
              <button className="invite-btn invite-btn--decline"
                onClick={()=>declineInvite.mutate({inviteId:inv.id},{onSuccess:()=>queryClient.invalidateQueries({queryKey:getListPartyInvitesQueryKey()})})}>
                رفض
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Header ── */}
      <div className="dash-header">
        <div className="dash-header-left">
          <div className="dash-greeting">{greeting}</div>
          <div className="dash-name">مرحباً، <span className="name-highlight">{me?.displayName?.toUpperCase()??"—"}</span> 👋</div>
          <XpBar me={me}/>
        </div>
        <div className="dash-stats-row">
          <StatCard icon="⏱️" value="24h"           label="هذا الأسبوع" color="#22C55E" sub="+3h من أمس"/>
          <StatCard icon="🏆" value={`#${stats?.rank??3}`} label="الرتبة"     color="#FFD700" sub="بين الأصدقاء"/>
          <StatCard icon="🌐" value={String(onlineCount)} label="Online الآن" color="#06B6D4" sub={`من ${friends.length}`}/>
          <StatCard icon="🔥" value={`${stats?.streak??1}d`} label="Streak"  color="#F97316" sub="أيام متتالية"/>
        </div>
      </div>

      <MoodStatus/>
      <QuickDock inviteCount={invites?.length??0} streak={stats?.streak??1}/>

      {/* ── Body ── */}
      <div className="dash-body">
        <div className="dash-main">
          {/* top row: spin | graph | hub */}
          <div className="dash-top-row">
            <DailySpin userId={me?.id}/>
            <WeeklyGraph stats={stats}/>
            <HubCard lfgPosts={lfgSuggestions??[]} parties={parties??[]}/>
          </div>
          <FriendsGrid
            friends={friends}
            onCall={f=>callUser({userId:f.id,username:f.username,displayName:f.displayName,avatarUrl:f.avatarUrl??null})}
            onDm={openDm}
            onBlock={f=>blockUser.mutate({userId:f.id},{onSuccess:()=>queryClient.invalidateQueries({queryKey:getGetOnlineFriendsSummaryQueryKey()})})}
          />
          <CommunityHighlights activity={partyActivity??[]}/>
        </div>

        <div className="dash-side">
          <SmartMatch friends={friends}/>
          <ChallengeVs me={me} friends={friends}/>
          <TournamentCard/>
          <ChallengeCard challenges={challenges??[]}/>
          <Leaderboard me={me} friends={friends}/>
          <AchievementShowcase achievements={achievements??[]}/>
          <ProCard me={me}/>
        </div>
      </div>
    </div>
  );
}
