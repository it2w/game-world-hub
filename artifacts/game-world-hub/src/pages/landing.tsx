import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  Check,
  ChevronDown,
  Crosshair,
  Download,
  Globe,
  Library,
  LifeBuoy,
  Mail,
  Menu,
  MessagesSquare,
  Mic,
  MonitorUp,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedLogo } from "@/components/animated-logo";
import { cn } from "@/lib/utils";

const CONTACT_EMAIL = "info@gmes.app";

const TICKER_ITEMS = [
  "FRIENDS",
  "PARTIES",
  "VOICE",
  "SCREEN SHARE",
  "LFG",
  "STEAM LIBRARY",
  "RANKS",
  "CHAT",
  "2FA",
];

const SECTION_IDS = ["about", "download", "pricing", "support", "contact"] as const;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

/** Types the given text one character at a time (instant under reduced motion). */
function useTypewriter(text: string, speed = 45) {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (prefersReducedMotion()) {
      setOut(text);
      return;
    }
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

/** Fades content in when it first scrolls into view. */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -32px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn("gwh-reveal", visible && "is-visible", className)}
    >
      {children}
    </div>
  );
}

/** Terminal-style section shell: `> prompt` line, title, optional intro. */
function Section({
  id,
  prompt,
  title,
  body,
  children,
}: {
  id: string;
  prompt: string;
  title: string;
  body?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-24">
        <Reveal>
          <div className="mb-10 md:mb-12">
            <div className="font-mono text-xs text-primary/90 tracking-wider mb-3">
              <span dir="ltr" className="inline-block">
                {prompt}
                <span className="gwh-cursor">_</span>
              </span>
            </div>
            <h2 className="text-2xl md:text-4xl font-bold font-mono uppercase tracking-wider">{title}</h2>
            {body && <p className="mt-4 text-muted-foreground max-w-3xl leading-relaxed">{body}</p>}
          </div>
        </Reveal>
        {children}
      </div>
    </section>
  );
}

