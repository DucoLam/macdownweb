import plistlib,sys
from plistlib import UID
path=sys.argv[1]
d=plistlib.load(open(path,'rb'))
O=d['$objects']
def r(x):
    return O[x.data] if isinstance(x,UID) else x
def cls(o):
    if isinstance(o,dict) and '$class' in o: return r(o['$class'])['$classname']
    return type(o).__name__
def s(x):
    o=r(x)
    if isinstance(o,dict):
        if 'NS.string' in o: return o['NS.string']
        if 'NS.bytes' in o: return o['NS.bytes'].decode('utf8','replace')
        if 'NSClassName' in o: return '<'+str(r(o['NSClassName']))+'>'
        if 'NS.objects' in o: return [s(i) for i in o['NS.objects']]
        return None
    return o
def mods(m):
    out=''
    if m & (1<<18): out+='Ctrl+'
    if m & (1<<19): out+='Opt+'
    if m & (1<<17): out+='Shift+'
    if m & (1<<20): out+='Cmd+'
    return out
# connections
conns=r(r(d['$objects'][1]['NSConnections'])['NS.objects']) if False else [r(c) for c in r(O[1]['NSConnections'])['NS.objects']]
actions={}
bindings=[]
for c in conns:
    k=cls(c)
    if k=='NSNibControlConnector':
        actions.setdefault(c['NSSource'].data,[]).append((s(c['NSLabel']), s(c.get('NSDestination')) if 'NSDestination' in c else 'FirstResponder'))
    elif k=='NSNibBindingConnector':
        src=r(c['NSSource'])
        bindings.append((c['NSSource'].data, cls(src), s(c['NSBinding']), s(c['NSKeyPath']), s(c['NSDestination']) if 'NSDestination' in c else None, c))
    elif k=='NSNibOutletConnector':
        pass
def desc(i):
    o=O[i]; k=cls(o)
    t=None
    for key in ('NSTitle','NSContents','NSText'):
        if isinstance(o,dict) and key in o: t=s(o[key])
    if isinstance(o,dict) and 'NSCell' in o:
        cc=r(o['NSCell'])
        for key in ('NSContents','NSTitle'):
            if key in cc: t=s(cc[key])
    return k,t
mode=sys.argv[2] if len(sys.argv)>2 else 'menu'
if mode=='menu':
    seen=set()
    def walk(menu,depth):
        for it in r(menu['NSMenuItems'])['NS.objects']:
            o=r(it)
            if o.get('NSIsSeparator'): print('  '*depth+'----'); continue
            ke=s(o.get('NSKeyEquiv')) or ''
            m=o.get('NSKeyEquivModMask',0)
            sc=(mods(m)+repr(ke)) if ke else ''
            act=actions.get(it.data,'')
            hidden=' HIDDEN' if o.get('NSIsHidden') else ''
            alt=' ALT' if o.get('NSIsAlternate') else ''
            tag=' tag=%s'%o['NSTag'] if o.get('NSTag') else ''
            print('  '*depth+'%s  [%s]  %s%s%s%s'%(s(o['NSTitle']),sc,act,hidden,alt,tag))
            if 'NSSubmenu' in o:
                sub=r(o['NSSubmenu'])
                if id(sub) in seen: continue
                seen.add(id(sub)); walk(sub,depth+1)
    # find main menu: NSMenu with NSName _NSMainMenu
    for i,o in enumerate(O):
        if cls(o)=='NSMenu' and s(o.get('NSName'))=='_NSMainMenu':
            walk(o,0)
else:
    for src,k,b,kp,dest,c in bindings:
        print(k, desc(src)[1], '|', b, '->', kp, '@', dest)
    print('=== actions')
    for src,a in actions.items():
        print(desc(src), a)
