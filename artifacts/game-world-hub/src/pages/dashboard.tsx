import { useState, useEffect, useRef, useCallback } from "react";
import { DailyQuestsWidget } from "@/components/daily-quests-widget";
import { BattlePassWidget } from "@/pages/battle-pass";
import { GlobalChat } from "@/components/global-chat";
import { ProBadge } from "@/components/pro-badge";
import "./dashboard.css";
import {
  useGetMe, useGetOnlineFriendsSummary, useGetPartyActivityFeed,
  useListPartyInvites, useBlockUser, useAcceptPartyInvite, useDeclinePartyInvite,
  customFetch,
  getGetOnlineFriendsSummaryQueryKey, getGetPartyActivityFeedQueryKey,
  getListPartyInvitesQueryKey, getGetMeQueryKey,
  type User,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useVoice } from "@/voice/voice-context";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

// ── Palette helpers ────────────────────────────────────────────────────────────
const PALETTE = ["#EC4899","#06B6D4","#A855F7","#22C55E","#F97316","#FFD700","#EF4444","#38BDF8"];
const fColor = (id: number) => PALETTE[id % PALETTE.length];

// ── Static data (no API equivalent) ───────────────────────────────────────────
const SPIN_PRIZES_BASE = [
  { key:"500 XP",     color:"#22C55E", icon:"⚡" },
  { key:"miss",       color:"#333",    icon:"💨" },
  { key:"proDay",     color:"#FFD700", icon:"👑" },
  { key:"200 XP",     color:"#06B6D4", icon:"🎯" },
  { key:"miss",       color:"#333",    icon:"💨" },
  { key:"rareBadge",  color:"#A855F7", icon:"🏅" },
  { key:"1000 XP",    color:"#EF4444", icon:"🔥" },
  { key:"100 XP",     color:"#F97316", icon:"🎁" },
];
const WEEK_GRAPH = [3,7,2,9,5,11,8];
const FEATURED_GAME = { name:"Valorant", mode:"RANKED • ACT III", accent:"#FF4655" };
const NEWS_ITEMS = [
  { tag:"UPDATE", color:"#22C55E", text:"Valorant EP9 — New map + new agent" },
  { tag:"ESPORTS",color:"#FFD700", text:"LOUD wins VCT Americas 2026 championship" },
  { tag:"PATCH",  color:"#F97316", text:"CS2 — Weapon balance update Premier Season 4" },
  { tag:"EVENT",  color:"#A855F7", text:"Apex: Hunter Season starts July 22" },
];
const HIGHLIGHTS = [
  { user:"Khalid",  avatarUrl:null, clip:"Ace Round Valorant 🔥",          views:"12K", ago:"2m", color:"#EC4899" },
  { user:"Sara",    avatarUrl:null, clip:"Apex Predator Montage ⚡",        views:"8.4K",ago:"7m", color:"#06B6D4" },
  { user:"Faisal2", avatarUrl:null, clip:"5K AWP CS2 Premier 💥",          views:"21K", ago:"15m",color:"#22C55E" },
  { user:"Reem",    avatarUrl:null, clip:"Overwatch Triple Elimination 🎯", views:"5.1K",ago:"28m",color:"#F97316" },
];

