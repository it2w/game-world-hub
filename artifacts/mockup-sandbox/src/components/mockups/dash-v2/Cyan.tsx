import React from 'react';
import { 
  Flame, 
  Gamepad2, 
  Trophy, 
  Clock, 
  Search, 
  Bell, 
  Settings, 
  LogOut, 
  Crown, 
  Award, 
  Star, 
  Swords, 
  Play 
} from 'lucide-react';

export default function Cyan() {
  return (
    <div 
      className="w-[1440px] h-[900px] flex overflow-hidden text-[#E8E8E8] bg-[#070707] selection:bg-[#06B6D4]/30"
      style={{ fontFamily: '"Inter", sans-serif' }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        ::-webkit-scrollbar { 
          width: 0px; 
          background: transparent; 
        }

        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee {
          display: inline-block;
          animation: marquee 25s linear infinite;
        }
      ` }} />

      {/* Sidebar 228px */}
      <aside className="w-[228px] shrink-0 bg-[#0A0A0A] border-r border-[#1A1A1A] flex flex-col justify-between h-full">
        <div className="flex flex-col h-full overflow-y-auto pb-4 pt-[18px]">
          <div className="text-[#06B6D4] text-[20px] font-bold px-[18px] mb-6">Logo</div>

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
          
          <NavGroup title="REWARDS" items={[
            { label: 'Battle Pass' },
            { label: 'Achievements' },
            { label: 'Quests' },
            { label: 'Factions' },
            { label: 'Pro Hunt' },
            { label: 'Events' },
            { label: 'Prestige' },
          ]} />
          
          <NavGroup title="STORE" items={[
            { label: 'Pro' },
            { label: 'Library' },
            { label: 'Games' },
          ]} />
        </div>

        {/* User Footer */}
        <div className="p-[18px] border-t border-[#1A1A1A] flex items-center justify-between bg-[#0A0A0A]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#06B6D4] text-black flex items-center justify-center text-[13px] font-bold">W</div>
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold text-[#E8E8E8]">Wolf_99</span>
              <span className="text-[10px] font-medium text-[#06B6D4]">GOLD · LVL 42</span>
            </div>
          </div>
          <div className="flex gap-2 text-[#555]">
            <Settings size={14} className="hover:text-[#E8E8E8] cursor-pointer transition-colors" />
            <LogOut size={14} className="hover:text-[#E8E8E8] cursor-pointer transition-colors" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full min-w-0">
        
        {/* Topbar 50px */}
        <header className="h-[50px] shrink-0 bg-[#0A0A0A] border-b border-[#1A1A1A] flex items-center justify-between px-6">
          <div className="text-[16px] font-semibold text-[#E8E8E8]">Dashboard</div>
          <div className="flex items-center gap-5">
            <Search size={16} className="text-[#555] cursor-pointer hover:text-[#E8E8E8] transition-colors" />
            <div className="relative">
              <Bell size={16} className="text-[#555] cursor-pointer hover:text-[#E8E8E8] transition-colors" />
              <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-[#06B6D4] text-black text-[9px] font-bold flex items-center justify-center rounded-full">5</div>
            </div>
            <div className="w-7 h-7 rounded-full bg-[#06B6D4] text-black flex items-center justify-center text-[12px] font-bold ml-2">W</div>
          </div>
        </header>

        {/* Ticker 24px */}
        <div className="h-[24px] shrink-0 bg-[#080808] border-b border-[#141414] flex items-center px-4 overflow-hidden relative">
          <div className="bg-[#06B6D4] text-black text-[8px] font-extrabold uppercase px-1.5 py-[1px] rounded-[2px] z-10 whitespace-nowrap shadow-[4px_0_10px_#080808]">LIVE</div>
          <div className="ml-3 text-[11px] text-[#555] whitespace-nowrap flex-1 overflow-hidden relative">
            <div className="animate-marquee">
              🏆 LOUD wins VCT 2026 &nbsp;·&nbsp; ⚡ Valorant EP9 — new map &nbsp;·&nbsp; 🎯 GWH Cup Tonight 8PM — Prize 5,000 SAR &nbsp;·&nbsp; 🔥 Apex Hunter Season July 22 &nbsp;·&nbsp; 👑 Pro subscription now available
            </div>
          </div>
        </div>

        {/* Body Columns */}
        <div className="flex-1 overflow-y-auto p-[14px_16px] flex gap-[10px]">
          
          {/* LEFT COLUMN 260px */}
          <div className="w-[260px] flex flex-col gap-[10px] shrink-0">
            {/* Stat Cards 2x2 */}
            <div className="grid grid-cols-2 gap-[10px]">
              <StatCard label="STREAK" value="5d" icon={Flame} />
              <StatCard label="MATCHES" value="8" icon={Gamepad2} />
              <StatCard label="RANK" value="#3" icon={Trophy} />
              <StatCard label="PLAYTIME" value="24h" icon={Clock} />
            </div>

            {/* S12 BATTLE PASS */}
            <Card>
              <div className="text-[#06B6D4] text-[10px] font-semibold tracking-[2px] uppercase mb-3">S12 BATTLE PASS</div>
              <div className="flex justify-between items-center text-[#E8E8E8] mb-2">
                <span className="text-[11px] font-bold">LEVEL 32</span>
                <span className="text-[11px] font-medium text-[#555]">32%</span>
              </div>
              <div className="h-[4px] bg-[#1A1A1A] rounded-[2px] w-full mb-4">
                <div className="h-full bg-[#06B6D4] rounded-[2px] w-[32%]"></div>
              </div>
              <div className="flex gap-2">
                <RewardIcon icon={Crown} />
                <RewardIcon icon={Award} />
                <RewardIcon icon={Star} />
              </div>
            </Card>

            {/* 5 MISSIONS TODAY */}
            <Card>
              <div className="text-[#06B6D4] text-[10px] font-semibold tracking-[2px] uppercase mb-4">5 MISSIONS TODAY</div>
              <div className="flex flex-col gap-3.5">
                <QuestRow name="Win 3 Matches" xp="+250 XP" progress={60} />
                <QuestRow name="Get 15 Kills" xp="+150 XP" progress={30} />
                <QuestRow name="Play with Squad" xp="+200 XP" progress={80} />
              </div>
            </Card>

            {/* CURRENT PARTY */}
            <Card>
              <div className="text-[#06B6D4] text-[10px] font-semibold tracking-[2px] uppercase mb-3">CURRENT PARTY</div>
              <div className="text-[13px] font-medium text-[#888] mb-1.5">Valorant · Ranked · DIAMOND</div>
              <div className="text-[12px] font-semibold text-[#06B6D4] mb-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#06B6D4] animate-pulse"></div>
                Searching...
              </div>
              <PrimaryButton className="w-full">Join Party</PrimaryButton>
            </Card>

            {/* 1V1 CHALLENGE */}
            <Card>
              <div className="text-[#06B6D4] text-[10px] font-semibold tracking-[2px] uppercase mb-4">1V1 CHALLENGE</div>
              <div className="flex items-center justify-between mb-5 px-1">
                <span className="text-[13px] font-semibold text-[#E8E8E8]">Wolf_99</span>
                <Swords size={16} className="text-[#555]" />
                <span className="text-[13px] font-semibold text-[#E8E8E8]">أنت</span>
              </div>
              <DangerButton className="w-full">Send Challenge</DangerButton>
            </Card>
          </div>

          {/* CENTER COLUMN flex-1 */}
          <div className="flex-1 flex flex-col gap-[10px] min-w-0">
            {/* Tabs */}
            <div className="flex gap-6 border-b border-[#1A1A1A] mb-1 px-3">
              <div className="text-[13px] font-semibold text-[#E8E8E8] pb-3 border-b-[2px] border-[#06B6D4]">LFG</div>
              <div className="text-[13px] font-medium text-[#888] pb-3 cursor-pointer hover:text-[#E8E8E8] transition-colors">أخبار</div>
              <div className="text-[13px] font-medium text-[#888] pb-3 cursor-pointer hover:text-[#E8E8E8] transition-colors">حفلات</div>
            </div>

            {/* LFG Cards */}
            <div className="flex flex-col gap-[10px]">
              <LFGCard avatar="K" name="Khalid_X" info="Valorant · Diamond 2" btn="انضم" />
              <LFGCard avatar="S" name="ShadowG" info="Apex · Platinum" btn="لاعب 1" />
              <LFGCard avatar="N" name="NightRvn" info="CS2 · MG2" btn="انضم 2" />
            </div>

            {/* ONLINE FRIENDS */}
            <div className="mt-2">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="text-[#06B6D4] text-[10px] font-semibold tracking-[2px] uppercase">الأصدقاء المتصلون</div>
                <div className="text-[10px] font-bold bg-[#1A1A1A] text-[#888] px-2 py-0.5 rounded">5/24 متصل</div>
              </div>
              <div className="grid grid-cols-2 gap-[10px]">
                <FriendCard avatar="N" name="NoName_7" info="Valorant · Comp" />
                <FriendCard avatar="Z" name="Ziad" info="Apex · Pubs" />
                <FriendCard avatar="R" name="Reem" info="Fortnite · Duos" />
                <FriendCard avatar="F" name="Faisal" info="CS2 · Wingman" />
                <FriendCard avatar="S" name="Sara" info="Overwatch · QP" />
                <FriendCard avatar="K" name="Khalid" info="Rocket League" />
              </div>
            </div>

            {/* HIGHLIGHTS */}
            <div className="mt-2">
              <div className="text-[#06B6D4] text-[10px] font-semibold tracking-[2px] uppercase mb-3 px-1">HIGHLIGHTS</div>
              <div className="flex flex-col gap-[10px]">
                <HighlightRow user="Wolf_99" title="Insane 1v5 Clutch" views="1.2k" time="2h ago" />
                <HighlightRow user="ShadowG" title="Kraber collateral" views="856" time="5h ago" />
                <HighlightRow user="NoName_7" title="Ace round 12" views="2.4k" time="1d ago" />
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN 280px */}
          <div className="w-[280px] flex flex-col gap-[10px] shrink-0">
            {/* WEEKLY ACTIVITY */}
            <Card>
              <div className="flex justify-between items-center mb-8">
                <div className="text-[#06B6D4] text-[10px] font-semibold tracking-[2px] uppercase">نشاط الأسبوع</div>
                <div className="text-[10px] font-medium text-[#555] tracking-wider">5d / 7 / 42h</div>
              </div>
              <div className="flex items-end justify-between h-[120px] gap-2 pt-4">
                <Bar height={40} day="M" />
                <Bar height={60} day="T" />
                <Bar height={50} day="W" />
                <Bar height={100} day="T" />
                <Bar height={75} day="F" />
                <Bar height={30} day="S" />
                <Bar height={45} day="S" />
              </div>
            </Card>

            {/* DAILY SPIN */}
            <Card className="flex flex-col items-center">
              <div className="text-[#06B6D4] text-[10px] font-semibold tracking-[2px] uppercase mb-8 self-start">دوامة اليوم</div>
              
              <div className="relative w-[170px] h-[170px] rounded-full flex items-center justify-center mb-8" style={{
                background: `conic-gradient(
                  #06B6D4 0deg 60deg,
                  #1A1A1A 60deg 120deg,
                  #06B6D4 120deg 180deg,
                  #1A1A1A 180deg 240deg,
                  #06B6D4 240deg 300deg,
                  #1A1A1A 300deg 360deg
                )`
              }}>
                <div className="absolute inset-[14px] bg-[#0F0F0F] rounded-full flex flex-col items-center justify-center z-10 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] border border-[#1A1A1A]">
                  <div className="text-[10px] text-[#555] font-semibold tracking-wider uppercase mb-1">REWARD</div>
                  <div className="text-[20px] font-bold text-[#E8E8E8] tracking-tight">XP 500</div>
                </div>
                {/* Pointer marker */}
                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#E8E8E8] rotate-45 z-20 shadow-[0_0_10px_rgba(0,0,0,0.5)]"></div>
              </div>

              <PrimaryButton className="w-full">GO</PrimaryButton>
            </Card>
          </div>
          
        </div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * REUSABLE COMPONENTS
 * ------------------------------------------------------------------------- */

const NavGroup = ({ title, items }: { title: string, items: any[] }) => (
  <div className="mb-5">
    <div className="text-[10px] uppercase font-semibold tracking-[2px] text-[#2A2A2A] px-[18px] mb-2">{title}</div>
    <div className="flex flex-col">
      {items.map(item => (
        <div key={item.label} className={`flex items-center justify-between px-[18px] py-[10px] text-[13px] font-medium cursor-pointer transition-colors ${
          item.active 
            ? 'text-[#E8E8E8] bg-[rgba(6,182,212,0.06)] border-l-[3px] border-[#06B6D4] pl-[15px]' 
            : 'text-[#888] hover:bg-[#141414] hover:text-[#E8E8E8] border-l-[3px] border-transparent pl-[15px]'
        }`}>
          {item.label}
          {item.badge && <span className="bg-[#06B6D4] text-black text-[10px] font-bold px-1.5 py-[1px] rounded">{item.badge}</span>}
        </div>
      ))}
    </div>
  </div>
);

const Card = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[18px] hover:border-[#222] transition-colors ${className}`}>
    {children}
  </div>
);

const StatCard = ({ label, value, icon: Icon }: { label: string, value: string, icon: any }) => (
  <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[18px] hover:border-[#222] transition-colors flex flex-col relative group">
    <Icon size={16} className="text-[#06B6D4] absolute top-[18px] right-[18px] opacity-80 group-hover:opacity-100 transition-opacity" />
    <div className="text-[#06B6D4] text-[42px] font-bold tracking-[-1px] leading-[1.1] mb-1">{value}</div>
    <div className="text-[#555] text-[10px] font-medium tracking-[2px] uppercase">{label}</div>
  </div>
);

const RewardIcon = ({ icon: Icon }: { icon: any }) => (
  <div className="flex-1 h-11 border border-[#1A1A1A] rounded bg-[#0A0A0A] flex items-center justify-center gap-1.5">
    <Icon size={14} className="text-[#555]" />
    <span className="text-[10px] text-[#555] font-semibold">??</span>
  </div>
);

const QuestRow = ({ name, xp, progress }: { name: string, xp: string, progress: number }) => (
  <div>
    <div className="flex justify-between items-center mb-2">
      <span className="text-[13px] font-medium text-[#E8E8E8]">{name}</span>
      <span className="text-[10px] font-bold text-[#06B6D4] bg-[rgba(6,182,212,0.1)] px-1.5 py-0.5 rounded">{xp}</span>
    </div>
    <div className="h-[4px] bg-[#1A1A1A] rounded-[2px] w-full">
      <div className="h-full bg-[#06B6D4] rounded-[2px]" style={{ width: `${progress}%` }}></div>
    </div>
  </div>
);

const LFGCard = ({ avatar, name, info, btn }: { avatar: string, name: string, info: string, btn: string }) => (
  <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[14px_18px] flex items-center justify-between hover:border-[#222] transition-colors">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-[#1A1A1A] text-[#06B6D4] flex items-center justify-center text-[13px] font-bold border border-[#2A2A2A]">{avatar}</div>
      <div>
        <div className="text-[13px] font-semibold text-[#E8E8E8]">{name}</div>
        <div className="text-[11px] text-[#555] mt-0.5">{info}</div>
      </div>
    </div>
    <SecondaryButton className="!px-4 !py-1.5 !text-[11px]">{btn}</SecondaryButton>
  </div>
);

const FriendCard = ({ avatar, name, info }: { avatar: string, name: string, info: string }) => (
  <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[14px] flex flex-col gap-3 hover:border-[#222] transition-colors">
    <div className="flex items-center gap-3">
      <div className="relative">
        <div className="w-8 h-8 rounded-full bg-[#1A1A1A] text-[#888] flex items-center justify-center text-[12px] font-bold border border-[#2A2A2A]">{avatar}</div>
        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#06B6D4] border-[2px] border-[#0F0F0F] rounded-full"></div>
      </div>
      <div>
        <div className="text-[13px] font-semibold text-[#E8E8E8]">{name}</div>
        <div className="text-[11px] text-[#555] mt-0.5">{info}</div>
      </div>
    </div>
    <div className="flex gap-2">
      <button className="flex-1 bg-[#1A1A1A] hover:bg-[#222] text-[#E8E8E8] text-[11px] font-semibold py-1.5 rounded-[4px] transition-colors">دعوة</button>
      <button className="flex-1 bg-[#1A1A1A] hover:bg-[#222] text-[#E8E8E8] text-[11px] font-semibold py-1.5 rounded-[4px] transition-colors">DM</button>
    </div>
  </div>
);

const HighlightRow = ({ user, title, views, time }: { user: string, title: string, views: string, time: string }) => (
  <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[12px_14px] flex items-center justify-between hover:border-[#222] cursor-pointer transition-colors group">
    <div className="flex items-center gap-3">
      <div className="w-[44px] h-[28px] bg-[#1A1A1A] rounded-[4px] flex items-center justify-center group-hover:bg-[#222] transition-colors">
        <Play size={12} className="text-[#06B6D4]" fill="currentColor" />
      </div>
      <div>
        <span className="text-[13px] font-semibold text-[#E8E8E8] mr-2">{user}</span>
        <span className="text-[12px] text-[#888]">{title}</span>
      </div>
    </div>
    <div className="flex flex-col items-end">
      <span className="text-[11px] font-medium text-[#555]">{views} views</span>
      <span className="text-[10px] text-[#2A2A2A] mt-0.5">{time}</span>
    </div>
  </div>
);

const Bar = ({ height, day }: { height: number, day: string }) => (
  <div className="flex flex-col items-center gap-2 flex-1 h-full">
    <div className="w-full max-w-[12px] bg-[#1A1A1A] rounded-[2px] h-full flex flex-col justify-end">
      <div className="w-full bg-[#06B6D4] rounded-[2px] hover:bg-[#06B6D4]/80 transition-colors" style={{ height: `${height}%` }}></div>
    </div>
    <div className="text-[10px] font-medium text-[#555]">{day}</div>
  </div>
);

/* BUTTONS */
const PrimaryButton = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <button className={`bg-[#06B6D4] text-black text-[12px] font-semibold px-[20px] py-[12px] rounded-[6px] hover:bg-[#06B6D4]/90 transition-colors ${className}`}>
    {children}
  </button>
);

const SecondaryButton = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <button className={`bg-transparent border border-[#06B6D4] text-[#06B6D4] text-[12px] font-semibold px-[20px] py-[12px] rounded-[6px] hover:bg-[rgba(6,182,212,0.1)] transition-colors ${className}`}>
    {children}
  </button>
);

const DangerButton = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <button className={`bg-[#1A0A0A] border border-[#3A1010] text-[#EF4444] text-[12px] font-semibold px-[20px] py-[12px] rounded-[6px] hover:bg-[#2A1010] transition-colors ${className}`}>
    {children}
  </button>
);
