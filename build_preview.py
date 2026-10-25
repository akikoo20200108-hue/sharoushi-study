# プレビュー用: index.html の <body> 中身に CSS/JS をインライン化して preview/index.html を生成
import re, os
src = open("index.html", encoding="utf-8").read()
body = re.search(r"<body>(.*)</body>", src, re.S).group(1)
body = re.sub(r'<script src="plan.js"></script>\s*<script src="app.js"></script>', "", body)
css = open("style.css", encoding="utf-8").read()
plan = open("plan.js", encoding="utf-8").read()
app = open("app.js", encoding="utf-8").read()
out = f"""<title>社労士2027 学習ナビ</title>
<style>
html, body {{ height: 100%; }}
{css}
</style>
{body}
<script>
{plan}
</script>
<script>
{app}
</script>
"""
os.makedirs("preview", exist_ok=True)
open("preview/index.html", "w", encoding="utf-8").write(out)
print("preview/index.html", len(out), "bytes")
