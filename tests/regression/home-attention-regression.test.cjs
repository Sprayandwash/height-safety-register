const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname, '../..');
const app=fs.readFileSync(path.join(root, 'operations-v4.js'), 'utf8');

function functionSource(name){
  const start=app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const following=app.slice(start+1).match(/\n  (?:async )?function /);
  const end=following ? start+1+following.index : app.length;
  return app.slice(start, end);
}

test('REG-UI-005: Home attention filters toggle closed and reset when returning to Home',()=>{
  const home=functionSource('showModuleHome');
  const toggle=functionSource('openAppAttention');

  assert.match(home, /\{preserveAttentionFilter=false\}=\{\}/);
  assert.match(home, /if\(!preserveAttentionFilter\) state\.homeAttentionFilter='all';/);
  assert.match(toggle, /const requested=group\|\|'all';/);
  assert.match(toggle, /state\.homeAttentionFilter=state\.homeAttentionFilter===requested\?'all':requested;/);
  assert.match(toggle, /showModuleHome\(\{preserveAttentionFilter:true\}\);/);
});
