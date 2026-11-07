'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
export default function Verify(){const [msg,setMsg]=useState('در حال تأیید ایمیل…'),[error,setError]=useState(false);
 useEffect(()=>{let cancelled=false;const token=new URLSearchParams(window.location.search).get('token')||'';
  if(!token){setMsg('لینک تأیید نامعتبر است.');setError(true);return;}
  fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verify-email',token})}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error||'تأیید ناموفق بود.');return b}).then(b=>{if(!cancelled)setMsg(b.message)}).catch(e=>{if(!cancelled){setMsg(e.message);setError(true)}});
  return()=>{cancelled=true};
 },[]);
 return <main className="account-shell"><div className="account-card"><div className="account-logo">◈ دایرا کلود</div><h1>تأیید ایمیل</h1><p role="status" aria-live="polite" className={error?'alert error':'alert info'}>{msg}</p><Link href="/">بازگشت به داشبورد</Link></div></main>;
}
