import json, subprocess, os, sys
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G="/usr/share/fonts/truetype/sand-box/google/"
TF=G+"Cinzel/Cinzel-VariableFont_wght.ttf"
VF=G+"Cormorant Garamond/CormorantGaramond-Italic-VariableFont_wght.ttf"
RF=G+"Cormorant Garamond/CormorantGaramond-VariableFont_wght.ttf"
stories=json.load(open(f"{ROOT}/scripts/stories.json"))
tmp=f"{ROOT}/scripts/tmp"; os.makedirs(tmp,exist_ok=True)
W,H,D=720,1280,18
only=sys.argv[1:]
from PIL import ImageFont
def tsize(t):
    w=ImageFont.truetype(TF,36).getlength(t)
    return int(min(56,36*500/w))

for s in stories:
    if only and s["id"] not in only: continue
    sid=s["id"]
    out=f"{ROOT}/public/videos/{sid}.mp4"
    def tf(name,txt):
        p=f"{tmp}/{sid}-{name}.txt"; open(p,"w").write(txt); return p
    # segments: title 0-4.5, cards at 4.5, 9, 13.5 each 4.5s
    def alpha(a,b): return f"if(lt(t,{a}),0,if(lt(t,{a+0.8}),(t-{a})/0.8,if(lt(t,{b-0.8}),1,if(lt(t,{b}),({b}-t)/0.8,0))))"
    dt=[]
    dt.append(f"drawtext=fontfile='{RF}':textfile='{tf('kicker','A BIBLE STORY')}':fontsize=26:fontcolor=0xd8b56a:x=(w-tw)/2:y=h*0.27:alpha='{alpha(0.3,4.6)}'")
    dt.append(f"drawtext=fontfile='{TF}':textfile='{tf('title',s['title'])}':fontsize={tsize(s['title'])}:fontcolor=0xf3e2b8:x=(w-tw)/2:y=h*0.31:alpha='{alpha(0.5,4.6)}':shadowcolor=black@0.7:shadowx=2:shadowy=2")
    dt.append(f"drawtext=fontfile='{RF}':textfile='{tf('ref',s['ref']+'  ·  KJV')}':fontsize=30:fontcolor=0xcfae6d:x=(w-tw)/2:y=h*0.39:alpha='{alpha(1.0,4.6)}'")
    for i,(txt,ref) in enumerate(s["cards"]):
        a=4.5+i*4.5; b=a+4.5 if i<2 else D
        dt.append(f"drawtext=fontfile='{VF}':textfile='{tf(f'c{i}',txt)}':fontsize=40:line_spacing=14:fontcolor=0xf6ead0:x=(w-tw)/2:y=h*0.36-th/2:alpha='{alpha(a+0.2,b-0.1)}':shadowcolor=black@0.8:shadowx=2:shadowy=2:text_align=center")
        dt.append(f"drawtext=fontfile='{RF}':textfile='{tf(f'r{i}','— '+ref)}':fontsize=32:fontcolor=0xd8b56a:x=(w-tw)/2:y=h*0.50:alpha='{alpha(a+0.6,b-0.1)}'")
    vf=(f"[0:v]format=yuv420p,"
        f"zoompan=z='1.0+0.0006*on':x='iw/2-(iw/zoom/2)+on*0.25':y='ih/2-(ih/zoom/2)':d={D*30}:s={W}x{H}:fps=30,"
        f"eq=brightness='0.035*sin(t*6.3)+0.02*sin(t*14.7)+0.015*sin(t*23.1)':eval=frame,"
        + ",".join(dt) + f",fade=in:st=0:d=0.8,fade=out:st={D-1}:d=1[v]")
    bg=(f"gradients=s=1080x1920:c0={s['c1'].replace('#','0x')}:c1={s['c2'].replace('#','0x')}:c2=0x1a0d05:c3=0x000000:n=4:x0=540:y0=1500:x1=540:y1=200:d=1:speed=0.0001:type=radial")
    audio=f"aevalsrc='0.05*sin(2*PI*110*t)*(0.6+0.4*sin(2*PI*0.2*t))+0.035*sin(2*PI*164.8*t)+0.02*sin(2*PI*220*t)':s=44100:d={D}"
    cmd=["ffmpeg","-y","-loglevel","error","-i",f"{tmp}/bg-{sid}.png",
         "-f","lavfi","-i",audio,
         "-filter_complex",vf+f";[1:a]afade=in:d=1.5,afade=out:st={D-2}:d=2,volume=0.8[a]",
         "-map","[v]","-map","[a]","-t",str(D),"-c:v","libx264","-preset","veryfast","-crf","23","-pix_fmt","yuv420p",
         "-c:a","aac","-b:a","96k","-movflags","+faststart",out]
    # gradients source is animated; take one frame then zoompan generates motion
    r=subprocess.run(cmd); print(sid, r.returncode, flush=True)
    subprocess.run(["ffmpeg","-y","-loglevel","error","-ss","10","-i",out,"-frames:v","1","-q:v","4",f"{ROOT}/public/posters/{sid}.jpg"])
