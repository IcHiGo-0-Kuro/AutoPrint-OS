import { FormEvent, useState } from 'react';
import { LogIn, UserPlus, ShieldCheck } from 'lucide-react';
import { isSupabaseConfigured, signIn, signUp } from '../lib/supabase';

export function AuthGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { if (mode === 'sign_in') await signIn(email, password); else await signUp(email, password); onAuthenticated(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  };

  if (!isSupabaseConfigured()) return <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6"><div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl"><ShieldCheck className="w-10 h-10 text-indigo-400 mb-4" /><h1 className="text-xl font-semibold">Connect AutoPrint OS</h1><p className="text-sm text-slate-400 mt-2">Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart the desktop app.</p></div></div>;

  return <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6"><form onSubmit={submit} className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
    <div className="flex items-center gap-3 mb-6">{mode === 'sign_in' ? <LogIn className="w-7 h-7 text-indigo-400" /> : <UserPlus className="w-7 h-7 text-indigo-400" />}<div><h1 className="text-xl font-semibold">AutoPrint OS</h1><p className="text-xs text-slate-400">{mode === 'sign_in' ? 'Sign in to your shop' : 'Create your shop account'}</p></div></div>
    <label className="block text-xs text-slate-400 mb-1">Email</label><input value={email} onChange={e=>setEmail(e.target.value)} type="email" required className="w-full mb-4 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 outline-none focus:border-indigo-500" />
    <label className="block text-xs text-slate-400 mb-1">Password</label><input value={password} onChange={e=>setPassword(e.target.value)} type="password" minLength={6} required className="w-full mb-4 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 outline-none focus:border-indigo-500" />
    {error && <div className="mb-4 text-xs text-red-300 bg-red-950/30 border border-red-900/50 rounded-lg p-3">{error}</div>}
    <button disabled={busy} className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium text-sm">{busy ? 'Connecting…' : mode === 'sign_in' ? 'Sign in' : 'Create account'}</button>
    <button type="button" onClick={() => setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in')} className="w-full mt-3 py-2 text-xs text-slate-400 hover:text-white">{mode === 'sign_in' ? 'Need an account? Create one' : 'Already have an account? Sign in'}</button>
  </form></div>;
}
