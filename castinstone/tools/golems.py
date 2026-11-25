from PIL import Image, ImageDraw, ImageFont
import json, math
W, H = 21, 21
EL = {'fire':(255,122,47),'water':(63,169,255),'earth':(200,154,74),'lightning':(255,242,122)}
STONE = {'h':(214,206,192),'m':(150,143,138),'d':(96,90,94),'s':(52,44,54),'k':(20,16,24),'g':(122,172,150)}
EMPTY_GLOW = (58,30,34)

def ell(cx,cy,rx,ry): return lambda x,y: ((x+.5-cx)/rx)**2+((y+.5-cy)/ry)**2 <= 1
def rect(x0,y0,x1,y1): return lambda x,y: x0<=x<=x1 and y0<=y<=y1
def tri(ax,ay,bx,by,cx,cy):
    def f(x,y):
        px,py=x+.5,y+.5
        d=lambda x1,y1,x2,y2:(px-x2)*(y1-y2)-(x1-x2)*(py-y2)
        a,b,c=d(ax,ay,bx,by),d(bx,by,cx,cy),d(cx,cy,ax,ay)
        return not((a<0 or b<0 or c<0) and (a>0 or b>0 or c>0))
    return f

def build(parts, feats):
    grid=[[None]*W for _ in range(H)]
    for pid,(shape,kind) in enumerate(parts):
        for y in range(H):
            for x in range(W):
                if shape(x-1,y-1): grid[y][x]=(pid,kind)
    boxes={}
    for y in range(H):
        for x in range(W):
            g=grid[y][x]
            if g: b=boxes.get(g[0],(x,y,x,y)); boxes[g[0]]=(min(b[0],x),min(b[1],y),max(b[2],x),max(b[3],y))
    out=[['.']*W for _ in range(H)]
    filled=lambda x,y: 0<=x<W and 0<=y<H and grid[y][x] is not None
    for y in range(H):
        for x in range(W):
            g=grid[y][x]
            if g is None:
                if any(filled(x+dx,y+dy) for dx,dy in((1,0),(-1,0),(0,1),(0,-1))): out[y][x]='k'
                continue
            pid,kind=g
            if kind!='stone': out[y][x]=kind; continue
            same=lambda dx,dy: filled(x+dx,y+dy) and grid[y+dy][x+dx][0]==pid
            other=lambda dx,dy: filled(x+dx,y+dy) and grid[y+dy][x+dx][0]!=pid and grid[y+dy][x+dx][1]=='stone'
            bx0,by0,bx1,by1=boxes[pid]
            v=((y-by0)/max(1,by1-by0))*0.75+((x-bx0)/max(1,bx1-bx0))*0.25
            if other(1,0) or other(0,1): out[y][x]='s'
            elif not same(0,-1): out[y][x]='h'
            elif not same(0,1) or not same(1,0) or v>0.68: out[y][x]='d'
            elif not same(-1,0) or v<0.3: out[y][x]='h' if v<0.45 else 'm'
            else: out[y][x]='m'
    for (x,y),ch in feats.items(): out[y+1][x+1]=ch
    rows=[''.join(r) for r in out]
    while rows and set(rows[0])=={'.'}: rows.pop(0)
    while rows and set(rows[-1])=={'.'}: rows.pop()
    return rows

designs = {}
# 1 Brute: tiny sunk head, huge shoulder boulders, fists near the ground
designs['1  Brute'] = (build([
  (ell(6.5,17,2.2,3),'stone'), (ell(12.5,17,2.2,3),'stone'),
  (ell(9.5,11.5,5.5,5),'stone'),
  (ell(3,10,3,4.2),'stone'), (ell(16,10,3,4.2),'stone'),
  (ell(2.6,15.5,2.7,3),'stone'), (ell(16.4,15.5,2.7,3),'stone'),
  (ell(4.5,6.5,3.6,2.8),'stone'), (ell(14.5,6.5,3.6,2.8),'stone'),
  (ell(9.5,6.6,2.5,2.4),'stone'),
], {(8,6):'L',(10,6):'R',(9,11):'c',(10,12):'c',(10,10):'c',(9,13):'c',(4,4):'g',(5,4):'g',(15,4):'g'}),
 'Huge shoulders and fists, head sunk between them; eyes are the slots')
