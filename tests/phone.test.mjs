import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedIranMobile,generateOtp,smsCodeHash} from '../lib/phone.js';
test('Iran phone numbers are normalized and malformed input rejected',()=>{
 assert.equal(normalizedIranMobile('+989121234567'),'09121234567');
 assert.equal(normalizedIranMobile('989121234567'),'09121234567');
 assert.equal(normalizedIranMobile('0912 123 4567'),'09121234567');
 for(const invalid of ['+971501234567','0912123456','091212345678','',null,'this-is-not-a-number']) assert.equal(normalizedIranMobile(invalid),null);
});
test('OTP is six digits and hash is bound to challenge ID',()=>{
 process.env.APP_SECRET='c'.repeat(64);
 for(let i=0;i<40;i++)assert.match(generateOtp(),/^\d{6}$/);
 assert.notEqual(smsCodeHash('first','123456'),smsCodeHash('second','123456'));
 assert.equal(smsCodeHash('first','123456'),smsCodeHash('first','123456'));
});
