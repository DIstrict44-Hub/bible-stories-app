import numpy as np, json, os
from PIL import Image, ImageFilter
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W,H=1080,1920
def hexc(h): h=h.lstrip('#'); return np.array([int(h[i:i+2],16) for i in (0,2,4)],float)/255
yy,xx=np.mgrid[0:H,0:W].astype(float)
def make(sid,c1,seed):
    rng=np.random.default_rng(seed)
    # masonry
    bh=110; row=(yy//bh).astype(int); off=(row%2)*130
    bw=260; col=((xx+off)//bw).astype(int)
    mort=((yy%bh)<7)|(((xx+off)%bw)<7)
    blockshade=rng.uniform(0.75,1.15,size=(row.max()+2,col.max()+3))[row,col]
    n=rng.normal(0,1,(H//4,W//4)); n=np.array(Image.fromarray(((n*30)+128).clip(0,255).astype(np.uint8)).resize((W,H),Image.BICUBIC).filter(ImageFilter.GaussianBlur(2)),float)/255-0.5
    fine=rng.normal(0,0.05,(H,W))
    stone=(0.34*blockshade+0.25*n+fine); stone[mort]*=0.35
    stone_col=np.stack([stone*0.62,stone*0.50,stone*0.38],-1)
    # arch opening
    cx,top,r=W/2,560,330
    inside=((np.abs(xx-cx)<r)&(yy>top))|(((xx-cx)**2+(yy-top)**2)<r*r)
    rim=(((np.abs(xx-cx)<r+46)&(yy>top))|(((xx-cx)**2+(yy-top)**2)<(r+46)**2))&~inside
    tint=hexc(c1)
    sky=np.clip(1-(yy-200)/1700,0,1)[...,None]*tint*1.1+0.015
    img=stone_col.copy()
    img[inside]=sky[inside]
    img[rim]=img[rim]*0.55+np.array([0.20,0.15,0.10])*0.6
    # firelight from bottom-left and bottom-right torches + center
    def glow(x,y,s,a): return a*np.exp(-((xx-x)**2+(yy-y)**2)/(2*s*s))
    g=glow(W*0.5,H*1.02,520,1.0)+glow(90,1050,200,0.55)+glow(W-90,1050,200,0.55)
    fire=np.array([1.0,0.55,0.18])
    img=img*(0.35+1.1*g[...,None])+g[...,None]*fire*0.35
    # torch flames
    for tx in (90,W-90):
        f=glow(tx,1010,26,1)+glow(tx,980,16,0.8)
        img+=f[...,None]*np.array([1.0,0.75,0.35])
    # vignette
    v=1-0.75*(((xx-cx)/(W*0.75))**2+((yy-H*0.55)/(H*0.7))**2)
    img*=np.clip(v,0.15,1)[...,None]
    Image.fromarray((img.clip(0,1)*255).astype(np.uint8)).save(f"{ROOT}/scripts/tmp/bg-{sid}.png")
for i,s in enumerate(json.load(open(f"{ROOT}/scripts/stories.json"))): make(s["id"],s["c1"],i+7)
