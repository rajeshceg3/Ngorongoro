const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{for(const w of JSON.parse(process.env.WIDTHS||'[390]'))for(const reducedMotion of JSON.parse(process.env.MOTIONS||'["reduce","no-preference"]')){
 const p=await b.newPage({viewport:{width:w,height:844},reducedMotion}); const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(process.env.BASE_URL||'http://127.0.0.1:8785/');await p.waitForSelector('#veil.gone');
 for(const ch of [0,1]){
  if(ch)await p.click(`[data-scene="${ch}"]`);
  const target=ch?{yaw:.43,pitch:-.045}:{yaw:-2.14,pitch:-.57};
  await p.waitForFunction(t=>{const c=document.querySelector('canvas').dataset;return Math.abs(+c.yaw-t.yaw)<.006&&Math.abs(+c.pitch-t.pitch)<.006},target,{timeout:20000});
  await p.mouse.move(w*.5,350);await p.mouse.down();await p.mouse.move(w*.3,390,{steps:8});await p.mouse.up();
  await p.waitForSelector('#reset-orb:not([hidden])');await p.click('#reset-orb');
  await p.waitForFunction(t=>{const c=document.querySelector('canvas').dataset;return Math.abs(+c.yaw-t.yaw)<.006&&Math.abs(+c.pitch-t.pitch)<.006},target,{timeout:20000});
  await p.waitForTimeout(2000);
  const end=await p.evaluate(()=>({yaw:+document.querySelector('canvas').dataset.yaw,pitch:+document.querySelector('canvas').dataset.pitch,hidden:document.querySelector('#reset-orb').hidden}));
  assert.ok(Math.abs(end.yaw-target.yaw)<.006&&Math.abs(end.pitch-target.pitch)<.006,JSON.stringify(end));assert.ok(end.hidden);
 }
 assert.deepEqual(errs,[]);console.log('PASS reset and held camera',w,reducedMotion);await p.close();
}}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
