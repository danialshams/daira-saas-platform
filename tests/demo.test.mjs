import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspaces,demoProducts,demoPlans,getDemoDashboard,getDemoAdmin,getDemoTicket} from '../lib/demo-data.mjs';

test('public demo includes dozens of completely synthetic workspaces',()=>{
 assert.equal(demoWorkspaces.length,40);
 assert.equal(new Set(demoWorkspaces.map(w=>w.id)).size,40);
 assert.equal(demoProducts.length,7);
 assert.equal(demoPlans.length,4);
 for(const w of demoWorkspaces){assert.match(w.slug,/^demo-\d+$/);assert.equal(w.role,'owner');}
});
test('each demo workspace has rich, consistent data and no write credentials',()=>{
 for(const ws of demoWorkspaces){
  const d=getDemoDashboard(ws.id);
  assert.equal(d.authenticated,false);
  assert.equal(d.demo,true);
  assert.equal(d.workspace.id,ws.id);
  assert.ok(d.team.length>0&&d.team.length<=d.subscription.seat_limit);
  assert.ok(d.tickets.length>=8&&d.invoices.length>=9);
  assert.ok(d.apiKeys.length>=3&&d.notifications.length>=16);
  assert.ok(d.webhooks.length>=2&&d.domains.length>=2);
  assert.ok(d.activity.length>=20&&d.invitations.length>=4);
  assert.ok(d.activeProducts.length<=d.subscription.product_limit);
  assert.ok(d.team.every(m=>m.email.endsWith('@example.test')));
  assert.ok(d.apiKeys.every(k=>!('token_hash' in k)&&!('token' in k)));
  assert.ok(d.webhooks.every(k=>!('secret_ciphertext' in k)));
  assert.ok(d.domains.every(k=>k.hostname.endsWith('.example.test')));
 }
});
test('demo tickets only return details for workspace-owned synthetic ids',()=>{
 const a=getDemoDashboard(demoWorkspaces[0].id),b=getDemoDashboard(demoWorkspaces[1].id);
 assert.equal(getDemoTicket(a.workspace.id,a.tickets[0].id).messages.length,5);
 assert.equal(getDemoTicket(b.workspace.id,a.tickets[0].id),null);
});
test('central management aggregates demo-only information',()=>{
 const admin=getDemoAdmin();
 assert.equal(admin.demo,true);
 assert.equal(admin.totals.workspaces,40);
 assert.ok(admin.totals.users>100);
 assert.ok(admin.tickets.length>=100);
 assert.ok(admin.invoices.length>=100);
 assert.equal(admin.coupons.length,15);
 assert.equal(admin.revenueHistory.length,12);
});
