import React from 'react';
import {
  Flame, Gamepad2, Trophy, Clock,
  Search, Bell, Settings, LogOut,
  Swords, Crown, Award, Star
} from 'lucide-react';

const Accent = "#A855F7";

const NavGroup = ({ label, children }: { label: string, children: React.ReactNode }) => (
  <div className="mb-4">
    <div className="text-[#2A2A2A] text-[10px] font-bold tracking-[2px] uppercase px-[18px] mb-[6px]">
      {label}
    </div>
    {children}
  </div>
);

const NavItem = ({ active, label, badge }: { active?: boolean, label: string, badge?: number }) => (
  <div className={`flex items-center justify-between py-[10px] text-[13px] font-medium hover:bg-[#141414] cursor-pointer ${
    active ? 'bg-[#A855F7]/[0.06] text-[#E8E8E8] border-l-[3px] border-[#A855F7] pl-[15px] pr-[18px]' : 'text-[#888888] px-[18px]'
  }`}>
    <span>{label}</span>
    {badge && <span className="bg-[#A855F7] text-black text-[10px] font-bold px-[5px] py-[1px] rounded-sm">{badge}</span>}
  </div>
);

const StatCard = ({ value, label, icon: Icon }: { value: string, label: string, icon: any }) => (
  <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[18px] flex flex-col justify-between h-[100px] hover:border-[#222222] transition-colors">
    <div className="flex justify-between items-start">
      <div className="text-[10px] font-medium tracking-[2px] uppercase text-[#555555]">{label}</div>
      <Icon size={14} className="text-[#A855F7]" />
    </div>
    <div className="text-[42px] font-bold text-[#A855F7] tracking-[-1px] leading-none">{value}</div>
  </div>
);

const ProgressBar = ({ progress, color = Accent }: { progress: number, color?: string }) => (
  <div className="h-[4px] w-full bg-[#1A1A1A] rounded-[2px] overflow-hidden">
    <div className="h-full rounded-[2px]" style={{ width: `${progress}%`, backgroundColor: color }}></div>
  </div>
);

const Button = ({ children, variant = 'primary', className = '' }: { children: React.ReactNode, variant?: 'primary' | 'outline' | 'danger', className?: string }) => {
  const base = "px-[20px] py-[12px] rounded-[6px] text-[12px] font-semibold flex items-center justify-center transition-opacity hover:opacity-90";
  const variants = {
    primary: "bg-[#A855F7] text-black",
    outline: "bg-transparent border border-[#A855F7] text-[#A855F7]",
    danger: "bg-[#1A0A0A] border border-[#3A1010] text-[#EF4444]"
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

export default function Violet() {
  return (
    <div className="flex h-screen w-full bg-[#070707] text-[#888888] overflow-hidden font-inter" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
      `}</style>
      
      {/* Sidebar */}
      <div className="w-[228px] shrink-0 bg-[#0A0A0A] border-r border-[#1A1A1A] flex flex-col">
        <div className="h-[50px] flex items-center px-[18px]">
          <span className="text-[20px] font-bold text-[#A855F7]">GWH</span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-[20px] scrollbar-hide">
          <NavGroup label="COMMS">
            <NavItem active label="Dashboard" />
            <NavItem label="Friends" />
            <NavItem label="Chat" badge={3} />
            <NavItem label="Parties" />
            <NavItem label="LFG" />
            <NavItem label="Ranks" />
            <NavItem label="Stats" />
            <NavItem label="Challenges" />
            <NavItem label="Rooms" />
            <NavItem label="Tournaments" />
            <NavItem label="Bounties" />
          </NavGroup>
          
          <NavGroup label="REWARDS">
            <NavItem label="Battle Pass" />
            <NavItem label="Achievements" />
            <NavItem label="Quests" />
            <NavItem label="Factions" />
            <NavItem label="Pro Hunt" />
            <NavItem label="Events" />
            <NavItem label="Prestige" />
          </NavGroup>
          
          <NavGroup label="STORE">
            <NavItem label="Pro" />
            <NavItem label="Library" />
            <NavItem label="Games" />
          </NavGroup>
        </div>
        
        <div className="mt-auto border-t border-[#1A1A1A] p-[18px] flex flex-col gap-3">
          <div className="flex items-center gap-3 text-[#555555]">
            <Settings size={14} className="hover:text-[#E8E8E8] cursor-pointer transition-colors" />
            <LogOut size={14} className="hover:text-[#E8E8E8] cursor-pointer transition-colors" />
          </div>
          <div className="flex items-center gap-[10px]">
            <div className="w-[32px] h-[32px] rounded-full bg-[#A855F7] text-black flex items-center justify-center text-[14px] font-bold shrink-0">
              W
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-semibold text-[#E8E8E8] truncate">Wolf_99</span>
              <span className="text-[10px] font-medium text-[#A855F7]">GOLD · LVL 42</span>
            </div>
            <div className="ml-auto bg-[#1A1A1A] text-[#A855F7] text-[9px] font-bold px-[4px] py-[2px] rounded-[4px] uppercase tracking-wider">
              PRO
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <div className="h-[50px] shrink-0 bg-[#0A0A0A] border-b border-[#1A1A1A] flex items-center justify-between px-[18px]">
          <div className="text-[16px] font-semibold text-[#E8E8E8]">Dashboard</div>
          <div className="flex items-center gap-[18px]">
            <Search size={16} className="text-[#555555] cursor-pointer hover:text-[#E8E8E8]" />
            <div className="relative cursor-pointer">
              <Bell size={16} className="text-[#555555] hover:text-[#E8E8E8]" />
              <div className="absolute -top-1 -right-1 w-[14px] h-[14px] bg-[#A855F7] rounded-full text-black text-[9px] font-bold flex items-center justify-center">5</div>
            </div>
            <div className="w-[28px] h-[28px] rounded-full bg-[#A855F7] text-black flex items-center justify-center text-[12px] font-bold cursor-pointer">
              W
            </div>
          </div>
        </div>
        
        {/* Ticker */}
        <div className="h-[24px] shrink-0 bg-[#080808] border-b border-[#141414] flex items-center px-[18px] overflow-hidden whitespace-nowrap">
          <div className="bg-[#A855F7] text-black text-[8px] font-extrabold uppercase px-[6px] py-[2px] rounded-[2px] mr-[10px] shrink-0">
            LIVE
          </div>
          <div className="text-[11px] text-[#555555] flex gap-[10px]">
            <span>🏆 LOUD wins VCT 2026</span>
            <span>·</span>
            <span>⚡ Valorant EP9 — new map</span>
            <span>·</span>
            <span>🎯 GWH Cup Tonight 8PM — Prize 5,000 SAR</span>
            <span>·</span>
            <span>🔥 Apex Hunter Season July 22</span>
            <span>·</span>
            <span>👑 Pro subscription now available</span>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-[14px_16px]">
          <div className="flex gap-[10px] h-full max-w-[1200px] mx-auto">
            
            {/* Left Column */}
            <div className="w-[260px] shrink-0 flex flex-col gap-[10px]">
              <div className="grid grid-cols-2 gap-[10px]">
                <StatCard value="5d" label="STREAK" icon={Flame} />
                <StatCard value="8" label="MATCHES" icon={Gamepad2} />
                <StatCard value="#3" label="RANK" icon={Trophy} />
                <StatCard value="24h" label="PLAYTIME" icon={Clock} />
              </div>
              
              <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[18px] hover:border-[#222222] transition-colors">
                <div className="text-[10px] font-semibold tracking-[2px] uppercase text-[#A855F7] mb-[12px]">S12 BATTLE PASS</div>
                <div className="text-[11px] font-medium text-[#888888] mb-[6px]">LEVEL 32 · 32%</div>
                <ProgressBar progress={32} />
                <div className="flex gap-[8px] mt-[16px]">
                  <div className="w-[36px] h-[36px] bg-[#141414] border border-[#1A1A1A] rounded-[4px] flex items-center justify-center text-[#555555]"><Crown size={16} /></div>
                  <div className="w-[36px] h-[36px] bg-[#141414] border border-[#1A1A1A] rounded-[4px] flex items-center justify-center text-[#555555]"><Award size={16} /></div>
                  <div className="w-[36px] h-[36px] bg-[#141414] border border-[#1A1A1A] rounded-[4px] flex items-center justify-center text-[#555555]"><Star size={16} /></div>
                </div>
              </div>

              <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[18px] hover:border-[#222222] transition-colors">
                <div className="text-[10px] font-semibold tracking-[2px] uppercase text-[#A855F7] mb-[12px]">5 MISSIONS TODAY</div>
                <div className="flex flex-col gap-[12px]">
                  <div>
                    <div className="flex justify-between text-[12px] text-[#E8E8E8] mb-[6px]">
                      <span>Win 3 Matches</span>
                      <span className="text-[#A855F7] font-medium text-[10px]">+250 XP</span>
                    </div>
                    <ProgressBar progress={60} />
                  </div>
                  <div>
                    <div className="flex justify-between text-[12px] text-[#E8E8E8] mb-[6px]">
                      <span>Get 15 Kills</span>
                      <span className="text-[#A855F7] font-medium text-[10px]">+150 XP</span>
                    </div>
                    <ProgressBar progress={30} />
                  </div>
                  <div>
                    <div className="flex justify-between text-[12px] text-[#E8E8E8] mb-[6px]">
                      <span>Play with Squad</span>
                      <span className="text-[#A855F7] font-medium text-[10px]">+200 XP</span>
                    </div>
                    <ProgressBar progress={80} />
                  </div>
                </div>
              </div>

              <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[18px] hover:border-[#222222] transition-colors">
                <div className="text-[10px] font-semibold tracking-[2px] uppercase text-[#A855F7] mb-[12px]">CURRENT PARTY</div>
                <div className="text-[13px] text-[#E8E8E8] font-medium mb-[4px]">Valorant · Ranked · DIAMOND</div>
                <div className="text-[12px] text-[#555555] mb-[16px]">Searching...</div>
                <Button className="w-full">Join Party</Button>
              </div>

              <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[18px] hover:border-[#222222] transition-colors">
                <div className="text-[10px] font-semibold tracking-[2px] uppercase text-[#A855F7] mb-[12px]">1v1 CHALLENGE</div>
                <div className="flex items-center justify-between text-[13px] text-[#E8E8E8] font-semibold mb-[16px]">
                  <span>Wolf_99</span>
                  <Swords size={16} className="text-[#555555]" />
                  <span>أنت</span>
                </div>
                <Button variant="danger" className="w-full">Send Challenge</Button>
              </div>
            </div>

            {/* Center Column */}
            <div className="flex-1 flex flex-col gap-[10px] min-w-0">
              <div className="flex gap-[24px] border-b border-[#1A1A1A] px-[4px]">
                <div className="text-[13px] font-semibold text-[#A855F7] border-b-2 border-[#A855F7] pb-[10px]">LFG</div>
                <div className="text-[13px] font-medium text-[#555555] pb-[10px] hover:text-[#888888] cursor-pointer">أخبار</div>
                <div className="text-[13px] font-medium text-[#555555] pb-[10px] hover:text-[#888888] cursor-pointer">حفلات</div>
              </div>

              <div className="flex flex-col gap-[10px] mt-[4px]">
                {[
                  { avatar: 'K', name: 'Khalid_X', detail: 'Valorant · Diamond 2', btn: 'انضم' },
                  { avatar: 'S', name: 'ShadowG', detail: 'Apex · Platinum', btn: 'لاعب 1' },
                  { avatar: 'N', name: 'NightRvn', detail: 'CS2 · MG2', btn: 'انضم 2' }
                ].map((lfg, i) => (
                  <div key={i} className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[18px] flex items-center justify-between hover:border-[#222222] transition-colors">
                    <div className="flex items-center gap-[14px]">
                      <div className="w-[36px] h-[36px] rounded-full bg-[#141414] border border-[#1A1A1A] flex items-center justify-center text-[#E8E8E8] font-bold text-[14px]">
                        {lfg.avatar}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[13px] font-semibold text-[#E8E8E8]">{lfg.name}</span>
                        <span className="text-[12px] text-[#555555]">{lfg.detail}</span>
                      </div>
                    </div>
                    <Button variant="outline" className="px-[16px] py-[8px] text-[11px]">{lfg.btn}</Button>
                  </div>
                ))}
              </div>

              <div className="mt-[8px]">
                <div className="flex justify-between items-center mb-[12px]">
                  <div className="text-[10px] font-semibold tracking-[2px] uppercase text-[#A855F7]">الأصدقاء المتصلون</div>
                  <div className="bg-[#141414] text-[#888888] text-[10px] font-medium px-[8px] py-[2px] rounded-[4px]">5/24 متصل</div>
                </div>
                
                <div className="grid grid-cols-2 gap-[10px]">
                  {[
                    { a: 'N', n: 'NoName_7', d: 'Valorant · Comp' },
                    { a: 'Z', n: 'Ziad', d: 'Apex · Pubs' },
                    { a: 'R', n: 'Reem', d: 'Fortnite · Duos' },
                    { a: 'F', n: 'Faisal', d: 'CS2 · Wingman' },
                    { a: 'S', n: 'Sara', d: 'Overwatch · QP' },
                    { a: 'K', n: 'Khalid', d: 'Rocket League' }
                  ].map((f, i) => (
                    <div key={i} className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[14px] flex flex-col gap-[14px] hover:border-[#222222] transition-colors">
                      <div className="flex items-center gap-[10px]">
                        <div className="relative">
                          <div className="w-[32px] h-[32px] rounded-full bg-[#141414] border border-[#1A1A1A] flex items-center justify-center text-[#E8E8E8] font-bold text-[12px]">
                            {f.a}
                          </div>
                          <div className="absolute bottom-0 right-0 w-[8px] h-[8px] rounded-full bg-[#A855F7] border border-[#0F0F0F]"></div>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold text-[#E8E8E8] truncate">{f.n}</span>
                          <span className="text-[11px] text-[#555555] truncate">{f.d}</span>
                        </div>
                      </div>
                      <div className="flex gap-[6px]">
                        <Button className="flex-1 py-[6px] text-[11px]">دعوة</Button>
                        <Button variant="outline" className="flex-1 py-[6px] text-[11px]">DM</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-[8px]">
                <div className="text-[10px] font-semibold tracking-[2px] uppercase text-[#A855F7] mb-[12px]">Highlights</div>
                <div className="flex flex-col gap-[10px]">
                  {[
                    { user: 'Wolf_99', title: 'Clutch 1v4 Ace', views: '1.2k', time: '2h ago' },
                    { user: 'ShadowG', title: 'Insane Kraber shot', views: '840', time: '5h ago' },
                    { user: 'NoName_7', title: 'Lineup Larry', views: '2.1k', time: '1d ago' }
                  ].map((h, i) => (
                    <div key={i} className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[14px] flex items-center justify-between hover:border-[#222222] transition-colors">
                      <div className="flex items-center gap-[12px]">
                        <div className="w-[48px] h-[32px] bg-[#141414] rounded-[4px] border border-[#1A1A1A]"></div>
                        <div className="flex flex-col">
                          <span className="text-[13px] font-medium text-[#E8E8E8]">{h.title}</span>
                          <span className="text-[11px] text-[#555555]">{h.user}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[12px] font-medium text-[#A855F7]">{h.views}</span>
                        <span className="text-[11px] text-[#555555]">{h.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="w-[280px] shrink-0 flex flex-col gap-[10px]">
              <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[18px] hover:border-[#222222] transition-colors">
                <div className="flex justify-between items-center mb-[20px]">
                  <div className="text-[10px] font-semibold tracking-[2px] uppercase text-[#A855F7]">نشاط الأسبوع</div>
                  <div className="text-[11px] text-[#555555] font-medium">5d / 7 / 42h</div>
                </div>
                
                <div className="flex items-end justify-between h-[100px] mt-[10px] gap-[8px]">
                  {[40, 60, 30, 100, 50, 80, 20].map((height, i) => (
                    <div key={i} className="flex flex-col items-center gap-[8px] flex-1">
                      <div className="w-full bg-[#141414] rounded-t-[4px] flex items-end justify-center h-[80px]">
                        <div 
                          className="w-full bg-[#A855F7] rounded-t-[4px]" 
                          style={{ height: `${height}%`, opacity: height === 100 ? 1 : 0.7 }}
                        ></div>
                      </div>
                      <span className="text-[10px] text-[#555555] font-medium uppercase">
                        {['M','T','W','T','F','S','S'][i]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-[6px] p-[18px] flex flex-col items-center text-center hover:border-[#222222] transition-colors">
                <div className="text-[10px] font-semibold tracking-[2px] uppercase text-[#A855F7] mb-[24px] self-start w-full text-left">دوامة اليوم</div>
                
                <div className="relative w-[160px] h-[160px] rounded-full border-4 border-[#0A0A0A] shadow-[0_0_0_1px_#1A1A1A]">
                  <div className="absolute inset-0 rounded-full" 
                       style={{ 
                         background: 'conic-gradient(#A855F7 0deg 60deg, #1A1A1A 60deg 120deg, #A855F7 120deg 180deg, #1A1A1A 180deg 240deg, #A855F7 240deg 300deg, #1A1A1A 300deg 360deg)'
                       }}>
                  </div>
                  {/* Inner circle mask */}
                  <div className="absolute inset-[20px] rounded-full bg-[#0F0F0F] border-[2px] border-[#1A1A1A] flex items-center justify-center flex-col z-10">
                    <span className="text-[10px] text-[#555555] font-bold uppercase tracking-[1px]">Prize</span>
                    <span className="text-[16px] font-bold text-[#E8E8E8]">XP 500</span>
                  </div>
                  {/* Pointer */}
                  <div className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-[12px] h-[16px] bg-[#E8E8E8] clip-path-polygon-[50%_100%,0_0,100%_0] z-20" style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }}></div>
                </div>
                
                <Button className="w-full mt-[24px]">GO</Button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
