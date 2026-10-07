const configuredUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const configuredKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const url = (configuredUrl || 'https://ngdbwujpfbsgzfwfmddq.supabase.co').replace(/\/$/, '');
const key = configuredKey || 'sb_publishable_tKjMe7fU3yBzn3HwdbbNuw_W8xzdqv1';
const STORAGE_KEY = 'autoprint.supabase.session';

export type Session={access_token:string;refresh_token:string;expires_at?:number;user:{id:string;email?:string}};

export function isSupabaseConfigured(){return Boolean(url&&key)}
export function getStoredSession():Session|null{try{const raw=localStorage.getItem(STORAGE_KEY);return raw?JSON.parse(raw):null}catch{return null}}
function store(s:Session|null){if(s)localStorage.setItem(STORAGE_KEY,JSON.stringify(s));else localStorage.removeItem(STORAGE_KEY)}

class SupabaseRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SupabaseRequestError';
    this.status = status;
  }
}

async function request(path:string,init:RequestInit={},authToken?:string){
  if(!url||!key)throw new Error('Supabase environment is not configured.');
  const headers:Record<string,string>={apikey:key,'Content-Type':'application/json'};
  if(authToken) headers.Authorization='Bearer '+authToken;
  const res=await fetch(url+path,{...init,headers:{...headers,...(init.headers||{})}});
  const text=await res.text();
  let data:any;
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok)throw new SupabaseRequestError(data?.msg||data?.message||data?.error_description||text||'Supabase request failed.',res.status);
  return data;
}

function sessionFrom(data:any):Session{
  if(!data?.access_token||!data?.user)throw new Error('Supabase returned an incomplete session.');
  return {access_token:data.access_token,refresh_token:data.refresh_token,expires_at:data.expires_at,user:data.user};
}

/**
 * Supabase's hosted recovery email normally redirects back to the app with
 * access_token/refresh_token in the URL hash and type=recovery.
 *
 * Consume that one-time browser URL, persist the recovery session locally,
 * and remove the tokens from the visible address bar.
 */
export function restoreRecoverySessionFromUrl():Session|null{
  if(typeof window==='undefined')return null;
  const hash=window.location.hash.startsWith('#')?window.location.hash.slice(1):'';
  if(!hash)return null;
  const params=new URLSearchParams(hash);
  if(params.get('type')!=='recovery')return null;
  const accessToken=params.get('access_token');
  const refreshToken=params.get('refresh_token');
  if(!accessToken||!refreshToken)return null;

  const userPayload=params.get('user');
  let user:{id:string;email?:string}|undefined;
  try{
    user=userPayload?JSON.parse(userPayload):undefined;
  }catch{
    user=undefined;
  }

  if(!user){
    try{
      const payload=JSON.parse(atob(accessToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      user={id:String(payload.sub||''),email:payload.email||undefined};
    }catch{
      user={id:''};
    }
  }
  if(!user.id)return null;

  const session:Session={
    access_token:accessToken,
    refresh_token:refreshToken,
    expires_at:params.get('expires_at')?Number(params.get('expires_at')):undefined,
    user,
  };
  store(session);
  window.history.replaceState({},document.title,window.location.pathname+window.location.search);
  return session;
}

export async function signIn(email:string,password:string){
  const s=sessionFrom(await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})}));
  store(s);return s;
}

export async function signUp(email:string,password:string){
  const data=await request('/auth/v1/signup',{method:'POST',body:JSON.stringify({email,password})});
  if(data?.access_token){const s=sessionFrom(data);store(s);return s}
  throw new Error('Account created. If email confirmation is enabled, confirm your email and then sign in.');
}

export async function refreshSession(){
  const current=getStoredSession();
  if(!current?.refresh_token)throw new Error('Your sign-in session has expired. Please sign in again.');
  try {
    const s=sessionFrom(await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:current.refresh_token})}));
    store(s);return s;
  } catch (error) {
    store(null);
    throw new Error('Your sign-in session has expired. Please sign in again.');
  }
}

async function getValidSession():Promise<Session>{
  const current=getStoredSession();
  if(!current)throw new Error('Not signed in.');
  const expiresAt=current.expires_at;
  if(typeof expiresAt==='number' && expiresAt <= Math.floor(Date.now()/1000) + 30){
    return refreshSession();
  }
  return current;
}

function getRecoveryRedirectUrl(){
  if(typeof window==='undefined') return 'printomatic://auth/recovery';
  return window.location.protocol === 'http:' || window.location.protocol === 'https:'
    ? window.location.origin
    : 'printomatic://auth/recovery';
}

export async function sendPasswordRecoveryCode(email:string){
  await request('/auth/v1/recover',{
    method:'POST',
    body:JSON.stringify({email,redirect_to:getRecoveryRedirectUrl()})
  });
}

export async function updatePassword(password:string){
  const current=getStoredSession();
  if(!current?.access_token)throw new Error('Password recovery session has expired. Please request a new reset email.');
  const data=await request('/auth/v1/user',{
    method:'PUT',
    body:JSON.stringify({password})
  },current.access_token);
  if(data?.access_token){
    const s=sessionFrom(data);store(s);return s;
  }
  return current;
}

export function signOut(){store(null)}

export async function db<T=any>(path:string,init:RequestInit={},session=getStoredSession()):Promise<T>{
  let active = session;
  if(!active)throw new Error('Not signed in.');
  if(typeof active.expires_at==='number' && active.expires_at <= Math.floor(Date.now()/1000) + 30){
    active = await refreshSession();
  }
  try {
    return await request('/rest/v1'+path,{...init,headers:{Authorization:'Bearer '+active.access_token,...(init.headers||{})}},active.access_token);
  } catch (error) {
    if(error instanceof SupabaseRequestError && error.status===401 && active.refresh_token){
      const refreshed = await refreshSession();
      return request('/rest/v1'+path,{...init,headers:{Authorization:'Bearer '+refreshed.access_token,...(init.headers||{})}},refreshed.access_token);
    }
    throw error;
  }
}
