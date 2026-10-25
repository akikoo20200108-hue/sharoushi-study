# -*- coding: utf-8 -*-
"""学習計画データ生成スクリプト
   実行: python gen_plan.py  → plan.js と PLAN.md を出力
"""
import json
from datetime import date, timedelta

START = date(2026, 11, 1)          # 日曜始まり
EXAM = date(2027, 8, 22)
WEEKS = 42
TARGET_HOURS = 12                  # 週あたり目標（10〜15hの中央）

SUBJECTS = {
    "労基": {"name": "労働基準法", "color": "#e76f51"},
    "安衛": {"name": "労働安全衛生法", "color": "#f4a261"},
    "労災": {"name": "労災保険法", "color": "#e9c46a"},
    "雇用": {"name": "雇用保険法", "color": "#8ab17d"},
    "徴収": {"name": "労働保険徴収法", "color": "#2a9d8f"},
    "労一": {"name": "労務管理その他の労働に関する一般常識", "color": "#287271"},
    "健保": {"name": "健康保険法", "color": "#4d96ff"},
    "国年": {"name": "国民年金法", "color": "#6a4c93"},
    "厚年": {"name": "厚生年金保険法", "color": "#9b5de5"},
    "社一": {"name": "社会保険に関する一般常識", "color": "#f15bb5"},
    "全科目": {"name": "全科目", "color": "#555"},
}

PHASES = [
    {"id": 1, "name": "インプット1周目", "weeks": (1, 19),
     "desc": "テキスト通読＋肢別過去問のジグザグ学習で全10科目を1周"},
    {"id": 2, "name": "2周目＋答練", "weeks": (20, 29),
     "desc": "肢別2周目で定着、実力確認答練・過去問マスター答練で実戦力"},
    {"id": 3, "name": "直前対策・穴埋め", "weeks": (30, 37),
     "desc": "選択式特訓・科目横断・法改正・白書、肢別3周目（×印のみ）"},
    {"id": 4, "name": "模試・総仕上げ", "weeks": (38, 42),
     "desc": "模擬試験と総復習、暗記事項の最終確認"},
]

# ---- フェーズ1: 科目割当（週番号→科目） ----
P1 = {}
def assign(sub, w_from, w_to):
    for w in range(w_from, w_to + 1):
        P1[w] = sub
assign("労基", 1, 2)
assign("安衛", 3, 3)
assign("労災", 4, 5)
assign("雇用", 6, 7)
assign("徴収", 8, 8)
assign("健保", 9, 11)
assign("国年", 12, 14)
assign("厚年", 15, 17)
assign("労一", 18, 18)
assign("社一", 19, 19)

# 科目内の週ごとの進め方（n週で割った時の範囲ラベル）
def part_label(idx, total):
    if total == 1:
        return "全範囲"
    return ["前半", "後半", "終盤"][idx] if total <= 3 else f"{idx+1}/{total}"

# ---- フェーズ2: 2周目の科目割当 ----
P2_ROUND2 = {
    20: ["労基", "安衛"], 21: ["労災", "雇用"], 22: ["徴収", "労一"],
    23: ["健保"], 24: ["国年"], 25: ["厚年"], 26: ["社一"],
    27: ["全科目"], 28: ["全科目"], 29: ["全科目"],
}

tasks = []
tid = 0
def add(week, typ, subject, title, hours, detail=""):
    global tid
    tid += 1
    tasks.append({
        "id": f"t{tid:03d}", "week": week, "type": typ, "subject": subject,
        "title": title, "hours": hours, "detail": detail,
    })

def week_range(w):
    s = START + timedelta(days=(w - 1) * 7)
    return s, s + timedelta(days=6)

# 科目ごとの週数（フェーズ1）
from collections import Counter
sub_weeks = Counter(P1.values())
sub_idx = Counter()

