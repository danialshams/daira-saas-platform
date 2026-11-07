// Pure functions shared by worker and unit tests.
export const isAccessActive = (subscription, now = new Date()) => !!subscription &&
  ['active','trialing'].includes(subscription.status) &&
  (subscription.status!=='trialing' || (!!subscription.trial_ends_at && new Date(subscription.trial_ends_at)>now)) &&
  (!subscription.current_period_ends_at || new Date(subscription.current_period_ends_at)>now || subscription.plan_code==='free');
export function invoiceTotal(invoice){return Math.max(0,Number(invoice.amount)-Number(invoice.discount_amount));}
export function canActivatePaidInvoice(invoice){return invoice?.status==='pending' && !!invoice?.plan_code && invoiceTotal(invoice)>0;}
export function stablePlanCode(value){return ['free','pro','business','custom'].includes(value)?value:null;}
