const test=require('node:test');
const assert=require('node:assert/strict');
const rules=require('./verifier-rules.cjs');

test('REG-055: verifier accepts every successful HTTP 2xx response',()=>{
  for(const status of [200,201,202,204,299]) assert.equal(rules.isSuccessfulHttpStatus(status),true);
  for(const status of [0,199,300,400,500,'200']) assert.equal(rules.isSuccessfulHttpStatus(status),false);
});

test('REG-056: blank optional completion notes do not invalidate a completed task',()=>{
  assert.equal(rules.taskCompletionIsVerified({
    status:'Completed',completed_at:'2026-08-20T00:00:00.000Z',completed_by:'test-user',completion_notes:null
  }),true);
  assert.equal(rules.taskCompletionIsVerified({status:'Completed',completed_at:null,completed_by:'test-user'}),false);
  assert.equal(rules.taskCompletionIsVerified({status:'Open',completed_at:'2026-08-20T00:00:00.000Z',completed_by:'test-user'}),false);
});
