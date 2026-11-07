'use client';
import {useState} from 'react';
import Link from 'next/link';
export default function Recovery(){
 const [token]=useState(()=>typeof window==='undefined'?'':new URLSearchParams(window.location.search).get('token')||'');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function submit(e){e.preventDefault();setBusy(true);setError('');setMessage('');
  if(token&&password!==repeat){setError('رمز و تکرار آن مطابقت ندارند.');setBusy(false);return;}
  try{const r=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(token?{action:'reset-password',token,password}:{action:'forgot-password',email})});const body=await r.json();if(!r.ok)throw new Error(body.error||'عملیات ناموفق بود.');setMessage(body.message||'درخواست ثبت شد.');}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <main className="account-shell"><div className="account-card"><div className="account-logo">◈ دایرا کلود</div><h1>{token?'تنظیم رمز جدید':'بازیابی رمز عبور'}</h1><p>{token?'رمز تازه را وارد کنید.':'لینک امن بازیابی برای ایمیل ثبت‌شده ارسال می‌شود.'}</p><form onSubmit={submit}>{!token?<label className="field">ایمیل<input required type="email" dir="ltr" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>:<><label className="field">رمز جدید<input required minLength={10} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label className="field">تکرار رمز جدید<input required minLength={10} maxLength={128} type="password" autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)}/></label></>}{message&&<div className="alert success">{message}</div>}{error&&<div className="alert error">{error}</div>}<button className="btn btn-primary" disabled={busy} type="submit">{busy?'در حال بررسی…':token?'تغییر رمز':'ارسال لینک بازیابی'}</button></form><Link href="/">بازگشت به ورود</Link></div></main>
}
