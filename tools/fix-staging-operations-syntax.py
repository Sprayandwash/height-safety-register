from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("Usage: fix-staging-operations-syntax.py <operations-v4.js>")

path = Path(sys.argv[1])
s = path.read_text(encoding="utf-8")

# A prior staging Vehicle Checks patch was generated through re.sub with a
# replacement string containing escaped newlines. re.sub interpreted the
# backslashes and produced a literal newline inside the single-quoted Notes
# string, making the whole Operations module fail to parse.
b