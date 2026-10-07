import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import {
  isSupabaseConfigured,
  restoreRecoverySessionFromUrl,
  sendPasswordRecoveryCode,
  signIn,
  signUp,
  updatePassword,
  verifyPasswordRecoveryCode,
} from '../lib/supabase';

type RecoveryStep = 'email' | 'code' | 'password';

export function AuthGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<'sign_in' | 'sign_up' | 'recover'>('sign_in');
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    try {
      const session = restoreRecoverySessionFromUrl();
      if (session) {
        setEmail(session.user.email || '');
        setMode('recover');
        setRecoveryStep('password');
        setNotice('Recovery link verified. Choose a new password below.');
        return;
      }

      const hash = window.location.hash;
      if (hash.includes('error=') || hash.includes('error_description=')) {
        const params = new URLSearchParams(hash.replace(/^#/, ''));
        const description = params.get('error_description');
        if (description) setError(decodeURIComponent(description.replace(/\+/g, ' ')));
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start password recovery.');
    }
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'sign_in') {
        await signIn(email.trim(), password);
        onAuthenticated();
      } else {
        await signUp(email.trim(), password);
        onAuthenticated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally { setBusy(false); }
  };

  const requestRecovery = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      await sendPasswordRecoveryCode(email.trim());
      setRecoveryStep('code');
      setNotice('If an account exists for this email, a recovery email has been sent. Enter the one-time code from that email below.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the recovery email.');
    } finally { setBusy(false); }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const session = await verifyPasswordRecoveryCode(email.trim(), recoveryCode.trim());
      setEmail(session.user.email || email.trim());
      setRecoveryStep('password');
      setNotice('Recovery code verified. Choose a new password.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That recovery code is invalid or expired. Request a new code and try again.');
    } finally { setBusy(false); }
  };

  const saveNewPassword = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    if (newPassword.length < 6) {
      setError('Your new password must be at least 6 characters.');
      setBusy(false); return;
    }
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      setBusy(false); return;
    }
    try {
      await updatePassword(newPassword);
      localStorage.removeItem('autoprint.supabase.session');
      setRecoveryStep('email');
      setMode('sign_in');
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setRecoveryCode('');
      setNotice('Password changed successfully. You can now sign in with your new password.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your password.');
    } finally { setBusy(false); }
  };

  const switchMode = () => {
    setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in');
    setError(''); setNotice('');
  };

  const startSignIn = () => {
    setRecoveryStep('email');
    setMode('sign_in');
    setError(''); setNotice('');
  };

  if (!isSupabaseConfigured()) return <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6"><div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl"><ShieldCheck className="w-10 h-10 text-indigo-400 mb-4" /><h1 className="text-xl font-semibold">Connect AutoPrint OS</h1><p className="text-sm text-slate-400 mt-2">Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart the desktop app.</p></div></div>;

  if (mode === 'sign_in' && recoveryStep === 'email') return <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6"><form onSubmit={submit} className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
    <div className="flex items-center gap-3 mb-6"><LogIn className="w-7 h-7 text-indigo-400" /><div><h1 className="text-xl font-semibold">AutoPrint OS</h1><p className="text-xs text-slate-400">Sign in to your shop</p></div></div>
    <label className="block text-xs text-slate-400 mb-1">Email</label><input value={email} onChange={e=>setEmail(e.target.value)} type="email" required autoComplete="email" className="w-full mb-4 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 outline-none focus:border-indigo-500" />
    <label className="block text-xs text-slate-400 mb-1">Password</label><input value={password} onChange={e=>setPassword(e.target.value)} type="password" minLength={6} required autoComplete="current-password" className="w-full mb-2 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 outline-none focus:border-indigo-500" />
    <button type="button" onClick={() => { setRecoveryStep('email'); setMode('recover'); setError(''); setNotice(''); }} className="mb-4 text-xs text-indigo-300 hover:text-indigo-200">Forgot password?</button>
    {error && <div className="mb-4 text-xs text-red-300 bg-red-950/30 border border-red-900/50 rounded-lg p-3">{error}</div>}
    {notice && <div className="mb-4 text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-900/50 rounded-lg p-3">{notice}</div>}
    <button disabled={busy} className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium text-sm">{busy ? 'Connecting…' : 'Sign in'}</button>
    <button type="button" onClick={switchMode} className="w-full mt-3 py-2 text-xs text-slate-400 hover:text-white">Need an account? Create one</button>
  </form></div>;

  if (mode === 'sign_up') return <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6"><form onSubmit={submit} className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
    <div className="flex items-center gap-3 mb-6"><UserPlus className="w-7 h-7 text-indigo-400" /><div><h1 className="text-xl font-semibold">AutoPrint OS</h1><p className="text-xs text-slate-400">Create your shop account</p></div></div>
    <label className="block text-xs text-slate-400 mb-1">Email</label><input value={email} onChange={e=>setEmail(e.target.value)} type="email" required autoComplete="email" className="w-full mb-4 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 outline-none focus:border-indigo-500" />
    <label className="block text-xs text-slate-400 mb-1">Password</label><input value={password} onChange={e=>setPassword(e.target.value)} type="password" minLength={6} required autoComplete="new-password" className="w-full mb-4 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 outline-none focus:border-indigo-500" />
    {error && <div className="mb-4 text-xs text-red-300 bg-red-950/30 border border-red-900/50 rounded-lg p-3">{error}</div>}
    {notice && <div className="mb-4 text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-900/50 rounded-lg p-3">{notice}</div>}
    <button disabled={busy} className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium text-sm">{busy ? 'Creating…' : 'Create account'}</button>
    <button type="button" onClick={switchMode} className="w-full mt-3 py-2 text-xs text-slate-400 hover:text-white">Already have an account? Sign in</button>
  </form></div>;

  const recoveryTitle = recoveryStep === 'email' ? 'Recover your password' : recoveryStep === 'code' ? 'Enter recovery code' : 'Set a new password';
  const recoverySubtitle = recoveryStep === 'email'
    ? 'We will send a recovery email to your registered address.'
    : recoveryStep === 'code'
      ? `Enter the 6-digit code sent to ${email}.`
      : 'Your recovery session is verified. Choose a new password.';

  return <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6"><form onSubmit={recoveryStep === 'email' ? requestRecovery : recoveryStep === 'code' ? verifyCode : saveNewPassword} className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
    <div className="flex items-center gap-3 mb-6"><KeyRound className="w-7 h-7 text-indigo-400" /><div><h1 className="text-xl font-semibold">{recoveryTitle}</h1><p className="text-xs text-slate-400">{recoverySubtitle}</p></div></div>

    {recoveryStep === 'email' && <>
      <label className="block text-xs text-slate-400 mb-1">Registered email</label>
      <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required autoComplete="email" className="w-full mb-4 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 outline-none focus:border-indigo-500" />
    </>}

    {recoveryStep === 'code' && <>
      <label className="block text-xs text-slate-400 mb-1">Recovery code</label>
      <input value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required className="w-full mb-2 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 outline-none focus:border-indigo-500 tracking-[0.45em] text-center text-lg" />
      <button type="button" disabled={busy} onClick={requestRecovery} className="mb-4 text-xs text-indigo-300 hover:text-indigo-200 disabled:opacity-50">Resend recovery email</button>
    </>}

    {recoveryStep === 'password' && <>
      <label className="block text-xs text-slate-400 mb-1">New password</label>
      <input value={newPassword} onChange={e=>setNewPassword(e.target.value)} type="password" minLength={6} required autoComplete="new-password" className="w-full mb-4 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 outline-none focus:border-indigo-500" />
      <label className="block text-xs text-slate-400 mb-1">Confirm new password</label>
      <input value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} type="password" minLength={6} required autoComplete="new-password" className="w-full mb-4 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 outline-none focus:border-indigo-500" />
    </>}

    {error && <div className="mb-4 text-xs text-red-300 bg-red-950/30 border border-red-900/50 rounded-lg p-3">{error}</div>}
    {notice && <div className="mb-4 text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-900/50 rounded-lg p-3">{notice}</div>}
    <button disabled={busy} className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium text-sm">{busy ? 'Please wait…' : recoveryStep === 'email' ? 'Send recovery email' : recoveryStep === 'code' ? 'Verify code' : 'Change password'}</button>
    <button type="button" onClick={startSignIn} className="w-full mt-3 py-2 text-xs text-slate-400 hover:text-white flex items-center justify-center gap-2"><ArrowLeft className="w-3.5 h-3.5" />Back to sign in</button>
  </form></div>;
}