// ── LiveTicker ─────────────────────────────────────────────────────────────────
function LiveTicker({ events }: { events: Array<{text:string;color:string}> }) {
  const { t } = useTranslation("dashboard");
  const [offset, setOffset] = useState(0);
  const items = events.length ? events : [{ text:t("ticker.welcome"), color:"#22C55E" }];
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
function XpBar({ me }: { me: User | null | undefined }) {
  if (!me) return null;
  const xpForNext = me.xpForNext ?? 0;
  const xpIntoLevel = me.xpIntoLevel ?? 0;
  const tierLevel = me.tierLevel ?? 1;
  const pct = xpForNext > 0 ? Math.round((xpIntoLevel / xpForNext) * 100) : 0;
  return (
    <div className="xp-wrap">
      <div className="xp-header">
        <span className="xp-level">
          {me.tier ? `${me.tier} · LVL ${tierLevel}` : `LVL ${tierLevel}`}
        </span>
        <span className="xp-nums">{xpIntoLevel.toLocaleString()} / {xpForNext.toLocaleString()} XP</span>
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
  const { t } = useTranslation("dashboard");
  const [selected, setSelected] = useState(0);
  const MOODS = [
    { icon:"😤", label:t("mood.playing") },
    { icon:"😎", label:t("mood.casual") },
    { icon:"🎯", label:t("mood.training") },
    { icon:"🏆", label:t("mood.ranked") },
    { icon:"😴", label:t("mood.sleeping") },
  ];
  return (
    <div className="mood-bar">
      <span className="mood-title">{t("mood.label")}</span>
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
  const { t } = useTranslation("dashboard");
  const [,nav] = useLocation();
  const ITEMS = [
    { icon:"⚔️", label:t("dock.newParty"),    href:"/parties",    color:"#22C55E", badge:inviteCount||null },
    { icon:"📡", label:t("dock.lfg"),          href:"/lfg",        color:"#EC4899", badge:null },
    { icon:"👥", label:t("dock.friends"),      href:"/friends",    color:"#06B6D4", badge:null },
    { icon:"💬", label:t("dock.messages"),     href:"/chat",       color:"#A855F7", badge:null },
    { icon:"🏆", label:t("dock.challenges"),   href:"/challenges", color:"#FFD700", badge:null },
    { icon:"⭐", label:t("dock.achievements"), href:"/ranks",      color:"#F97316", badge:null },
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
          <span className="streak-label">{t("dock.streakDays")}</span>
        </div>
      )}
    </div>
  );
}

// ── DailySpin ──────────────────────────────────────────────────────────────────
function DailySpin({ userId }: { userId?:number }) {
  const { t } = useTranslation("dashboard");
  const SPIN_PRIZES = SPIN_PRIZES_BASE.map(p => ({
    ...p,
    label: p.key === "miss" ? t("spin.prizeMiss") : p.key === "proDay" ? t("spin.prizeProDay") : p.key === "rareBadge" ? t("spin.prizeRareBadge") : p.key,
  }));
  const today = new Date().toISOString().slice(0,10);
  const key = `gwh_spin_${userId??0}_${today}`;
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle]       = useState(0);
  const [result, setResult]     = useState<{label:string;color:string;icon:string}|null>(null);
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
        <span className="section-title">{t("spin.title")}</span>
        {done ? <span className="spin-reset">{t("spin.comeBack")}</span> : <span className="spin-free-badge">{t("spin.free")}</span>}
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
              {result.label===t("spin.prizeMiss") ? t("spin.miss") : t("spin.won", { prize:result.label })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── WeeklyGraph ────────────────────────────────────────────────────────────────
function WeeklyGraph({ stats }: { stats?:any }) {
  const { t } = useTranslation("dashboard");
  const WEEK_DAYS = [0,1,2,3,4,5,6].map(i => t(`graph.days_${i}`));
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
        <span className="section-title">{t("graph.title")}</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span className="wg-up-badge">▲ 31%</span>
          <span style={{fontSize:9,color:"#555"}}>{t("graph.vsLastWeek")}</span>
        </div>
      </div>
      <div className="wg-body">
        <div className="wg-summary">
          <div className="wg-sum-item"><span className="wg-sum-val" style={{color:"#22C55E"}}>{total}</span><span className="wg-sum-label">{t("graph.wins")}</span></div>
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
                {isHov&&<div className="wg-tooltip" style={{borderColor:color,color}}>{v}W{isBest&&<span className="wg-best-tag">{t("graph.best")}</span>}</div>}
                <div className="wg-track">
                  <div className="wg-fill" style={{height:`${pct}%`,background:isToday?"linear-gradient(180deg,#4ADE80,#22C55E)":isBest?"linear-gradient(180deg,#FDE68A,#FFD700)":"linear-gradient(180deg,#38BDF8,#06B6D4)",boxShadow:isHov?`0 0 12px ${color}80`:"none",opacity:isHov?1:0.75}}>
                    <div className="wg-fill-shine"/>
                  </div>
                  {(isToday||isBest)&&<div className="wg-marker" style={{background:color,boxShadow:`0 0 8px ${color}`}}/>}
                </div>
                <div className="wg-day" style={{color:isToday?"#22C55E":isBest?"#FFD700":"#444",fontWeight:isToday||isBest?900:400}}>{WEEK_DAYS[i]}</div>
                {isToday&&<div className="wg-today-tag">{t("graph.today")}</div>}
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
  const { t } = useTranslation("dashboard");
  const [tab, setTab] = useState<"game"|"lfg"|"news"|"party">("game");
  const TABS = [
    {id:"game",  icon:"🎮", label:t("hub.tabToday")},
    {id:"lfg",   icon:"📡", label:"LFG"},
    {id:"news",  icon:"📰", label:t("hub.tabNews")},
    {id:"party", icon:"⚔️", label:t("hub.tabParties")},
  ] as const;
  const [responded, setResponded] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navHub] = useLocation();

  const respond = async (id:number) => {
    try {
      await customFetch(`/api/lfg/${id}/respond`,{method:"POST"});
      setResponded(p=>new Set([...p,id]));
      qc.invalidateQueries({ queryKey: ["lfg-suggestions"] });
      toast({ title:t("hub.respondedToast"), description:t("hub.respondedToastDesc") });
      setTimeout(()=>navHub("/lfg"), 1200);
    } catch { toast({title:t("hub.respondError"),variant:"destructive"}); }
  };

  return (
    <div className="hub-card section-box">
      <div className="hub-tabs">
        {TABS.map(tb=><button key={tb.id} className={`hub-tab${tab===tb.id?" hub-tab--on":""}`} onClick={()=>setTab(tb.id)}><span>{tb.icon}</span>{tb.label}</button>)}
      </div>

      {tab==="game"&&(
        <div className="hub-pane hub-game">
          <div className="hub-game-bg"/><div className="hub-game-grid"/>
          <div className="hub-game-tag">{t("hub.todayTag")}</div>
          <div className="hub-game-name">{FEATURED_GAME.name}</div>
          <div className="hub-game-mode">{FEATURED_GAME.mode}</div>
          <div className="hub-game-row">
            <span className="hub-game-players">👥 {t("hub.gameActive")}</span>
            <span className="hub-game-update">⚡ {t("hub.gameUpdate")}</span>
          </div>
          <Link href="/lfg" className="hub-game-btn" style={{background:FEATURED_GAME.accent}}>{t("hub.joinNow")}</Link>
        </div>
      )}

      {tab==="lfg"&&(
        <div className="hub-pane">
          <div className="hub-pane-hd">
            <span style={{fontSize:9,color:"#555"}}>{t("hub.openRequests")}</span>
            <span className="hub-live-dot-wrap"><span className="online-dot"/>{t("hub.live")}</span>
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
                  {p.neededPlayers&&<div className="hub-lfg-need">{t("hub.slots",{count:p.neededPlayers})}</div>}
                  <div className="hub-lfg-ago">{p.ago??""}</div>
                </div>
                <button className="hub-lfg-btn" style={{borderColor:color,color}} disabled={done} onClick={()=>respond(p.id)}>
                  {done?"✓":t("hub.respond")}
                </button>
              </div>
            );
          })}
          {!lfgPosts.length&&<p style={{fontSize:10,color:"#444",textAlign:"center",padding:"12px 0"}}>{t("hub.noRequests")}</p>}
          <Link href="/lfg" className="hub-see-all">{t("hub.viewAll")}</Link>
        </div>
      )}

      {tab==="news"&&(
        <div className="hub-pane">
          <div className="hub-pane-hd">
            <span style={{fontSize:9,color:"#555"}}>Latest News</span>
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
            <span style={{fontSize:9,color:"#555"}}>{t("hub.activeParties")}</span>
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
                  <div className="hub-party-mode">{p.mode??""} • {t("hub.freeSlots",{count:slots})}</div>
                  <div className="hub-party-avs">
                    {members.map((m:any,j:number)=><div key={j} className="hub-party-av" style={{background:`${color}30`,borderColor:color,color}}>{m.displayName?.charAt(0)??"?"}</div>)}
                    {[...Array(slots)].map((_,j)=><div key={`e${j}`} className="hub-party-av hub-party-av--empty">+</div>)}
                  </div>
                </div>
                <Link href={`/party/${p.id}`} className="hub-party-btn" style={{background:color}}>{t("hub.joinParty")}</Link>
              </div>
            );
          })}
          {!parties.length&&<p style={{fontSize:10,color:"#444",textAlign:"center",padding:"12px 0"}}>{t("hub.noParties")}</p>}
          <Link href="/parties" className="hub-see-all">{t("hub.viewAllParties")}</Link>
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
  const { t } = useTranslation("dashboard");
  const online = friends.filter(e=>e.friend.status==="online").length;
  return (
    <div className="section-box">
      <div className="section-hd">
        <span className="section-title">{t("friends.title")}</span>
        <div className="section-hd-right">
          <span className="online-pill"><span className="online-dot"/>{t("friends.active",{count:online})}</span>
          <Link href="/friends" className="section-link">{t("friends.viewAll")}</Link>
        </div>
      </div>
      <div className="friends-grid">
        {friends.map(entry=>{
          const f=entry.friend;
          const color=(f as any).profileFrameColor??fColor(f.id);
          return (
            <Link key={f.id} href={`/profile/${f.id}`}
              className="fc"
              style={{"--fc":color} as any}>
              <div className="fc-top" style={{background:`linear-gradient(160deg,${color}40 0%,${color}10 60%,#0a0a0a 100%)`}}>
                <span className="fc-rank-tag" style={{color,borderColor:`${color}50`}}>{f.tier??"—"}</span>
              </div>
              <div className="fc-av-wrap">
                <div className="fc-av" style={{borderColor:color}}>
                  {f.avatarUrl?<img src={f.avatarUrl} alt={f.displayName}/>:f.displayName.charAt(0).toUpperCase()}
                </div>
                <div className={`fc-dot fc-dot--${f.status}`}/>
              </div>
              <div className="fc-info">
                <div className="fc-name" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                  {f.displayName}
                  {f.isPro && <ProBadge size="icon"/>}
                </div>
                <div className="fc-user">@{f.username}</div>
                {f.currentGame
                  ?<div className="fc-game" style={{color}}>▶ {f.currentGame}</div>
                  :<div className="fc-idle">{f.status==="away"?t("friends.away"):f.status==="busy"?t("friends.busy"):"ONLINE"}</div>
                }
              </div>
              <div className="fc-actions">
                <button className="fc-act" style={{color,borderColor:`${color}50`}} onClick={e=>{e.preventDefault();onCall(f);}}>{t("friends.call")}</button>
                <button className="fc-act" style={{color,borderColor:`${color}50`}} onClick={e=>{e.preventDefault();onDm(f);}}>{t("friends.chat")}</button>
                <button className="fc-act" style={{color:"#EF4444",borderColor:"#EF444450"}} onClick={e=>{e.preventDefault();onBlock(f);}}>{t("friends.block")}</button>
              </div>
            </Link>
          );
        })}
        {!friends.length&&(
          <div style={{gridColumn:"1/-1",textAlign:"center",padding:"24px 0",color:"#333",fontSize:11}}>
            {t("friends.empty")}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CommunityHighlights ────────────────────────────────────────────────────────
function CommunityHighlights({ activity }: { activity:any[] }) {
  const { t } = useTranslation("dashboard");
  const highlights = activity.length
    ? activity.slice(0,4).map((a:any,i:number)=>({
        user: a.actor.displayName,
        avatarUrl: a.actor.avatarUrl ?? null,
        clip: `${a.actor.displayName} ${a.action==="created"?t("highlights.created"):a.action==="joined"?t("highlights.joined"):t("highlights.left")} ${a.party.name}`,
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
        <span className="section-title">{t("highlights.title")}</span>
        <span style={{fontSize:9,color:"#EF4444"}}>TRENDING</span>
      </div>
      <div style={{padding:"8px 10px",display:"flex",flexDirection:"column",gap:4}}>
        {highlights.map((h,i)=>(
          <div key={i} className={`highlight-row${i===active?" highlight-row--active":""}`}
            style={{borderColor:i===active?h.color:"transparent"}} onClick={()=>setActive(i)}>
            <div className="hl-av" style={{background:`linear-gradient(135deg,${h.color}80,${h.color}20)`,borderColor:h.color}}>
              {h.avatarUrl
                ? <img src={h.avatarUrl} alt={h.user} style={{width:"100%",height:"100%",borderRadius:"50%",objectFit:"cover"}}/>
                : h.user.charAt(0)}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div className="hl-clip">{h.clip}</div>
              <div className="hl-meta"><span style={{color:h.color}}>@{h.user}</span> • {h.ago}</div>
            </div>
            <div className="hl-right">
              <div className="hl-views">👁 {h.views}</div>
              {i===active&&<button className="hl-watch-btn" style={{color:h.color,borderColor:`${h.color}60`}}>{t("highlights.watch")}</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SmartMatch ─────────────────────────────────────────────────────────────────
function SmartMatch({ friends, openParties }: { friends:any[]; openParties:any[] }) {
  const { t } = useTranslation("dashboard");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [cd, setCd] = useState(180);
  const [, nav] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const party = openParties?.[0] ?? null;

  useEffect(()=>{
    if (joined) return;
    const id = setInterval(()=>setCd(c=>c>0?c-1:0),1000);
    return ()=>clearInterval(id);
  },[joined]);

  const mm=String(Math.floor(cd/60)).padStart(2,"0"), ss=String(cd%60).padStart(2,"0");
  const pct=(cd/180)*100;
  const shown = friends.slice(0,3);

  const handleJoin = async () => {
    if (joining || joined) return;
    if (!party) { nav("/parties"); return; }
    setJoining(true);
    try {
      await customFetch(`/api/parties/${party.id}/join`, { method:"POST" });
      setJoined(true);
      qc.invalidateQueries({ queryKey: ["parties-active-dash"] });
      toast({ title: t("smartMatch.joinedToast") });
      setTimeout(()=>nav(`/party/${party.id}`), 900);
    } catch (e:any) {
      const msg = e?.data?.error ?? t("smartMatch.joinErrorDefault");
      toast({ title: t("smartMatch.joinError"), description: msg, variant:"destructive" });
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="section-box match-box">
      <div className="match-pulse-ring"/>
      <div className="section-hd">
        <span className="section-title">{t("smartMatch.title")}</span>
        <div className="match-live-badge"><span className="match-live-dot"/>LIVE</div>
      </div>
      <div className="match-game">{party?.game ?? "Valorant"}</div>
      <div className="match-meta">"{party?.name ?? "Rush Squad"}" • {t("smartMatch.players",{count:(party?.memberCount ?? shown.length) || 3})}</div>
      <div className="match-avatars">
        {shown.length ? shown.map((e:any)=>{const f=e.friend;const color=fColor(f.id);return(
          <div key={f.id} className="match-av" style={{background:`linear-gradient(135deg,${color}88,${color}33)`,borderColor:color}}>
            {f.avatarUrl?<img src={f.avatarUrl} alt=""/>:f.displayName.charAt(0)}
          </div>
        )}) : [
          <div key="a" className="match-av" style={{background:"#1a1a1a",borderColor:"#333"}}>K</div>,
          <div key="b" className="match-av" style={{background:"#1a1a1a",borderColor:"#333"}}>S</div>,
          <div key="c" className="match-av" style={{background:"#1a1a1a",borderColor:"#333"}}>F</div>,
        ]}
      </div>
      {!joined && <div className="match-countdown">
        <div className="match-cd-track">
          <div className="match-cd-fill" style={{width:`${pct}%`,background:pct<30?"#EF4444":pct<60?"#FFD700":"#22C55E"}}/>
        </div>
        <span className="match-cd-time" style={{color:pct<30?"#EF4444":"#ccc"}}>⏱ {mm}:{ss}</span>
      </div>}
      <button
        className={`match-btn${(joined||joining)?" match-btn--done":""}`}
        onClick={handleJoin}
        disabled={joining||joined}
      >
        {joining ? t("smartMatch.joining") : joined ? t("smartMatch.joined") : t("smartMatch.joinNow")}
      </button>
    </div>
  );
}

// ── ChallengeVs ────────────────────────────────────────────────────────────────
function ChallengeVs({ me, friends }: { me: User | null | undefined; friends:any[] }) {
  const { t } = useTranslation("dashboard");
  const [sel, setSel] = useState<any>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const online = friends.filter(e=>e.friend.status==="online");
  const myColor = "#06B6D4";

  const sendChallenge = async () => {
    if (!sel || sending || sent) return;
    setSending(true);
    try {
      const endsAt = new Date(Date.now() + 7 * 86400000).toISOString();
      await customFetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId: sel.id, type: "most_hours", endsAt }),
      });
      setSent(true);
      qc.invalidateQueries({ queryKey: ["challenges"] });
      toast({ title: t("challengeVs.sentToast") });
      setTimeout(() => nav("/challenges"), 1200);
    } catch (e: any) {
      toast({ title: t("challengeVs.errorToast"), description: e?.data?.error ?? t("challengeVs.errorDefault"), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="section-box vs-box">
      <div className="section-hd">
        <span className="section-title">{t("challengeVs.title")}</span>
        <span style={{fontSize:9,color:"#EF4444",letterSpacing:1}}>{t("challengeVs.live")}</span>
      </div>
      <div className="vs-inner">
        <div className="vs-you">
          <div className="vs-av" style={{background:`linear-gradient(135deg,${myColor},${myColor}30)`,borderColor:myColor}}>
            {me?.avatarUrl?<img src={me.avatarUrl} alt=""/>:(me?.displayName??"?").charAt(0)}
          </div>
          <div className="vs-name">{t("challengeVs.you")}</div>
          <div className="vs-rank">LVL {me?.tierLevel??1}</div>
        </div>
        <div className="vs-middle">
          <div className="vs-text">VS</div>
          {sent&&<div className="vs-sent">{t("challengeVs.sent")}</div>}
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
          ):<div className="vs-pick">{t("challengeVs.pickOpponent")}</div>}
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
      <button
        className={`vs-send-btn${(!sel||sent||sending)?" vs-send-btn--dis":""}`}
        onClick={sendChallenge}
        disabled={!sel||sent||sending}
      >
        {sending ? t("challengeVs.sending") : sent ? t("challengeVs.sentBtn") : t("challengeVs.sendBtn")}
      </button>
    </div>
  );
}

// ── TournamentCard ─────────────────────────────────────────────────────────────
function TournamentCard() {
  const { t } = useTranslation("dashboard");
  const [joined, setJoined] = useState<number|null>(null);
  const TOURNAMENTS = [
    { name:"GWH Cup — Final",   date:t("tournament.tomorrow8"), prize:"5,000 SAR", game:"Valorant",     color:"#EF4444", hot:true  },
    { name:"CS2 Weekly Open",   date:t("tournament.friday9"),   prize:"1,000 SAR", game:"CS2",          color:"#F97316", hot:false },
    { name:"Apex Legends Solo", date:t("tournament.saturday7"), prize:"2,500 SAR", game:"Apex Legends", color:"#A855F7", hot:false },
  ];
  return (
    <div className="section-box">
      <div className="section-hd">
        <span className="section-title">{t("tournament.title")}</span>
        <span className="trn-hot-tag">🔥 HOT</span>
      </div>
      {TOURNAMENTS.map((trn,i)=>(
        <div key={i} className={`trn-row${trn.hot?" trn-row--hot":""}`} style={{"--tc":trn.color} as any}>
          {trn.hot&&<div className="trn-hot-bar" style={{background:trn.color}}/>}
          <div className="trn-main">
            <div>
              <div className="trn-name" style={{color:trn.hot?trn.color:"#ccc"}}>{trn.name}</div>
              <div className="trn-game">{trn.game} • {trn.date}</div>
            </div>
            <div style={{textAlign:"end"}}>
              <div className="trn-prize" style={{color:trn.color}}>{trn.prize}</div>
              <button className={`trn-join-btn${joined===i?" trn-join-btn--done":""}`}
                style={{borderColor:trn.color,color:joined===i?"#000":trn.color,background:joined===i?trn.color:"transparent"}}
                onClick={()=>setJoined(i)}>
                {joined===i ? t("tournament.registered") : t("tournament.register")}
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
  const { t } = useTranslation("dashboard");
  const [animated, setAnimated] = useState(false);
  useEffect(()=>{setTimeout(()=>setAnimated(true),400);},[]);
  const active = challenges.find(c=>c.status==="active");
  if (!active && !challenges.length) return null;
  const c = active ?? { title:t("challenge.fallbackTitle"), description:t("challenge.fallbackDesc"), progress:3, goal:5, xpReward:200, expiresAt:"" };
  const pct = Math.min(100, Math.round((c.progress/c.goal)*100));
  return (
    <div className="section-box challenge-box">
      <div className="section-hd">
        <span className="section-title">{t("challenge.title")}</span>
        <span className="challenge-timer">{t("challenge.timer")}</span>
      </div>
      <div className="challenge-name">{c.title}</div>
      <div className="challenge-desc">{c.description}</div>
      <div className="challenge-track">
        <div className="challenge-fill" style={{width:animated?`${pct}%`:"0%",transition:"width 1.2s cubic-bezier(.4,0,.2,1)"}}><div className="challenge-shimmer"/></div>
        <span className="challenge-num">{c.progress} / {c.goal}</span>
      </div>
      <div className="challenge-rewards">
        <span className="reward-chip">🎁 {c.xpReward} XP</span>
        <span className="reward-chip">{t("challenge.badge")}</span>
        <span className="reward-chip">{t("challenge.proPrize")}</span>
      </div>
    </div>
  );
}

// ── Leaderboard ────────────────────────────────────────────────────────────────
function Leaderboard({ me, friends }: { me: User | null | undefined; friends:any[] }) {
  const { t } = useTranslation("dashboard");
  const base = friends.map(e=>({
    name: e.friend.displayName,
    pts: Math.floor(Math.random()*3000+1500),
    color: fColor(e.friend.id),
    isMe: false,
    id: e.friend.id,
  }));
  const myEntry = { name: me?.displayName ?? t("leaderboard.you"), pts:3990, color:"#06B6D4", isMe:true, id:0 };
  const all = [...base, myEntry].sort((a,b)=>b.pts-a.pts).slice(0,5);
  const max = all[0]?.pts??1;
  return (
    <div className="section-box">
      <div className="section-hd">
        <span className="section-title">{t("leaderboard.title")}</span>
        <span className="section-link">{t("leaderboard.thisWeek")}</span>
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
  const { t } = useTranslation("dashboard");
  const fallback = [
    {icon:"🏆",name:t("achievements.fallback0Name"),description:t("achievements.fallback0Desc"),rarity:"LEGENDARY",color:"#FFD700"},
    {icon:"⚡",name:t("achievements.fallback1Name"),description:t("achievements.fallback1Desc"),rarity:"EPIC",     color:"#A855F7"},
    {icon:"🎯",name:t("achievements.fallback2Name"),description:t("achievements.fallback2Desc"),rarity:"RARE",     color:"#06B6D4"},
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
        <span className="section-title">{t("achievements.title")}</span>
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

// ── SpotlightCarousel ─────────────────────────────────────────────────────────
export function SpotlightCarousel({ me }: { me?: User | null }) {
  const { t } = useTranslation("dashboard");
  const isAr = i18n.resolvedLanguage?.startsWith("ar");
  const { data: spotlightUsers, isLoading } = useQuery<any[]>({
    queryKey: ["spotlight"],
    queryFn: () => customFetch("/api/users/spotlight"),
    refetchInterval: 60_000 * 10, // 10 min
    staleTime: 60_000 * 60,
  });

  // True only when the user's own card is in the live carousel sample AND they
  // haven't opted out.  The opt-out flag is checked locally (from the me cache)
  // so the pill disappears the moment settings invalidates the me query — no
  // manual reload required.
  const isFeatured = !!(me?.id && !me?.spotlightOptOut && spotlightUsers?.some((u: any) => u.id === me.id));

  return (
    <div className="border border-yellow-400/30 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono font-bold text-xs uppercase tracking-widest text-yellow-400">{t("spotlight.title")}</p>
          <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{t("spotlight.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {isFeatured && (
            <Link href="/settings#spotlight">
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest border border-yellow-400/60 bg-yellow-400/10 text-yellow-300 hover:bg-yellow-400/20 px-2 py-0.5 transition-colors cursor-pointer">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse shrink-0" />
                {t("spotlight.youAreFeatured")}
              </span>
            </Link>
          )}
          <Link href="/pro"><span className="font-mono text-[10px] text-yellow-400 hover:underline uppercase">Pro Hunt →</span></Link>
        </div>
      </div>
      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="shrink-0 w-20 space-y-1.5 animate-pulse">
              <div className="w-12 h-12 mx-auto bg-muted rounded-sm border border-yellow-400/20" />
              <div className="h-2.5 bg-muted rounded mx-1" />
            </div>
          ))}
        </div>
      ) : !spotlightUsers || spotlightUsers.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground text-center py-4">{t("spotlight.empty")}</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
          {spotlightUsers.map((u: any) => (
            <Link key={u.id} href={`/profile/${u.id}`}>
              <div className="shrink-0 w-20 flex flex-col items-center gap-1.5 cursor-pointer group">
                <div className="relative">
                  <div className="w-12 h-12 rounded-sm bg-muted border border-yellow-400/40 overflow-hidden flex items-center justify-center font-mono text-sm group-hover:border-yellow-400 transition-colors">
                    {u.avatarUrl
                      ? <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                      : <span>{u.displayName.charAt(0).toUpperCase()}</span>
                    }
                  </div>
                  <div className="absolute -top-1 -end-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center text-[8px] leading-none">👑</div>
                </div>
                <p className="font-mono text-[10px] text-center text-muted-foreground group-hover:text-yellow-400 truncate w-full text-center transition-colors leading-tight">
                  {isAr ? (u.displayName || u.username) : (u.displayName || u.username)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── VipLoungeCard ─────────────────────────────────────────────────────────────
function VipLoungeCard({ me }: { me: User | null | undefined }) {
  const { t } = useTranslation("dashboard");
  const { joinVipLounge } = useVoice();
  const { toast } = useToast();
  // `isPro` is server-computed and already reflects an active subscription
  const isPro = !!me?.isPro;

  const { data: vip, refetch } = useQuery<{ participantCount: number; canJoin: boolean }>({
    queryKey: ["vip-lounge-dash"],
    queryFn: () => customFetch("/api/pro-hunt/vip-lounge"),
    refetchInterval: 30_000,
  });

  const handleJoin = async () => {
    if (!isPro) { return; }
    try {
      await joinVipLounge();
      await refetch();
    } catch {
      toast({ title: t("vipLounge.joinError"), variant: "destructive" });
    }
  };

  return (
    <div className={`border p-4 space-y-3 ${isPro ? "border-yellow-400/40 bg-yellow-400/5" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2">
        <span className="text-base">👑</span>
        <div>
          <p className="font-mono font-bold text-xs uppercase tracking-widest text-yellow-400">{t("vipLounge.title")}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{t("vipLounge.subtitle")}</p>
        </div>
        {(vip?.participantCount ?? 0) > 0 && (
          <div className="ms-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="font-mono text-[10px] text-green-400 uppercase">{t("vipLounge.active")}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">
          {t("vipLounge.participants", { count: vip?.participantCount ?? 0 })}
        </span>
        {isPro ? (
          <button
            className="font-mono text-[10px] uppercase tracking-widest border border-yellow-400/50 bg-yellow-400/10 text-yellow-300 hover:bg-yellow-400/20 px-3 py-1.5 transition-colors"
            onClick={handleJoin}
          >
            {t("vipLounge.join")}
          </button>
        ) : (
          <Link href="/pro-hunt">
            <button className="font-mono text-[10px] uppercase tracking-widest border border-border text-muted-foreground hover:border-yellow-400/50 hover:text-yellow-400 px-3 py-1.5 transition-colors">
              {t("vipLounge.upgrade")}
            </button>
          </Link>
        )}
      </div>
    </div>
  );
}

// ── ProCard ────────────────────────────────────────────────────────────────────
function ProCard({ me }: { me: User | null | undefined }) {
  const { t } = useTranslation("dashboard");
  if (!me?.isPro) return null;
  return (
    <div className="pro-card">
      <div className="pro-bg"/>
      <div className="pro-particles">{[...Array(6)].map((_,i)=><div key={i} className="pro-particle" style={{animationDelay:`${i*0.4}s`,left:`${15+i*14}%`}}/>)}</div>
      <div className="pro-header">
        <div className="pro-crown-wrap"><span className="pro-crown">👑</span><div className="pro-crown-glow"/></div>
        <div><div className="pro-title">PRO MEMBER</div><div className="pro-exp">{t("pro.activeMembership")}</div></div>
        <div className="pro-active-pill">ACTIVE ✓</div>
      </div>
      <div className="pro-perks">
        <div className="pro-perk"><span>🎙️</span><span>{t("pro.myRoom")}</span><span className="perk-on">{t("pro.active")}</span></div>
        <div className="pro-perk"><span>🤖</span><span>{t("pro.lfgBot")}</span><span className="perk-on">{t("pro.enabled")}</span></div>
        <div className="pro-perk"><span>🎨</span><span>{t("pro.customFrame")}</span><span className="perk-on">{t("pro.enabled")}</span></div>
        <div className="pro-perk"><span>🎁</span><span>{t("pro.giftPro")}</span><span className="perk-avail">{t("pro.available")}</span></div>
      </div>
      <Link href="/pro" className="pro-manage">{t("pro.manageLink")}</Link>
    </div>
  );
}

// ── Flash Event Banner ────────────────────────────────────────────────────────

/** Invalidates the flash-active-banner query on WS push events */
function useFlashEventWsSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["flash-active-banner"] });
    };
    window.addEventListener("gwh:flash_event_new", refresh);
    window.addEventListener("gwh:flash_event_complete", refresh);
    return () => {
      window.removeEventListener("gwh:flash_event_new", refresh);
      window.removeEventListener("gwh:flash_event_complete", refresh);
    };
  }, [queryClient]);
}

function useFlashCountdown(expiresAt: string | null | undefined): number {
  const [remaining, setRemaining] = useState(() =>
    expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : 0,
  );
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

function FlashEventBanner() {
  const { t } = useTranslation("events");
  const isAr = i18n.resolvedLanguage?.startsWith("ar");
  useFlashEventWsSync();
  const { data: flash } = useQuery<any>({
    queryKey: ["flash-active-banner"],
    queryFn: () => customFetch("/api/events/flash/active"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const remaining = useFlashCountdown(flash?.expiresAt);

  if (!flash || flash.status !== "active") return null;

  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  const countdown = remaining > 0 ? (h > 0 ? `${h}h ${m}m` : `${m}m`) : t("time.expired");
  const title = isAr && flash.titleAr ? flash.titleAr : flash.title;

  return (
    <div className="relative flex items-center justify-between gap-3 px-4 py-2 bg-gradient-to-r from-orange-500/20 via-yellow-500/10 to-orange-500/20 border-b border-orange-500/30 overflow-hidden">
      {/* Pulse glow */}
      <div className="absolute inset-0 bg-orange-500/5 animate-pulse pointer-events-none" />
      <div className="flex items-center gap-2 min-w-0 relative">
        <span className="text-base shrink-0">{flash.icon ?? "⚡"}</span>
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-widest text-orange-400 shrink-0">
            {t("flash.bannerTitle")}
          </span>
          <span className="font-mono text-xs text-foreground/90 truncate">{title}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 relative">
        <div className="text-end hidden sm:block">
          <div className="font-mono text-[10px] text-muted-foreground uppercase">{t("flash.expiresIn")}</div>
          <div className={`font-mono text-xs tabular-nums font-bold ${remaining < 3_600_000 ? "text-red-400" : "text-orange-400"}`}>
            {countdown}
          </div>
        </div>
        {flash.xpReward > 0 && (
          <span className="font-mono text-[10px] bg-orange-500/20 border border-orange-500/40 text-orange-300 px-2 py-0.5">
            +{flash.xpReward} XP
          </span>
        )}
        {flash.viewerJoined ? (
          <span className="font-mono text-[10px] text-green-400 uppercase tracking-widest">{t("flash.complete")}</span>
        ) : (
          <Link href="/events">
            <button className="font-mono text-[10px] uppercase tracking-widest border border-orange-500/50 text-orange-400 hover:bg-orange-500/20 px-3 py-1 transition-colors">
              {t("flash.bannerCta")}
            </button>
          </Link>
        )}
      </div>
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
    { text:"🏆 LOUD wins VCT Americas 2026",              color:"#FFD700" },
    { text:"⚡ Valorant EP9 — New map + new agent",       color:"#06B6D4" },
    { text:"🎯 GWH Cup Tonight 8PM — Prize: 5,000 SAR",  color:"#22C55E" },
    { text:"🔥 Apex: Hunter Season starts July 22",       color:"#F97316" },
    { text:"👑 Pro subscription now available",           color:"#A855F7" },
    { text:"📡 2,400 players looking for a party now",    color:"#EC4899" },
    { text:"🎮 CS2 weapon balance update — Premier S4",   color:"#38BDF8" },
    { text:"⭐ New Ranked season started — climb now",    color:"#EF4444" },
  ];
  const realEvents = (partyActivity??[]).slice(0,8).map((a:any,i:number)=>({
    text: `${a.actor.displayName} ${a.action==="created"?t("activity.created"):a.action==="joined"?t("activity.joined"):a.action==="left"?t("activity.left"):t("activity.invited")} ${a.party.name}`,
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
  const greeting = hour<5 ? t("header.greetingNight") : hour<12 ? t("header.greetingMorning") : hour<17 ? t("header.greetingAfternoon") : t("header.greetingEvening");

  const openDm = async (f: any) => {
    try {
      const conv = await customFetch<{ id:number }>(`/api/conversations/direct/${f.id}`);
      navigate(`/chat/${conv.id}`);
    } catch { toast({ title: t("network.openChat"), variant:"destructive" }); }
  };

  return (
    <div className="dash-root">
      <div className="dash-scanlines"/>

      <LiveTicker events={tickerEvents}/>

      <FlashEventBanner />

      {/* ── Party Invites Banner ── */}
      {invites && invites.length > 0 && (
        <div className="invite-banner">
          <span className="invite-badge">{t("invites.title", { count: invites.length })}</span>
          {invites.slice(0,2).map(inv=>(
            <div key={inv.id} className="invite-card">
              <div>
                <div className="invite-card-name">{inv.party.name}</div>
                <div className="invite-card-game">{inv.party.game??""} • {inv.invitedBy.username}</div>
              </div>
              <button className="invite-btn invite-btn--accept"
                onClick={()=>acceptInvite.mutate({inviteId:inv.id},{onSuccess:()=>queryClient.invalidateQueries({queryKey:getListPartyInvitesQueryKey()})})}>
                {t("invites.accept")}
              </button>
              <button className="invite-btn invite-btn--decline"
                onClick={()=>declineInvite.mutate({inviteId:inv.id},{onSuccess:()=>queryClient.invalidateQueries({queryKey:getListPartyInvitesQueryKey()})})}>
                {t("invites.decline")}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Header ── */}
      <div className="dash-header">
        <div className="dash-header-left">
          <div className="dash-greeting">{greeting}</div>
          <div className="dash-name"><span className="name-highlight">{me?.displayName?.toUpperCase()??"—"}</span> 👋</div>
          <XpBar me={me}/>
        </div>
        <div className="dash-stats-row">
          <StatCard icon="⏱️" value="24h"                        label={t("stats.weeklyLabel")} color="#22C55E" sub={t("stats.weeklyHint",{h:3})}/>
          <StatCard icon="🏆" value={`#${stats?.rank??3}`}       label={t("stats.rankLabel")}   color="#FFD700" sub={t("stats.rankHint")}/>
          <StatCard icon="🌐" value={String(onlineCount)}         label={t("stats.onlineLabel")} color="#06B6D4" sub={t("stats.onlineHint",{total:friends.length})}/>
          <StatCard icon="🔥" value={`${stats?.streak??1}d`}     label={t("stats.streakLabel")} color="#F97316" sub={t("stats.streakHint")}/>
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
          <GlobalChat me={me} />
          <SpotlightCarousel me={me}/>
        </div>

        <div className="dash-side">
          <BattlePassWidget/>
          <DailyQuestsWidget me={me}/>
          <SmartMatch friends={friends} openParties={parties??[]}/>
          <ChallengeVs me={me} friends={friends}/>
          <TournamentCard/>
          <ChallengeCard challenges={challenges??[]}/>
          <Leaderboard me={me} friends={friends}/>
          <AchievementShowcase achievements={achievements??[]}/>
          <VipLoungeCard me={me}/>
          <ProCard me={me}/>
        </div>
      </div>
    </div>
  );
}
