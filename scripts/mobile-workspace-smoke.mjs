// Local synthetic fixtures only. No production/staging mutations or credentials.
import assert from 'node:assert/strict'
const base = 'http://localhost:3088'
async function login(email) {
 const r=await fetch(base+'/api/dev-login?as='+encodeURIComponent(email),{method:'POST',headers:{Origin:base},redirect:'manual'})
 const token=r.headers.get('set-auth-token'); assert.ok(token);return token
}
async function call(token,path,body) {
 const r=await fetch(base+'/api/mobile/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json',Origin:base}:{})},...(body?{body:JSON.stringify(body)}:{})})
 return {status:r.status,data:await r.json()}
}
const admin=await login('sindre@demo.tertnesbrass.no')
const member=await login('ingrid@demo.tertnesbrass.no')
for(const [role,token] of [['member',member],['admin',admin]]){
 const queue=['more','posts'];const visited=new Set()
 const snapshot=await call(token,'snapshot');queue.push(...snapshot.data.events.slice(0,2).map(e=>'events/'+e.id))
 while(queue.length){
  const path=queue.shift();if(visited.has(path))continue;visited.add(path)
  assert.ok(visited.size<250,'bounded navigation graph')
  const parts=new URL('http://local/'+path);const query=new URLSearchParams(parts.search);query.set('screen',parts.pathname.slice(1))
  const r=await call(token,'workspace?'+query)
  assert.equal(r.status,200,role+' '+path+' '+JSON.stringify(r.data))
  assert.equal(typeof r.data.title,'string');assert.ok(Array.isArray(r.data.sections))
  for(const s of r.data.sections){
   assert.equal(new Set(s.rows.map(r=>r.id)).size,s.rows.length,'stable distinct row identities')
   for(const row of s.rows)if(row.path)queue.push(row.path)
  }
 }
 console.log(`PASS ${role}: ${visited.size} native screens and all reachable navigation links`)
}
async function action(token,operation,values={}){return call(token,'workspace/action',{operation,values})}
assert.equal((await action(admin,'__proto__')).status,404)
assert.equal((await action(admin,'constructor')).status,404)
assert.notEqual((await action(member,'settings.createRole',{name:'Must not be created'})).status,200)
assert.notEqual((await action(member,'board.createTask',{title:'Must not be created'})).status,200)
assert.equal((await action(admin,'settings.createRole',{})).status,400)
const profile=await call(member,'workspace?screen=profile');assert.equal(profile.status,200)
assert.equal((await action(member,'profile.updateMyPhone',{phone:'12345678'})).status,200)
assert.equal((await action(member,'profile.updateMyPhone',{phone:''})).status,200)
const name='Native smoke '+Date.now()
assert.equal((await action(admin,'board.createTask',{title:name})).status,200)
const tasks=await call(admin,'workspace?screen=board/tasks')
const created=tasks.data.sections.flatMap(s=>s.rows).find(r=>r.title===name);assert.ok(created)
const id=created.path.split('/').at(-1)
assert.equal((await action(admin,'board.updateTask',{id,title:name+' edited'})).status,200)
assert.equal((await action(admin,'board.setTaskStatus',{id,status:'done'})).status,200)
assert.equal((await action(admin,'board.deleteTask',{id})).status,200)
console.log('PASS: explicit action allowlist, validation, denied permissions, profile and board task lifecycle')