for w in range(1, WEEKS + 1):
    s, e = week_range(w)
    phase = next(p for p in PHASES if p["weeks"][0] <= w <= p["weeks"][1])

    if phase["id"] == 1:
        sub = P1[w]
        i = sub_idx[sub]; n = sub_weeks[sub]; sub_idx[sub] += 1
        lbl = part_label(i, n)
        if w == 1:
            add(w, "準備", "全科目", "教材の棚卸し・学習導入オリエンテーション資料を読む", 1,
                "テキスト・肢別過去問集・答練・模試を一覧化。テキストの「改正」アイコンの意味を確認。")
        add(w, "テキスト", sub, f"総合講義テキスト 通読（{lbl}）", 6,
            "映像なしのため、テキストの太字・図表・条文を音読しながら読む。1回目は理解優先、完璧を目指さない。")
        add(w, "肢別", sub, f"肢別過去問集 1周目（{lbl}）", 4,
            "読んだ範囲に対応する肢を解く。正誤に○×△を付け、解説でテキストの該当ページを確認。")
        if i == n - 1 and n > 1:
            add(w, "復習", sub, f"{SUBJECTS[sub]['name']} 間違えた肢の見直し", 1)
        if w >= 2:
            prev = [x for x in range(1, w) if P1[x] != sub]
            if prev:
                add(w, "復習", P1[prev[-1]], "前科目の肢別 ×問だけ再挑戦", 1,
                    "忘却防止。前科目で×だった肢を30分×2回。")
        if w == 9:
            add(w, "その他", "全科目", "年末年始：ペースダウン可。労働科目(労基〜徴収)の目次だけ眺めて思い出す", 1)
        if w == 19:
            add(w, "その他", "全科目", "フェーズ1振り返り：科目別の手応えをアプリにメモ", 0.5)

    elif phase["id"] == 2:
        subs = P2_ROUND2[w]
        for sub in subs:
            if sub == "全科目":
                continue
            add(w, "肢別", sub, f"肢別過去問集 2周目", 5 if len(subs) == 1 else 3,
                "1周目で×△だった肢を優先。正解率を科目別に記録する。")
            add(w, "テキスト", sub, f"テキスト 弱点箇所の読み直し", 2 if len(subs) == 1 else 1)
        if 20 <= w <= 27:
            n = w - 19
            add(w, "答練", "全科目", f"実力確認答練 第{n}回（択一10問＋選択2問）", 2.5,
                "時間を計って解く→解説を読む→間違いはテキストへ戻る。")
        if w == 27:
            add(w, "答練", "全科目", "過去問マスター答練 第1回（本試験形式・70問）", 5,
                "択一3時間30分を本番同様に通しで。")
        if w == 28:
            add(w, "答練", "全科目", "過去問マスター答練 第2回（本試験形式）", 5)
            add(w, "復習", "全科目", "答練で判明した弱点科目を集中補強", 5)
        if w == 29:
            add(w, "答練", "全科目", "過去問マスター答練 第3回（本試験形式）", 5)
            add(w, "復習", "全科目", "答練で判明した弱点科目を集中補強／科目別基準点の危険科目を特定", 5)
        # 受験手続き
        if w == 22:
            add(w, "手続き", "全科目", "【手続き】受験案内の請求（例年3月中旬〜）", 0.5,
                "社会保険労務士試験オフィシャルサイトで2027年度（第59回）の日程を確認。")
        if w == 24:
            add(w, "手続き", "全科目", "【手続き】受験申込（例年4月中旬開始・インターネット申込可）", 1,
                "受験資格の証明書類を事前に準備。")
        if w == 29:
            add(w, "手続き", "全科目", "【手続き】受験申込の締切確認（例年5/31）", 0.2)

    elif phase["id"] == 3:
        add(w, "肢別", "全科目", "肢別過去問集 3周目（×印の肢のみ・全科目ローテーション）", 4,
            "週ごとに2科目ずつ回す。3周連続○の肢は卒業。")
        if w in (30, 31):
            add(w, "特訓", "全科目", f"選択式集中特訓講座 テキスト（{'前半' if w==30 else '後半'}）", 4,
                "空欄補充のコツ：条文のキーワード・数字・判例の言い回しを意識。")
        if w in (32, 33):
            add(w, "特訓", "全科目", f"科目横断整理講座 テキスト（{'前半' if w==32 else '後半'}）", 4,
                "期間・数字・不服申立てなど横断項目を自作の比較表にまとめる。")
        if w == 34:
            add(w, "特訓", "全科目", "法改正対策（※2027年版の教材を別途入手）", 5,
                "2026年版テキストは2027年試験の改正に未対応。アガルート2027年版「法改正対策講座」単科 または 市販の法改正本を使う。")
        if w == 35:
            add(w, "特訓", "労一", "白書対策（※2027年版の教材を別途入手）", 4,
                "厚生労働白書・労働経済白書の数字は最新年度版が必須。")
        if w in (36, 37):
            add(w, "復習", "全科目", "選択式対策：テキストの条文・目的条文を音読＆穴埋め自作", 4)
        if w == 37:
            add(w, "その他", "全科目", "模試の受験日を確定（週38）・当日のタイムテーブルを決める", 0.5)

    else:  # phase 4
        if w == 38:
            add(w, "模試", "全科目", "模擬試験 本番形式で実施（選択80分／択一210分）", 5,
                "開始時刻も本番に合わせる（10:30選択式、13:20択一式）。")
            add(w, "復習", "全科目", "模試の復習：科目別得点と基準点割れを確認", 5)
        if w == 39:
            add(w, "復習", "全科目", "模試で基準点割れした科目の肢別＋テキスト集中", 8)
            add(w, "復習", "全科目", "法改正・白書の再確認", 3)
        if w in (40, 41):
            add(w, "復習", "全科目", f"全科目 総復習（{'労働科目' if w==40 else '社会保険科目'}）", 8,
                "×印の肢・横断整理表・数字暗記カードを回す。")
            add(w, "復習", "全科目", "選択式 目的条文の暗記", 3)
        if w == 42:
            add(w, "復習", "全科目", "直前週：暗記事項の最終確認（数字・期間・目的条文）", 6,
                "新しいことはやらない。")
            add(w, "その他", "全科目", "受験票・持ち物・会場までの経路確認、睡眠リズム調整", 1)

