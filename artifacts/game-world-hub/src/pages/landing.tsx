import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  Check,
  ChevronDown,
  Crosshair,
  Crown,
  Download,
  Library,
  LifeBuoy,
  Mail,
  Menu,
  MessagesSquare,
  Mic,
  MonitorUp,
  Pencil,
  Shield,
  Smile,
  Swords,
  Target,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedLogo } from "@/components/animated-logo";
import { cn } from "@/lib/utils";

// ─── types ────────────────────────────────────────────────────────────────────

type FactionScore = {
  id: number; name: string; slug: string;
  color: string; iconEmoji: string;
  weeklyPoints: number; memberCount: number;
};

type LiveStats = {
  onlineCount: number;
  todayRegistrations: number;
  factionScores: FactionScore[];
};

type SpotlightUser = {
  id: number; username: string; displayName: string;
  avatarUrl: string | null; tier: string | null; tierLevel: number | null;
  currentGame: string | null; isPro: boolean; prestigeLevel?: number;
};

type MatchedUser = {
  id: number; username: string; displayName: string;
  avatarUrl: string | null; status: string; matchedGame: string | null;
};

// ─── constants ───────────────────────────────────────────────────────────────

const CONTACT_EMAIL = "info@gmes.app";

const TICKER_ITEMS = [
  "FRIENDS", "PARTIES", "VOICE", "SCREEN SHARE",
  "LFG", "STEAM LIBRARY", "RANKS", "GLOBAL CHAT",
  "GIF", "REACTIONS", "EDIT MSGS", "800 CHARS",
  "64 EMOJIS", "PIN MSG", "2FA", "FACTIONS", "BATTLE PASS",
];

const SECTION_IDS = ["features", "download", "pricing", "support", "contact"] as const;

const POPULAR_GAMES = [
  "Valorant", "CS2", "Apex Legends", "League of Legends",
  "Fortnite", "PUBG", "Overwatch 2", "Rocket League",
  "GTA Online", "Call of Duty: Warzone", "Minecraft", "FIFA",
];

interface ChatMsg { name: string; text: string; system: boolean }

const CHAT_SCRIPT: ChatMsg[] = [
  { name: "xKhaled99",    text: "جاهز؟ الحفلة بدأت! 🎮",       system: false },
  { name: "ShadowSniper", text: "في الطريق ⚡",                  system: false },
  { name: "GWH",          text: "ShadowSniper joined voice",     system: true  },
  { name: "ProGamer_SA",  text: "LFG Ranked — نحتاج لاعب 🔥",   system: false },
  { name: "xKhaled99",    text: "شارك شاشتك يا Shadow!",         system: false },
  { name: "GWH",          text: "Screen share started",           system: true  },
];
const CHAT_DELAYS = [900, 2_100, 3_400, 5_200, 7_000, 8_300];

const MOCKUP_FRIENDS = [
  { name: "xKhaled99",    status: "Valorant", online: true  },
  { name: "ShadowSniper", status: "CS2",      online: true  },
  { name: "ProGamer_SA",  status: "Online",   online: true  },
  { name: "NightWalker",  status: "Offline",  online: false },
] as const;

const MOCKUP_CHAT = [
  { name: "xKhaled99",    text: "جاهز للرانكد؟ 🎮" },
  { name: "ShadowSniper", text: "اه يلا 🔥" },
  { name: "ProGamer_SA",  text: "ضيفوني معاكم" },
  { name: "xKhaled99",    text: "تم! انضم للغرفة 🎉" },
] as const;

// ─── helpers ─────────────────────────────────────────────────────────────────

function prefersReducedMotion() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollToSection(id: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  };
}

function useTypewriter(text: string, speed = 48) {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (prefersReducedMotion()) { setOut(text); return; }
    setOut("");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return out;
}

// ─── reveal (scroll animation with variants) ─────────────────────────────────

type RevealVariant = "up" | "left" | "right" | "pop" | "fade";

function Reveal({
  children, className, delay = 0, variant = "up",
}: {
  children: ReactNode; className?: string; delay?: number; variant?: RevealVariant;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold: 0.1, rootMargin: "0px 0px -24px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-variant={variant}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn("gwh-reveal", visible && "is-visible", className)}
    >
      {children}
    </div>
  );
}

// ─── particle canvas (interactive network) ───────────────────────────────────

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    type Particle = { x: number; y: number; vx: number; vy: number; r: number };
    let particles: Particle[] = [];
    let raf = 0;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    const init = () => {
      const count = Math.floor((canvas.width * canvas.height) / 12_000);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.5 + 0.5,
      }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      for (const p of particles) {
        const dx = mx - p.x, dy = my - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 80) { p.vx -= dx / d * 0.08; p.vy -= dy / d * 0.08; }
        p.vx *= 0.995; p.vy *= 0.995;
        p.x = (p.x + p.vx + canvas.width)  % canvas.width;
        p.y = (p.y + p.vy + canvas.height) % canvas.height;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(var(--primary-rgb,34,197,94),0.5)";
        ctx.fill();
        for (const q of particles) {
          const ddx = p.x - q.x, ddy = p.y - q.y;
          const dd = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dd < 90) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(var(--primary-rgb,34,197,94),${0.08 * (1 - dd / 90)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    const ro = new ResizeObserver(() => { resize(); init(); });
    ro.observe(canvas);
    resize(); init(); draw();
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => { mouseRef.current = { x: -9999, y: -9999 }; };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 4 }}
      aria-hidden
    />
  );
}

// ─── matrix canvas ────────────────────────────────────────────────────────────

function MatrixCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const CHARS = "アイウエオカキクケコGWH01アイウエオカキクケコGWH01".split("");
    let drops: number[] = [];
    let raf = 0;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      drops = Array.from({ length: Math.ceil(canvas.width / 14) }, () => Math.random() * -50);
    };
    const draw = () => {
      ctx.fillStyle = "rgba(0,0,0,0.04)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(34,197,94,0.07)";
      ctx.font = "12px monospace";
      drops.forEach((y, i) => {
        const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
        ctx.fillText(ch, i * 14, y * 14);
        drops[i] = y > canvas.height / 14 && Math.random() > 0.975 ? 0 : y + 0.5;
      });
      raf = requestAnimationFrame(draw);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize(); draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none opacity-30"
      style={{ zIndex: 0 }}
      aria-hidden
    />
  );
}

// ─── glitch title ─────────────────────────────────────────────────────────────

function GlitchTitle({ text }: { text: string }) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const schedule = () => {
      const delay = Math.random() * 8_000 + 3_000;
      return setTimeout(() => {
        setActive(true);
        setTimeout(() => { setActive(false); schedule(); }, 300);
      }, delay);
    };
    const t = schedule();
    return () => clearTimeout(t);
  }, []);

  return (
    <h1
      className={cn(
        "font-mono font-black uppercase tracking-[0.12em] text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-primary select-none gwh-glitch",
        active && "gwh-glitch--active",
      )}
      data-text={text}
      aria-label={text}
    >
      {text}
    </h1>
  );
}

// ─── fake chat widget ─────────────────────────────────────────────────────────

