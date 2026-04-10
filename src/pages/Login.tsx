import { useState } from 'react';
import { HardHat, Eye, EyeOff, User, Lock, ArrowRight, ArrowLeft, Mail, BadgeCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type AuthMode = 'login' | 'register';

interface LoginProps {
  onBackToLanding?: () => void;
}

export default function Login({ onBackToLanding }: LoginProps) {
  const { login, register, isPlayFabEnabled } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const isRegisterMode = mode === 'register';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isRegisterMode) {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setIsLoading(true);

    const result = isRegisterMode
      ? await register({
          name,
          email,
          username: registerUsername,
          password,
        })
      : await login(username, password, false);

    if (!result.ok) {
      setError(result.error || `${isRegisterMode ? 'Registration' : 'Login'} failed. Please try again.`);
    }

    setIsLoading(false);
  };

  const switchMode = (nextMode: AuthMode) => {
    setError('');
    setMode(nextMode);
  };

  return (
    <div className="min-h-screen blueprint-bg-dark flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-1/4 -left-32 w-64 h-64 border border-earth-300/8 rounded-full" />
        <div className="absolute bottom-1/4 -right-24 w-48 h-48 border border-earth-300/8 rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-earth-300/[0.04] rounded-full" />
        <div className="absolute top-20 left-0 w-full h-px bg-gradient-to-r from-transparent via-earth-300/10 to-transparent" />
        <div className="absolute bottom-32 left-0 w-full h-px bg-gradient-to-r from-transparent via-earth-300/10 to-transparent" />
        <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-earth-300/15" />
        <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-earth-300/15" />
        <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-earth-300/15" />
        <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-earth-300/15" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-xl bg-earth-500/15 border border-earth-300/25 flex items-center justify-center mb-4 backdrop-blur-sm">
            <HardHat className="w-8 h-8 text-earth-300" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">CivilCraft</h1>
          <p className="text-earth-300/50 text-sm font-mono tracking-widest uppercase mt-1">Engineering Hub</p>
        </div>

        <div className="relative bg-white/[0.04] backdrop-blur-lg border border-earth-300/15 rounded-[6px] p-8">
          <div className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-earth-300/40 rounded-tl-[6px]" />
          <div className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-earth-300/40 rounded-tr-[6px]" />
          <div className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-earth-300/40 rounded-bl-[6px]" />
          <div className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-earth-300/40 rounded-br-[6px]" />

          <div className="flex bg-white/5 rounded-[4px] p-1 mb-6 border border-earth-300/10">
            <button
              onClick={() => switchMode('login')}
              className={`flex-1 py-2.5 rounded-[3px] text-sm font-medium transition-all ${
                mode === 'login'
                  ? 'bg-earth-500/20 text-earth-300 border border-earth-300/25'
                  : 'text-steel-400 hover:text-white border border-transparent'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => switchMode('register')}
              className={`flex-1 py-2.5 rounded-[3px] text-sm font-medium transition-all ${
                mode === 'register'
                  ? 'bg-earth-500/20 text-earth-300 border border-earth-300/25'
                  : 'text-steel-400 hover:text-white border border-transparent'
              }`}
            >
              Register
            </button>
          </div>


          <div className="mb-6">
            <h2 className="text-lg font-bold text-white">
              {isRegisterMode ? 'Create Your Account' : 'Welcome Back'}
            </h2>
            <p className="text-sm text-steel-400 mt-1">
              {isRegisterMode
                ? 'Register to start building in CivilCraft.'
                : 'Sign in to access your engineering workspace'}
            </p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-[3px] border border-earth-300/20 bg-earth-300/5 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-earth-300/70">
              <span className={`h-1.5 w-1.5 rounded-full ${isPlayFabEnabled ? 'bg-cyber-green' : 'bg-earth-300/70'}`} />
              {isPlayFabEnabled ? 'PlayFab Connected' : 'Demo Mode'}
            </p>
            {isPlayFabEnabled && (
              <p className="mt-2 text-[10px] text-earth-300/50 font-mono">
                Same account works on mobile game
              </p>
            )}
            {isRegisterMode && (
              <div className="mt-3 rounded-[4px] border border-earth-300/15 bg-earth-300/5 p-3 text-xs text-earth-200/80">
                <div className="flex items-start gap-2">
                  <BadgeCheck className="mt-0.5 h-4 w-4 text-earth-300" />
                  <div>
                    <p className="font-medium text-earth-200">Role assignment on registration</p>
                    <p className="mt-1 text-earth-300/70">
                      New accounts default to <span className="font-semibold text-white">Student</span>. If the email contains
                      <span className="mx-1 rounded bg-earth-500/15 px-1.5 py-0.5 font-mono text-earth-300">edu.ph</span>
                      the account is automatically registered as <span className="font-semibold text-white">Professor</span>.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegisterMode && (
              <div>
                <label className="block text-[11px] font-mono text-steel-400 tracking-widest uppercase mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel-500" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-earth-300/15 rounded-[4px] text-sm text-white placeholder:text-steel-600 focus:outline-none focus:border-earth-300/40 focus:ring-1 focus:ring-earth-300/20 transition-all"
                  />
                </div>
              </div>
            )}

            {isRegisterMode && (
              <div>
                <label className="block text-[11px] font-mono text-steel-400 tracking-widest uppercase mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-earth-300/15 rounded-[4px] text-sm text-white placeholder:text-steel-600 focus:outline-none focus:border-earth-300/40 focus:ring-1 focus:ring-earth-300/20 transition-all font-mono"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-mono text-steel-400 tracking-widest uppercase mb-2">
                {isRegisterMode ? 'Username' : 'Username or Email'}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel-500" />
                <input
                  type="text"
                  value={isRegisterMode ? registerUsername : username}
                  onChange={(e) => (isRegisterMode ? setRegisterUsername(e.target.value) : setUsername(e.target.value))}
                  placeholder={isRegisterMode ? 'Create a username' : 'Enter your username or email'}
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-earth-300/15 rounded-[4px] text-sm text-white placeholder:text-steel-600 focus:outline-none focus:border-earth-300/40 focus:ring-1 focus:ring-earth-300/20 transition-all font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-steel-400 tracking-widest uppercase mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isRegisterMode ? 'Create a password' : 'Enter your password'}
                  className="w-full pl-10 pr-12 py-3 bg-white/5 border border-earth-300/15 rounded-[4px] text-sm text-white placeholder:text-steel-600 focus:outline-none focus:border-earth-300/40 focus:ring-1 focus:ring-earth-300/20 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-500 hover:text-earth-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {isRegisterMode && (
              <div>
                <label className="block text-[11px] font-mono text-steel-400 tracking-widest uppercase mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-earth-300/15 rounded-[4px] text-sm text-white placeholder:text-steel-600 focus:outline-none focus:border-earth-300/40 focus:ring-1 focus:ring-earth-300/20 transition-all font-mono"
                  />
                </div>
              </div>
            )}

            {!isRegisterMode && (
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-3.5 h-3.5 rounded border-earth-300/20 bg-white/5 accent-earth-500" />
                  <span className="text-xs text-steel-400">Remember me</span>
                </label>
                <button type="button" className="text-xs text-earth-300/70 hover:text-earth-300 transition-colors">
                  Forgot Password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-earth-700 to-earth-600 text-white rounded-[4px] text-sm font-semibold hover:from-earth-600 hover:to-earth-500 transition-all flex items-center justify-center gap-2 group border border-earth-400/30 disabled:opacity-60"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isRegisterMode ? 'Create Account' : 'Sign In'}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>

            {error && (
              <p className="rounded-[4px] border border-danger-red/40 bg-danger-red/10 px-3 py-2 text-xs text-red-200">
                {error}
              </p>
            )}
          </form>

          <div className="mt-6 pt-5 border-t border-earth-300/10 text-center">
            <p className="text-sm text-steel-400">
              {isRegisterMode ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={() => switchMode(isRegisterMode ? 'login' : 'register')}
                className="text-earth-300 font-medium hover:text-earth-200 transition-colors"
              >
                {isRegisterMode ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </div>

        {!isPlayFabEnabled && mode === 'login' && (
          <div className="mt-6 bg-earth-300/5 border border-earth-300/10 rounded-[4px] p-4">
            <p className="text-[10px] font-mono text-earth-300/40 tracking-wider uppercase mb-3 text-center">
              -- Quick Demo Access --
            </p>
            <div className="space-y-2">
              {[
                { label: 'Super Admin', sub: 'Full system control', user: 'admin', color: 'border-[#1B6E8A]/30 hover:border-[#1B6E8A]/60 hover:bg-[#0B3C5D]/10', badge: 'bg-[#0B3C5D]/20 text-draft-300' },
                { label: 'Professor', sub: 'Class management + analytics', user: 'professor', color: 'border-earth-300/20 hover:border-earth-300/40 hover:bg-earth-300/5', badge: 'bg-earth-500/20 text-earth-300' },
                { label: 'Student', sub: 'My section & assignments', user: 'engineer', color: 'border-cyber-green/20 hover:border-cyber-green/40 hover:bg-cyber-green/5', badge: 'bg-cyber-green/10 text-cyber-green' },
              ].map((demo) => (
                <button
                  key={demo.user}
                  onClick={() => {
                    setUsername(demo.user);
                    setPassword('demo123');
                    setMode('login');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[3px] border transition-all group ${demo.color}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold tracking-wider ${demo.badge}`}>
                      {demo.label.toUpperCase()}
                    </span>
                    <span className="text-[11px] text-earth-300/50 group-hover:text-earth-300/80 transition-colors">{demo.sub}</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-earth-300/30 group-hover:text-earth-300/70 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {onBackToLanding && (
          <div className="text-center mt-5">
            <button
              onClick={onBackToLanding}
              className="inline-flex items-center gap-2 text-xs text-earth-300/40 hover:text-earth-300/70 font-mono tracking-widest uppercase transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to Home
            </button>
          </div>
        )}
        <p className="text-center text-[10px] font-mono text-earth-300/20 tracking-widest mt-4">
          © 2026 CIVILCRAFT ENGINEERING HUB
        </p>
      </div>
    </div>
  );
}