weeks = []
for w in range(1, WEEKS + 1):
    s, e = week_range(w)
    phase = next(p for p in PHASES if p["weeks"][0] <= w <= p["weeks"][1])
    weeks.append({"week": w, "start": s.isoformat(), "end": e.isoformat(), "phase": phase["id"]})

plan = {
    "meta": {
        "title": "社労士 2027年合格 学習計画",
        "start": START.isoformat(), "exam": EXAM.isoformat(),
        "weeks": WEEKS, "targetHoursPerWeek": TARGET_HOURS,
        "course": "アガルート 2026年合格目標 入門総合カリキュラム（フル）／映像講義なし",
        "milestones": [
            {"date": "2027-03-14", "label": "フェーズ2開始（2周目＋答練）"},
            {"date": "2027-04-13", "label": "受験申込 開始（例年・要確認）"},
            {"date": "2027-05-31", "label": "受験申込 締切（例年・要確認）"},
            {"date": "2027-05-23", "label": "フェーズ3開始（直前対策）"},
            {"date": "2027-07-18", "label": "フェーズ4開始（模試・総仕上げ）"},
            {"date": "2027-08-22", "label": "本試験（例年8月第4日曜・要確認）"},
        ],
    },
    "subjects": SUBJECTS, "phases": PHASES, "weeks": weeks, "tasks": tasks,
}

with open("plan.js", "w", encoding="utf-8") as f:
    f.write("// 自動生成: python gen_plan.py\n")
    f.write("window.PLAN = " + json.dumps(plan, ensure_ascii=False, indent=2) + ";\n")

# ---- PLAN.md ----
lines = [f"# {plan['meta']['title']}", "",
         f"- 学習開始: {START} / 本試験（想定）: {EXAM}（{WEEKS}週）",
         f"- 教材: {plan['meta']['course']}",
         f"- 目標: 週{TARGET_HOURS}時間（10〜15h） → 合計約{TARGET_HOURS*WEEKS}時間", "",
         "## フェーズ", ""]
for p in PHASES:
    s = week_range(p["weeks"][0])[0]; e = week_range(p["weeks"][1])[1]
    lines.append(f"- **フェーズ{p['id']} {p['name']}**（第{p['weeks'][0]}〜{p['weeks'][1]}週 / {s}〜{e}）: {p['desc']}")
lines += ["", "## 週別計画", ""]
for wk in weeks:
    w = wk["week"]
    wt = [t for t in tasks if t["week"] == w]
    total = sum(t["hours"] for t in wt)
    lines.append(f"### 第{w}週 {wk['start']}〜{wk['end']}（計{total:g}h）")
    for t in wt:
        lines.append(f"- [{t['type']}][{t['subject']}] {t['title']}（{t['hours']:g}h）" + (f" — {t['detail']}" if t['detail'] else ""))
    lines.append("")
with open("PLAN.md", "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

tot = sum(t["hours"] for t in tasks)
print(f"tasks={len(tasks)} total_hours={tot:g} avg/week={tot/WEEKS:.1f}")
for p in PHASES:
    h = sum(t["hours"] for t in tasks if p["weeks"][0] <= t["week"] <= p["weeks"][1])
    print(f"  phase{p['id']}: {h:g}h over {p['weeks'][1]-p['weeks'][0]+1}w")
