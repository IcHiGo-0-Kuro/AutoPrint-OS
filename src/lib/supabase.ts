const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const STORAGE_KEY = 'autoprint.supabase.session';
export type Session={access_token:string;refresh_token:string;expires_at?:number;user:{id:string;email?:string}};
export function isSupabaseConfigured(){return Boolean(url&&key)}
export function getStoredSession():Session|null{try{const raw=localStorage.getItem(STORAGE_KEY);return raw?JSON.parse(raw):null}catch{return null}}
function store(s:Session|null){if(s)localStorage.setItem(STORAGE_KEY,JSON.stringify(s));else localStorage.removeItem(STORAGE_KEY)}
async function request(path:string,init:RequestInit={}){if(!url||!key)throw new Error('Supabase environment is not configured.');const res=await fetch(url+path,{...init,headers:{apikey:key,'Content-Type':'application/json',...(init.headers||{})}});const text=await res.text();let data:any;try{data=text?JSON.parse(text):null}catch{data=text}if(!res.ok)throw new Error(data?.msg||data?.message||data?.error_description||text||'Supabase request failed.');return data}
function sessionFrom(data:any):Session{if(!data?.access_token||!data?.user)throw new Error('Supabase returned an incomplete session.');return {access_token:data.access_token,refresh_token:data.refresh_token,expires_at:data.expires_at,user:data.user}}
export async function signIn(email:string,password:string){const s=sessionFrom(await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})}));store(s);return s}
export async function signUp(email:string,password:string){const data=await request('/auth/v1/signup',{method:'POST',body:JSON.stringify({email,password})});if(data?.access_token){const s=sessionFrom(data);store(s);return s}throw new Error('Account created. If email confirmation is enabled, confirm your email and then sign in.')}
export async function refreshSession(){const current=getStoredSession();if(!current?.refresh_token)throw new Error('No refresh token available.');const s=sessionFrom(await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:current.refresh_token})}));store(s);return s}
export function signOut(){store(null)}
export async function db<T=any>(path:string,init:RequestInit={},session=getStoredSession()):Promise<T>{if(!session)throw new Error('Not signed in.');return request('/rest/v1'+path,{...init,headers:{Authorization:'Bearer '+session.access_token,...(init.headers||{})}})}