# 2 Titan: V-shaped torso, broad chest, glowing crack down the middle
designs['2  Titan'] = (build([
  (ell(7,17,2,3),'stone'), (ell(12,17,2,3),'stone'),
  (ell(9.5,14,3.2,2.2),'stone'),
  (tri(2.5,6.5,16.5,6.5,9.5,14.5),'stone'),
  (ell(2.6,10,2.2,3.6),'stone'), (ell(16.4,10,2.2,3.6),'stone'),
  (ell(2.4,15,2.4,2.6),'stone'), (ell(16.6,15,2.4,2.6),'stone'),
  (ell(4,6,2.6,2),'stone'), (ell(15,6,2.6,2),'stone'),
  (ell(9.5,3.8,2.3,2.4),'stone'),
], {(8,3):'L',(10,3):'R',(9,8):'c',(9,9):'c',(10,10):'c',(9,11):'c',(9,12):'c',(3,4):'g',(16,4):'g',(15,4):'g'}),
 'Wide V-shaped chest, small head; glowing crack down the middle')
# 3 Crystal back: hunched boulder with two crystals on its back
designs['3  Crystal'] = (build([
  (tri(3,7,6,0,8,7),'L'), (tri(7,6,10,1,12,7),'R'),
  (ell(7.5,16.5,2,3),'stone'), (ell(12.5,16.5,2,3),'stone'),
  (ell(9,10.5,6.5,5.2),'stone'),
  (ell(15,9,2.8,3.6),'stone'), (ell(16,14.5,2.8,3.4),'stone'),
  (ell(3.5,13,2.4,3.2),'stone'),
  (ell(14.5,5.5,3,2.6),'stone'),
], {(15,5):'e',(16,5):'e',(9,11):'c',(10,12):'c',(8,12):'c',(2,11):'g',(3,10):'g'}),
 'Hunched boulder; two crystals on its back are the slots')
# 4 Sentinel: helmeted head with a visor slit, flat shoulder plates
designs['4  Sentinel'] = (build([
  (rect(6,15,8,19),'stone'), (rect(11,15,13,19),'stone'),
  (ell(9.5,11,5,5),'stone'),
  (rect(1,6,6,8),'stone'), (rect(13,6,18,8),'stone'),
  (ell(3,12,2.2,3.5),'stone'), (ell(16,12,2.2,3.5),'stone'),
  (ell(3,16,2.4,2.2),'stone'), (ell(16,16,2.4,2.2),'stone'),
  (ell(9.5,4.5,3.4,3.6),'stone'),
], {(8,4):'L',(9,4):'L',(10,4):'R',(11,4):'R',(9,11):'c',(10,10):'c',(9,12):'c',(2,6):'g',(3,6):'g',(17,6):'g'}),
 'Helm with a glowing visor; flat shoulder plates')

json.dump({k:v[0] for k,v in designs.items()}, open('golems.json','w'))
S=7; combos=[(None,None),('fire','water'),('earth','lightning')]
img=Image.new('RGB',(2400,360),(20,16,31)); dr=ImageDraw.Draw(img)
font=ImageFont.load_default(size=22); small=ImageFont.load_default(size=15)
def colour(ch,a,b):
    ea=EL[a] if a else None; eb=EL[b] if b else None
    if ch=='L': return ea or EMPTY_GLOW
    if ch=='R': return eb or EMPTY_GLOW
    if ch=='c': return tuple((p+q)//2 for p,q in zip(ea,eb)) if ea and eb else STONE['s']
    if ch=='e': return (255,236,196) if a else (240,226,200)
    return STONE[ch]
x0=30
for name,(rows,note) in designs.items():
    dr.text((x0,16),name,fill=(239,230,216),font=font); dr.text((x0,46),note,fill=(184,172,154),font=small)
    for j,(a,b) in enumerate(combos):
        ox=x0+j*(W*S+16); oy=100
        dr.rectangle([ox-4,oy+H*S,ox+W*S+4,oy+H*S+14],fill=(132,84,100)); dr.rectangle([ox-4,oy+H*S,ox+W*S+4,oy+H*S+3],fill=(178,126,140))
        off=H-len(rows)
        for y,row in enumerate(rows):
            for x,ch in enumerate(row):
                if ch=='.': continue
                X=ox+x*S; Y=oy+(y+off)*S; dr.rectangle([X,Y,X+S-1,Y+S-1],fill=colour(ch,a,b))
        dr.text((ox,oy+H*S+22),'empty' if not a else f'{a[0].upper()}+{b[0].upper()}',fill=(138,127,113),font=small)
    gx=x0+3*(W*S+16); gy=170
    dr.text((gx,gy-42),'game\nsize',fill=(138,127,113),font=small)
    for y,row in enumerate(rows):
        for x,ch in enumerate(row):
            if ch!='.': dr.rectangle([gx+x*4,gy+y*4,gx+x*4+3,gy+y*4+3],fill=colour(ch,'fire','water'))
    x0=gx+W*4+50
img.crop((0,0,x0,360)).save('golems.png'); print(x0)
