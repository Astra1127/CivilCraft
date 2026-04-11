import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  ChevronDown,
  Cog,
  FlaskConical,
  GraduationCap,
  Layers,
  Menu,
  Play,
  Ruler,
  Shield,
  Smartphone,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
  Mail,
} from 'lucide-react';

interface LandingPageProps {
  onEnterApp: () => void;
}


function useVisible(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function Reveal({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  const { ref, visible } = useVisible();
  return (
    <section id={id} ref={ref} className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}>
      {children}
    </section>
  );
}

/* Amber corner bracket card */
function CornerCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      {/* top-left */}
      <span className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-amber-500/60 rounded-tl-sm" />
      {/* top-right */}
      <span className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-amber-500/60 rounded-tr-sm" />
      {/* bottom-left */}
      <span className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-amber-500/60 rounded-bl-sm" />
      {/* bottom-right */}
      <span className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-amber-500/60 rounded-br-sm" />
      {children}
    </div>
  );
}

export default function LandingPage({ onEnterApp }: LandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const go = (id: string) => {
    setMenuOpen(false);
    if (id === 'home') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const navLinks = [
    { id: 'home', label: 'Home' },
    { id: 'about', label: 'About' },
    { id: 'features', label: 'Features' },
    { id: 'gallery', label: 'Gallery' },
    { id: 'download', label: 'Download' },
  ];

  const screenshotCards = [
    {
      image: '/images/low-poly-canyon-bridge.png',
      title: 'Main Menu — Canyon Bridge',
      tag: 'ENVIRONMENT',
      text: 'The low-poly desert canyon where players begin their bridge construction journey.',
      size: 'lg:col-span-2',
    },
    {
      image: '/images/game-screenshot-1.jpg',
      title: 'Construction Town Hub',
      tag: 'GAMEPLAY',
      text: 'Move through the canyon settlement, receive tasks, and access section activities.',
      size: '',
    },
    {
      image: '/images/game-screenshot-2.jpg',
      title: 'Bridge Test Preview',
      tag: 'SIMULATION',
      text: 'Preview bridge behavior, inspect the build path, and evaluate structural response.',
      size: '',
    },
    {
      image: '/images/game-screenshot-3.jpg',
      title: 'Engineering Interface',
      tag: 'UI PREVIEW',
      text: 'A structured dashboard for progress tracking, assignments, and section analytics.',
      size: 'md:col-span-2',
    },
  ];

  const previewCards = [
    {
      icon: Building2,
      title: 'Low-Poly Canyon World',
      text: 'A stylized bridge-building setting with cliffs, platforms, and warm desert tones that reinforce the game identity.',
    },
    {
      icon: BarChart3,
      title: 'Professor Monitoring View',
      text: 'Educators can review performance data, section results, and project completion from a technical dashboard.',
    },
    {
      icon: Smartphone,
      title: 'Mobile-First Experience',
      text: 'All screens are designed for mobile play, making simulation, analytics, and progression easy to access anywhere.',
    },
  ];

  return (
    <div className="min-h-screen text-white">
      {/* ── NAVBAR ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'navbar-glass shadow-lg shadow-black/30' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button onClick={() => go('home')} className="flex items-center gap-2">
            <img src="/logo.png" alt="CivilCraft" className="h-8 w-auto" />
          </button>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((l, i) => (
              <button
                key={l.id}
                onClick={() => go(l.id)}
                className={`px-4 py-1.5 text-sm font-semibold rounded transition-colors ${i === 0 ? 'text-amber-400 border border-amber-500/40 bg-amber-500/10' : 'text-earth-100/80 hover:text-white hover:bg-white/5'}`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={onEnterApp} className="px-5 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-sm font-bold transition-colors">
              Login
            </button>
            <button onClick={() => go('download')} className="px-5 py-2 rounded-lg border border-amber-400/60 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 text-sm font-bold transition-colors">
              Play Now
            </button>
          </div>

          <button className="md:hidden p-2" onClick={() => setMenuOpen(v => !v)}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden px-4 pb-4 pt-1 navbar-glass border-t border-earth-300/20">
            <div className="flex flex-col gap-1">
              {navLinks.map(l => (
                <button key={l.id} onClick={() => go(l.id)} className="text-left py-2.5 text-earth-100/85 hover:text-white text-sm font-medium border-b border-white/5">{l.label}</button>
              ))}
              <button onClick={onEnterApp} className="mt-2 py-2.5 text-amber-400 font-bold text-sm">Login</button>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section id="home" className="relative min-h-screen flex items-center justify-center overflow-hidden landing-bg pt-16">
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-100" style={{
          backgroundImage: 'linear-gradient(rgba(201,169,110,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(201,169,110,0.08) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }} />
        {/* Secondary fine grid */}
        <div className="absolute inset-0 opacity-100" style={{
          backgroundImage: 'linear-gradient(rgba(201,169,110,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(201,169,110,0.03) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }} />

        {/* Corner labels */}
        <div className="absolute top-20 left-6 text-[11px] font-mono text-earth-300/40 hidden md:block">
          <div className="flex items-center gap-2">
            <span className="w-6 h-px bg-earth-300/30 inline-block" />
            PROJECT.REF // CC-2026-001
          </div>
        </div>
        <div className="absolute top-20 right-6 text-[11px] font-mono text-earth-300/40 hidden md:block text-right">
          STATUS: ACTIVE BUILD
          <span className="w-6 h-px bg-earth-300/30 inline-block ml-2" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center px-4 sm:px-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-amber-500/50 bg-amber-500/10 mb-8">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs sm:text-sm font-mono font-semibold tracking-[0.15em] text-amber-300">
              EDUCATIONAL ENGINEERING PLATFORM &middot; 2026
            </span>
          </div>

          {/* Title */}
          <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black leading-[0.9] mb-6">
            <span className="text-white">Civil</span>
            <span className="text-amber-400">Craft</span>
          </h1>

          {/* Tagline */}
          <p className="text-lg sm:text-xl md:text-2xl text-earth-200/80 font-medium mb-3">
            Build. Analyze. Engineer the Future.
          </p>

          {/* Description */}
          <p className="text-sm sm:text-base text-earth-200/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            A gamified civil engineering simulation platform where students design structures,
            solve real mechanics challenges, and master engineering principles
            — guided by professors, tracked by data.
          </p>

          {/* Stats row */}
          <div className="inline-flex flex-wrap justify-center gap-3 sm:gap-4 mb-10">
            {[
              { value: '500+', label: 'STUDENTS' },
              { value: '40+', label: 'CHALLENGES' },
              { value: '12', label: 'MODULES' },
              { value: '98%', label: 'SATISFACTION' },
            ].map(s => (
              <div key={s.label} className="px-5 py-3 border border-amber-500/40 rounded-lg bg-amber-500/5 min-w-[100px]">
                <div className="text-xl sm:text-2xl font-black text-amber-400">{s.value}</div>
                <div className="text-[10px] font-mono tracking-widest text-earth-200/50 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            <button
              onClick={() => go('download')}
              className="group px-8 py-3.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-base inline-flex items-center gap-2 transition-colors shadow-lg shadow-amber-900/30"
            >
              <Play size={18} /> Play Now
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => go('about')}
              className="px-7 py-3.5 rounded-xl font-semibold border border-earth-100/30 text-earth-100/80 hover:bg-earth-100/10 inline-flex items-center gap-2 transition-colors"
            >
              Learn More <ChevronDown size={16} />
            </button>
          </div>

          {/* Scroll indicator */}
          <button onClick={() => go('about')} className="inline-flex flex-col items-center text-earth-200/40 hover:text-earth-200/70 transition-colors">
            <span className="text-[10px] font-mono tracking-[0.3em]">SCROLL</span>
            <ChevronDown size={14} className="mt-1" />
          </button>
        </div>
      </section>

      {/* ── § 01 — ABOUT ── */}
      <div className="landing-bg-light text-earth-800">
        <Reveal id="about" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <p className="text-sm font-mono text-amber-600 mb-2 tracking-wide">&sect; 01 — ABOUT</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-2">
            What is <span className="text-amber-600">CivilCraft?</span>
          </h2>
          <p className="text-earth-600 max-w-3xl mb-12 text-base sm:text-lg leading-relaxed">
            CivilCraft transforms traditional civil engineering education into an interactive,
            simulation-based learning experience — right on your mobile device.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: BookOpen,
                title: 'The Purpose',
                text: 'CivilCraft bridges the gap between theoretical lectures and hands-on engineering experience — making abstract concepts tangible through mobile simulation.',
              },
              {
                icon: Target,
                title: 'The Problem We Solve',
                text: 'Traditional engineering education lacks practical feedback loops. Students struggle to connect formulas to real-world behavior — CivilCraft provides instant, visual, data-driven feedback.',
              },
              {
                icon: Users,
                title: "Who It's For",
                text: 'Built for Civil Engineering students who want to deepen understanding, and professors who want measurable, gamified classroom tools.',
                boldWords: ['Civil Engineering students', 'professors'],
              },
            ].map(item => (
              <CornerCard key={item.title} className="bg-white rounded-xl p-6 shadow-sm">
                <div className="w-11 h-11 rounded-lg flex items-center justify-center mb-4 text-white bg-amber-700">
                  <item.icon size={20} />
                </div>
                <h3 className="font-bold text-lg mb-3 text-earth-900">{item.title}</h3>
                <p className="text-sm text-earth-600 leading-relaxed">{item.text}</p>
              </CornerCard>
            ))}
          </div>
        </Reveal>
      </div>

      {/* ── § 02 — EDUCATIONAL OBJECTIVES ── */}
      <div className="landing-bg text-white">
        <Reveal id="objectives" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <p className="text-sm font-mono text-amber-500/70 mb-2 tracking-wide">&sect; 02 — OBJECTIVES</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-2">
            Educational <span className="text-amber-400">Objectives</span>
          </h2>
          <p className="text-earth-200/60 max-w-3xl mb-10 text-base sm:text-lg leading-relaxed">
            CivilCraft is designed around core learning outcomes aligned with civil
            engineering curricula — focusing on Statics, Structural Analysis, and
            Mechanics of Materials.
          </p>

          {/* Subject tags */}
          <div className="flex flex-wrap gap-2 mb-10">
            {['STATICS', 'STRUCTURAL ANALYSIS', 'MECHANICS OF MATERIALS', 'FOUNDATION ENGINEERING', 'LOAD DISTRIBUTION', 'TRUSS DESIGN'].map(tag => (
              <span key={tag} className="px-3 py-1.5 text-[11px] font-mono font-semibold tracking-wider border border-amber-500/40 text-amber-400 rounded-md bg-amber-500/5">
                {tag}
              </span>
            ))}
          </div>

          {/* Skills grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Target, title: 'Problem-Solving', desc: 'Apply engineering principles to real structural scenarios under constraints.' },
              { icon: Cog, title: 'Critical Thinking', desc: 'Analyze forces, loads, and failure modes before committing to a design.' },
              { icon: Ruler, title: 'Design Analysis', desc: 'Iterate through design cycles with instant feedback from physics simulation.' },
              { icon: FlaskConical, title: 'Materials Science', desc: 'Learn how material choice affects structural performance and cost.' },
              { icon: BookOpen, title: 'Theory Application', desc: 'Bridge the gap between textbook formulas and hands-on engineering practice.' },
              { icon: Zap, title: 'Rapid Iteration', desc: 'Fail fast, learn faster — gamified loops that reward experimentation.' },
            ].map(s => (
              <div key={s.title} className="rounded-xl border border-amber-500/20 bg-white/5 p-5 hover:border-amber-500/40 hover:bg-white/8 transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-600/20 text-amber-400">
                    <s.icon size={18} />
                  </div>
                  <h3 className="font-bold text-white">{s.title}</h3>
                </div>
                <p className="text-sm text-earth-200/55 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* ── § 03 — GAME FEATURES ── */}
      <div className="landing-bg-light text-earth-800">
        <Reveal id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <p className="text-sm font-mono text-amber-600 mb-2 tracking-wide">&sect; 03 — FEATURES</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-2">
            Game <span className="text-amber-600">Features</span>
          </h2>
          <p className="text-earth-600 max-w-3xl mb-12 text-base sm:text-lg leading-relaxed">
            Every feature is designed to reinforce engineering learning while keeping
            students engaged and motivated.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Building2, title: 'Building Simulations', desc: 'Realistic structural simulations where you design, load-test, and analyze buildings and bridges in real time.' },
              { icon: Zap, title: 'Structural Challenges', desc: 'Progressive engineering missions — from simple beams to complex truss systems — graded by real mechanics.' },
              { icon: Shield, title: 'Scoring System', desc: 'Multi-criteria grading: structural integrity, material efficiency, cost optimization and time-to-completion.' },
              { icon: TrendingUp, title: 'Progress Tracking', desc: 'Personal dashboards track skill growth, section rankings, completed projects and historical performance.' },
              { icon: Users, title: 'Section Management', desc: 'Professors create and manage course sections, assign challenges, and review each student\'s design portfolio.' },
              { icon: BarChart3, title: 'Analytics Engine', desc: 'Deep analytics for educators — class averages, concept mastery heatmaps, and exportable grade reports.' },
              { icon: Layers, title: 'Modular Curriculum', desc: 'Lesson packs aligned to Civil Engineering syllabi — Statics, Mechanics of Materials, Structural Analysis.' },
              { icon: GraduationCap, title: 'Role-Based Access', desc: 'Secure multi-role system: Students, Professors, and Administrators each see exactly what they need.' },
            ].map(f => (
              <CornerCard key={f.title} className="feature-card bg-white rounded-xl p-5 shadow-sm">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4 text-white bg-earth-700">
                  <f.icon size={18} />
                </div>
                <h3 className="font-bold text-base mb-2 text-earth-900">{f.title}</h3>
                <p className="text-sm text-earth-600 leading-relaxed">{f.desc}</p>
              </CornerCard>
            ))}
          </div>
        </Reveal>
      </div>

      {/* ── § 04 — GALLERY ── */}
      <div className="landing-bg text-white">
        <Reveal id="gallery" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <p className="text-sm font-mono text-amber-500/70 mb-2 tracking-wide">&sect; 04 — GALLERY</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-2">
            Screenshots <span className="text-amber-400">&amp; Preview</span>
          </h2>
          <p className="text-earth-200/60 max-w-3xl mb-12 text-base sm:text-lg leading-relaxed">
            Explore more of the canyon construction environment, mobile interface,
            and simulation screens used throughout the CivilCraft experience.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
            {screenshotCards.map((card) => (
              <div
                key={card.title}
                className={`rounded-xl overflow-hidden border border-amber-500/20 bg-earth-800/50 shadow-lg ${card.size}`}
              >
                <div className="relative">
                  <img src={card.image} alt={card.title} className="w-full h-56 sm:h-72 object-cover" />
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md border border-amber-400/40 bg-earth-900/80 text-[10px] font-mono tracking-[0.2em] text-amber-300">
                    {card.tag}
                  </div>
                </div>
                <div className="px-5 py-4">
                  <h3 className="font-bold text-white mb-1">{card.title}</h3>
                  <p className="text-sm text-earth-200/50 leading-relaxed">{card.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {previewCards.map((card) => (
              <div key={card.title} className="rounded-xl border border-amber-500/20 bg-white/5 p-5 backdrop-blur-sm">
                <div className="w-11 h-11 rounded-lg flex items-center justify-center mb-4 bg-amber-600/15 text-amber-400 border border-amber-500/20">
                  <card.icon size={20} />
                </div>
                <h3 className="font-bold text-white mb-2">{card.title}</h3>
                <p className="text-sm text-earth-200/55 leading-relaxed">{card.text}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* ── § 05 — DOWNLOAD ── */}
      <div className="landing-bg-light text-earth-800">
        <Reveal id="download" className="max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <p className="text-sm font-mono text-amber-600 mb-2 tracking-wide">&sect; 05 — DOWNLOAD</p>

          <div className="rounded-2xl overflow-hidden border border-earth-300/40 shadow-xl">
            {/* Ref line */}
            <div className="bg-earth-900 text-center py-2">
              <span className="text-[10px] font-mono tracking-widest text-amber-500/50">-- REF: CC-DOWNLOAD-2026 --</span>
            </div>

            {/* Download content */}
            <div className="bg-gradient-to-b from-earth-900 via-earth-800 to-earth-900 text-white text-center px-6 py-14 sm:py-20">
              <div className="w-14 h-14 rounded-xl bg-amber-700 flex items-center justify-center mx-auto mb-6">
                <Smartphone size={24} className="text-white" />
              </div>

              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-2">
                Available on <span className="text-amber-400">Mobile</span>
              </h2>
              <p className="text-earth-200/60 max-w-xl mx-auto mb-10 text-sm sm:text-base leading-relaxed">
                CivilCraft is designed for mobile devices — learn engineering
                anywhere, anytime. Download the app and start building today.
              </p>

              {/* Platform box */}
              <div className="mb-8">
                <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 min-w-[180px]">
                  <Smartphone size={20} className="text-amber-400" />
                  <div className="text-left">
                    <div className="font-bold text-white text-sm">Android</div>
                    <div className="text-[11px] text-amber-400/70">Google Play Store</div>
                  </div>
                </div>
              </div>

              {/* Download button */}
              <div className="flex justify-center mb-10">
                <button className="px-8 py-3.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold inline-flex items-center gap-2 transition-colors shadow-lg shadow-amber-900/30">
                  <Play size={18} /> Download for Android
                </button>
              </div>

              {/* Feature strip */}
              <div className="flex flex-wrap justify-center gap-3 mb-8">
                {[
                  { icon: Smartphone, label: 'Optimized for Mobile' },
                  { icon: Zap, label: 'Offline Support' },
                  { icon: Shield, label: 'Secure Login' },
                  { icon: TrendingUp, label: 'Real-time Sync' },
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-earth-400/15 bg-white/3 text-sm text-earth-200/60">
                    <f.icon size={14} className="text-earth-300/50" /> {f.label}
                  </div>
                ))}
              </div>

              {/* Checklist */}
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-earth-200/50">
                {['Free for students', 'No credit card needed', 'Works on Android 8+', 'Professor tools included'].map(c => (
                  <span key={c} className="inline-flex items-center gap-1.5">
                    <span className="text-green-500">&#10003;</span> {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      {/* ── FOOTER ── */}
      <footer className="landing-bg border-t border-earth-300/15">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <div className="grid md:grid-cols-3 gap-10 mb-10">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src="/logo.png" alt="CivilCraft" className="h-10 w-auto" />
              </div>
              <p className="text-sm text-earth-200/50 leading-relaxed max-w-xs">
                A gamified engineering simulation platform for the
                next generation of civil engineers — available on mobile.
              </p>
            </div>

            {/* Navigation */}
            <div>
              <h4 className="text-xs font-mono font-semibold tracking-widest text-earth-200/70 mb-4">NAVIGATION</h4>
              <div className="flex flex-col gap-2">
                {navLinks.map(l => (
                  <button key={l.id} onClick={() => go(l.id)} className="text-left text-sm text-earth-200/50 hover:text-amber-400 transition-colors">
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Project info */}
            <div>
              <h4 className="text-xs font-mono font-semibold tracking-widest text-earth-200/70 mb-4">PROJECT INFO</h4>
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2.5">
                  <Users size={14} className="text-amber-500/60 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-earth-100 font-medium">Thesis Group 4</p>
                    <p className="text-xs text-earth-200/40">Bachelor of Science in Civil Engineering</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <GraduationCap size={14} className="text-amber-500/60 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-earth-100 font-medium">University of Engineering &amp; Technology</p>
                    <p className="text-xs text-earth-200/40">College of Civil Engineering &middot; A.Y. 2025-2026</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Mail size={14} className="text-amber-500/60 mt-0.5 shrink-0" />
                  <p className="text-sm text-earth-100">support@civilcraft.edu</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-earth-300/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-xs text-earth-200/35">
              &copy; 2026 CivilCraft &middot; All rights reserved
            </p>
            <p className="text-xs text-earth-200/35 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Platform: <span className="text-amber-400/60">Mobile (Android)</span>
            </p>
            <p className="text-xs text-earth-200/35">
              Built with &#9829; by Thesis Group 4 &middot; BSCE 2026
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
