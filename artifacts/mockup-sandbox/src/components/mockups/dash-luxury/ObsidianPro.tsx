import { Gamepad2, Users, MessageSquare, Trophy, Zap, Bell, Search, Settings, LogOut, Star, Flame, Clock, Activity, Radar, BarChart2, Swords, Mic, Layers, Crown, Award, Calendar, ChevronRight, Target, Gift, Medal, TrendingUp, Sparkles } from "lucide-react";

export default function ObsidianPro() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Inter', sans-serif;
          overflow: hidden;
        }
        
        .obsidian-root {
          width: 1440px;
          height: 900px;
          background: #0C0C14;
          color: #F1F0FF;
          display: flex;
          overflow: hidden;
          position: relative;
        }
        
        .obsidian-sidebar {
          width: 220px;
          height: 100%;
          background: #0F0F1A;
          border-right: 1px solid rgba(99, 102, 241, 0.15);
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
        }
        
        .obsidian-logo {
          padding: 20px 16px;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #F1F0FF;
          border-bottom: 1px solid rgba(99, 102, 241, 0.1);
        }
        
        .obsidian-logo-icon {
          font-size: 20px;
          color: #6366F1;
        }
        
        .obsidian-nav {
          flex: 1;
          overflow-y: auto;
          padding: 12px 0;
        }
        
        .obsidian-nav::-webkit-scrollbar {
          width: 4px;
        }
        
        .obsidian-nav::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .obsidian-nav::-webkit-scrollbar-thumb {
          background: rgba(99, 102, 241, 0.3);
          border-radius: 2px;
        }
        
        .obsidian-nav-group {
          margin-bottom: 20px;
        }
        
        .obsidian-nav-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #6366F1;
          padding: 0 16px 8px;
        }
        
        .obsidian-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 500;
          color: #9CA3AF;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          border-left: 3px solid transparent;
        }
        
        .obsidian-nav-item:hover {
          background: rgba(99, 102, 241, 0.05);
          color: #F1F0FF;
        }
        
        .obsidian-nav-item.active {
          background: rgba(99, 102, 241, 0.1);
          color: #F1F0FF;
          border-left-color: #6366F1;
        }
        
        .obsidian-nav-icon {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }
        
        .obsidian-badge {
          margin-left: auto;
          background: #EF4444;
          color: white;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 10px;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .obsidian-user {
          padding: 16px;
          border-top: 1px solid rgba(99, 102, 241, 0.1);
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .obsidian-user-avatar {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: linear-gradient(135deg, #6366F1, #8B5CF6);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 14px;
          flex-shrink: 0;
        }
        
        .obsidian-user-info {
          flex: 1;
          min-width: 0;
        }
        
        .obsidian-user-name {
          font-size: 13px;
          font-weight: 600;
          color: #F1F0FF;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .obsidian-user-meta {
          font-size: 10px;
          font-weight: 500;
          color: #6B7280;
          display: flex;
          align-items: center;
          gap: 4px;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .obsidian-pro-badge {
          background: linear-gradient(135deg, #F59E0B, #EAB308);
          color: #000;
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 9px;
          font-weight: 700;
        }
        
        .obsidian-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        
        .obsidian-topbar {
          height: 48px;
          background: #0F0F1A;
          border-bottom: 1px solid rgba(99, 102, 241, 0.15);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          backdrop-filter: blur(12px);
          flex-shrink: 0;
        }
        
        .obsidian-breadcrumb {
          font-size: 14px;
          font-weight: 600;
          color: #F1F0FF;
        }
        
        .obsidian-topbar-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        
        .obsidian-icon-btn {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          color: #9CA3AF;
          position: relative;
        }
        
        .obsidian-icon-btn:hover {
          background: rgba(99, 102, 241, 0.1);
          color: #F1F0FF;
        }
        
        .obsidian-notification-badge {
          position: absolute;
          top: -2px;
          right: -2px;
          width: 16px;
          height: 16px;
          background: #EF4444;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          font-weight: 700;
          color: white;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .obsidian-ticker {
          height: 32px;
          background: #090910;
          border-bottom: 1px solid rgba(99, 102, 241, 0.1);
          display: flex;
          align-items: center;
          padding: 0 24px;
          gap: 12px;
          overflow: hidden;
          flex-shrink: 0;
        }
        
        .obsidian-live-badge {
          background: #6366F1;
          color: white;
          font-size: 10px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 4px;
          letter-spacing: 0.5px;
          flex-shrink: 0;
        }
        
        .obsidian-ticker-content {
          display: flex;
          gap: 24px;
          animation: scroll-ticker 30s linear infinite;
          white-space: nowrap;
          font-size: 12px;
          color: #9CA3AF;
          font-weight: 500;
        }
        
        @keyframes scroll-ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        
        .obsidian-ticker-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .obsidian-ticker-separator {
          color: #374151;
        }
        
        .obsidian-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: grid;
          grid-template-columns: 260px 1fr 300px;
          gap: 20px;
          align-items: start;
        }
        
        .obsidian-body::-webkit-scrollbar {
          width: 8px;
        }
        
        .obsidian-body::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .obsidian-body::-webkit-scrollbar-thumb {
          background: rgba(99, 102, 241, 0.3);
          border-radius: 4px;
        }
        
        .obsidian-column {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .obsidian-card {
          background: linear-gradient(135deg, #13131F, #101018);
          border: 1px solid rgba(99, 102, 241, 0.12);
          border-radius: 8px;
          padding: 16px;
          position: relative;
          overflow: hidden;
        }
        
        .obsidian-card-header {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #6366F1;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .obsidian-stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        
        .obsidian-stat-card {
          background: linear-gradient(135deg, #13131F, #101018);
          border: 1px solid rgba(99, 102, 241, 0.12);
          border-radius: 8px;
          padding: 12px;
          position: relative;
          overflow: hidden;
        }
        
        .obsidian-stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--stat-color);
          box-shadow: 0 4px 12px var(--stat-glow);
        }
        
        .obsidian-stat-icon {
          width: 24px;
          height: 24px;
          color: var(--stat-color);
          margin-bottom: 8px;
        }
        
        .obsidian-stat-value {
          font-size: 20px;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          color: #F1F0FF;
          margin-bottom: 2px;
        }
        
        .obsidian-stat-label {
          font-size: 11px;
          font-weight: 500;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .obsidian-bp-level {
          font-size: 11px;
          font-weight: 600;
          color: #9CA3AF;
          margin-bottom: 8px;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .obsidian-progress {
          height: 8px;
          background: rgba(99, 102, 241, 0.1);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 12px;
          position: relative;
        }
        
        .obsidian-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #6366F1, #8B5CF6);
          border-radius: 4px;
          position: relative;
          overflow: hidden;
        }
        
        .obsidian-progress-bar::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
          animation: shimmer 2s infinite;
        }
        
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        .obsidian-rewards {
          display: flex;
          gap: 8px;
          justify-content: center;
        }
        
        .obsidian-reward-icon {
          width: 36px;
          height: 36px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #6366F1;
        }
        
        .obsidian-quest-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(99, 102, 241, 0.08);
        }
        
        .obsidian-quest-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        
        .obsidian-quest-icon {
          width: 32px;
          height: 32px;
          background: rgba(239, 68, 68, 0.1);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #EF4444;
          flex-shrink: 0;
        }
        
        .obsidian-quest-info {
          flex: 1;
          min-width: 0;
        }
        
        .obsidian-quest-title {
          font-size: 12px;
          font-weight: 600;
          color: #F1F0FF;
          margin-bottom: 4px;
        }
        
        .obsidian-quest-progress-mini {
          height: 4px;
          background: rgba(99, 102, 241, 0.1);
          border-radius: 2px;
          overflow: hidden;
        }
        
        .obsidian-quest-progress-bar {
          height: 100%;
          background: var(--quest-color);
          border-radius: 2px;
        }
        
        .obsidian-quest-xp {
          font-size: 11px;
          font-weight: 700;
          color: #10B981;
          font-family: 'JetBrains Mono', monospace;
          flex-shrink: 0;
        }
        
        .obsidian-party-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        
        .obsidian-party-game {
          font-size: 14px;
          font-weight: 700;
          color: #F1F0FF;
        }
        
        .obsidian-party-mode {
          font-size: 11px;
          font-weight: 600;
          color: #6B7280;
          padding: 2px 6px;
          background: rgba(99, 102, 241, 0.1);
          border-radius: 4px;
        }
        
        .obsidian-party-rank {
          font-size: 11px;
          font-weight: 700;
          color: #8B5CF6;
          margin-left: auto;
        }
        
        .obsidian-party-status {
          font-size: 12px;
          color: #9CA3AF;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .obsidian-pulse {
          width: 6px;
          height: 6px;
          background: #10B981;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        
        .obsidian-btn {
          width: 100%;
          padding: 10px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        
        .obsidian-btn-primary {
          background: #6366F1;
          color: white;
        }
        
        .obsidian-btn-primary:hover {
          background: #5558E3;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }
        
        .obsidian-btn-danger {
          background: #EF4444;
          color: white;
        }
        
        .obsidian-btn-danger:hover {
          background: #DC2626;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
        }
        
        .obsidian-challenge-vs {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        
        .obsidian-challenge-player {
          text-align: center;
        }
        
        .obsidian-challenge-avatar {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          background: linear-gradient(135deg, #6366F1, #8B5CF6);
          margin: 0 auto 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 16px;
        }
        
        .obsidian-challenge-name {
          font-size: 13px;
          font-weight: 600;
          color: #F1F0FF;
        }
        
        .obsidian-challenge-rank {
          font-size: 11px;
          color: #6B7280;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .obsidian-vs {
          font-size: 18px;
          font-weight: 700;
          color: #EF4444;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .obsidian-tabs {
          display: flex;
          gap: 8px;
          padding: 12px;
          background: #0F0F1A;
          border-radius: 8px;
          margin-bottom: 16px;
        }
        
        .obsidian-tab {
          flex: 1;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          color: #9CA3AF;
        }
        
        .obsidian-tab.active {
          background: #6366F1;
          color: white;
        }
        
        .obsidian-lfg-card {
          background: rgba(99, 102, 241, 0.05);
          border: 1px solid rgba(99, 102, 241, 0.12);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .obsidian-lfg-avatar {
          width: 44px;
          height: 44px;
          border-radius: 8px;
          background: linear-gradient(135deg, #10B981, #059669);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 14px;
          flex-shrink: 0;
        }
        
        .obsidian-lfg-info {
          flex: 1;
          min-width: 0;
        }
        
        .obsidian-lfg-user {
          font-size: 14px;
          font-weight: 700;
          color: #F1F0FF;
          margin-bottom: 4px;
        }
        
        .obsidian-lfg-meta {
          font-size: 11px;
          color: #6B7280;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .obsidian-lfg-join {
          padding: 6px 12px;
          background: #6366F1;
          color: white;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        
        .obsidian-lfg-join:hover {
          background: #5558E3;
        }
        
        .obsidian-friends-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        
        .obsidian-friend-card {
          background: rgba(99, 102, 241, 0.05);
          border: 1px solid rgba(99, 102, 241, 0.12);
          border-radius: 8px;
          padding: 12px;
          text-align: center;
        }
        
        .obsidian-friend-avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366F1, #8B5CF6);
          margin: 0 auto 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 16px;
          border: 3px solid;
          border-color: var(--friend-color);
        }
        
        .obsidian-friend-name {
          font-size: 13px;
          font-weight: 600;
          color: #F1F0FF;
          margin-bottom: 4px;
        }
        
        .obsidian-friend-game {
          font-size: 10px;
          color: #6B7280;
          margin-bottom: 8px;
        }
        
        .obsidian-friend-actions {
          display: flex;
          gap: 6px;
        }
        
        .obsidian-friend-btn {
          flex: 1;
          padding: 6px;
          background: rgba(99, 102, 241, 0.1);
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          color: #6366F1;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .obsidian-friend-btn:hover {
          background: rgba(99, 102, 241, 0.2);
        }
        
        .obsidian-highlight-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(99, 102, 241, 0.08);
        }
        
        .obsidian-highlight-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        
        .obsidian-highlight-thumb {
          width: 64px;
          height: 36px;
          background: linear-gradient(135deg, #6366F1, #8B5CF6);
          border-radius: 6px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 20px;
        }
        
        .obsidian-highlight-info {
          flex: 1;
          min-width: 0;
        }
        
        .obsidian-highlight-user {
          font-size: 11px;
          font-weight: 600;
          color: #6366F1;
          margin-bottom: 2px;
        }
        
        .obsidian-highlight-title {
          font-size: 12px;
          color: #F1F0FF;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .obsidian-highlight-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 10px;
          color: #6B7280;
          margin-top: 2px;
        }
        
        .obsidian-chart {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 8px;
          height: 120px;
          margin-bottom: 12px;
        }
        
        .obsidian-chart-bar {
          flex: 1;
          background: linear-gradient(180deg, #6366F1, #4F46E5);
          border-radius: 4px 4px 0 0;
          position: relative;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .obsidian-chart-bar:hover {
          background: linear-gradient(180deg, #8B5CF6, #6366F1);
        }
        
        .obsidian-chart-label {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #6B7280;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .obsidian-wheel {
          width: 160px;
          height: 160px;
          margin: 16px auto;
          border-radius: 50%;
          background: conic-gradient(
            from 0deg,
            #6366F1 0deg 60deg,
            #8B5CF6 60deg 120deg,
            #10B981 120deg 180deg,
            #F59E0B 180deg 240deg,
            #EF4444 240deg 300deg,
            #EC4899 300deg 360deg
          );
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 40px rgba(99, 102, 241, 0.4);
        }
        
        .obsidian-wheel-center {
          width: 80px;
          height: 80px;
          background: #13131F;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          border: 4px solid #6366F1;
        }
        
        .obsidian-wheel-prize {
          font-size: 11px;
          font-weight: 600;
          color: #6B7280;
          margin-bottom: 2px;
        }
        
        .obsidian-wheel-value {
          font-size: 18px;
          font-weight: 700;
          color: #10B981;
          font-family: 'JetBrains Mono', monospace;
        }
      `}</style>
      
      <div className="obsidian-root">
        {/* Sidebar */}
        <div className="obsidian-sidebar">
          <div className="obsidian-logo">
            <span className="obsidian-logo-icon">⬡</span>
            <span>GAME WORLD HUB</span>
          </div>
          
          <div className="obsidian-nav">
            {/* COMMS */}
            <div className="obsidian-nav-group">
              <div className="obsidian-nav-label">COMMS</div>
              <div className="obsidian-nav-item active">
                <Gamepad2 className="obsidian-nav-icon" />
                <span>Dashboard</span>
              </div>
              <div className="obsidian-nav-item">
                <Users className="obsidian-nav-icon" />
                <span>Friends</span>
              </div>
              <div className="obsidian-nav-item">
                <MessageSquare className="obsidian-nav-icon" />
                <span>Chat</span>
                <span className="obsidian-badge">3</span>
              </div>
              <div className="obsidian-nav-item">
                <Users className="obsidian-nav-icon" />
                <span>Parties</span>
              </div>
              <div className="obsidian-nav-item">
                <Target className="obsidian-nav-icon" />
                <span>LFG</span>
              </div>
              <div className="obsidian-nav-item">
                <Trophy className="obsidian-nav-icon" />
                <span>Ranks</span>
              </div>
              <div className="obsidian-nav-item">
                <BarChart2 className="obsidian-nav-icon" />
                <span>Stats</span>
              </div>
              <div className="obsidian-nav-item">
                <Zap className="obsidian-nav-icon" />
                <span>Challenges</span>
              </div>
              <div className="obsidian-nav-item">
                <Mic className="obsidian-nav-icon" />
                <span>Rooms</span>
              </div>
              <div className="obsidian-nav-item">
                <Swords className="obsidian-nav-icon" />
                <span>Tournaments</span>
              </div>
              <div className="obsidian-nav-item">
                <Star className="obsidian-nav-icon" />
                <span>Bounties</span>
              </div>
            </div>
            
            {/* REWARDS */}
            <div className="obsidian-nav-group">
              <div className="obsidian-nav-label">REWARDS</div>
              <div className="obsidian-nav-item">
                <Layers className="obsidian-nav-icon" />
                <span>Battle Pass</span>
              </div>
              <div className="obsidian-nav-item">
                <Award className="obsidian-nav-icon" />
                <span>Achievements</span>
              </div>
              <div className="obsidian-nav-item">
                <Calendar className="obsidian-nav-icon" />
                <span>Quests</span>
              </div>
              <div className="obsidian-nav-item">
                <Trophy className="obsidian-nav-icon" />
                <span>Factions</span>
              </div>
              <div className="obsidian-nav-item">
                <Radar className="obsidian-nav-icon" />
                <span>Pro Hunt</span>
              </div>
              <div className="obsidian-nav-item">
                <Sparkles className="obsidian-nav-icon" />
                <span>Events</span>
              </div>
              <div className="obsidian-nav-item">
                <Crown className="obsidian-nav-icon" />
                <span>Prestige</span>
              </div>
            </div>
            
            {/* STORE */}
            <div className="obsidian-nav-group">
              <div className="obsidian-nav-label">STORE</div>
              <div className="obsidian-nav-item">
                <Star className="obsidian-nav-icon" />
                <span>Pro</span>
              </div>
              <div className="obsidian-nav-item">
                <Layers className="obsidian-nav-icon" />
                <span>Library</span>
              </div>
              <div className="obsidian-nav-item">
                <Gamepad2 className="obsidian-nav-icon" />
                <span>Games</span>
              </div>
            </div>
            
            <div style={{ marginTop: 'auto' }}>
              <div className="obsidian-nav-item">
                <Settings className="obsidian-nav-icon" />
                <span>Settings</span>
              </div>
              <div className="obsidian-nav-item">
                <LogOut className="obsidian-nav-icon" />
                <span>Logout</span>
              </div>
            </div>
          </div>
          
          <div className="obsidian-user">
            <div className="obsidian-user-avatar">W</div>
            <div className="obsidian-user-info">
              <div className="obsidian-user-name">Wolf_99</div>
              <div className="obsidian-user-meta">
                <span>GOLD · LVL 42</span>
                <span className="obsidian-pro-badge">PRO</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="obsidian-main">
          {/* Top Bar */}
          <div className="obsidian-topbar">
            <div className="obsidian-breadcrumb">Dashboard</div>
            <div className="obsidian-topbar-actions">
              <div className="obsidian-icon-btn">
                <Search size={18} />
              </div>
              <div className="obsidian-icon-btn">
                <Bell size={18} />
                <span className="obsidian-notification-badge">5</span>
              </div>
              <div className="obsidian-user-avatar" style={{ width: '32px', height: '32px', fontSize: '12px' }}>W</div>
            </div>
          </div>
          
          {/* Live Ticker */}
          <div className="obsidian-ticker">
            <span className="obsidian-live-badge">LIVE</span>
            <div className="obsidian-ticker-content">
              <div className="obsidian-ticker-item">
                🏆 LOUD wins VCT 2026
              </div>
              <span className="obsidian-ticker-separator">◆</span>
              <div className="obsidian-ticker-item">
                ⚡ Valorant EP9 — new map
              </div>
              <span className="obsidian-ticker-separator">◆</span>
              <div className="obsidian-ticker-item">
                🎯 GWH Cup 8PM Prize 5K SAR
              </div>
              <span className="obsidian-ticker-separator">◆</span>
              <div className="obsidian-ticker-item">
                🔥 Apex Hunter Season
              </div>
              <span className="obsidian-ticker-separator">◆</span>
              {/* Duplicate for seamless loop */}
              <div className="obsidian-ticker-item">
                🏆 LOUD wins VCT 2026
              </div>
              <span className="obsidian-ticker-separator">◆</span>
              <div className="obsidian-ticker-item">
                ⚡ Valorant EP9 — new map
              </div>
              <span className="obsidian-ticker-separator">◆</span>
              <div className="obsidian-ticker-item">
                🎯 GWH Cup 8PM Prize 5K SAR
              </div>
              <span className="obsidian-ticker-separator">◆</span>
              <div className="obsidian-ticker-item">
                🔥 Apex Hunter Season
              </div>
            </div>
          </div>
          
          {/* Dashboard Body */}
          <div className="obsidian-body">
            {/* LEFT COLUMN */}
            <div className="obsidian-column">
              {/* Stats Grid */}
              <div className="obsidian-stats-grid">
                <div className="obsidian-stat-card" style={{ '--stat-color': '#EF4444', '--stat-glow': 'rgba(239, 68, 68, 0.4)' } as any}>
                  <Flame className="obsidian-stat-icon" />
                  <div className="obsidian-stat-value">5d</div>
                  <div className="obsidian-stat-label">Streak</div>
                </div>
                <div className="obsidian-stat-card" style={{ '--stat-color': '#6366F1', '--stat-glow': 'rgba(99, 102, 241, 0.4)' } as any}>
                  <Gamepad2 className="obsidian-stat-icon" />
                  <div className="obsidian-stat-value">8</div>
                  <div className="obsidian-stat-label">Matches</div>
                </div>
                <div className="obsidian-stat-card" style={{ '--stat-color': '#F59E0B', '--stat-glow': 'rgba(245, 158, 11, 0.4)' } as any}>
                  <Trophy className="obsidian-stat-icon" />
                  <div className="obsidian-stat-value">#3</div>
                  <div className="obsidian-stat-label">Rank</div>
                </div>
                <div className="obsidian-stat-card" style={{ '--stat-color': '#8B5CF6', '--stat-glow': 'rgba(139, 92, 246, 0.4)' } as any}>
                  <Clock className="obsidian-stat-icon" />
                  <div className="obsidian-stat-value">24h</div>
                  <div className="obsidian-stat-label">Playtime</div>
                </div>
              </div>
              
              {/* Battle Pass */}
              <div className="obsidian-card">
                <div className="obsidian-card-header">S12 BATTLE PASS</div>
                <div className="obsidian-bp-level">LEVEL 32 — 32%</div>
                <div className="obsidian-progress">
                  <div className="obsidian-progress-bar" style={{ width: '32%' }}></div>
                </div>
                <div className="obsidian-rewards">
                  <div className="obsidian-reward-icon">
                    <Crown size={20} />
                  </div>
                  <div className="obsidian-reward-icon">
                    <Medal size={20} />
                  </div>
                  <div className="obsidian-reward-icon">
                    <Gift size={20} />
                  </div>
                </div>
              </div>
              
              {/* Daily Quests */}
              <div className="obsidian-card">
                <div className="obsidian-card-header">
                  <span>5 🔥 MISSIONS TODAY</span>
                </div>
                <div>
                  <div className="obsidian-quest-row">
                    <div className="obsidian-quest-icon">
                      <Target size={16} />
                    </div>
                    <div className="obsidian-quest-info">
                      <div className="obsidian-quest-title">Win 3 Matches</div>
                      <div className="obsidian-quest-progress-mini">
                        <div className="obsidian-quest-progress-bar" style={{ width: '66%', '--quest-color': '#10B981' } as any}></div>
                      </div>
                    </div>
                    <div className="obsidian-quest-xp">+250 XP</div>
                  </div>
                  <div className="obsidian-quest-row">
                    <div className="obsidian-quest-icon">
                      <Swords size={16} />
                    </div>
                    <div className="obsidian-quest-info">
                      <div className="obsidian-quest-title">Get 15 Kills</div>
                      <div className="obsidian-quest-progress-mini">
                        <div className="obsidian-quest-progress-bar" style={{ width: '40%', '--quest-color': '#F59E0B' } as any}></div>
                      </div>
                    </div>
                    <div className="obsidian-quest-xp">+150 XP</div>
                  </div>
                  <div className="obsidian-quest-row">
                    <div className="obsidian-quest-icon">
                      <Users size={16} />
                    </div>
                    <div className="obsidian-quest-info">
                      <div className="obsidian-quest-title">Play with Squad</div>
                      <div className="obsidian-quest-progress-mini">
                        <div className="obsidian-quest-progress-bar" style={{ width: '100%', '--quest-color': '#6366F1' } as any}></div>
                      </div>
                    </div>
                    <div className="obsidian-quest-xp">+200 XP</div>
                  </div>
                </div>
              </div>
              
              {/* Current Party */}
              <div className="obsidian-card">
                <div className="obsidian-party-header">
                  <span className="obsidian-party-game">Valorant</span>
                  <span className="obsidian-party-mode">Ranked</span>
                  <span className="obsidian-party-rank">DIAMOND</span>
                </div>
                <div className="obsidian-party-status">
                  <span className="obsidian-pulse"></span>
                  <span>Searching...</span>
                </div>
                <button className="obsidian-btn obsidian-btn-primary">
                  <Users size={16} />
                  Join Party
                </button>
              </div>
              
              {/* 1v1 Challenge */}
              <div className="obsidian-card">
                <div className="obsidian-card-header">1V1 CHALLENGE</div>
                <div className="obsidian-challenge-vs">
                  <div className="obsidian-challenge-player">
                    <div className="obsidian-challenge-avatar">W</div>
                    <div className="obsidian-challenge-name">Wolf_99</div>
                    <div className="obsidian-challenge-rank">DIAMOND</div>
                  </div>
                  <div className="obsidian-vs">VS</div>
                  <div className="obsidian-challenge-player">
                    <div className="obsidian-challenge-avatar" style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)' }}>أ</div>
                    <div className="obsidian-challenge-name">أنت</div>
                    <div className="obsidian-challenge-rank">DIAMOND</div>
                  </div>
                </div>
                <button className="obsidian-btn obsidian-btn-danger">
                  <Swords size={16} />
                  Send Challenge
                </button>
              </div>
            </div>
            
            {/* CENTER COLUMN */}
            <div className="obsidian-column">
              {/* Tabs */}
              <div className="obsidian-tabs">
                <div className="obsidian-tab active">LFG</div>
                <div className="obsidian-tab">أخبار</div>
                <div className="obsidian-tab">حفلات</div>
              </div>
              
              {/* LFG Posts */}
              <div className="obsidian-card">
                <div className="obsidian-card-header">LOOKING FOR GROUP</div>
                <div>
                  <div className="obsidian-lfg-card">
                    <div className="obsidian-lfg-avatar">K</div>
                    <div className="obsidian-lfg-info">
                      <div className="obsidian-lfg-user">Khalid_X</div>
                      <div className="obsidian-lfg-meta">Valorant · Diamond 2</div>
                    </div>
                    <div className="obsidian-lfg-join">انضم</div>
                  </div>
                  <div className="obsidian-lfg-card">
                    <div className="obsidian-lfg-avatar" style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)' }}>S</div>
                    <div className="obsidian-lfg-info">
                      <div className="obsidian-lfg-user">ShadowG</div>
                      <div className="obsidian-lfg-meta">Apex · Platinum</div>
                    </div>
                    <div className="obsidian-lfg-join">1 لاعب</div>
                  </div>
                  <div className="obsidian-lfg-card">
                    <div className="obsidian-lfg-avatar" style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)' }}>N</div>
                    <div className="obsidian-lfg-info">
                      <div className="obsidian-lfg-user">NightRvn</div>
                      <div className="obsidian-lfg-meta">CS2 · MG2</div>
                    </div>
                    <div className="obsidian-lfg-join">انضم 2</div>
                  </div>
                </div>
              </div>
              
              {/* Online Friends */}
              <div className="obsidian-card">
                <div className="obsidian-card-header">
                  <span>الأصدقاء المتصلون</span>
                  <span style={{ color: '#10B981', fontFamily: 'JetBrains Mono' }}>5/24 متصل</span>
                </div>
                <div className="obsidian-friends-grid">
                  <div className="obsidian-friend-card">
                    <div className="obsidian-friend-avatar" style={{ '--friend-color': '#6366F1' } as any}>N</div>
                    <div className="obsidian-friend-name">NoName_7</div>
                    <div className="obsidian-friend-game">Valorant · Comp</div>
                    <div className="obsidian-friend-actions">
                      <div className="obsidian-friend-btn">دعوة</div>
                      <div className="obsidian-friend-btn">DM</div>
                    </div>
                  </div>
                  <div className="obsidian-friend-card">
                    <div className="obsidian-friend-avatar" style={{ '--friend-color': '#10B981' } as any}>Z</div>
                    <div className="obsidian-friend-name">Ziad</div>
                    <div className="obsidian-friend-game">Apex · Pubs</div>
                    <div className="obsidian-friend-actions">
                      <div className="obsidian-friend-btn">دعوة</div>
                      <div className="obsidian-friend-btn">DM</div>
                    </div>
                  </div>
                  <div className="obsidian-friend-card">
                    <div className="obsidian-friend-avatar" style={{ '--friend-color': '#EC4899' } as any}>R</div>
                    <div className="obsidian-friend-name">Reem</div>
                    <div className="obsidian-friend-game">Fortnite · Duos</div>
                    <div className="obsidian-friend-actions">
                      <div className="obsidian-friend-btn">دعوة</div>
                      <div className="obsidian-friend-btn">DM</div>
                    </div>
                  </div>
                  <div className="obsidian-friend-card">
                    <div className="obsidian-friend-avatar" style={{ '--friend-color': '#F59E0B' } as any}>F</div>
                    <div className="obsidian-friend-name">Faisal</div>
                    <div className="obsidian-friend-game">CS2 · Wingman</div>
                    <div className="obsidian-friend-actions">
                      <div className="obsidian-friend-btn">دعوة</div>
                      <div className="obsidian-friend-btn">DM</div>
                    </div>
                  </div>
                  <div className="obsidian-friend-card">
                    <div className="obsidian-friend-avatar" style={{ '--friend-color': '#8B5CF6' } as any}>S</div>
                    <div className="obsidian-friend-name">Sara</div>
                    <div className="obsidian-friend-game">Valorant · DM</div>
                    <div className="obsidian-friend-actions">
                      <div className="obsidian-friend-btn">دعوة</div>
                      <div className="obsidian-friend-btn">DM</div>
                    </div>
                  </div>
                  <div className="obsidian-friend-card">
                    <div className="obsidian-friend-avatar" style={{ '--friend-color': '#EF4444' } as any}>K</div>
                    <div className="obsidian-friend-name">Khalid</div>
                    <div className="obsidian-friend-game">Apex · Ranked</div>
                    <div className="obsidian-friend-actions">
                      <div className="obsidian-friend-btn">دعوة</div>
                      <div className="obsidian-friend-btn">DM</div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Highlights */}
              <div className="obsidian-card">
                <div className="obsidian-card-header">
                  <span>HIGHLIGHTS</span>
                  <ChevronRight size={14} />
                </div>
                <div>
                  <div className="obsidian-highlight-row">
                    <div className="obsidian-highlight-thumb">▶</div>
                    <div className="obsidian-highlight-info">
                      <div className="obsidian-highlight-user">Wolf_99</div>
                      <div className="obsidian-highlight-title">ACE on Ascent — Insane Clutch</div>
                      <div className="obsidian-highlight-meta">
                        <span>1.2K views</span>
                        <span>·</span>
                        <span>2h ago</span>
                      </div>
                    </div>
                  </div>
                  <div className="obsidian-highlight-row">
                    <div className="obsidian-highlight-thumb" style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>▶</div>
                    <div className="obsidian-highlight-info">
                      <div className="obsidian-highlight-user">Ziad</div>
                      <div className="obsidian-highlight-title">4K with Sheriff</div>
                      <div className="obsidian-highlight-meta">
                        <span>847 views</span>
                        <span>·</span>
                        <span>5h ago</span>
                      </div>
                    </div>
                  </div>
                  <div className="obsidian-highlight-row">
                    <div className="obsidian-highlight-thumb" style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)' }}>▶</div>
                    <div className="obsidian-highlight-info">
                      <div className="obsidian-highlight-user">NoName_7</div>
                      <div className="obsidian-highlight-title">200 IQ Play on Haven</div>
                      <div className="obsidian-highlight-meta">
                        <span>2.1K views</span>
                        <span>·</span>
                        <span>1d ago</span>
                      </div>
                    </div>
                  </div>
                  <div className="obsidian-highlight-row">
                    <div className="obsidian-highlight-thumb" style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)' }}>▶</div>
                    <div className="obsidian-highlight-info">
                      <div className="obsidian-highlight-user">Reem</div>
                      <div className="obsidian-highlight-title">Legendary Snipe Montage</div>
                      <div className="obsidian-highlight-meta">
                        <span>3.5K views</span>
                        <span>·</span>
                        <span>2d ago</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* RIGHT COLUMN */}
            <div className="obsidian-column">
              {/* Weekly Activity */}
              <div className="obsidian-card">
                <div className="obsidian-card-header">
                  <span>نشاط الأسبوع</span>
                  <span style={{ fontFamily: 'JetBrains Mono', color: '#9CA3AF' }}>5d/7/42h</span>
                </div>
                <div className="obsidian-chart">
                  <div className="obsidian-chart-bar" style={{ height: '40%' }}></div>
                  <div className="obsidian-chart-bar" style={{ height: '65%' }}></div>
                  <div className="obsidian-chart-bar" style={{ height: '85%' }}></div>
                  <div className="obsidian-chart-bar" style={{ height: '90%' }}></div>
                  <div className="obsidian-chart-bar" style={{ height: '100%' }}></div>
                  <div className="obsidian-chart-bar" style={{ height: '75%' }}></div>
                  <div className="obsidian-chart-bar" style={{ height: '50%' }}></div>
                </div>
                <div className="obsidian-chart-label">
                  <span>M</span>
                  <span>T</span>
                  <span>W</span>
                  <span>T</span>
                  <span>F</span>
                  <span>S</span>
                  <span>S</span>
                </div>
              </div>
              
              {/* Daily Spin */}
              <div className="obsidian-card">
                <div className="obsidian-card-header">دوامة اليوم</div>
                <div className="obsidian-wheel">
                  <div className="obsidian-wheel-center">
                    <div className="obsidian-wheel-prize">XP</div>
                    <div className="obsidian-wheel-value">500</div>
                  </div>
                </div>
                <button className="obsidian-btn obsidian-btn-primary">
                  <Sparkles size={16} />
                  SPIN NOW
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
