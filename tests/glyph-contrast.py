from PIL import Image
import numpy as np,json,glob,os

def lum(v):
 v=v/255.;v=np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
 return v[...,0]*.2126+v[...,1]*.7152+v[...,2]*.0722
root=os.environ.get('OUT','docs/contrast/local')
out=[]
for f in glob.glob(root+'/records-*.json'):
 for rec in json.load(open(f)):
  p=rec['prefix'];ims={k:np.asarray(Image.open(p+'-'+k+'.png').convert('RGB')).astype(float) for k in ['original','backdrop','black','white']}
  for e in rec['els']:
   r=e['rect'];dpr=ims['original'].shape[1]/rec['w'];x=max(0,int(r['x']*dpr));y=max(0,int(r['y']*dpr));x2=min(ims['original'].shape[1],int((r['x']+r['width'])*dpr));y2=min(ims['original'].shape[0],int((r['y']+r['height'])*dpr))
   sl=(slice(y,y2),slice(x,x2));mask=np.min(ims['white'][sl]-ims['black'][sl],axis=2);peak=mask.max() if mask.size else 0
   if peak<10:
    out.append({'w':rec['w'],'ch':rec['ch'],'selector':e['sel'],'status':'not-visible'});continue
   # Only solid glyph cores, not antialiased edge pixels. Preserve actual computed CSS ink.
   ink=np.array([int(t) for t in e['ink'].removeprefix('rgb(').removesuffix(')').split(',')]);bg=ims['backdrop'][sl]
   L=lum(bg);Li=lum(ims['original'][sl]);ratio=(np.maximum(L,Li)+.05)/(np.minimum(L,Li)+.05)
   core=mask>=peak*.95
   out.append({'w':rec['w'],'ch':rec['ch'],'selector':e['sel'],'corePixels':int(core.sum()),'worstContrast':round(float(ratio[core].min()),3),'pass':bool(np.all(ratio[core]>=4.5))})
print(json.dumps(out,indent=1));json.dump(out,open(root+'/contrast-results.json','w'),indent=1)

assert out and all(x.get("pass",False) for x in out), "Missing/failed glyph contrast sample"
