"""Turns an IMDb watchlist export (.csv) uploaded to this repo into imdb.json for play.tv."""
import csv, glob, json, os, subprocess, time


def added(path):
    # Most recently committed CSV wins (file times are reset on checkout).
    out = subprocess.run(['git', 'log', '-1', '--format=%ct', '--', path], capture_output=True, text=True).stdout.strip()
    return int(out or 0)


files = sorted(glob.glob('**/*.csv', recursive=True), key=added)
if not files:
    raise SystemExit('No CSV uploaded')
items, seen = [], set()
with open(files[-1], encoding='utf-8-sig', newline='') as f:
    for r in csv.DictReader(f):
        tid = (r.get('Const') or '').strip()
        if not tid.startswith('tt') or tid in seen:
            continue
        seen.add(tid)
        kind = 'series' if 'series' in (r.get('Title Type') or '').lower() else 'movie'
        try:
            year = int((r.get('Year') or '0')[:4])
        except ValueError:
            year = 0
        items.append({'id': tid, 'title': r.get('Title', ''), 'orig': r.get('Original Title', ''),
                      'year': year, 'kind': kind, 'img': ''})
url = open('imdb-url.txt').read().strip()
with open('imdb.json', 'w') as f:
    json.dump({'url': url, 'at': int(time.time() * 1000), 'source': os.path.basename(files[-1]), 'items': items}, f, indent=1)
print(len(items), 'titles from', files[-1])
