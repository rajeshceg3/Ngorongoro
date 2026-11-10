const {chromium}=require('playwright'),fs=require('fs');
(async()=>{
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--hide-scrollbars']});
const root=process.env.OUT||'docs/contrast/local';fs.mkdirSync(root,{recursive:true});
const records=[];
for(const [w,h] of JSON.parse(process.env.SIZES||'[[390,844]]'))for(const ch of JSON.parse(process.env.CHAPTERS||'[0,1,2,3]')){
 const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:w<600?2:1,reducedMotion:'reduce'});
 await p.goto(process.env.BASE_URL||'http://127.0.0.1:8785/');await p.waitForSelector('#veil.gone');
 if(ch)await p.click(`[data-scene="${ch}"]`);
 await p.waitForFunction(()=>document.querySelector('#whisper').classList.contains('show'));
 await new Promise(r=>setTimeout(r,6000));
 await p.mouse.click(15,150); // wake chrome without dragging
 await p.addStyleTag({content:'*{transition:none!important}.chrome{opacity:1!important}'});
 await p.evaluate(()=>{window.requestAnimationFrame=()=>0;});
 await new Promise(r=>setTimeout(r,300));
 const prefix=`${root}/${w}-${ch}`;
 const els=await p.evaluate(()=>['#caption','#whisper','.wordmark-small',...Array.from({length:4},(_,i)=>`[data-scene="${i}"] span`)].map((sel,i)=>{const e=document.querySelector(sel),r=e.getBoundingClientRect(),c=getComputedStyle(e); e.setAttribute('data-contrast-id',i);return {sel,i,rect:{x:r.x,y:r.y,width:r.width,height:r.height},ink:c.color,opacity:c.opacity,font:c.fontSize};}));
 await p.screenshot({path:prefix+'-original.png'});
 const st=await p.addStyleTag({content:'[data-contrast-id]{color:transparent!important;text-shadow:none!important}'});await p.screenshot({path:prefix+'-backdrop.png'});
 await st.evaluate(e=>e.textContent='[data-contrast-id]{color:#000!important;text-shadow:none!important}');await p.screenshot({path:prefix+'-black.png'});
 await st.evaluate(e=>e.textContent='[data-contrast-id]{color:#fff!important;text-shadow:none!important}');await p.screenshot({path:prefix+'-white.png'});
 records.push({w,h,ch,prefix,els});let previous=[];try{previous=JSON.parse(fs.readFileSync(root+`/records-${w}.json`))}catch{};previous=previous.filter(r=>r.ch!==ch);previous.push({w,h,ch,prefix,els});fs.writeFileSync(root+`/records-${w}.json`,JSON.stringify(previous,null,2));await p.close();
}
fs.writeFileSync(root+'/records.json',JSON.stringify(records,null,2));await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
