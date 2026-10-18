import re,struct,sys
import os
data=open(os.path.expanduser('~/Downloads/MacDown.app/Contents/MacOS/MacDown'),'rb').read()
pat=sys.argv[1]; p=False; lines=open(sys.argv[2]).read().split('\n')
for i,l in enumerate(lines):
    if re.match(r'^[-+]\[',l): p = pat in l; 
    if p and 'movsd' in l and '(%rip)' in l:
        ad=int(l.split('\t')[0],16)
        nxt=int(lines[i+1].split('\t')[0],16)
        disp=int(re.search(r'(-?0x[0-9a-f]+)\(%rip\)',l).group(1),16)
        a=nxt+disp
        print(hex(ad), struct.unpack_from('<d',data,a-0x100000000)[0], lines[i-1].split('##')[-1] if '##' in lines[i-1] else '', '|', lines[i+1].split('##')[-1] if '##' in lines[i+1] else '')
