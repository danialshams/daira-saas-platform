import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,randomToken,hashToken,encrypt,decrypt} from '../lib/crypto.js';
import {isAccessActive,invoiceTotal,canActivatePaidInvoice,stablePlanCode} from '../lib/lifecycle.js';
import {safeMutation} from '../lib/csrf.js';
import {paymentConfigured,tomanToRial} from '../lib/billing.js';
import {providerStatus,ProviderNotConfigured,sendEmail} from '../lib/providers.js';

test('password hash uses individual salt and cannot accept wrong password',async()=>{
 const a=await hashPassword('SaaS_password_v2!');const b=await hashPassword('SaaS_password_v2!');
 assert.notEqual(a,b);assert.equal(await verifyPassword('SaaS_password_v2!',a),true);
 assert.equal(await verifyPassword('bad_password',a),false);assert.equal(await verifyPassword('any','scrypt$16384$missing$00'),false);
});
test('one-time token hashing is deterministic and tokens unpredictable',()=>{
 const a=randomToken(),b=randomToken();assert.notEqual(a,b);assert.equal(a.length>=40,true);assert.equal(hashToken(a),hashToken(a));assert.notEqual(hashToken(a),hashToken(b));
});
test('webhook secrets are AES-256-GCM authenticated',()=>{
 process.env.APP_SECRET='a'.repeat(64);
 const encrypted=encrypt('whsec_some-private-string');assert.notEqual(encrypted,'whsec_some-private-string');
 assert.equal(decrypt(encrypted),'whsec_some-private-string');
 const invalid=encrypted.slice(0,-2)+'xx';assert.throws(()=>decrypt(invalid));
 delete process.env.APP_SECRET;
});
test('subscription access enforces trial expiry and overdue',()=>{
 const now=new Date('2026-11-07T12:00:00Z');
 assert.equal(isAccessActive({status:'active',plan_code:'pro',current_period_ends_at:'2026-12-01T12:00:00Z'},now),true);
 assert.equal(isAccessActive({status:'active',plan_code:'pro',current_period_ends_at:'2026-11-01T12:00:00Z'},now),false);
 assert.equal(isAccessActive({status:'trialing',trial_ends_at:'2026-11-01T12:00:00Z'},now),false);
 assert.equal(isAccessActive({status:'paused',plan_code:'pro'},now),false);
 assert.equal(isAccessActive({status:'active',plan_code:'free'},now),true);
});
test('invoice totals never negative and plan codes restricted',()=>{
 assert.equal(invoiceTotal({amount:500,discount_amount:300}),200);
 assert.equal(invoiceTotal({amount:500,discount_amount:999}),0);
 assert.equal(canActivatePaidInvoice({plan_code:'pro',amount:500,discount_amount:50,status:'pending'}),true);
 assert.equal(canActivatePaidInvoice({plan_code:'pro',amount:500,status:'paid'}),false);
 assert.equal(stablePlanCode('custom'),'custom');assert.equal(stablePlanCode('hacked'),null);
});
test('toman converts to rial without floating point loss',()=>{
 assert.equal(tomanToRial(590000),5900000);
 for(const v of [NaN,Infinity,0,-100,1.25,Number.MAX_SAFE_INTEGER])assert.throws(()=>tomanToRial(v));
});
test('cookie-authenticated mutations reject cross-origin and cross-site requests',()=>{
 const req=(origin,site)=>({url:'https://example.com/api/app',headers:{get:k=>k==='origin'?origin:k==='sec-fetch-site'?site:null}});
 assert.equal(safeMutation(req('https://example.com','same-origin')),true);
 assert.equal(safeMutation(req('https://evil.example','cross-site')),false);
 assert.equal(safeMutation(req(null,'cross-site')),false);
 assert.equal(safeMutation(req(null,'same-site')),false);
 assert.equal(safeMutation(req(null,null)),true);
});
test('missing provider credentials do not silently pretend delivery',async()=>{
 delete process.env.MAIL_HTTP_ENDPOINT;delete process.env.MAIL_HTTP_TOKEN;
 delete process.env.SMS_HTTP_ENDPOINT;delete process.env.SMS_HTTP_TOKEN;
 delete process.env.ZARINPAL_MERCHANT_ID;delete process.env.PAYMENT_PROVIDER;
 assert.deepEqual(providerStatus(),{email:false,sms:false,payment:false});assert.equal(paymentConfigured(),false);
 await assert.rejects(()=>sendEmail({to:'x@y.com',subject:'test',text:'x'}),ProviderNotConfigured);
});
