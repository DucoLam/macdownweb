import struct,re,sys
binp,objc,dis,out=sys.argv[1:5]
data=open(binp,'rb').read()
# parse load commands for segments
ncmds=struct.unpack_from('<I',data,16)[0]
off=32; segs=[]
for _ in range(ncmds):
    cmd,size=struct.unpack_from('<II',data,off)
    if cmd==0x19:
        segname=data[off+8:off+24].rstrip(b'\0').decode()
        vmaddr,vmsize,fileoff,filesize=struct.unpack_from('<QQQQ',data,off+24)
        nsects=struct.unpack_from('<I',data,off+64)[0]
        segs.append((vmaddr,vmsize,fileoff))
        so=off+72
        for i in range(nsects):
            sn=data[so:so+16].rstrip(b'\0').decode()
            addr,sz=struct.unpack_from('<QQ',data,so+32)
            if sn=='__cfstring': cf=(addr,sz)
            so+=80
    off+=size
def v2o(a):
    for vm,vs,fo in segs:
        if vm<=a<vm+vs: return a-vm+fo
def cstr(a):
    o=v2o(a);
    if o is None: return None
    e=data.index(b'\0',o); return data[o:e].decode('utf8','replace')
cfmap={}
a,sz=cf
for p in range(a,a+sz,32):
    o=v2o(p); isa,flags,ptr,ln=struct.unpack_from('<QQQQ',data,o)
    ptr&=0xffffffffff
    if flags&0x7d0==0x7d0 or True:
        o2=v2o(ptr)
        if o2 is None: continue
        if flags==0x7d0 or flags&0xff==0xc8:
            s=data[o2:o2+ln].decode('utf8','replace')
        else:
            try: s=data[o2:o2+2*ln].decode('utf-16-le')
            except: s='?'
        cfmap[p]=s
# method labels
labels={}
cls=None; meta=False
for line in open(objc):
    m=re.match(r'\s*name\s+0x[0-9a-f]+\s+(\S+)',line)
    if re.match(r'^\s{0,4}name\s',line) or re.search(r'^\s+data\s',line): pass
    m2=re.match(r'^ {8}name\s+0x[0-9a-f]+\s+(\S+)$',line)
    if m2: cls=m2.group(1)
    if 'Meta Class' in line: meta=True
    if re.match(r'^[0-9a-f]{16} 0x',line): meta=False
    mm=re.match(r'^ {12}name\s+0x[0-9a-f]+\s+(\S+)$',line)
    if mm: last=mm.group(1)
    mi=re.match(r'^\s+imp\s+0x([0-9a-f]+)',line)
    if mi: labels[int(mi.group(1),16)]=('%s[%s %s]'%('+' if meta else '-',cls,last))
o=open(out,'w')
for line in open(dis):
    m=re.match(r'^([0-9a-f]{16})\t',line)
    if m:
        ad=int(m.group(1),16)
        if ad in labels: o.write('\n'+labels[ad]+':\n')
        if 'bad cfstring ref' in line:
            mm=re.search(r'leaq\t(-?0x[0-9a-f]+)\(%rip\)',line)
            # rip = next instr; approximate with instr len 7
            if mm:
                tgt=ad+7+int(mm.group(1),16)
                line=line.replace('"bad cfstring ref"',repr(cfmap.get(tgt,'??%x'%tgt)))
    o.write(line)
