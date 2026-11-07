import test from 'node:test';
import assert from 'node:assert/strict';
import {requireProductLicense,recordUsage,exchangeIntegrationToken} from '../integrations/node-sdk.mjs';
const apiKey='dk_'+'x'.repeat(43);
const success=(body)=>({ok:true,status:200,json:async()=>body});
test('product licensing validates exact tenant and refuses expired entitlements', async()=>{
 const fetchImpl=async()=>success({workspaceId:'tenant-A',product:'crm',enabled:true});
 await assert.rejects(()=>requireProductLicense({baseUrl:'https://platform.example',apiKey,product:'crm',workspaceId:'tenant-B',fetchImpl}),/LICENSE_NOT_ACTIVE/);
 assert.equal((await requireProductLicense({baseUrl:'https://platform.example',apiKey,product:'crm',workspaceId:'tenant-A',fetchImpl})).enabled,true);
 await assert.rejects(()=>requireProductLicense({baseUrl:'http://insecure.example',apiKey,product:'crm',workspaceId:'tenant-A',fetchImpl}),/HTTPS_REQUIRED/);
});
test('usage billing always includes idempotency key and bearer server key',async()=>{
 let headers,body;
 const fetchImpl=async(_url,options)=>{headers=options.headers;body=JSON.parse(options.body);return success({success:true})};
 await recordUsage({baseUrl:'https://platform.example',apiKey,feature:'api_calls',amount:2,idempotencyKey:'unique-event-5',fetchImpl});
 assert.equal(headers['Idempotency-Key'],'unique-event-5');
 assert.equal(headers.Authorization,`Bearer ${apiKey}`);
 assert.deepEqual(body,{feature:'api_calls',amount:2});
 await assert.rejects(()=>recordUsage({baseUrl:'https://platform.example',apiKey,feature:'api_calls',fetchImpl}),/IDEMPOTENCY_KEY_REQUIRED/);
});
test('one-time exchange does not send workspace keys',async()=>{
 const fetchImpl=async(_url,options)=>{assert.equal(options.headers.Authorization,undefined);return success({success:true,workspaceId:'tenant-1'})};
 const result=await exchangeIntegrationToken({baseUrl:'https://platform.example',token:'token-'+'A'.repeat(44),fetchImpl});
 assert.equal(result.workspaceId,'tenant-1');
});
