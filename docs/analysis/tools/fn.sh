#!/bin/sh
# usage: fn.sh 'pattern'  -> condensed body of matching methods
awk -v pat="$1" '
/^[-+]\[/ { p = (index($0, pat) > 0); if (p) print "\n=== " $0; next }
p && /(selector ref|cfstring ref|literal pool for|\$0x[0-9a-f]+, %e|\$0x[0-9a-f]+, %r|movsd|callq.*stub)/ {
  sub(/^[0-9a-f]+\t/, ""); gsub(/\t+/, " "); print "  " $0 }
' docs/analysis/disasm-annotated.txt