function FakeChatWidget() {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      CHAT_SCRIPT.forEach((item, i) => {
        const t = setTimeout(() => setMsgs((prev) => [...prev, item]), CHAT_DELAYS[i]);
        timers.push(t);
      });
      const loop = setTimeout(run, 12_800);
      timers.push(loop);
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 9999, behavior: "smooth" });
  }, [msgs]);

  return (
    <div
      className="hidden lg:flex absolute bottom-20 end-6 flex-col w-64 bg-card/95 border border-border backdrop-blur-sm shadow-2xl overflow-hidden"
      style={{ zIndex: 15 }}
      aria-hidden
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/80">
        <span className="w-2 h-2 rounded-full bg-primary gwh-counter-dot" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
          PARTY CHAT — LIVE
        </span>
      </div>
      <div ref={bodyRef} className="flex flex-col gap-1 p-2 max-h-36 overflow-hidden text-[11px]">
        {msgs.slice(-8).map((m, i) => (
          <div key={i} className={cn("flex gap-1.5", m.system && "opacity-50 italic")}>
            {!m.system && (
              <span className="font-mono text-primary shrink-0">{m.name.slice(0, 8)}</span>
            )}
            <span className={m.system ? "text-muted-foreground" : "text-foreground"}>
              {m.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── app mockup window ────────────────────────────────────────────────────────

function AppMockupWindow() {
  const [chatIdx,  setChatIdx]  = useState(0);
  const [gameIdx,  setGameIdx]  = useState(0);
  const [showGame, setShowGame] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setChatIdx((i) => (i + 1) % MOCKUP_CHAT.length), 2_600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setShowGame(true);
      const loop = setInterval(() => {
        setGameIdx((i) => (i + 1) % MOCKUP_FRIENDS.length);
      }, 1_800);
      return () => clearInterval(loop);
    }, 1_400);
    return () => clearTimeout(t);
  }, []);

  const activeFriend = MOCKUP_FRIENDS[gameIdx];

  return (
    <div
      dir="ltr"
      className="gwh-corner-card relative bg-card border border-border overflow-hidden shadow-2xl"
      aria-hidden
    >
      {/* title bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-card/80">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
        <span className="ms-2 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          GWH_DESKTOP.EXE
        </span>
      </div>

      <div className="flex h-56 sm:h-64">
        {/* sidebar */}
        <div className="w-28 border-e border-border flex flex-col gap-0.5 p-1.5 bg-card/60">
          {MOCKUP_FRIENDS.map((f, i) => (
            <div
              key={f.name}
              className={cn(
                "flex items-center gap-1.5 p-1 rounded text-[10px]",
                i === gameIdx && "bg-primary/10 border border-primary/30",
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  f.online ? "bg-primary" : "bg-muted-foreground/40",
                )}
              />
              <span className="truncate text-[9px] text-foreground/80">{f.name}</span>
            </div>
          ))}
        </div>

        {/* main pane */}
        <div className="flex-1 flex flex-col">
          {showGame && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-primary/5">
              <div className="w-4 h-4 rounded bg-primary/20 border border-primary/40 flex items-center justify-center">
                <span className="text-[8px] text-primary">▶</span>
              </div>
              <span className="font-mono text-[10px] text-primary truncate">
                {activeFriend.name} is playing {activeFriend.status}
              </span>
            </div>
          )}
          <div className="flex-1 flex flex-col gap-1 p-2 overflow-hidden text-[11px]">
            {MOCKUP_CHAT.slice(0, chatIdx + 1).map((m, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="font-mono text-primary shrink-0 text-[9px]">{m.name}</span>
                <span>{m.text}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border px-2 py-1.5">
            <div className="bg-background/60 border border-border px-2 py-0.5 font-mono text-[9px] text-muted-foreground">
              Type a message…
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── section wrapper ──────────────────────────────────────────────────────────

function Section({
  id, prompt, title, body, children, className,
}: {
  id?: string; prompt: string; title: string; body?: string;
  children?: ReactNode; className?: string;
}) {
  return (
    <section id={id} className={cn("py-16 md:py-24 border-b border-border", className)}>
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <Reveal variant="up">
          <div className="mb-10 md:mb-14">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-3">
              {prompt}
            </div>
            <h2 className="font-mono font-bold text-2xl md:text-3xl lg:text-4xl uppercase tracking-tight mb-4">
              {title}
            </h2>
            {body && (
              <p className="max-w-2xl text-sm md:text-base text-muted-foreground leading-relaxed">
                {body}
              </p>
            )}
          </div>
        </Reveal>
        {children}
      </div>
    </section>
  );
}

// ─── nav ──────────────────────────────────────────────────────────────────────

function LandingNav() {
  const { t, i18n } = useTranslation("landing");
  const [menuOpen, setMenuOpen] = useState(false);
  const isArabic = !!i18n.resolvedLanguage?.startsWith("ar");
  const links = SECTION_IDS.map((id) => ({ id, label: t(`nav.${id}`) }));

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-4">
        {/* logo */}
        <a href="#top" onClick={scrollToSection("top")} className="flex items-center gap-2 shrink-0">
          <AnimatedLogo className="h-6 w-auto text-primary" />
          <span dir="ltr" className="hidden sm:block font-mono text-xs font-bold tracking-[0.25em] text-foreground">
            GAME WORLD HUB
          </span>
        </a>

        {/* desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <a
              key={l.id} href={`#${l.id}`} onClick={scrollToSection(l.id)}
              className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors px-3 py-1.5"
              data-testid={`link-nav-${l.id}`}
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* cta */}
        <div className="hidden md:flex items-center gap-2">
          <Button
            variant="ghost" size="sm" asChild
            className="rounded-none font-mono uppercase tracking-wider text-[11px]"
          >
            <Link href="/login" data-testid="link-nav-login">{t("nav.login")}</Link>
          </Button>
          <Button
            size="sm" asChild
            className="rounded-none font-mono uppercase tracking-wider text-[11px]"
          >
            <Link href="/register" data-testid="link-nav-start">{t("nav.start")}</Link>
          </Button>
          <button
            className="font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors uppercase tracking-wider"
            onClick={() => i18n.changeLanguage(isArabic ? "en" : "ar")}
          >
            {t("nav.switchLang")}
          </button>
        </div>

        {/* mobile menu toggle */}
        <button
          className="md:hidden p-2 text-muted-foreground hover:text-primary transition-colors"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-border bg-background/95 backdrop-blur-md px-4 py-4 flex flex-col gap-3">
          {links.map((l) => (
            <a
              key={l.id} href={`#${l.id}`}
              onClick={(e) => { scrollToSection(l.id)(e); setMenuOpen(false); }}
              className="font-mono text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
            >
              {l.label}
            </a>
          ))}
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" asChild className="rounded-none font-mono uppercase tracking-wider flex-1">
              <Link href="/login">{t("nav.login")}</Link>
            </Button>
            <Button size="sm" asChild className="rounded-none font-mono uppercase tracking-wider flex-1">
              <Link href="/register">{t("nav.start")}</Link>
            </Button>
          </div>
          <button
            className="font-mono text-[11px] text-muted-foreground hover:text-primary transition-colors uppercase tracking-wider text-start"
            onClick={() => i18n.changeLanguage(isArabic ? "en" : "ar")}
          >
            {t("nav.switchLang")}
          </button>
        </div>
      )}
    </header>
  );
}

// ─── hero ─────────────────────────────────────────────────────────────────────

function Hero({ liveStats }: { liveStats: LiveStats | null }) {
  const { t, i18n } = useTranslation("landing");
  const isArabic = !!i18n.resolvedLanguage?.startsWith("ar");
  const typed = useTypewriter(t("hero.typed"), 55);
  const heroTitle = t("hero.title");
  const [displayCount, setDisplayCount] = useState(liveStats?.onlineCount ?? 0);

  // Animate counter when online count updates
  useEffect(() => {
    const target = liveStats?.onlineCount ?? 0;
    if (target === displayCount) return;
    const step = target > displayCount ? 1 : -1;
    const diff = Math.abs(target - displayCount);
    const inc = Math.ceil(diff / 30);
    let cur = displayCount;
    const id = setInterval(() => {
      cur += step * inc;
      if ((step > 0 && cur >= target) || (step < 0 && cur <= target)) {
        setDisplayCount(target);
        clearInterval(id);
      } else {
        setDisplayCount(cur);
      }
    }, 30);
    return () => clearInterval(id);
  }, [liveStats?.onlineCount]);

  return (
    <section id="top" className="relative overflow-hidden border-b border-border">
      {/* animated backgrounds (matrix → grid → scanline → particles → content) */}
      <MatrixCanvas />
      <div
        className="absolute inset-0 bg-[linear-gradient(to_right,#80808010_1px,transparent_1px),linear-gradient(to_bottom,#80808010_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"
        style={{ zIndex: 2 }}
      />
      <div className="gwh-landing-scanline" style={{ zIndex: 3 }} />
      <ParticleCanvas />

      {/* content */}
      <div
        className="relative max-w-6xl mx-auto px-4 md:px-6 min-h-[calc(100svh-3.5rem)] flex flex-col items-center justify-center text-center gap-6 py-20"
        style={{ zIndex: 10 }}
      >
        {/* live status pill */}
        <div
          dir="ltr"
          className="flex items-center gap-2 border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[10px] tracking-[0.25em] text-primary"
          data-testid="status-system-online"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary gwh-counter-dot" />
          {t("hero.status")}
        </div>

        <AnimatedLogo className="h-16 md:h-24 w-auto text-primary" />

        {/* main headline — always show Arabic title regardless of lang setting */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="font-black text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-tight tracking-tight text-foreground">
            {heroTitle}
          </h1>
          <GlitchTitle text="GAME WORLD HUB" />
        </div>

        {/* typewriter sub */}
        <p
          className="font-mono text-primary text-base sm:text-lg md:text-xl min-h-[1.6em]"
          aria-label={t("hero.typed")}
        >
          {typed}
          <span className="gwh-cursor" aria-hidden>▍</span>
        </p>

        <p className="max-w-2xl text-sm md:text-base text-muted-foreground leading-relaxed">
          {t("hero.sub")}
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          <Button asChild size="lg" className="rounded-none font-mono uppercase tracking-widest px-8 text-base">
            <Link href="/register" data-testid="link-hero-start">{t("hero.start")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-none font-mono uppercase tracking-widest px-8 text-base">
            <Link href="/login" data-testid="link-hero-login">{t("hero.login")}</Link>
          </Button>
        </div>

        {/* live online counter */}
        <div className="flex items-center gap-3 mt-2">
          <span className="w-2 h-2 rounded-full bg-primary gwh-counter-dot" />
          <span className="font-mono text-lg md:text-2xl font-bold text-primary tabular-nums">
            {displayCount.toLocaleString()}
          </span>
          <span className="font-mono text-sm text-muted-foreground">
            {t("hero.counterLabel")}
          </span>
        </div>

        {/* scroll cue */}
        <a
          href="#social"
          onClick={scrollToSection("social")}
          className="mt-4 flex flex-col items-center gap-1 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-primary transition-colors"
          data-testid="link-hero-scroll"
        >
          {t("hero.scroll")}
          <ChevronDown className="w-4 h-4 motion-safe:animate-bounce" />
        </a>
      </div>

      {/* floating chat widget — desktop only */}
      <FakeChatWidget />

      {/* ticker */}
      <div
        className="gwh-ticker relative border-t border-border bg-background/70 overflow-hidden py-2.5"
        style={{ zIndex: 10 }}
        dir="ltr"
      >
        <div className="gwh-ticker-track flex w-max items-center gap-8">
          {[0, 1].map((half) => (
            <div key={half} className="flex items-center gap-8" aria-hidden={half === 1}>
              {TICKER_ITEMS.map((item) => (
                <span
                  key={`${half}-${item}`}
                  className="flex items-center gap-8 font-mono text-[11px] tracking-[0.3em] text-muted-foreground whitespace-nowrap"
                >
                  {item}<span className="text-primary/60">//</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── social proof carousel ────────────────────────────────────────────────────

function SocialProofCarousel() {
  const { t } = useTranslation("landing");
  const [users, setUsers] = useState<SpotlightUser[]>([]);
  const [loading, setLoading] = useState(true);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/users/spotlight")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setUsers(data as SpotlightUser[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Auto-scroll carousel
  useEffect(() => {
    if (!users.length || prefersReducedMotion()) return;
    const track = trackRef.current;
    if (!track) return;
    let pos = 0;
    const speed = 0.6;
    const id = setInterval(() => {
      pos += speed;
      if (pos >= track.scrollWidth / 2) pos = 0;
      track.style.transform = `translateX(-${pos}px)`;
    }, 16);
    return () => clearInterval(id);
  }, [users]);

  const PALETTE = ["#EC4899","#06B6D4","#A855F7","#22C55E","#F97316","#FFD700"];
  const TIER_COLORS: Record<string, string> = {
    TRANSCENDENT: "#FFD700", LEGENDARY: "#EC4899", EPIC: "#A855F7",
    DIAMOND: "#38BDF8", GOLD: "#F97316", SILVER: "#94A3B8", BRONZE: "#A3733F",
  };

  const cards = loading
    ? Array.from({ length: 6 }, (_, i) => ({
        id: i, displayName: "---", username: "loading", tier: null,
        tierLevel: null, currentGame: null, isPro: true, avatarUrl: null,
      } as SpotlightUser))
    : users;

  const doubled = [...cards, ...cards]; // seamless loop

  return (
    <section id="social" className="py-14 border-b border-border overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 md:px-6 mb-8">
        <Reveal variant="up">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-2">
            {t("social.prompt")}
          </div>
          <h2 className="font-mono font-bold text-xl md:text-2xl uppercase tracking-tight">
            {t("social.title")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t("social.body")}</p>
        </Reveal>
      </div>

      <div className="relative">
        {/* fade edges */}
        <div className="absolute inset-y-0 start-0 w-16 z-10 bg-gradient-to-r from-background to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 end-0 w-16 z-10 bg-gradient-to-l from-background to-transparent pointer-events-none" />

        <div className="overflow-hidden px-4">
          <div
            ref={trackRef}
            className="flex gap-4 w-max"
            style={{ willChange: "transform" }}
          >
            {doubled.map((u, i) => {
              const color = PALETTE[u.id % PALETTE.length] ?? "#22C55E";
              const tierColor = u.tier ? (TIER_COLORS[u.tier] ?? "#22C55E") : "#22C55E";
              return (
                <div
                  key={`${u.id}-${i}`}
                  className="gwh-corner-card relative w-44 shrink-0 bg-card border border-border p-4 flex flex-col gap-3"
                  style={{ borderColor: `${color}30` }}
                  aria-hidden={i >= cards.length}
                >
                  {/* avatar */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm shrink-0"
                      style={{ borderColor: color, background: `${color}20`, color }}
                    >
                      {u.avatarUrl
                        ? <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full rounded-full object-cover" />
                        : (u.displayName || "?").charAt(0).toUpperCase()
                      }
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-bold truncate">{loading ? "·····" : u.displayName}</div>
                      <div className="font-mono text-[9px] text-muted-foreground truncate">@{loading ? "···" : u.username}</div>
                    </div>
                  </div>

                  {/* tier */}
                  {u.tier && (
                    <div
                      className="font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 border"
                      style={{ borderColor: `${tierColor}50`, color: tierColor, background: `${tierColor}10` }}
                    >
                      {u.tier} {u.tierLevel ? `· ${u.tierLevel}` : ""}
                    </div>
                  )}

                  {/* game */}
                  {u.currentGame && (
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] text-primary">▶</span>
                      <span className="font-mono text-[9px] text-muted-foreground truncate">{u.currentGame}</span>
                    </div>
                  )}

                  {/* pro badge */}
                  {u.isPro && (
                    <div className="absolute top-2 end-2 text-[9px] font-mono font-bold text-amber-400 border border-amber-400/40 bg-amber-400/10 px-1 py-0.5 leading-none">
                      {t("social.proTag")}
                    </div>
                  )}

                  {/* online indicator */}
                  <div className="absolute bottom-2 end-2 w-2 h-2 rounded-full bg-primary gwh-counter-dot" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── feature showcase ─────────────────────────────────────────────────────────

function FeatureShowcase() {
  const { t } = useTranslation("landing");

  const FEATURES = [
    { key: "lfg",         Icon: Crosshair,      color: "#EC4899" },
    { key: "voice",       Icon: Mic,            color: "#06B6D4" },
    { key: "quests",      Icon: Target,         color: "#22C55E" },
    { key: "tournaments", Icon: Trophy,         color: "#FFD700" },
    { key: "factions",    Icon: Swords,         color: "#A855F7" },
    { key: "chat",        Icon: MessagesSquare, color: "#6366F1" },
  ] as const;

  const variants: RevealVariant[] = ["left", "up", "right", "left", "up", "right"];

  return (
    <Section
      id="features"
      prompt={t("features.prompt")}
      title={t("features.title")}
      body={t("features.body")}
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map((f, i) => (
          <Reveal key={f.key} delay={i * 70} variant={variants[i]} className="h-full">
            <div
              className="gwh-corner-card relative h-full bg-card border border-border p-6 hover:border-primary/40 transition-all group"
              data-testid={`card-feature-${f.key}`}
              style={{ "--fc": f.color } as React.CSSProperties}
            >
              <div
                className="w-10 h-10 rounded border flex items-center justify-center mb-4 transition-colors group-hover:bg-opacity-20"
                style={{ borderColor: `${f.color}40`, background: `${f.color}15` }}
              >
                <f.Icon className="w-5 h-5" style={{ color: f.color }} />
              </div>
              <h3 className="font-mono font-bold uppercase tracking-wider text-sm mb-2">
                {t(`features.${f.key}.title` as any)}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(`features.${f.key}.desc` as any)}
              </p>
              {/* hover glow */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ boxShadow: `inset 0 0 40px ${f.color}08` }}
              />
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ─── faction war map ──────────────────────────────────────────────────────────

const FACTION_FALLBACKS: FactionScore[] = [
  { id: 1, name: "Shadows",  slug: "shadows", color: "#7c3aed", iconEmoji: "👤", weeklyPoints: 4820, memberCount: 38 },
  { id: 2, name: "Titans",   slug: "titans",  color: "#dc2626", iconEmoji: "⚔️", weeklyPoints: 3910, memberCount: 31 },
  { id: 3, name: "Ghosts",   slug: "ghosts",  color: "#0891b2", iconEmoji: "👻", weeklyPoints: 2750, memberCount: 27 },
];

function FactionWarMap({ liveStats }: { liveStats: LiveStats | null }) {
  const { t } = useTranslation("landing");
  const factions = (liveStats?.factionScores?.length ?? 0) > 0
    ? liveStats!.factionScores
    : FACTION_FALLBACKS;

  const maxPts = Math.max(...factions.map((f) => f.weeklyPoints), 1);

  return (
    <Section
      id="warmap"
      prompt={t("warmap.prompt")}
      title={t("warmap.title")}
      body={t("warmap.body")}
      className="bg-card/20"
    >
      <div className="max-w-3xl flex flex-col gap-6">
        {factions.map((f, i) => {
          const pct = Math.round((f.weeklyPoints / maxPts) * 100);
          return (
            <Reveal key={f.id} delay={i * 100} variant="left">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{f.iconEmoji}</span>
                    <div>
                      <div
                        className="font-mono font-bold uppercase tracking-widest text-sm"
                        style={{ color: f.color }}
                      >
                        {f.name}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {f.memberCount.toLocaleString()} {t("warmap.members")}
                      </div>
                    </div>
                    {i === 0 && (
                      <span
                        className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border"
                        style={{ borderColor: `${f.color}60`, color: f.color, background: `${f.color}15` }}
                      >
                        #1 LEAD
                      </span>
                    )}
                  </div>
                  <div className="font-mono font-bold tabular-nums" style={{ color: f.color }}>
                    {f.weeklyPoints.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">{t("warmap.points")}</span>
                  </div>
                </div>

                {/* progress bar */}
                <div className="h-3 bg-border/40 rounded-full overflow-hidden">
                  <Reveal variant="fade">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${f.color}90, ${f.color})`,
                        boxShadow: `0 0 8px ${f.color}60`,
                      }}
                    />
                  </Reveal>
                </div>
              </div>
            </Reveal>
          );
        })}

        <Reveal delay={350} variant="up">
          <div className="flex items-center gap-3 pt-2">
            <Swords className="w-4 h-4 text-primary" />
            <p className="text-sm text-muted-foreground">{t("warmap.joinPrompt")}</p>
            <Button asChild size="sm" className="rounded-none font-mono uppercase tracking-wider ms-auto">
              <Link href="/register">{t("nav.start")}</Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

// ─── twin gamer widget ────────────────────────────────────────────────────────

function TwinGamer() {
  const { t } = useTranslation("landing");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [match, setMatch] = useState<MatchedUser | null | "none">(null);

  const toggle = useCallback((g: string) => {
    setSelected((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g].slice(0, 5),
    );
    setMatch(null);
  }, []);

  const search = async () => {
    if (!selected.length) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/users/match?games=${selected.map(encodeURIComponent).join(",")}`);
      const data = await r.json();
      setMatch(data ?? "none");
    } catch {
      setMatch("none");
    } finally {
      setLoading(false);
    }
  };

  const PALETTE = ["#EC4899","#06B6D4","#A855F7","#22C55E","#F97316","#FFD700","#EF4444","#38BDF8"];

  return (
    <Section
      id="twin"
      prompt={t("twin.prompt")}
      title={t("twin.title")}
      body={t("twin.body")}
    >
      <div className="max-w-2xl">
        {/* game chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          {POPULAR_GAMES.map((g, i) => {
            const on = selected.includes(g);
            const color = PALETTE[i % PALETTE.length];
            return (
              <button
                key={g}
                onClick={() => toggle(g)}
                className="font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 border transition-all"
                style={on
                  ? { borderColor: color, background: `${color}20`, color }
                  : { borderColor: "#333", color: "#666" }
                }
              >
                {g}
              </button>
            );
          })}
        </div>

        {/* search button */}
        <Button
          size="lg"
          className="rounded-none font-mono uppercase tracking-widest mb-6"
          disabled={!selected.length || loading}
          onClick={search}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border border-primary-foreground/50 border-t-primary-foreground animate-spin" />
              {t("twin.search")}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              {t("twin.search")}
            </span>
          )}
        </Button>

        {/* result */}
        {match === "none" && (
          <Reveal variant="up">
            <div className="border border-border bg-card/50 p-4 font-mono text-sm text-muted-foreground">
              {t("twin.notFound")}
              <button
                className="ms-3 text-primary hover:underline text-xs"
                onClick={() => { setMatch(null); setSelected([]); }}
              >
                {t("twin.retry")}
              </button>
            </div>
          </Reveal>
        )}

        {match && match !== "none" && (
          <Reveal variant="pop">
            <div className="gwh-corner-card border border-primary/40 bg-card p-5 flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-full border-2 border-primary flex items-center justify-center font-bold text-lg text-primary bg-primary/10 shrink-0"
              >
                {match.avatarUrl
                  ? <img src={match.avatarUrl} alt={match.displayName} className="w-full h-full rounded-full object-cover" />
                  : match.displayName.charAt(0).toUpperCase()
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono font-bold text-sm">{match.displayName}</div>
                <div className="font-mono text-[11px] text-muted-foreground">@{match.username}</div>
                {match.matchedGame && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[9px] text-primary">▶</span>
                    <span className="font-mono text-[11px] text-primary">{match.matchedGame}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <div className="font-mono text-[10px] text-green-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 gwh-counter-dot" />
                  ONLINE
                </div>
                <Button asChild size="sm" className="rounded-none font-mono uppercase tracking-wider text-[10px]">
                  <Link href="/register">{t("twin.join")}</Link>
                </Button>
              </div>
            </div>
          </Reveal>
        )}
      </div>
    </Section>
  );
}

// ─── pro comparison table ─────────────────────────────────────────────────────

function PricingSection() {
  const { t } = useTranslation("landing");
  const freeFeatures = ["freeF1", "freeF2", "freeF3", "freeF4"] as const;
  const proFeatures  = ["proF1",  "proF2",  "proF3",  "proF4",  "proF5",  "proF6",  "proF7",  "proF8"] as const;

  return (
    <Section
      id="pricing"
      prompt={t("pricing.prompt")}
      title={t("pricing.title")}
      body={t("pricing.body")}
      className="bg-card/10"
    >
      <div className="grid md:grid-cols-2 gap-6 max-w-4xl">
        {/* Free */}
        <Reveal className="h-full" variant="pop">
          <div className="relative h-full bg-card border border-primary p-8 flex flex-col gap-6" data-testid="card-plan-free">
            <span className="absolute -top-2.5 start-6 bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-widest px-2 py-0.5">
              {t("pricing.freeTag")}
            </span>
            <div>
              <div dir="ltr" className="font-mono text-xs tracking-[0.35em] text-muted-foreground">{t("pricing.freeName")}</div>
              <div className="mt-2 font-mono text-4xl font-bold text-primary">{t("pricing.freePrice")}</div>
            </div>
            <ul className="flex flex-col gap-3 flex-1">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>{t(`pricing.${f}`)}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="rounded-none font-mono uppercase tracking-widest">
              <Link href="/register" data-testid="link-pricing-signup">{t("pricing.cta")}</Link>
            </Button>
          </div>
        </Reveal>

        {/* Pro */}
        <Reveal delay={120} className="h-full" variant="pop">
          <div className="relative h-full bg-card border border-amber-400/60 p-8 flex flex-col gap-6" data-testid="card-plan-pro"
            style={{ boxShadow: "0 0 30px rgba(251,191,36,0.08)" }}>
            <span className="absolute -top-2.5 start-6 bg-gradient-to-r from-amber-500 to-yellow-300 text-black font-mono text-[10px] uppercase tracking-widest px-2 py-0.5">
              {t("pricing.proTag")}
            </span>
            <div>
              <div dir="ltr" className="font-mono text-xs tracking-[0.35em] text-muted-foreground">{t("pricing.proName")}</div>
              <div className="mt-2 font-mono text-4xl font-bold bg-gradient-to-r from-amber-400 to-yellow-300 bg-clip-text text-transparent">
                {t("pricing.proPrice")}
              </div>
            </div>
            <ul className="flex flex-col gap-3 flex-1">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <Crown className="w-4 h-4 shrink-0 mt-0.5 gwh-crown-glow" />
                  <span>{t(`pricing.${f}`)}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="rounded-none font-mono uppercase tracking-widest bg-gradient-to-r from-amber-500 to-yellow-300 text-black hover:from-amber-400 hover:to-yellow-200">
              <a href="https://sashoop.com/pro-subscription-game-world-hub/p1404499967" target="_blank" rel="noreferrer" data-testid="link-pricing-pro">
                {t("pricing.proCta")}
              </a>
            </Button>
          </div>
        </Reveal>
      </div>
      <p className="mt-6 font-mono text-xs text-muted-foreground">{t("pricing.note")}</p>
    </Section>
  );
}

// ─── pro chat showcase ────────────────────────────────────────────────────────

function ProChatSection() {
  const { t } = useTranslation("landing");

  const PERKS = [
    { key: "chars",  emoji: "💬", color: "#3B82F6" },
    { key: "gif",    emoji: "🎬", color: "#EC4899" },
    { key: "pin",    emoji: "📌", color: "#FFD700" },
    { key: "edit",   emoji: "✏️",  color: "#60A5FA" },
    { key: "bubble", emoji: "🫧",  color: "#A855F7" },
    { key: "emoji",  emoji: "✨",  color: "#F59E0B" },
  ] as const;

  return (
    <Section
      id="chat-pro"
      prompt={t("chatPro.prompt")}
      title={t("chatPro.title")}
      body={t("chatPro.body")}
      className="bg-gradient-to-b from-amber-950/5 to-transparent"
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PERKS.map((p, i) => (
          <Reveal key={p.key} delay={i * 70} variant="up" className="h-full">
            <div
              className="gwh-corner-card relative h-full bg-card border border-border p-6 hover:border-amber-400/40 transition-all group"
              style={{ "--fc": p.color } as React.CSSProperties}
            >
              <div className="text-4xl mb-4">{p.emoji}</div>
              <h3
                className="font-mono font-bold uppercase tracking-wider text-sm mb-2"
                style={{ color: p.color }}
              >
                {t(`chatPro.${p.key}.title` as any)}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(`chatPro.${p.key}.desc` as any)}
              </p>
              {/* hover glow */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ boxShadow: `inset 0 0 40px ${p.color}10` }}
              />
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={450} variant="up">
        <div className="mt-10 flex flex-col items-center gap-3">
          <div className="font-mono text-xs text-muted-foreground tracking-wider">
            {t("pricing.proName")} · {t("pricing.proPrice")} / {t("pricing.freeTag").replace("Available now", "month").replace("متاح الآن", "شهرياً")}
          </div>
          <Button
            asChild size="lg"
            className="rounded-none font-mono uppercase tracking-widest bg-gradient-to-r from-amber-500 to-yellow-300 text-black hover:from-amber-400 hover:to-yellow-200 px-12"
            style={{ boxShadow: "0 0 30px rgba(251,191,36,0.25)" }}
          >
            <a
              href="https://sashoop.com/pro-subscription-game-world-hub/p1404499967"
              target="_blank" rel="noreferrer"
            >
              <Crown className="w-4 h-4 me-2" />
              {t("pricing.proCta")}
            </a>
          </Button>
        </div>
      </Reveal>
    </Section>
  );
}

// ─── fomo section ─────────────────────────────────────────────────────────────

function FomoSection({ liveStats }: { liveStats: LiveStats | null }) {
  const { t } = useTranslation("landing");
  const count = liveStats?.todayRegistrations ?? 0;

  return (
    <section className="py-16 md:py-24 border-b border-border relative overflow-hidden">
      {/* subtle glow behind */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 md:px-6 text-center">
        <Reveal variant="up">
          <div className="font-mono font-black text-5xl md:text-7xl lg:text-8xl text-primary tabular-nums mb-2">
            {count > 0 ? count.toLocaleString() : "—"}
          </div>
          <h2 className="font-mono font-bold text-xl md:text-3xl uppercase tracking-tight mb-3">
            {t("fomo.title", { count: count > 0 ? count.toLocaleString() : "—" })}
          </h2>
          <p className="text-base md:text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            {t("fomo.body")}
          </p>
          <Button
            asChild size="lg"
            className="rounded-none font-mono uppercase tracking-widest px-10 text-base"
            style={{ boxShadow: "0 0 20px rgba(34,197,94,0.3)" }}
          >
            <Link href="/register" data-testid="link-fomo-cta">{t("fomo.cta")}</Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}

// ─── download section ─────────────────────────────────────────────────────────

function DownloadSection() {
  const { t } = useTranslation("landing");
  const points = ["p1", "p2", "p3", "p4", "p5", "p6"] as const;

  return (
    <Section id="download" prompt={t("download.prompt")} title={t("download.title")} body={t("download.body")}>
      <div className="grid lg:grid-cols-2 gap-10 items-center">
        <Reveal variant="left">
          <ul className="flex flex-col gap-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm">
                <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>{t(`download.${p}`)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-none font-mono uppercase tracking-widest" data-testid="button-download-windows">
              <a href="/api/download/windows" download>
                <Download className="w-4 h-4" />
                {t("download.button")}
              </a>
            </Button>
            <span className="border border-primary/40 bg-primary/10 text-primary font-mono text-[10px] uppercase tracking-widest px-2 py-1">
              {t("download.available")}
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground font-mono">{t("download.sizeNote")}</p>

          <div className="mt-8 border-t border-border pt-6">
            <p className="text-sm text-muted-foreground mb-3">{t("download.webNote")}</p>
            <Button asChild variant="outline" className="rounded-none font-mono uppercase tracking-wider">
              <Link href="/register" data-testid="link-download-web">{t("download.webCta")}</Link>
            </Button>
          </div>
        </Reveal>

        <Reveal delay={120} variant="right">
          <AppMockupWindow />
        </Reveal>
      </div>
    </Section>
  );
}

// ─── support section ──────────────────────────────────────────────────────────

function SupportSection() {
  const { t } = useTranslation("landing");
  const items = [1, 2, 3, 4] as const;
  const mailHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t("support.mailSubject"))}`;

  return (
    <Section id="support" prompt={t("support.prompt")} title={t("support.title")} body={t("support.body")}>
      <div className="max-w-3xl flex flex-col gap-3">
        {items.map((n, i) => (
          <Reveal key={n} delay={i * 60} variant={i % 2 === 0 ? "left" : "right"}>
            <details className="group border border-border bg-card" data-testid={`faq-item-${n}`}>
              <summary className="flex items-center justify-between gap-3 cursor-pointer select-none p-4 font-mono text-sm font-bold list-none [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="text-primary me-2">&gt;</span>
                  {t(`support.q${n}`)}
                </span>
                <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{t(`support.a${n}`)}</p>
            </details>
          </Reveal>
        ))}
        <Reveal delay={250} variant="up">
          <Button asChild variant="outline" className="mt-4 rounded-none font-mono uppercase tracking-wider">
            <a href={mailHref} data-testid="link-support-email">
              <LifeBuoy className="w-4 h-4" />
              {t("support.cta")}
            </a>
          </Button>
        </Reveal>
      </div>
    </Section>
  );
}

// ─── contact section ──────────────────────────────────────────────────────────

function ContactSection() {
  const { t } = useTranslation("landing");
  const mailHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t("contact.mailSubject"))}`;

  return (
    <Section id="contact" prompt={t("contact.prompt")} title={t("contact.title")} body={t("contact.body")}>
      <Reveal variant="pop">
        <div className="max-w-3xl border border-border bg-card p-8 md:p-12 flex flex-col items-center text-center gap-4">
          <Mail className="w-8 h-8 text-primary" />
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {t("contact.emailLabel")}
          </div>
          <a
            dir="ltr" href={mailHref}
            className="font-mono text-lg md:text-2xl text-primary hover:underline break-all"
            data-testid="link-contact-email"
          >
            {CONTACT_EMAIL}
          </a>
          <Button asChild size="lg" className="mt-2 rounded-none font-mono uppercase tracking-widest">
            <a href={mailHref} data-testid="button-contact-email">{t("contact.button")}</a>
          </Button>
        </div>
      </Reveal>
    </Section>
  );
}

// ─── footer ──────────────────────────────────────────────────────────────────

function LandingFooter({ liveStats }: { liveStats: LiveStats | null }) {
  const { t } = useTranslation("landing");
  const links = SECTION_IDS.map((id) => ({ id, label: t(`nav.${id}`) }));
  const todayCount = liveStats?.todayRegistrations ?? 0;

  return (
    <footer className="border-t border-border">
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-8 pb-4">
        {/* top row */}
        <div className="flex flex-col md:flex-row items-center gap-6 md:justify-between pb-6 border-b border-border">
          <div className="flex items-center gap-3">
            <AnimatedLogo className="h-6 w-auto text-primary" />
            <div>
              <div dir="ltr" className="font-mono text-xs font-bold tracking-[0.25em]">GAME WORLD HUB</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t("footer.tagline")}</div>
            </div>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {links.map((l) => (
              <a
                key={l.id} href={`#${l.id}`} onClick={scrollToSection(l.id)}
                className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
                data-testid={`link-footer-${l.id}`}
              >
                {l.label}
              </a>
            ))}
          </nav>
          {todayCount > 0 && (
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-primary gwh-counter-dot" />
              <span className="text-primary font-bold">{todayCount.toLocaleString()}</span>
              <span className="text-muted-foreground">
                {t("footer.joinedToday", { count: todayCount.toLocaleString() })}
              </span>
            </div>
          )}
        </div>
        {/* bottom row */}
        <div className="pt-4 flex flex-col md:flex-row items-center justify-between gap-2">
          <div className="font-mono text-[11px] text-muted-foreground">
            {t("footer.rights", { year: new Date().getFullYear() })}
          </div>
          <div className="flex gap-4">
            <Button asChild size="sm" variant="ghost" className="rounded-none font-mono uppercase tracking-wider text-[10px] h-auto py-1">
              <Link href="/register">{t("nav.start")}</Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="rounded-none font-mono uppercase tracking-wider text-[10px] h-auto py-1">
              <Link href="/login">{t("nav.login")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);

  // Fetch live stats every 30 s; never breaks the page if API is down
  useEffect(() => {
    const fetchStats = () => {
      fetch("/api/stats/live")
        .then((r) => r.ok ? r.json() : null)
        .then((d: LiveStats | null) => { if (d) setLiveStats(d); })
        .catch(() => {});
    };
    fetchStats();
    const id = setInterval(fetchStats, 30_000);
    return () => clearInterval(id);
  }, []);

  // Scroll to anchor hash on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const validAnchors = [...SECTION_IDS, "top", "social", "warmap", "twin"];
    if (hash && validAnchors.includes(hash)) {
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "auto", block: "start" });
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />
      <main>
        <Hero liveStats={liveStats} />
        <SocialProofCarousel />
        <FeatureShowcase />
        <FactionWarMap liveStats={liveStats} />
        <TwinGamer />
        <PricingSection />
        <ProChatSection />
        <FomoSection liveStats={liveStats} />
        <DownloadSection />
        <SupportSection />
        <ContactSection />
      </main>
      <LandingFooter liveStats={liveStats} />
    </div>
  );
}
