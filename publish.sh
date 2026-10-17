#!/bin/sh
# Copy a quiz site into this repo: ./publish.sh <source-quiz-dir> <course>/<exam>
set -e
src="$1"; dst="$(dirname "$0")/$2"
[ -f "$src/index.html" ] && [ -n "$2" ] || { echo "usage: $0 <quiz-dir> <course>/<exam>"; exit 1; }
rm -rf "$dst"; mkdir -p "$dst"
cp -R "$src/index.html" "$src/assets" "$src/data" "$dst/"
echo "synced $src -> $dst (remember to list it in index.html QUIZZES)"