function LandingNav() {
  const { t, i18n } = useTranslation("landing");
  const [menuOpen, setMenuOpen] = useState(false);
  const isArabic = !!i18n.resolvedLanguage?.startsWith("ar");

  const links = SECTION_IDS.map((id) => ({ id, label: t(`nav.${id}`) }));

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border bg-background/90 backdrop-blur">
      <div className="max-w-6xl mx-auto h-full px-4 md:px-6 flex items-center gap-3">
        <a
          href="#top"
          onClick={scrollToSection("top")}
          className="flex items-center gap-3 me-auto"
          data-testid="link-nav-home"
        >
          <AnimatedLogo className="h-7 w-auto text-primary" />
          <span dir="ltr" className="font-mono text-xs md:text-sm font-bold tracking-[0.25em]">
            GAME WORLD HUB
          </span>
        </a>

        <nav className="hidden lg:flex items-center">
          {links.map((l) => (
            <a
              key={l.id}
              href={`#${l.id}`}
              onClick={scrollToSection(l.id)}
              className="group px-3 py-2 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
              data-testid={`link-nav-${l.id}`}
            >
              <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity">[</span>
              <span className="mx-0.5">{l.label}</span>
              <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity">]</span>
            </a>
          ))}
        </nav>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => i18n.changeLanguage(isArabic ? "en" : "ar")}
          className="font-mono text-xs gap-1.5"
          data-testid="button-lang-toggle"
        >
          <Globe className="w-3.5 h-3.5" />
          {t("nav.switchLang")}
        </Button>

        <Button asChild size="sm" className="rounded-none font-mono uppercase tracking-wider hidden sm:inline-flex">
          <Link href="/login" data-testid="button-nav-login">
            {t("nav.login")}
          </Link>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          aria-expanded={menuOpen}
          data-testid="button-mobile-menu"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {menuOpen && (
        <div className="lg:hidden absolute top-full inset-x-0 bg-background border-b border-border">
          <nav className="flex flex-col p-4 gap-1">
            {links.map((l) => (
              <a
                key={l.id}
                href={`#${l.id}`}
                onClick={(e) => {
                  scrollToSection(l.id)(e);
                  setMenuOpen(false);
                }}
                className="px-3 py-2.5 font-mono text-sm uppercase tracking-wider text-muted-foreground hover:text-primary"
                data-testid={`link-mobilenav-${l.id}`}
              >
                <span className="text-primary me-2">&gt;</span>
                {l.label}
              </a>
            ))}
            <div className="flex gap-2 mt-3">
              <Button asChild className="flex-1 rounded-none font-mono uppercase tracking-wider">
                <Link href="/login" data-testid="button-mobilenav-login">
                  {t("nav.login")}
                </Link>
              </Button>
              <Button asChild variant="outline" className="flex-1 rounded-none font-mono uppercase tracking-wider">
                <Link href="/register" data-testid="button-mobilenav-start">
                  {t("nav.start")}
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const { t } = useTranslation("landing");
  const typed = useTypewriter(t("hero.typed"));

  return (
    <section id="top" className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="gwh-landing-scanline" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 min-h-[calc(100svh-4rem)] flex flex-col items-center justify-center text-center gap-6 py-20">
        <div
          dir="ltr"
          className="flex items-center gap-2 border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[10px] tracking-[0.25em] text-primary"
          data-testid="status-system-online"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
          {t("hero.status")}
        </div>

        <AnimatedLogo className="h-20 md:h-28 w-auto text-primary" />

        <h1
          dir="ltr"
          className="font-mono font-bold text-3xl sm:text-5xl md:text-6xl tracking-[0.12em] md:tracking-[0.18em]"
          style={{ textShadow: "0 0 28px hsl(135 100% 50% / 0.28)" }}
        >
          GAME WORLD HUB
        </h1>

        <p className="font-mono text-primary text-base sm:text-lg md:text-xl min-h-[1.6em]" aria-label={t("hero.typed")}>
          {typed}
          <span className="gwh-cursor" aria-hidden="true">
            ▍
          </span>
        </p>

        <p className="max-w-2xl text-sm md:text-base text-muted-foreground leading-relaxed">{t("hero.sub")}</p>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          <Button asChild size="lg" className="rounded-none font-mono uppercase tracking-widest px-8">
            <Link href="/register" data-testid="link-hero-start">
              {t("hero.start")}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-none font-mono uppercase tracking-widest px-8">
            <Link href="/login" data-testid="link-hero-login">
              {t("hero.login")}
            </Link>
          </Button>
        </div>

        <a
          href="#about"
          onClick={scrollToSection("about")}
          className="mt-6 flex flex-col items-center gap-1 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-primary"
          data-testid="link-hero-scroll"
        >
          {t("hero.scroll")}
          <ChevronDown className="w-4 h-4 motion-safe:animate-bounce" />
        </a>
      </div>

      <div className="gwh-ticker relative z-10 border-t border-border bg-background/70 overflow-hidden py-2.5" dir="ltr">
        <div className="gwh-ticker-track flex w-max items-center gap-8">
          {[0, 1].map((half) => (
            <div key={half} className="flex items-center gap-8" aria-hidden={half === 1}>
              {TICKER_ITEMS.map((item) => (
                <span
                  key={`${half}-${item}`}
                  className="flex items-center gap-8 font-mono text-[11px] tracking-[0.3em] text-muted-foreground whitespace-nowrap"
                >
                  {item}
                  <span className="text-primary/60">//</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutSection() {
  const { t } = useTranslation("landing");
  const features = [
    { key: "presence", Icon: Users },
    { key: "parties", Icon: Mic },
    { key: "screen", Icon: MonitorUp },
    { key: "chat", Icon: MessagesSquare },
    { key: "lfg", Icon: Crosshair },
    { key: "library", Icon: Library },
  ] as const;

  return (
    <Section id="about" prompt={t("about.prompt")} title={t("about.title")} body={t("about.body")}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f, i) => (
          <Reveal key={f.key} delay={i * 60} className="h-full">
            <div
              className="gwh-corner-card relative h-full bg-card border border-border p-6 hover:border-primary/50 transition-colors"
              data-testid={`card-feature-${f.key}`}
            >
              <f.Icon className="w-6 h-6 text-primary mb-4" />
              <h3 className="font-mono font-bold uppercase tracking-wider text-sm mb-2">
                {t(`about.features.${f.key}.title`)}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{t(`about.features.${f.key}.desc`)}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function DownloadSection() {
  const { t } = useTranslation("landing");
  const points = ["p1", "p2", "p3", "p4"] as const;

  return (
    <Section id="download" prompt={t("download.prompt")} title={t("download.title")} body={t("download.body")}>
      <div className="grid lg:grid-cols-2 gap-10 items-center">
        <Reveal>
          <ul className="flex flex-col gap-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm">
                <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>{t(`download.${p}`)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              disabled
              className="rounded-none font-mono uppercase tracking-widest"
              data-testid="button-download-windows"
            >
              <Download className="w-4 h-4" />
              {t("download.button")}
            </Button>
            <span className="border border-primary/40 bg-primary/10 text-primary font-mono text-[10px] uppercase tracking-widest px-2 py-1">
              {t("download.soon")}
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground font-mono">{t("download.soonNote")}</p>

          <div className="mt-8 border-t border-border pt-6">
            <p className="text-sm text-muted-foreground mb-3">{t("download.webNote")}</p>
            <Button asChild variant="outline" className="rounded-none font-mono uppercase tracking-wider">
              <Link href="/register" data-testid="link-download-web">
                {t("download.webCta")}
              </Link>
            </Button>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <span className="w-2 h-2 rounded-full bg-muted" />
              <span className="w-2 h-2 rounded-full bg-muted" />
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span dir="ltr" className="ms-auto font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
                {t("download.windowTitle")}
              </span>
            </div>
            <div className="p-8 md:p-12 flex flex-col items-center gap-6">
              <AnimatedLogo className="h-16 md:h-20 w-auto text-primary" />
              <div className="w-full max-w-xs">
                <div className="h-2.5 border border-border bg-background overflow-hidden">
                  <div className="gwh-progress-bar h-full w-[62%]" />
                </div>
                <p dir="ltr" className="mt-2 text-center font-mono text-[10px] tracking-widest text-muted-foreground">
                  {t("download.installing")}
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

function PricingSection() {
  const { t } = useTranslation("landing");
  const freeFeatures = ["freeF1", "freeF2", "freeF3", "freeF4"] as const;
  const proFeatures = ["proF1", "proF2", "proF3", "proF4"] as const;

  return (
    <Section id="pricing" prompt={t("pricing.prompt")} title={t("pricing.title")} body={t("pricing.body")}>
      <div className="grid md:grid-cols-2 gap-6 max-w-4xl">
        <Reveal className="h-full">
          <div className="relative h-full bg-card border border-primary p-8 flex flex-col gap-6" data-testid="card-plan-free">
            <span className="absolute -top-2.5 start-6 bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-widest px-2 py-0.5">
              {t("pricing.freeTag")}
            </span>
            <div>
              <div dir="ltr" className="font-mono text-xs tracking-[0.35em] text-muted-foreground">
                {t("pricing.freeName")}
              </div>
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
              <Link href="/register" data-testid="link-pricing-signup">
                {t("pricing.cta")}
              </Link>
            </Button>
          </div>
        </Reveal>

        <Reveal delay={120} className="h-full">
          <div
            className="relative h-full bg-card border border-dashed border-border p-8 flex flex-col gap-6"
            data-testid="card-plan-pro"
          >
            <span className="absolute -top-2.5 start-6 bg-muted text-muted-foreground font-mono text-[10px] uppercase tracking-widest px-2 py-0.5">
              {t("pricing.proTag")}
            </span>
            <div>
              <div dir="ltr" className="font-mono text-xs tracking-[0.35em] text-muted-foreground">
                {t("pricing.proName")}
              </div>
              <div className="mt-2 font-mono text-4xl font-bold text-muted-foreground">{t("pricing.proPrice")}</div>
            </div>
            <ul className="flex flex-col gap-3 flex-1">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{t(`pricing.${f}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
      <p className="mt-6 font-mono text-xs text-muted-foreground">{t("pricing.note")}</p>
    </Section>
  );
}

function SupportSection() {
  const { t } = useTranslation("landing");
  const items = [1, 2, 3, 4] as const;
  const mailHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t("support.mailSubject"))}`;

  return (
    <Section id="support" prompt={t("support.prompt")} title={t("support.title")} body={t("support.body")}>
      <div className="max-w-3xl flex flex-col gap-3">
        {items.map((n, i) => (
          <Reveal key={n} delay={i * 50}>
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

        <Reveal delay={220}>
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

function ContactSection() {
  const { t } = useTranslation("landing");
  const mailHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t("contact.mailSubject"))}`;

  return (
    <Section id="contact" prompt={t("contact.prompt")} title={t("contact.title")} body={t("contact.body")}>
      <Reveal>
        <div className="max-w-3xl border border-border bg-card p-8 md:p-12 flex flex-col items-center text-center gap-4">
          <Mail className="w-8 h-8 text-primary" />
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {t("contact.emailLabel")}
          </div>
          <a
            dir="ltr"
            href={mailHref}
            className="font-mono text-lg md:text-2xl text-primary hover:underline break-all"
            data-testid="link-contact-email"
          >
            {CONTACT_EMAIL}
          </a>
          <Button asChild size="lg" className="mt-2 rounded-none font-mono uppercase tracking-widest">
            <a href={mailHref} data-testid="button-contact-email">
              {t("contact.button")}
            </a>
          </Button>
        </div>
      </Reveal>
    </Section>
  );
}

function LandingFooter() {
  const { t } = useTranslation("landing");
  const links = SECTION_IDS.map((id) => ({ id, label: t(`nav.${id}`) }));

  return (
    <footer className="border-t border-border">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 flex flex-col md:flex-row items-center gap-6 md:justify-between">
        <div className="flex items-center gap-3">
          <AnimatedLogo className="h-6 w-auto text-primary" />
          <div>
            <div dir="ltr" className="font-mono text-xs font-bold tracking-[0.25em]">
              GAME WORLD HUB
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{t("footer.tagline")}</div>
          </div>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {links.map((l) => (
            <a
              key={l.id}
              href={`#${l.id}`}
              onClick={scrollToSection(l.id)}
              className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-primary"
              data-testid={`link-footer-${l.id}`}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="font-mono text-[11px] text-muted-foreground text-center">
          {t("footer.rights", { year: new Date().getFullYear() })}
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  // SPA hash deep-links (e.g. /#pricing shared in chat): the browser can't
  // jump to an anchor that doesn't exist until React renders, so do it here.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && (SECTION_IDS as readonly string[]).includes(hash)) {
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "auto", block: "start" });
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />
      <main>
        <Hero />
        <AboutSection />
        <DownloadSection />
        <PricingSection />
        <SupportSection />
        <ContactSection />
      </main>
      <LandingFooter />
    </div>
  );
}
