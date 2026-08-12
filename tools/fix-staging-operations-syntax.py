from pathlib import Path
import re
import sys

if len(sys.argv) != 2:
    raise SystemExit("Usage: fix-staging-operations-syntax.py <operations-v4.js>")

path = Path(sys.argv[1])
s = path.read_text(encoding="utf-8")

# A prior staging Vehicle Checks replacement turned intended \\n sequences in
# the task description into physical line breaks. The line break after the
# opening single quote in source.notes ? '...' makes operations-v4.js fail to
# parse, so the entire Operations module never boots.
pattern = re.compile(
    r"description:`\$\{source\.item\.question_text\}.*?Answer:\s*\$\{source\.answer\}\$\{source\.notes\?'?.*?Notes:\s*'\+source\.notes:''\}`",
    re.S,
)
replacement = r"description:`${source.item.question_text}\nAnswer: ${source.answer}${source.notes?'\nNotes: '+source.notes:''}`"

s2, count = pattern.subn(lambda _m: replacement, s, count=1)
if count != 1:
    raise SystemExit(f"Expected to repair exactly one malformed task description; repaired {count}")

path.write_text(s2, encoding="utf-8")

text = path.read_text(encoding="utf-8")
expected = r"description:`${source.item.question_text}\nAnswer: ${source.answer}${source.notes?'\nNotes: '+source.notes:''}`"
if expected not in text:
    raise SystemExit("Repaired task-description verification failed")

print("Repaired malformed Vehicle Checks task-description JavaScript.")
