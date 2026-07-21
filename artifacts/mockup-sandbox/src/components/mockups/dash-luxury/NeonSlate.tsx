import { Gamepad2, Users, MessageSquare, Trophy, Zap, Bell, Search, Settings, LogOut, Star, Flame, Clock, Activity, Radar, BarChart2, Swords, Mic, Layers, Crown, Award, Calendar, ChevronRight, Target, Gift, Sparkles } from "lucide-react";

export default function NeonSlate() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        .neonslate-root {
          font-family: 'Plus Jakarta Sans', sans-serif;
          background: #0A0F1E;
          color: #E2F0FF;
          width: 1440px;
          height: 900px;
          overflow: hidden;
          position: relative;
        }
        
        .neonslate-root::before {
          content: '';
          position: absolute;
          top: -200px;
          right: -200px;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%);
          pointer-events: none;
        }
        
        .neonslate-sidebar {
          position: fixed;
          left: 0;
          top: 0;
          width: 220px;
          height: 100%;
          background: #080D1A;
          border-right: 1px solid rgba(0,212,255,0.1);
          display: flex;
          flex-direction: column;
          z-index: 100;
        }
        
        .neonslate-logo {
          padding: 20px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid rgba(0,212,255,0.08);
        }
        
        .neonslate-logo-icon {
          width: 28px;
          height: 28px;
          background: linear-gradient(135deg, #00D4FF, #00A8CC);
          clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
        }
        
        .neonslate-logo-text {
          font-weight: 800;
          font-size: 13px;
          letter-spacing: 0.5px;
          color: #00D4FF;
        }
        
        .neonslate-nav {
          flex: 1;
          overflow-y: auto;
          padding: 16px 0;
        }
        
        .neonslate-nav::-webkit-scrollbar {
          width: 4px;
        }
        
        .neonslate-nav::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .neonslate-nav::-webkit-scrollbar-thumb {
          background: rgba(0,212,255,0.2);
          border-radius: 2px;
        }
        
        .neonslate-nav-group {
          margin-bottom: 24px;
        }
        
        .neonslate-nav-header {
          padding: 0 16px 8px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.2px;
          color: #00D4FF;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .neonslate-nav-header::before {
          content: '';
          width: 4px;
          height: 4px;
          background: #00D4FF;
          border-radius: 50%;
        }
        
        .neonslate-nav-item {
          padding: 10px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
          color: #4A6080;
          font-size: 13px;
          font-weight: 500;
        }
        
        .neonslate-nav-item:hover {
          color: #E2F0FF;
          background: rgba(0,212,255,0.03);
        }
        
        .neonslate-nav-item.active {
          color: #00D4FF;
          background: rgba(0,212,255,0.05);
        }
        
        .neonslate-nav-item.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: #00D4FF;
        }
        
        .neonslate-nav-icon {
          width: 18px;
          height: 18px;
        }
        
        .neonslate-nav-item.active .neonslate-nav-icon {
          color: #00D4FF;
        }
        
        .neonslate-badge {
          margin-left: auto;
          background: #FF2D78;
          color: white;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 10px;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .neonslate-user-section {
          padding: 16px;
          border-top: 1px solid rgba(0,212,255,0.08);
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .neonslate-user-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FFB800, #FF8C00);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: #0A0F1E;
          position: relative;
          border: 2px solid rgba(255,184,0,0.3);
        }
        
        .neonslate-user-avatar::after {
          content: '';
          position: absolute;
          bottom: 0;
          right: 0;
          width: 10px;
          height: 10px;
          background: #00E5A0;
          border: 2px solid #080D1A;
          border-radius: 50%;
        }
        
        .neonslate-user-info {
          flex: 1;
        }
        
        .neonslate-username {
          font-size: 13px;
          font-weight: 600;
          color: #E2F0FF;
          margin-bottom: 2px;
        }
        
        .neonslate-user-level {
          font-size: 10px;
          color: #4A6080;
          font-family: 'JetBrains Mono', monospace;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .neonslate-pro-badge {
          background: linear-gradient(135deg, #FFB800, #FF8C00);
          color: #0A0F1E;
          font-size: 8px;
          font-weight: 800;
          padding: 2px 5px;
          border-radius: 3px;
          margin-left: 4px;
        }
        
        .neonslate-main {
          margin-left: 220px;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        
        .neonslate-topbar {
          height: 48px;
          background: #080D1A;
          border-bottom: 1px solid rgba(0,212,255,0.1);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          position: sticky;
          top: 0;
          z-index: 50;
        }
        
        .neonslate-breadcrumb {
          font-size: 14px;
          font-weight: 600;
          color: #E2F0FF;
        }
        
        .neonslate-topbar-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        
        .neonslate-icon-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: transparent;
          border: 1px solid rgba(0,212,255,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          color: #4A6080;
          position: relative;
        }
        
        .neonslate-icon-btn:hover {
          background: rgba(0,212,255,0.05);
          color: #00D4FF;
          border-color: rgba(0,212,255,0.3);
        }
        
        .neonslate-icon-btn .neonslate-notif-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          background: #FF2D78;
          color: white;
          font-size: 9px;
          font-weight: 700;
          padding: 2px 5px;
          border-radius: 8px;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .neonslate-ticker {
          height: 32px;
          background: linear-gradient(90deg, #0D1526 0%, #111927 50%, #0D1526 100%);
          border-bottom: 1px solid rgba(0,212,255,0.08);
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 0 24px;
          overflow: hidden;
          position: relative;
        }
        
        .neonslate-live-badge {
          background: #FF2D78;
          color: white;
          font-size: 9px;
          font-weight: 800;
          padding: 4px 8px;
          border-radius: 4px;
          letter-spacing: 1px;
          box-shadow: 0 0 12px rgba(255,45,120,0.4);
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        
        .neonslate-ticker-content {
          display: flex;
          align-items: center;
          gap: 24px;
          font-size: 12px;
          font-weight: 500;
          color: #4A6080;
          white-space: nowrap;
          animation: scroll 30s linear infinite;
        }
        
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        
        .neonslate-ticker-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .neonslate-ticker-separator {
          color: #00D4FF;
        }
        
        .neonslate-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: grid;
          grid-template-columns: 260px 1fr 300px;
          gap: 24px;
          align-items: start;
        }
        
        .neonslate-body::-webkit-scrollbar {
          width: 8px;
        }
        
        .neonslate-body::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .neonslate-body::-webkit-scrollbar-thumb {
          background: rgba(0,212,255,0.2);
          border-radius: 4px;
        }
        
        .neonslate-card {
          background: #0D1526;
          border: 1px solid rgba(0,212,255,0.08);
          border-radius: 10px;
          padding: 16px;
          margin-bottom: 16px;
        }
        
        .neonslate-stat-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }
        
        .neonslate-stat-card {
          background: #0D1526;
          border: 1px solid rgba(0,212,255,0.08);
          border-radius: 10px;
          padding: 12px;
          position: relative;
          overflow: hidden;
        }
        
        .neonslate-stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
        }
        
        .neonslate-stat-card.cyan::before {
          background: #00D4FF;
        }
        
        .neonslate-stat-card.magenta::before {
          background: #FF2D78;
        }
        
        .neonslate-stat-card.mint::before {
          background: #00E5A0;
        }
        
        .neonslate-stat-card.amber::before {
          background: #FFB800;
        }
        
        .neonslate-stat-value {
          font-size: 20px;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .neonslate-stat-card.cyan .neonslate-stat-value {
          color: #00D4FF;
        }
        
        .neonslate-stat-card.magenta .neonslate-stat-value {
          color: #FF2D78;
        }
        
        .neonslate-stat-card.mint .neonslate-stat-value {
          color: #00E5A0;
        }
        
        .neonslate-stat-card.amber .neonslate-stat-value {
          color: #FFB800;
        }
        
        .neonslate-stat-label {
          font-size: 10px;
          color: #4A6080;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
        }
        
        .neonslate-section-header {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1px;
          color: #00D4FF;
          text-transform: uppercase;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .neonslate-section-header::before {
          content: '';
          width: 4px;
          height: 4px;
          background: #00D4FF;
          border-radius: 50%;
        }
        
        .neonslate-bp-level {
          font-size: 24px;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          color: #00D4FF;
          margin-bottom: 8px;
        }
        
        .neonslate-progress-bar {
          height: 8px;
          background: rgba(0,212,255,0.1);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 12px;
        }
        
        .neonslate-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00D4FF, #00A8CC);
          border-radius: 4px;
          transition: width 0.3s;
        }
        
        .neonslate-rewards {
          display: flex;
          gap: 8px;
        }
        
        .neonslate-reward-icon {
          width: 36px;
          height: 36px;
          background: rgba(0,212,255,0.1);
          border: 1px solid rgba(0,212,255,0.2);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #00D4FF;
        }
        
        .neonslate-quest-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(0,212,255,0.05);
        }
        
        .neonslate-quest-item:last-child {
          border-bottom: none;
        }
        
        .neonslate-quest-icon {
          width: 32px;
          height: 32px;
          background: rgba(0,229,160,0.1);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #00E5A0;
        }
        
        .neonslate-quest-info {
          flex: 1;
        }
        
        .neonslate-quest-title {
          font-size: 12px;
          font-weight: 600;
          color: #E2F0FF;
          margin-bottom: 4px;
        }
        
        .neonslate-quest-progress {
          height: 4px;
          background: rgba(0,229,160,0.1);
          border-radius: 2px;
          overflow: hidden;
        }
        
        .neonslate-quest-progress-fill {
          height: 100%;
          border-radius: 2px;
        }
        
        .neonslate-quest-xp {
          font-size: 11px;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          color: #00E5A0;
        }
        
        .neonslate-party-status {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        
        .neonslate-party-game {
          font-size: 13px;
          font-weight: 600;
          color: #E2F0FF;
        }
        
        .neonslate-party-rank {
          font-size: 11px;
          color: #4A6080;
        }
        
        .neonslate-party-searching {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: rgba(0,212,255,0.05);
          border-radius: 8px;
          margin-bottom: 12px;
        }
        
        .neonslate-searching-dot {
          width: 8px;
          height: 8px;
          background: #00D4FF;
          border-radius: 50%;
          animation: pulse 1.5s infinite;
        }
        
        .neonslate-btn {
          width: 100%;
          padding: 10px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        
        .neonslate-btn-primary {
          background: #00D4FF;
          color: #0A0F1E;
        }
        
        .neonslate-btn-primary:hover {
          background: #00B8E6;
          transform: translateY(-1px);
        }
        
        .neonslate-btn-danger {
          background: #FF2D78;
          color: white;
        }
        
        .neonslate-btn-danger:hover {
          background: #E6286B;
          transform: translateY(-1px);
        }
        
        .neonslate-challenge-vs {
          text-align: center;
          font-size: 18px;
          font-weight: 700;
          color: #E2F0FF;
          margin-bottom: 8px;
        }
        
        .neonslate-challenge-rank {
          text-align: center;
          font-size: 11px;
          color: #4A6080;
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        .neonslate-tabs {
          display: flex;
          gap: 24px;
          border-bottom: 1px solid rgba(0,212,255,0.08);
          margin-bottom: 16px;
        }
        
        .neonslate-tab {
          padding: 12px 0;
          font-size: 13px;
          font-weight: 600;
          color: #4A6080;
          cursor: pointer;
          position: relative;
          transition: color 0.2s;
        }
        
        .neonslate-tab:hover {
          color: #E2F0FF;
        }
        
        .neonslate-tab.active {
          color: #00D4FF;
        }
        
        .neonslate-tab.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: #00D4FF;
        }
        
        .neonslate-lfg-card {
          background: #0D1526;
          border: 1px solid rgba(0,212,255,0.08);
          border-radius: 10px;
          padding: 16px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .neonslate-lfg-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #00D4FF, #0088AA);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: white;
        }
        
        .neonslate-lfg-info {
          flex: 1;
        }
        
        .neonslate-lfg-user {
          font-size: 14px;
          font-weight: 600;
          color: #E2F0FF;
          margin-bottom: 4px;
        }
        
        .neonslate-lfg-game {
          font-size: 12px;
          color: #4A6080;
        }
        
        .neonslate-btn-join {
          padding: 8px 16px;
          background: transparent;
          border: 1px solid #00D4FF;
          color: #00D4FF;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .neonslate-btn-join:hover {
          background: rgba(0,212,255,0.1);
        }
        
        .neonslate-friends-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        
        .neonslate-friends-count {
          font-size: 12px;
          color: #4A6080;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .neonslate-friends-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }
        
        .neonslate-friend-card {
          background: #121D33;
          border: 1px solid rgba(0,212,255,0.1);
          border-radius: 10px;
          padding: 12px;
          text-align: center;
        }
        
        .neonslate-friend-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #00E5A0, #00A876);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: white;
          margin: 0 auto 8px;
          border: 2px solid rgba(0,229,160,0.3);
          position: relative;
        }
        
        .neonslate-friend-avatar::after {
          content: '';
          position: absolute;
          bottom: 0;
          right: 0;
          width: 10px;
          height: 10px;
          background: #00E5A0;
          border: 2px solid #121D33;
          border-radius: 50%;
        }
        
        .neonslate-friend-name {
          font-size: 12px;
          font-weight: 600;
          color: #E2F0FF;
          margin-bottom: 4px;
        }
        
        .neonslate-friend-game {
          font-size: 10px;
          color: #4A6080;
          margin-bottom: 8px;
        }
        
        .neonslate-friend-actions {
          display: flex;
          gap: 4px;
        }
        
        .neonslate-friend-btn {
          flex: 1;
          padding: 6px;
          background: rgba(0,212,255,0.05);
          border: 1px solid rgba(0,212,255,0.1);
          color: #00D4FF;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .neonslate-friend-btn:hover {
          background: rgba(0,212,255,0.1);
        }
        
        .neonslate-highlight-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 0;
          border-bottom: 1px solid rgba(0,212,255,0.05);
        }
        
        .neonslate-highlight-item:last-child {
          border-bottom: none;
        }
        
        .neonslate-highlight-thumb {
          width: 80px;
          height: 48px;
          background: linear-gradient(135deg, #FF2D78, #CC2461);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }
        
        .neonslate-highlight-info {
          flex: 1;
        }
        
        .neonslate-highlight-user {
          font-size: 11px;
          color: #4A6080;
          margin-bottom: 2px;
        }
        
        .neonslate-highlight-title {
          font-size: 12px;
          font-weight: 600;
          color: #E2F0FF;
          margin-bottom: 4px;
        }
        
        .neonslate-highlight-meta {
          font-size: 10px;
          color: #4A6080;
        }
        
        .neonslate-chart-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        
        .neonslate-chart-stats {
          font-size: 11px;
          color: #4A6080;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .neonslate-chart {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          height: 120px;
          margin-bottom: 8px;
        }
        
        .neonslate-bar {
          flex: 1;
          background: linear-gradient(180deg, #00D4FF, #0088AA);
          border-radius: 4px 4px 0 0;
          position: relative;
          transition: all 0.3s;
        }
        
        .neonslate-bar:hover {
          opacity: 0.8;
        }
        
        .neonslate-chart-labels {
          display: flex;
          gap: 8px;
        }
        
        .neonslate-chart-label {
          flex: 1;
          text-align: center;
          font-size: 10px;
          color: #4A6080;
          font-weight: 600;
        }
        
        .neonslate-wheel-container {
          position: relative;
          width: 180px;
          height: 180px;
          margin: 16px auto;
        }
        
        .neonslate-wheel {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: conic-gradient(
            from 0deg,
            #00D4FF 0deg 60deg,
            #0D1526 60deg 120deg,
            #FF2D78 120deg 180deg,
            #0D1526 180deg 240deg,
            #00E5A0 240deg 300deg,
            #0D1526 300deg 360deg
          );
          border: 4px solid rgba(0,212,255,0.2);
          position: relative;
          animation: rotate 8s linear infinite;
        }
        
        @keyframes rotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .neonslate-wheel-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 80px;
          height: 80px;
          background: #0D1526;
          border-radius: 50%;
          border: 3px solid #00D4FF;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }
        
        .neonslate-wheel-prize {
          font-size: 11px;
          color: #4A6080;
          margin-bottom: 2px;
        }
        
        .neonslate-wheel-value {
          font-size: 16px;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          color: #00D4FF;
        }
      `}</style>
      
      <div className="neonslate-root">
        {/* Sidebar */}
        <div className="neonslate-sidebar">
          <div className="neonslate-logo">
            <div className="neonslate-logo-icon"></div>
            <div className="neonslate-logo-text">GAME WORLD HUB</div>
          </div>
          
          <div className="neonslate-nav">
            <div className="neonslate-nav-group">
              <div className="neonslate-nav-header">COMMS</div>
              <div className="neonslate-nav-item active">
                <Gamepad2 className="neonslate-nav-icon" size={18} />
                Dashboard
              </div>
              <div className="neonslate-nav-item">
                <Users className="neonslate-nav-icon" size={18} />
                Friends
              </div>
              <div className="neonslate-nav-item">
                <MessageSquare className="neonslate-nav-icon" size={18} />
                Chat
                <span className="neonslate-badge">3</span>
              </div>
              <div className="neonslate-nav-item">
                <Users className="neonslate-nav-icon" size={18} />
                Parties
              </div>
              <div className="neonslate-nav-item">
                <Radar className="neonslate-nav-icon" size={18} />
                LFG
              </div>
              <div className="neonslate-nav-item">
                <Trophy className="neonslate-nav-icon" size={18} />
                Ranks
              </div>
              <div className="neonslate-nav-item">
                <BarChart2 className="neonslate-nav-icon" size={18} />
                Stats
              </div>
              <div className="neonslate-nav-item">
                <Target className="neonslate-nav-icon" size={18} />
                Challenges
              </div>
              <div className="neonslate-nav-item">
                <Mic className="neonslate-nav-icon" size={18} />
                Rooms
              </div>
              <div className="neonslate-nav-item">
                <Trophy className="neonslate-nav-icon" size={18} />
                Tournaments
              </div>
              <div className="neonslate-nav-item">
                <Swords className="neonslate-nav-icon" size={18} />
                Bounties
              </div>
            </div>
            
            <div className="neonslate-nav-group">
              <div className="neonslate-nav-header">REWARDS</div>
              <div className="neonslate-nav-item">
                <Layers className="neonslate-nav-icon" size={18} />
                Battle Pass
              </div>
              <div className="neonslate-nav-item">
                <Award className="neonslate-nav-icon" size={18} />
                Achievements
              </div>
              <div className="neonslate-nav-item">
                <Target className="neonslate-nav-icon" size={18} />
                Quests
              </div>
              <div className="neonslate-nav-item">
                <Star className="neonslate-nav-icon" size={18} />
                Factions
              </div>
              <div className="neonslate-nav-item">
                <Trophy className="neonslate-nav-icon" size={18} />
                Pro Hunt
              </div>
              <div className="neonslate-nav-item">
                <Calendar className="neonslate-nav-icon" size={18} />
                Events
              </div>
              <div className="neonslate-nav-item">
                <Crown className="neonslate-nav-icon" size={18} />
                Prestige
              </div>
            </div>
            
            <div className="neonslate-nav-group">
              <div className="neonslate-nav-header">STORE</div>
              <div className="neonslate-nav-item">
                <Star className="neonslate-nav-icon" size={18} />
                Pro
              </div>
              <div className="neonslate-nav-item">
                <Layers className="neonslate-nav-icon" size={18} />
                Library
              </div>
              <div className="neonslate-nav-item">
                <Gamepad2 className="neonslate-nav-icon" size={18} />
                Games
              </div>
            </div>
            
            <div className="neonslate-nav-group">
              <div className="neonslate-nav-item">
                <Settings className="neonslate-nav-icon" size={18} />
                Settings
              </div>
              <div className="neonslate-nav-item">
                <LogOut className="neonslate-nav-icon" size={18} />
                Logout
              </div>
            </div>
          </div>
          
          <div className="neonslate-user-section">
            <div className="neonslate-user-avatar">W</div>
            <div className="neonslate-user-info">
              <div className="neonslate-username">Wolf_99</div>
              <div className="neonslate-user-level">
                GOLD · LVL 42
                <span className="neonslate-pro-badge">PRO</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="neonslate-main">
          {/* Top Bar */}
          <div className="neonslate-topbar">
            <div className="neonslate-breadcrumb">Dashboard</div>
            <div className="neonslate-topbar-actions">
              <button className="neonslate-icon-btn">
                <Search size={16} />
              </button>
              <button className="neonslate-icon-btn">
                <Bell size={16} />
                <span className="neonslate-notif-badge">8</span>
              </button>
              <div className="neonslate-user-avatar" style={{ width: '32px', height: '32px', fontSize: '12px' }}>W</div>
            </div>
          </div>
          
          {/* Live Ticker */}
          <div className="neonslate-ticker">
            <div className="neonslate-live-badge">LIVE</div>
            <div className="neonslate-ticker-content">
              <div className="neonslate-ticker-item">
                🏆 LOUD wins VCT 2026
              </div>
              <span className="neonslate-ticker-separator">◆</span>
              <div className="neonslate-ticker-item">
                ⚡ Valorant EP9 — new map
              </div>
              <span className="neonslate-ticker-separator">◆</span>
              <div className="neonslate-ticker-item">
                🎯 GWH Cup 8PM Prize 5K SAR
              </div>
              <span className="neonslate-ticker-separator">◆</span>
              <div className="neonslate-ticker-item">
                🔥 Apex Hunter Season
              </div>
              <span className="neonslate-ticker-separator">◆</span>
              <div className="neonslate-ticker-item">
                🏆 LOUD wins VCT 2026
              </div>
              <span className="neonslate-ticker-separator">◆</span>
              <div className="neonslate-ticker-item">
                ⚡ Valorant EP9 — new map
              </div>
            </div>
          </div>
          
          {/* Dashboard Body */}
          <div className="neonslate-body">
            {/* Left Column */}
            <div>
              {/* Stat Cards */}
              <div className="neonslate-stat-grid">
                <div className="neonslate-stat-card magenta">
                  <div className="neonslate-stat-value">
                    <Flame size={18} />
                    5d
                  </div>
                  <div className="neonslate-stat-label">Streak</div>
                </div>
                <div className="neonslate-stat-card cyan">
                  <div className="neonslate-stat-value">
                    <Gamepad2 size={18} />
                    8
                  </div>
                  <div className="neonslate-stat-label">Matches</div>
                </div>
                <div className="neonslate-stat-card mint">
                  <div className="neonslate-stat-value">
                    <Trophy size={18} />
                    #3
                  </div>
                  <div className="neonslate-stat-label">Rank</div>
                </div>
                <div className="neonslate-stat-card amber">
                  <div className="neonslate-stat-value">
                    <Clock size={18} />
                    24h
                  </div>
                  <div className="neonslate-stat-label">Playtime</div>
                </div>
              </div>
              
              {/* Battle Pass */}
              <div className="neonslate-card">
                <div className="neonslate-section-header">S12 BATTLE PASS</div>
                <div className="neonslate-bp-level">LVL 32</div>
                <div className="neonslate-progress-bar">
                  <div className="neonslate-progress-fill" style={{ width: '32%' }}></div>
                </div>
                <div className="neonslate-rewards">
                  <div className="neonslate-reward-icon">
                    <Crown size={18} />
                  </div>
                  <div className="neonslate-reward-icon">
                    <Award size={18} />
                  </div>
                  <div className="neonslate-reward-icon">
                    <Gift size={18} />
                  </div>
                  <div className="neonslate-reward-icon">
                    <Sparkles size={18} />
                  </div>
                </div>
              </div>
              
              {/* Daily Quests */}
              <div className="neonslate-card">
                <div className="neonslate-section-header">
                  <Flame size={14} />
                  5 MISSIONS TODAY
                </div>
                <div>
                  <div className="neonslate-quest-item">
                    <div className="neonslate-quest-icon">
                      <Target size={16} />
                    </div>
                    <div className="neonslate-quest-info">
                      <div className="neonslate-quest-title">Win 3 Matches</div>
                      <div className="neonslate-quest-progress">
                        <div className="neonslate-quest-progress-fill" style={{ width: '66%', background: 'linear-gradient(90deg, #00E5A0, #00A876)' }}></div>
                      </div>
                    </div>
                    <div className="neonslate-quest-xp">+800</div>
                  </div>
                  <div className="neonslate-quest-item">
                    <div className="neonslate-quest-icon">
                      <Swords size={16} />
                    </div>
                    <div className="neonslate-quest-info">
                      <div className="neonslate-quest-title">30 Eliminations</div>
                      <div className="neonslate-quest-progress">
                        <div className="neonslate-quest-progress-fill" style={{ width: '80%', background: 'linear-gradient(90deg, #00D4FF, #0088AA)' }}></div>
                      </div>
                    </div>
                    <div className="neonslate-quest-xp">+500</div>
                  </div>
                  <div className="neonslate-quest-item">
                    <div className="neonslate-quest-icon">
                      <Users size={16} />
                    </div>
                    <div className="neonslate-quest-info">
                      <div className="neonslate-quest-title">Play with Squad</div>
                      <div className="neonslate-quest-progress">
                        <div className="neonslate-quest-progress-fill" style={{ width: '100%', background: 'linear-gradient(90deg, #FFB800, #FF8C00)' }}></div>
                      </div>
                    </div>
                    <div className="neonslate-quest-xp">+300</div>
                  </div>
                </div>
              </div>
              
              {/* Current Party */}
              <div className="neonslate-card">
                <div className="neonslate-section-header">CURRENT PARTY</div>
                <div className="neonslate-party-status">
                  <div className="neonslate-party-game">Valorant</div>
                  <span style={{ color: '#4A6080' }}>•</span>
                  <div className="neonslate-party-rank">Ranked</div>
                  <span style={{ color: '#4A6080' }}>•</span>
                  <div className="neonslate-party-rank">Diamond</div>
                </div>
                <div className="neonslate-party-searching">
                  <div className="neonslate-searching-dot"></div>
                  <span style={{ fontSize: '12px', color: '#00D4FF', fontWeight: 600 }}>Searching...</span>
                </div>
                <button className="neonslate-btn neonslate-btn-primary">
                  Join Party
                </button>
              </div>
              
              {/* 1v1 Challenge */}
              <div className="neonslate-card">
                <div className="neonslate-section-header">1v1 CHALLENGE</div>
                <div className="neonslate-challenge-vs">Wolf_99 VS أنت</div>
                <div className="neonslate-challenge-rank">DIAMOND</div>
                <button className="neonslate-btn neonslate-btn-danger">
                  Send Challenge
                </button>
              </div>
            </div>
            
            {/* Center Column */}
            <div>
              {/* Tabs */}
              <div className="neonslate-tabs">
                <div className="neonslate-tab active">LFG</div>
                <div className="neonslate-tab">أخبار</div>
                <div className="neonslate-tab">حفلات</div>
              </div>
              
              {/* LFG Posts */}
              <div style={{ marginBottom: '24px' }}>
                <div className="neonslate-lfg-card">
                  <div className="neonslate-lfg-avatar">K</div>
                  <div className="neonslate-lfg-info">
                    <div className="neonslate-lfg-user">Khalid_X</div>
                    <div className="neonslate-lfg-game">Valorant · Diamond 2</div>
                  </div>
                  <button className="neonslate-btn-join">انضم</button>
                </div>
                
                <div className="neonslate-lfg-card">
                  <div className="neonslate-lfg-avatar" style={{ background: 'linear-gradient(135deg, #FF2D78, #CC2461)' }}>S</div>
                  <div className="neonslate-lfg-info">
                    <div className="neonslate-lfg-user">ShadowG</div>
                    <div className="neonslate-lfg-game">Apex · Platinum</div>
                  </div>
                  <button className="neonslate-btn-join">1 لاعب</button>
                </div>
                
                <div className="neonslate-lfg-card">
                  <div className="neonslate-lfg-avatar" style={{ background: 'linear-gradient(135deg, #00E5A0, #00A876)' }}>N</div>
                  <div className="neonslate-lfg-info">
                    <div className="neonslate-lfg-user">NightRvn</div>
                    <div className="neonslate-lfg-game">CS2 · MG2</div>
                  </div>
                  <button className="neonslate-btn-join">انضم 2</button>
                </div>
              </div>
              
              {/* Online Friends */}
              <div>
                <div className="neonslate-friends-header">
                  <div className="neonslate-section-header">الأصدقاء المتصلون</div>
                  <div className="neonslate-friends-count">5/24 متصل</div>
                </div>
                
                <div className="neonslate-friends-grid">
                  <div className="neonslate-friend-card">
                    <div className="neonslate-friend-avatar">N</div>
                    <div className="neonslate-friend-name">NoName_7</div>
                    <div className="neonslate-friend-game">Valorant</div>
                    <div className="neonslate-friend-actions">
                      <button className="neonslate-friend-btn">دعوة</button>
                      <button className="neonslate-friend-btn">DM</button>
                    </div>
                  </div>
                  
                  <div className="neonslate-friend-card">
                    <div className="neonslate-friend-avatar" style={{ background: 'linear-gradient(135deg, #00D4FF, #0088AA)' }}>Z</div>
                    <div className="neonslate-friend-name">Ziad</div>
                    <div className="neonslate-friend-game">Apex</div>
                    <div className="neonslate-friend-actions">
                      <button className="neonslate-friend-btn">دعوة</button>
                      <button className="neonslate-friend-btn">DM</button>
                    </div>
                  </div>
                  
                  <div className="neonslate-friend-card">
                    <div className="neonslate-friend-avatar" style={{ background: 'linear-gradient(135deg, #FF2D78, #CC2461)' }}>R</div>
                    <div className="neonslate-friend-name">Reem</div>
                    <div className="neonslate-friend-game">CS2</div>
                    <div className="neonslate-friend-actions">
                      <button className="neonslate-friend-btn">دعوة</button>
                      <button className="neonslate-friend-btn">DM</button>
                    </div>
                  </div>
                  
                  <div className="neonslate-friend-card">
                    <div className="neonslate-friend-avatar" style={{ background: 'linear-gradient(135deg, #FFB800, #FF8C00)' }}>F</div>
                    <div className="neonslate-friend-name">Faisal</div>
                    <div className="neonslate-friend-game">Fortnite</div>
                    <div className="neonslate-friend-actions">
                      <button className="neonslate-friend-btn">دعوة</button>
                      <button className="neonslate-friend-btn">DM</button>
                    </div>
                  </div>
                  
                  <div className="neonslate-friend-card">
                    <div className="neonslate-friend-avatar" style={{ background: 'linear-gradient(135deg, #9D4EDD, #7B2CBF)' }}>S</div>
                    <div className="neonslate-friend-name">Sara</div>
                    <div className="neonslate-friend-game">Overwatch</div>
                    <div className="neonslate-friend-actions">
                      <button className="neonslate-friend-btn">دعوة</button>
                      <button className="neonslate-friend-btn">DM</button>
                    </div>
                  </div>
                  
                  <div className="neonslate-friend-card">
                    <div className="neonslate-friend-avatar" style={{ background: 'linear-gradient(135deg, #06D6A0, #048A5C)' }}>K</div>
                    <div className="neonslate-friend-name">Khalid</div>
                    <div className="neonslate-friend-game">Rocket League</div>
                    <div className="neonslate-friend-actions">
                      <button className="neonslate-friend-btn">دعوة</button>
                      <button className="neonslate-friend-btn">DM</button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Highlights */}
              <div>
                <div className="neonslate-section-header">HIGHLIGHTS</div>
                <div>
                  <div className="neonslate-highlight-item">
                    <div className="neonslate-highlight-thumb">
                      <Zap size={24} />
                    </div>
                    <div className="neonslate-highlight-info">
                      <div className="neonslate-highlight-user">Wolf_99</div>
                      <div className="neonslate-highlight-title">Insane 1v5 Clutch</div>
                      <div className="neonslate-highlight-meta">2.3K views · 2h ago</div>
                    </div>
                  </div>
                  
                  <div className="neonslate-highlight-item">
                    <div className="neonslate-highlight-thumb" style={{ background: 'linear-gradient(135deg, #00D4FF, #0088AA)' }}>
                      <Trophy size={24} />
                    </div>
                    <div className="neonslate-highlight-info">
                      <div className="neonslate-highlight-user">Khalid_X</div>
                      <div className="neonslate-highlight-title">Ace Round Victory</div>
                      <div className="neonslate-highlight-meta">1.8K views · 5h ago</div>
                    </div>
                  </div>
                  
                  <div className="neonslate-highlight-item">
                    <div className="neonslate-highlight-thumb" style={{ background: 'linear-gradient(135deg, #00E5A0, #00A876)' }}>
                      <Target size={24} />
                    </div>
                    <div className="neonslate-highlight-info">
                      <div className="neonslate-highlight-user">Ziad</div>
                      <div className="neonslate-highlight-title">Perfect Headshot Streak</div>
                      <div className="neonslate-highlight-meta">987 views · 12h ago</div>
                    </div>
                  </div>
                  
                  <div className="neonslate-highlight-item">
                    <div className="neonslate-highlight-thumb" style={{ background: 'linear-gradient(135deg, #FFB800, #FF8C00)' }}>
                      <Flame size={24} />
                    </div>
                    <div className="neonslate-highlight-info">
                      <div className="neonslate-highlight-user">NightRvn</div>
                      <div className="neonslate-highlight-title">Squad Wipe Moment</div>
                      <div className="neonslate-highlight-meta">3.1K views · 1d ago</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right Column */}
            <div>
              {/* Weekly Activity */}
              <div className="neonslate-card">
                <div className="neonslate-chart-header">
                  <div className="neonslate-section-header">نشاط الأسبوع</div>
                  <div className="neonslate-chart-stats">5d/7 · 42h</div>
                </div>
                <div className="neonslate-chart">
                  <div className="neonslate-bar" style={{ height: '60%' }}></div>
                  <div className="neonslate-bar" style={{ height: '80%' }}></div>
                  <div className="neonslate-bar" style={{ height: '100%' }}></div>
                  <div className="neonslate-bar" style={{ height: '75%' }}></div>
                  <div className="neonslate-bar" style={{ height: '90%' }}></div>
                  <div className="neonslate-bar" style={{ height: '40%' }}></div>
                  <div className="neonslate-bar" style={{ height: '70%' }}></div>
                </div>
                <div className="neonslate-chart-labels">
                  <div className="neonslate-chart-label">M</div>
                  <div className="neonslate-chart-label">T</div>
                  <div className="neonslate-chart-label">W</div>
                  <div className="neonslate-chart-label">T</div>
                  <div className="neonslate-chart-label">F</div>
                  <div className="neonslate-chart-label">S</div>
                  <div className="neonslate-chart-label">S</div>
                </div>
              </div>
              
              {/* Spin Wheel */}
              <div className="neonslate-card">
                <div className="neonslate-section-header">دوامة اليوم</div>
                <div className="neonslate-wheel-container">
                  <div className="neonslate-wheel"></div>
                  <div className="neonslate-wheel-center">
                    <div className="neonslate-wheel-prize">XP</div>
                    <div className="neonslate-wheel-value">500</div>
                  </div>
                </div>
                <button className="neonslate-btn neonslate-btn-primary">
                  GO
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
