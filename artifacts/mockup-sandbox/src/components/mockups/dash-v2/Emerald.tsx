import React from 'react';
import { 
  Flame, Gamepad2, Trophy, Clock, Search, Bell, Crown, Award, Star, 
  Swords, Settings, LogOut, Video
} from 'lucide-react';

export default function Emerald() {
  const accent = '#22C55E';
  
  const NavGroup = ({ title, items }: { title: string, items: any[] }) => (
    <div className="flex flex-col">
      <div 
        style={{ 
          padding: '10px 18px', 
          fontSize: '10px', 
          fontWeight: 600, 
          letterSpacing: '2px', 
          textTransform: 'uppercase', 
          color: '#2A2A2A' 
        }}
      >
        {title}
      </div>
      {items.map(item => (
        <div 
          key={item.label}
          className="flex items-center justify-between cursor-pointer"
          style={{
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 500,
            color: item.active ? '#E8E8E8' : '#888',
            backgroundColor: item.active ? 'rgba(34,197,94,0.06)' : 'transparent',
            borderLeft: item.active ? `3px solid ${accent}` : '3px solid transparent',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => !item.active && (e.currentTarget.style.backgroundColor = '#141414')}
          onMouseLeave={(e) => !item.active && (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <span>{item.label}</span>
          {item.badge && (
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#000', backgroundColor: accent, padding: '2px 6px', borderRadius: '4px' }}>
              {item.badge}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const Card = ({ children, className = '', style = {} }: any) => (
    <div 
      className={`relative ${className}`}
      style={{
        backgroundColor: '#0F0F0F',
        border: '1px solid #1A1A1A',
        borderRadius: '6px',
        padding: '18px',
        transition: 'border-color 0.2s',
        ...style
      }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#222'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = '#1A1A1A'}
    >
      {children}
    </div>
  );

  const CardTitle = ({ children }: any) => (
    <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: accent }}>
      {children}
    </div>
  );

  const StatCard = ({ value, label, Icon }: any) => (
    <Card className="flex flex-col justify-between" style={{ padding: '14px 16px', height: '110px' }}>
      <div className="flex justify-between items-start">
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '2px', textTransform: 'uppercase', color: '#555' }}>
          {label}
        </div>
        <Icon size={14} color={accent} opacity={0.8} />
      </div>
      <div style={{ fontSize: '42px', fontWeight: 700, color: accent, letterSpacing: '-1px', lineHeight: 1 }}>
        {value}
      </div>
    </Card>
  );

  const ProgressBar = ({ progress }: any) => (
    <div style={{ height: '4px', backgroundColor: '#1A1A1A', borderRadius: '2px', width: '100%', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${progress}%`, backgroundColor: accent, borderRadius: '2px' }}></div>
    </div>
  );

  const RewardIcon = ({ Icon, label }: any) => (
    <div className="flex flex-col items-center gap-2 flex-1">
      <div 
        className="flex items-center justify-center w-full"
        style={{ height: '44px', backgroundColor: '#1A1A1A', borderRadius: '6px', border: '1px solid #222' }}
      >
        <Icon size={16} color="#555" />
      </div>
      <div style={{ fontSize: '10px', color: '#555', fontWeight: 600 }}>{label}</div>
    </div>
  );

  const MissionRow = ({ title, xp, progress }: any) => (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <div style={{ fontSize: '12px', fontWeight: 500, color: '#E8E8E8' }}>{title}</div>
        <div style={{ fontSize: '10px', fontWeight: 600, color: accent, backgroundColor: 'rgba(34,197,94,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
          {xp}
        </div>
      </div>
      <ProgressBar progress={progress} />
    </div>
  );

  const LFGCard = ({ avatar, name, info, btn }: any) => (
    <Card style={{ padding: '14px 18px' }} className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div 
          className="flex items-center justify-center rounded-full"
          style={{ width: '36px', height: '36px', backgroundColor: '#1A1A1A', color: '#E8E8E8', fontSize: '14px', fontWeight: 600 }}
        >
          {avatar}
        </div>
        <div className="flex flex-col">
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#E8E8E8' }}>{name}</div>
          <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>{info}</div>
        </div>
      </div>
      <button 
        className="cursor-pointer"
        style={{ 
          backgroundColor: 'transparent', 
          color: accent, 
          border: `1px solid ${accent}`,
          borderRadius: '6px', 
          padding: '8px 16px', 
          fontSize: '12px', 
          fontWeight: 600 
        }}
      >
        {btn}
      </button>
    </Card>
  );

  const FriendCard = ({ avatar, name, info }: any) => (
    <Card style={{ padding: '14px' }} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div 
          className="flex items-center justify-center rounded-full relative shrink-0"
          style={{ width: '32px', height: '32px', backgroundColor: '#1A1A1A', color: '#E8E8E8', fontSize: '12px', fontWeight: 600 }}
        >
          {avatar}
          <div className="absolute" style={{ bottom: 0, right: 0, width: '8px', height: '8px', backgroundColor: accent, borderRadius: '50%', border: '2px solid #0F0F0F' }} />
        </div>
        <div className="flex flex-col overflow-hidden">
          <div className="truncate" style={{ fontSize: '13px', fontWeight: 600, color: '#E8E8E8' }}>{name}</div>
          <div className="truncate" style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{info}</div>
        </div>
      </div>
      <div className="flex gap-2 mt-1">
        <button className="flex-1 cursor-pointer transition-colors hover:bg-[#222]" style={{ backgroundColor: '#1A1A1A', color: '#E8E8E8', border: 'none', borderRadius: '4px', padding: '6px 0', fontSize: '11px', fontWeight: 600 }}>دعوة</button>
        <button className="flex-1 cursor-pointer transition-colors hover:bg-[#1A1A1A]" style={{ backgroundColor: 'transparent', color: '#888', border: '1px solid #1A1A1A', borderRadius: '4px', padding: '6px 0', fontSize: '11px', fontWeight: 600 }}>DM</button>
      </div>
    </Card>
  );

  const HighlightRow = ({ user, title, views, time }: any) => (
    <Card style={{ padding: '12px 14px' }} className="flex items-center gap-4 cursor-pointer">
      <div 
        className="flex items-center justify-center relative overflow-hidden shrink-0"
        style={{ width: '80px', height: '50px', backgroundColor: '#1A1A1A', borderRadius: '4px' }}
      >
        <Video size={16} color="#555" />
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <div className="truncate" style={{ fontSize: '13px', fontWeight: 600, color: '#E8E8E8' }}>{title}</div>
        <div className="flex items-center gap-2 mt-1" style={{ fontSize: '11px', color: '#555' }}>
          <span style={{ color: accent, fontWeight: 500 }}>{user}</span>
          <span>·</span>
          <span>{views} views</span>
          <span>·</span>
          <span>{time}</span>
        </div>
      </div>
    </Card>
  );

  const Bar = ({ day, height }: any) => (
    <div className="flex flex-col items-center gap-2 flex-1">
      <div className="w-full relative flex items-end justify-center rounded-t-sm" style={{ height: '80px', backgroundColor: '#141414' }}>
        <div className="w-full rounded-t-sm transition-all" style={{ height, backgroundColor: accent }}></div>
      </div>
      <div style={{ fontSize: '10px', fontWeight: 600, color: '#555' }}>{day}</div>
    </div>
  );

  return (
    <div 
      className="flex flex-row overflow-hidden w-full h-[100dvh]" 
      style={{ backgroundColor: '#070707', color: '#E8E8E8' }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        * {
          font-family: 'Inter', sans-serif;
        }

        .emerald-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .emerald-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .emerald-scrollbar::-webkit-scrollbar-thumb {
          background: #1A1A1A;
          border-radius: 2px;
        }
        .emerald-scrollbar:hover::-webkit-scrollbar-thumb {
          background: #2A2A2A;
        }

        .lfg-tab-active {
          color: #E8E8E8;
          border-bottom: 2px solid ${accent};
        }
        
        .lfg-tab {
          color: #888;
          font-size: 13px;
          font-weight: 500;
          padding: 10px 16px;
          cursor: pointer;
        }
        
        .spin-circle {
          background: conic-gradient(
            ${accent} 0deg 60deg, 
            #1A1A1A 60deg 120deg, 
            ${accent} 120deg 180deg, 
            #1A1A1A 180deg 240deg, 
            ${accent} 240deg 300deg, 
            #1A1A1A 300deg 360deg
          );
        }
      `}</style>
      
      {/* Sidebar */}
      <div 
        className="flex flex-col flex-shrink-0" 
        style={{ width: '228px', backgroundColor: '#0A0A0A', borderRight: '1px solid #1A1A1A' }}
      >
        <div style={{ padding: '18px', fontSize: '20px', fontWeight: 700, color: accent }}>
          GWH
        </div>
        
        <div className="flex-1 overflow-y-auto emerald-scrollbar pb-4">
          <NavGroup title="COMMS" items={[
            { label: 'Dashboard', active: true },
            { label: 'Friends' },
            { label: 'Chat', badge: 3 },
            { label: 'Parties' },
            { label: 'LFG' },
            { label: 'Ranks' },
            { label: 'Stats' },
            { label: 'Challenges' },
            { label: 'Rooms' },
            { label: 'Tournaments' },
            { label: 'Bounties' },
          ]} />
          
          <div className="mt-4"></div>
          
          <NavGroup title="REWARDS" items={[
            { label: 'Battle Pass' },
            { label: 'Achievements' },
            { label: 'Quests' },
            { label: 'Factions' },
            { label: 'Pro Hunt' },
            { label: 'Events' },
            { label: 'Prestige' },
          ]} />
          
          <div className="mt-4"></div>
          
          <NavGroup title="STORE" items={[
            { label: 'Pro' },
            { label: 'Library' },
            { label: 'Games' },
          ]} />
        </div>
        
        <div 
          className="flex-shrink-0 flex items-center justify-between"
          style={{ padding: '12px 18px', borderTop: '1px solid #1A1A1A' }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="flex items-center justify-center rounded-full shrink-0" 
              style={{ width: '32px', height: '32px', backgroundColor: accent, color: '#000', fontWeight: 600, fontSize: '14px' }}
            >
              W
            </div>
            <div className="flex flex-col">
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#E8E8E8' }}>Wolf_99</div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#555', letterSpacing: '0.5px' }}>GOLD · LVL 42</div>
            </div>
          </div>
          <div 
            style={{ fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', backgroundColor: '#1A1A1A', color: accent, letterSpacing: '1px' }}
          >
            PRO
          </div>
        </div>
        
        <div className="flex items-center gap-4 flex-shrink-0" style={{ padding: '0 18px 18px', color: '#555' }}>
          <Settings size={16} className="hover:text-white cursor-pointer transition-colors" />
          <LogOut size={16} className="hover:text-white cursor-pointer transition-colors" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 min-w-0">
        
        {/* Topbar */}
        <div 
          className="flex items-center justify-between flex-shrink-0"
          style={{ height: '50px', backgroundColor: '#0A0A0A', borderBottom: '1px solid #1A1A1A', padding: '0 18px' }}
        >
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#E8E8E8' }}>
            Dashboard
          </div>
          <div className="flex items-center gap-5">
            <Search size={16} color="#555" className="cursor-pointer hover:text-white transition-colors" />
            <div className="relative cursor-pointer">
              <Bell size={16} color="#555" className="hover:text-white transition-colors" />
              <div 
                className="absolute flex items-center justify-center rounded-full"
                style={{ 
                  top: '-6px', right: '-6px', 
                  width: '14px', height: '14px', 
                  backgroundColor: accent, 
                  color: '#000', 
                  fontSize: '9px', 
                  fontWeight: 700 
                }}
              >
                5
              </div>
            </div>
            <div 
              className="flex items-center justify-center rounded-full cursor-pointer" 
              style={{ width: '28px', height: '28px', backgroundColor: accent, color: '#000', fontWeight: 600, fontSize: '12px' }}
            >
              W
            </div>
          </div>
        </div>
        
        {/* Ticker */}
        <div 
          className="flex items-center flex-shrink-0 overflow-hidden"
          style={{ height: '24px', backgroundColor: '#080808', borderBottom: '1px solid #141414', padding: '0 18px', gap: '12px' }}
        >
          <div 
            style={{ 
              backgroundColor: accent, 
              color: '#000', 
              fontSize: '8px', 
              fontWeight: 800, 
              padding: '2px 6px', 
              borderRadius: '2px',
              textTransform: 'uppercase'
            }}
          >
            LIVE
          </div>
          <div className="whitespace-nowrap flex-1" style={{ fontSize: '11px', color: '#555' }}>
            <span style={{ color: '#888' }}>🏆 LOUD wins VCT 2026</span> &nbsp;·&nbsp; 
            ⚡ Valorant EP9 — new map &nbsp;·&nbsp; 
            <span style={{ color: '#888' }}>🎯 GWH Cup Tonight 8PM — Prize 5,000 SAR</span> &nbsp;·&nbsp; 
            🔥 Apex Hunter Season July 22 &nbsp;·&nbsp; 
            <span style={{ color: '#888' }}>👑 Pro subscription now available</span>
          </div>
        </div>
        
        {/* Body 3 columns */}
        <div className="flex-1 flex overflow-y-auto overflow-x-hidden emerald-scrollbar" style={{ padding: '14px 16px', gap: '10px' }}>
          
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-[10px] flex-shrink-0" style={{ width: '260px' }}>
            {/* 2x2 Stats */}
            <div className="grid grid-cols-2 gap-[10px]">
              <StatCard value="5d" label="STREAK" Icon={Flame} />
              <StatCard value="8" label="MATCHES" Icon={Gamepad2} />
              <StatCard value="#3" label="RANK" Icon={Trophy} />
              <StatCard value="24h" label="PLAYTIME" Icon={Clock} />
            </div>
            
            {/* S12 BATTLE PASS */}
            <Card>
              <CardTitle>S12 BATTLE PASS</CardTitle>
              <div className="mt-4 flex justify-between items-end mb-2">
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#E8E8E8' }}>LEVEL 32 <span style={{ color: '#555' }}>· 32%</span></div>
              </div>
              <ProgressBar progress={32} />
              <div className="mt-5 flex gap-2">
                <RewardIcon Icon={Crown} label="??" />
                <RewardIcon Icon={Award} label="??" />
                <RewardIcon Icon={Star} label="??" />
              </div>
            </Card>
            
            {/* 5 MISSIONS TODAY */}
            <Card>
              <CardTitle>5 MISSIONS TODAY</CardTitle>
              <div className="mt-4 flex flex-col gap-4">
                <MissionRow title="Win 3 Matches" xp="+250 XP" progress={60} />
                <MissionRow title="Get 15 Kills" xp="+150 XP" progress={30} />
                <MissionRow title="Play with Squad" xp="+200 XP" progress={80} />
              </div>
            </Card>
            
            {/* CURRENT PARTY */}
            <Card>
              <CardTitle>CURRENT PARTY</CardTitle>
              <div className="mt-3">
                <div style={{ fontSize: '12px', fontWeight: 500, color: '#E8E8E8' }}>Valorant · Ranked · DIAMOND</div>
                <div style={{ fontSize: '12px', color: '#555', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div className="animate-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: accent }}></div>
                  Searching...
                </div>
                <button 
                  className="w-full mt-4 cursor-pointer hover:brightness-110 transition-all"
                  style={{ 
                    backgroundColor: accent, 
                    color: '#000', 
                    borderRadius: '6px', 
                    padding: '10px', 
                    fontSize: '12px', 
                    fontWeight: 600,
                    border: 'none'
                  }}
                >
                  Join Party
                </button>
              </div>
            </Card>

            {/* 1v1 CHALLENGE */}
            <Card>
              <CardTitle>1v1 CHALLENGE</CardTitle>
              <div className="mt-4 flex items-center justify-between">
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#E8E8E8' }}>Wolf_99</div>
                <Swords size={16} color="#555" />
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#E8E8E8' }}>أنت</div>
              </div>
              <button 
                className="w-full mt-4 cursor-pointer transition-colors"
                style={{ 
                  backgroundColor: '#1A0A0A', 
                  color: '#EF4444', 
                  border: '1px solid #3A1010',
                  borderRadius: '6px', 
                  padding: '10px', 
                  fontSize: '12px', 
                  fontWeight: 600 
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#250E0E'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1A0A0A'}
              >
                Send Challenge
              </button>
            </Card>
          </div>
          
          {/* CENTER COLUMN */}
          <div className="flex flex-col gap-[10px] flex-1 min-w-0">
            {/* Tabs */}
            <div className="flex gap-2 border-b border-[#1A1A1A] mb-1">
              <div className="lfg-tab-active lfg-tab">LFG</div>
              <div className="lfg-tab hover:text-white transition-colors">أخبار</div>
              <div className="lfg-tab hover:text-white transition-colors">حفلات</div>
            </div>
            
            {/* 3 LFG Cards */}
            <LFGCard avatar="K" name="Khalid_X" info="Valorant · Diamond 2" btn="انضم" />
            <LFGCard avatar="S" name="ShadowG" info="Apex · Platinum" btn="لاعب 1" />
            <LFGCard avatar="N" name="NightRvn" info="CS2 · MG2" btn="انضم 2" />
            
            {/* ONLINE FRIENDS */}
            <div className="mt-4 flex items-center justify-between px-2">
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: accent }}>
                الأصدقاء المتصلون
              </div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#555', backgroundColor: '#1A1A1A', padding: '2px 8px', borderRadius: '10px' }}>
                5/24 متصل
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-[10px] mt-1">
              <FriendCard avatar="N" name="NoName_7" info="Valorant · Comp" />
              <FriendCard avatar="Z" name="Ziad" info="Apex · Pubs" />
              <FriendCard avatar="R" name="Reem" info="Fortnite · Duos" />
              <FriendCard avatar="F" name="Faisal" info="CS2 · Wingman" />
              <FriendCard avatar="S" name="Sara" info="Overwatch · QP" />
              <FriendCard avatar="K" name="Khalid" info="Rocket League" />
            </div>

            {/* HIGHLIGHTS */}
            <div className="mt-4 px-2">
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: accent }}>
                Highlights
              </div>
            </div>
            <div className="flex flex-col gap-[10px] mt-1 mb-4">
              <HighlightRow user="NoName_7" title="Clutch 1v5 Radiant Lobby" views="12k" time="2h" />
              <HighlightRow user="Ziad" title="Apex Predator Endgame" views="8.4k" time="5h" />
              <HighlightRow user="Faisal" title="AWP Ace Mirage" views="21k" time="1d" />
            </div>
          </div>
          
          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-[10px] flex-shrink-0" style={{ width: '280px' }}>
            {/* WEEKLY ACTIVITY */}
            <Card>
              <div className="flex justify-between items-center mb-6">
                <CardTitle>نشاط الأسبوع</CardTitle>
                <div style={{ fontSize: '10px', color: '#555', fontWeight: 600 }}>5d / 7 / 42h</div>
              </div>
              <div className="flex items-end justify-between h-[100px] px-2 gap-2 mt-4">
                <Bar day="M" height="40%" />
                <Bar day="T" height="60%" />
                <Bar day="W" height="85%" />
                <Bar day="T" height="100%" />
                <Bar day="F" height="30%" />
                <Bar day="S" height="70%" />
                <Bar day="S" height="50%" />
              </div>
            </Card>

            {/* DAILY SPIN */}
            <Card>
              <CardTitle>دوامة اليوم</CardTitle>
              <div className="flex flex-col items-center justify-center mt-6 py-4">
                <div 
                  className="spin-circle relative flex items-center justify-center rounded-full shadow-[0_0_30px_rgba(34,197,94,0.15)]"
                  style={{ width: '150px', height: '150px' }}
                >
                  <div 
                    className="rounded-full flex flex-col items-center justify-center absolute"
                    style={{ width: '120px', height: '120px', backgroundColor: '#0F0F0F', border: '1px solid #1A1A1A' }}
                  >
                    <div style={{ fontSize: '10px', color: '#555', fontWeight: 600, letterSpacing: '1px' }}>XP</div>
                    <div style={{ fontSize: '26px', color: accent, fontWeight: 700, letterSpacing: '-1px' }}>500</div>
                  </div>
                  {/* Indicator arrow */}
                  <div 
                    className="absolute z-10"
                    style={{ top: '-4px', width: '12px', height: '12px', backgroundColor: '#E8E8E8', clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }}
                  />
                </div>
                
                <button 
                  className="mt-8 cursor-pointer w-[140px] hover:brightness-110 transition-all"
                  style={{ 
                    backgroundColor: accent, 
                    color: '#000', 
                    borderRadius: '6px', 
                    padding: '12px 20px', 
                    fontSize: '14px', 
                    fontWeight: 700,
                    border: 'none',
                    letterSpacing: '1px'
                  }}
                >
                  GO
                </button>
              </div>
            </Card>
          </div>
          
        </div>
      </div>
    </div>
  );
}
