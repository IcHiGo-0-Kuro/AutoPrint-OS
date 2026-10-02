import {useEffect, useState} from 'react';
import {isSupabaseConfigured, getStoredSession, signIn, signOut} from './lib/supabase';

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState(getStoredSession());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'AutoPrint OS';
  }, []);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try { const s = await signIn(email, password); setSession(s); }
    catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  }

  if (!isSupabaseConfigured()) {
    return <Shell><SetupCard /></Shell>;
  }

  if (!session) {
    return <Shell>
      <form onSubmit={handleSignIn} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <div className="mb-6"><p className="text-xs font-mono text-indigo-400">AUTOPRINT OS</p><h1 className="mt-2 text-2xl font-bold">Desktop Print Workstation</h1><p className="mt-2 text-sm text-slate-400">Sign in to connect this workstation to your shop workspace.</p></div>
        <input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" className="mb-3 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 outline-none focus:border-indigo-500" />
        <input required minLength={6} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" className="mb-3 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 outline-none focus:border-indigo-500" />
        {error && <p className="mb-3 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-300">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">{busy ? 'Connecting…' : 'Sign in'}</button>
      </form>
    </Shell>;
  }

  return <Shell>
    <div className="w-full max-w-4xl">
      <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-mono text-indigo-400">WORKSTATION ONLINE</p><h1 className="mt-1 text-3xl font-bold">AutoPrint OS</h1><p className="mt-1 text-sm text-slate-400">Local documents and printer control stay on this desktop. Supabase stores shop metadata and coordination.</p></div><button onClick={()=>{signOut();setSession(null)}} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Sign out</button></div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Print Queue','Ready for native spooler integration','queue'],
          ['Printers','Windows/local printer layer','printer'],
          ['WhatsApp','Cloud intake → local job queue','cloud']
        ].map(([title,body])=><div key={title} className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><p className="text-sm font-semibold">{title}</p><p className="mt-2 text-xs leading-5 text-slate-400">{body}</p><span className="mt-4 inline-flex rounded-full border border-emerald-900/50 bg-emerald-950/30 px-2 py-1 text-[10px] text-emerald-300">FOUNDATION READY</span></div>)}
      </div>
    </div>
  </Shell>;
}

function Shell({children}:{children:React.ReactNode}) {
  return <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">{children}</main>;
}
function SetupCard() {
  return <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl"><p className="text-xs font-mono text-indigo-400">AUTOPRINT OS</p><h1 className="mt-2 text-2xl font-bold">Connect Supabase</h1><p className="mt-3 text-sm text-slate-400">Create the desktop environment from .env.example and provide VITE_SUPABASE_URL plus VITE_SUPABASE_PUBLISHABLE_KEY.</p></div>;
}