// Chrome contract: pinned pass drives every control; unpinned pass asserts retire, hint, wake.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const out=process.env.PROOF_DIR||path.resolve(__dirname,'../docs/chrome-pixels');fs.mkdirSync(out,{recursive:true});
(async()=>{const external=process.env.BASE_URL||process.env.TEST_URL;const server=external?null:spawn('python3',['-m','http.server','4191','--bind','127.0.0.1'],{cwd:path.resolve(__dirname,'..'),stdio:'ignore'});let browser;
try{await new Promise(r=>setTimeout(r,500));browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
const url=external||'http://127.0.0.1:4191';const results=[];
const vis=(p,sel)=>p.$eval(sel,e=>getComputedStyle(e).visibility==='visible'&&+getComputedStyle(e).opacity>0.5);
for(const width of (process.env.WIDTHS?process.env.WIDTHS.split(",").map(Number):[390,1365])){
 for(const reduced of [false,true]){
  const ctx=await browser.newContext({viewport:{width,height:844},reducedMotion:reduced?'reduce':'no-preference',hasTouch:width<500});
  const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{try{localStorage.setItem('ngorongoro-chrome-pin','1')}catch(e){}});
  await p.goto(url);await p.waitForSelector('#veil.gone',{timeout:15000});await p.waitForTimeout(3600);
  assert.equal(await p.$eval('#pin-controls',e=>e.getAttribute('aria-pressed')),'true');
  assert.ok(await vis(p,'#dock'),'pinned dock stays');assert.ok(await vis(p,'#audio-orb'),'orbs stay');
  await p.click('#audio-orb');await p.waitForTimeout(300);assert.equal(await p.$eval('#audio-orb',e=>e.getAttribute('aria-pressed')),'true','sound opt-in toggles');await p.click('#audio-orb');assert.equal(await p.$eval('#audio-orb',e=>e.getAttribute('aria-pressed')),'false');
  {const b=await p.$eval('canvas',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}});await p.mouse.move(b.x+b.w*.5,b.y+b.h*.3);await p.mouse.down();await p.mouse.move(b.x+b.w*.8,b.y+b.h*.35,{steps:4});await p.mouse.up();await p.waitForSelector('#reset-orb:not([hidden])');await p.click('#reset-orb');await p.waitForTimeout(400);}
  assert.equal((await p.$$('.dot')).length,4);
  for(let i=0;i<4;i++){await p.click(`.dot[data-scene="${i}"]`);await p.waitForTimeout(500);assert.equal(await p.$eval(`.dot[data-scene="${i}"]`,e=>e.getAttribute('aria-current')),'true');
   if(width===390||i===3)await p.screenshot({path:`${out}/${width}-${reduced}-pinned-${i}.png`});}
  await p.click('.dot[data-scene="0"]');await p.focus('.dot[data-scene="0"]');await p.keyboard.press('ArrowRight');await p.waitForTimeout(300);
  assert.equal(await p.$eval('.dot[data-scene="1"]',e=>e.getAttribute('aria-current')),'true','arrow steps');
  await p.keyboard.press('Escape');await p.waitForTimeout(500);assert.ok(await vis(p,'#dock'),'escape leaves pinned chrome');
  await p.click('#pin-controls');assert.equal(await p.$eval('#pin-controls',e=>e.getAttribute('aria-pressed')),'false');
  assert.equal(await p.evaluate(()=>localStorage.getItem('ngorongoro-chrome-pin')),null);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow');
  const sizes=await p.$$eval('button span, #caption, .wordmark-small',els=>els.filter(e=>+getComputedStyle(e).opacity>0).map(e=>parseFloat(getComputedStyle(e).fontSize)));assert.ok(Math.min(...sizes)>=14,'font floor '+sizes);
  assert.deepEqual(errors,[]);await p.close();
  const q=await ctx.newPage();q.on('pageerror',e=>errors.push(e.message));await q.goto(url);await q.waitForSelector('#veil.gone',{timeout:15000});
  await q.waitForTimeout(900);await q.screenshot({path:`${out}/${width}-${reduced}-greeting.png`});
  await q.waitForTimeout(3800);
  for(const s of ['#dock','#masthead','#orbs']) assert.ok(await q.$eval(s,e=>getComputedStyle(e).visibility==='hidden'),s+' retired');
  assert.ok(await vis(q,'#hint'),'hint shows');
  assert.ok(await q.$eval('#caption',e=>+getComputedStyle(e).opacity)>0.9,'caption stays');
  await q.screenshot({path:`${out}/${width}-${reduced}-quiet.png`});
  if(width>500){await q.mouse.move(600,820);await q.waitForTimeout(500);assert.ok(await vis(q,'#dock'),'bottom edge wakes');await q.mouse.move(600,300);await q.waitForTimeout(3300);assert.ok(await q.$eval('#dock',e=>getComputedStyle(e).visibility==='hidden'),'re-retires');}
  await q.click('#hint',{force:true});await q.waitForTimeout(350);assert.ok(await vis(q,'#dock'),'hint wakes');
  await q.evaluate(()=>document.querySelector('#pin-controls').click());await q.screenshot({path:`${out}/${width}-${reduced}-woken.png`});await q.waitForTimeout(3300);assert.ok(await vis(q,'#dock'),'pin holds');
  assert.equal(await q.evaluate(()=>localStorage.getItem('ngorongoro-chrome-pin')),'1');
  assert.deepEqual(errors,[]);results.push({width,reduced,ok:true});await ctx.close();}}
fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({url,results},null,2));console.log('PASS',JSON.stringify(results));
}finally{if(browser)await browser.close();if(server){server.kill();await new Promise(r=>server.once('exit',r));}}})().catch(e=>{console.error(e);process.exitCode=1});
