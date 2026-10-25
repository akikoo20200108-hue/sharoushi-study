/* 社労士2027 学習ナビ - app.js
 * 依存: plan.js (window.PLAN)
 * 保存先: localStorage (キー: sharoushi-study-v1)
 */
(function () {
  "use strict";
  const PLAN = window.PLAN;
  const KEY = "sharoushi-study-v1";

  // ---------- 状態 ----------
  const defaultState = () => ({ done: {}, dayDone: {}, logs: [], targetHours: PLAN.meta.targetHoursPerWeek });
  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      return Object.assign(defaultState(), s);
    } catch (e) { return defaultState(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }

  // ---------- 日付ユーティリティ ----------
  const DAY = 86400000;
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = s => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}(${"日月火水木金土"[d.getDay()]})`; };
  const todayStr = () => iso(new Date());
  const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? m % 60 + "分" : ""}` : `${m}分`;
  const start = parse(PLAN.meta.start);
  const exam = parse(PLAN.meta.exam);

  function weekOf(dateStr) {
    const diff = Math.floor((parse(dateStr) - start) / DAY);
    if (diff < 0) return 0;
    return Math.min(PLAN.meta.weeks + 1, Math.floor(diff / 7) + 1);
  }
  const weekInfo = w => PLAN.weeks.find(x => x.week === w);
  const phaseOf = id => PLAN.phases.find(p => p.id === id);
  const tasksOfWeek = w => PLAN.tasks.filter(t => t.week === w);
  const subj = k => PLAN.subjects[k] || { name: k, color: "#777" };

  // ---------- 共通 ----------
  const $ = id => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function renderTaskList(container, tasks) {
    container.innerHTML = "";
    if (!tasks.length) { container.appendChild(el("div", "muted", "この週のタスクはありません。")); return; }
    for (const t of tasks) {
      const ratio = taskRatio(t); const done = ratio >= 0.999;
      const row = el("div", "task" + (done ? " done" : ""));
      const cb = el("input"); cb.type = "checkbox"; cb.checked = done;
      cb.addEventListener("change", () => {
        if (cb.checked) state.done[t.id] = todayStr();
        else { delete state.done[t.id]; for (const k of Object.keys(state.dayDone)) if (k.startsWith(t.id + "|")) delete state.dayDone[k]; }
        save(); renderAll();
      });
      const s = subj(t.subject);
      const body = el("div", "", `<div class="t-title"><span class="type">${esc(t.type)}</span><span class="badge" style="background:${s.color}">${esc(t.subject)}</span>${esc(t.title)}</div>` +
        (t.detail ? `<div class="t-detail">${esc(t.detail)}</div>` : "") +
        (!done && ratio > 0 ? `<div class="meter small" style="margin:6px 0 0"><div style="width:${Math.round(ratio * 100)}%"></div></div>` : "") +
        (done && state.done[t.id] ? `<div class="t-meta">完了: ${esc(state.done[t.id])}</div>` : ""));
      const h = el("div", "t-hours", `${t.hours}h`);
      body.addEventListener("click", () => row.classList.toggle("open"));
      row.append(cb, body, h);
      container.appendChild(row);
    }
  }

  function logsOf(filterFn) { return state.logs.filter(filterFn).sort((a, b) => a.date < b.date ? 1 : -1); }
  function renderLogs(container, logs) {
    container.innerHTML = "";
    if (!logs.length) { container.appendChild(el("div", "muted", "記録はまだありません。")); return; }
    for (const l of logs) {
      const row = el("div", "log");
      row.innerHTML = `<span class="d">${fmt(l.date)}</span><span class="m">${l.minutes}分</span><span class="badge" style="background:${subj(l.subject).color}">${esc(l.subject)}</span><span>${esc(l.memo || "")}</span>`;
      const x = el("button", "x", "✕"); x.title = "削除";
      x.addEventListener("click", () => { state.logs = state.logs.filter(z => z.id !== l.id); save(); renderAll(); });
      row.appendChild(x);
      container.appendChild(row);
    }
  }
  const weekMinutes = w => { const wi = weekInfo(w); if (!wi) return 0; return state.logs.filter(l => l.date >= wi.start && l.date <= wi.end).reduce((a, l) => a + l.minutes, 0); };

  // ---------- 日割り計画 ----------
  // 週のタスクを曜日の重み（日1.5 月〜金1 土1.5）で日ごとに分割する。決定的（同じ入力→同じ結果）。
  const DAY_WEIGHT = [1.5, 1, 1, 1, 1, 1, 1.5];
  const round15 = m => Math.round(m / 15) * 15;
  function dayPlanOfWeek(w) {
    const wi = weekInfo(w); if (!wi) return [];
    const tasks = tasksOfWeek(w);
    const totalMin = tasks.reduce((a, t) => a + t.hours * 60, 0);
    const wsum = DAY_WEIGHT.reduce((a, b) => a + b, 0);
    const cap = DAY_WEIGHT.map(x => round15(totalMin * x / wsum));
    const days = DAY_WEIGHT.map((_, i) => ({ date: iso(new Date(parse(wi.start).getTime() + i * DAY)), items: [] }));
    const parts = {}; // taskId -> 分割数
    let di = 0, left = cap[0];
    for (const t of tasks) {
      let rem = Math.max(15, round15(t.hours * 60));
      while (rem > 0) {
        if (di >= 6) { days[6].items.push({ task: t, minutes: rem }); rem = 0; break; }
        if (left <= 0) { di++; left = cap[di]; continue; }
        const take = Math.min(rem, left);
        if (take < 15 && rem > take) { di++; left = cap[di]; continue; } // 15分未満の端数は翌日へ
        days[di].items.push({ task: t, minutes: take });
        rem -= take; left -= take;
        if (left <= 0) { di++; left = di <= 6 ? cap[di] : 0; }
      }
    }
    for (const d of days) for (const it of d.items) parts[it.task.id] = (parts[it.task.id] || 0) + 1;
    const seen = {}, offs = {}, totals = {};
    for (const d of days) for (const it of d.items) totals[it.task.id] = (totals[it.task.id] || 0) + it.minutes;
    for (const d of days) for (const it of d.items) {
      seen[it.task.id] = (seen[it.task.id] || 0) + 1; it.part = seen[it.task.id]; it.of = parts[it.task.id]; it.key = `${it.task.id}|${d.date}`;
      it.offset = offs[it.task.id] || 0; it.total = totals[it.task.id]; offs[it.task.id] = it.offset + it.minutes;
    }
    return days;
  }
  const dayPlanOf = dateStr => { const w = weekOf(dateStr); if (w < 1 || w > PLAN.meta.weeks) return null; return dayPlanOfWeek(w).find(d => d.date === dateStr); };
  // タスクの完了率（0〜1）: 週チェック済みなら1、それ以外は日割り分の完了割合
  function taskRatio(t) {
    if (state.done[t.id]) return 1;
    const days = dayPlanOfWeek(t.week);
    let tot = 0, done = 0;
    for (const d of days) for (const it of d.items) if (it.task.id === t.id) { tot += it.minutes; if (state.dayDone[it.key]) done += it.minutes; }
    return tot ? done / tot : 0;
  }
  const taskDone = t => taskRatio(t) >= 0.999;

  // ---------- 今日 ----------
  let viewDate = todayStr();
  function renderToday() {
    const today = todayStr();
    const d = viewDate;
    const w = weekOf(d);
    $("dayPick").value = d;
    $("todayTitle").textContent = (d === today ? "今日 " : "") + fmt(d);
    const ms = $("todayMilestone");
    const upcoming = PLAN.meta.milestones.filter(m => m.date >= d && (parse(m.date) - parse(d)) / DAY <= 14);
    if (upcoming.length) { ms.classList.remove("hidden"); ms.textContent = upcoming.map(m => `📌 ${fmt(m.date)} ${m.label}`).join(" ／ "); }
    else ms.classList.add("hidden");

    const box = $("todayTasks"); box.innerHTML = "";
    $("dayPlanText").textContent = ""; $("dayDoneText").textContent = "";
    const TYPE_ICON = { "テキスト": "📖", "肢別": "✏️", "復習": "🔁", "答練": "📝", "特訓": "🎯", "模試": "🏁", "手続き": "📮", "準備": "📦", "その他": "📌" };
    // タスク名「第1章 総則(1) 労働憲章　テキスト p.11〜40」→ 章名と作業名に分ける
    const splitTitle = t => { const i = t.title.indexOf("　"); return i > 0 ? [t.title.slice(0, i), t.title.slice(i + 1)] : [t.title, ""]; };
    let planDate = d;
    if (w === 0) {
      planDate = PLAN.meta.start;
      $("todayPhase").textContent = `学習開始は ${fmt(PLAN.meta.start)} から。開始日の予定を先に表示しています`;
    } else if (w > PLAN.meta.weeks) {
      $("todayPhase").textContent = "本試験当日 / 試験後";
      box.innerHTML = `<div class="muted">お疲れさまでした。</div>`;
    } else {
      const wi = weekInfo(w); const ph = phaseOf(wi.phase);
      $("todayPhase").textContent = `第${w}週 ／ フェーズ${ph.id} ${ph.name}`;
    }
    if (w <= PLAN.meta.weeks) {
      const dp = dayPlanOf(planDate);
      if (!dp.items.length) box.innerHTML = `<div class="muted">この日は予定なし（休息日）。遅れがあれば前日までの未完了分を進めましょう。</div>`;
      let planMin = 0, doneMin = 0;
      // 科目＋章でグループ化
      const groups = [];
      for (const it of dp.items) {
        const [chap, work] = splitTitle(it.task);
        const key = it.task.subject + "|" + chap;
        let g = groups.find(x => x.key === key);
        if (!g) { g = { key, subject: it.task.subject, chap, items: [] }; groups.push(g); }
        g.items.push(Object.assign({ work }, it));
      }
      for (const g of groups) {
        const s = subj(g.subject);
        const card = el("div", "dgroup");
        card.appendChild(el("div", "dg-head", `<span class="badge" style="background:${s.color}">${esc(g.subject)}</span><span class="dg-title">${esc(g.chap)}</span>`));
        for (const it of g.items) {
          const done = !!state.dayDone[it.key] || !!state.done[it.task.id];
          planMin += it.minutes; if (done) doneMin += it.minutes;
          const row = el("label", "drow" + (done ? " done" : ""));
          const cb = el("input"); cb.type = "checkbox"; cb.checked = done;
          cb.addEventListener("change", () => {
            if (cb.checked) state.dayDone[it.key] = today; else { delete state.dayDone[it.key]; delete state.done[it.task.id]; }
            save(); renderAll();
          });
          // 分割タスクは、その日の分のページ範囲に置き換える（p.A〜B を分の比率で按分）
          let work = it.work;
          const m = it.of > 1 && work ? work.match(/p\.(\d+)〜(\d+)/) : null;
          if (m) {
            const a = +m[1], b = +m[2], n = b - a + 1;
            const from = a + Math.floor(n * it.offset / it.total);
            const to = Math.min(b, a + Math.ceil(n * (it.offset + it.minutes) / it.total) - 1);
            work = work.replace(m[0], `p.${from}〜${Math.max(from, to)}`);
          }
          const partTxt = it.of > 1 ? `<span class="muted"> (${it.part}/${it.of}日目)</span>` : "";
          const label = work ? `${TYPE_ICON[it.task.type] || ""} ${esc(work)}` : `${TYPE_ICON[it.task.type] || ""} ${esc(it.task.type)}`;
          const body = el("div", "dr-body", `<div class="dr-title">${label}${partTxt}</div>` + (it.task.detail ? `<div class="t-detail">${esc(it.task.detail)}</div>` : ""));
          const h = el("div", "t-hours", fmtMin(it.minutes));
          row.append(cb, body, h);
          card.appendChild(row);
        }
        box.appendChild(card);
      }
      $("dayPlanText").textContent = `この日の予定 ${fmtMin(planMin)}`;
      $("dayDoneText").textContent = planMin ? `完了 ${Math.round(doneMin / planMin * 100)}%` : "";
    }
    // 学習記録
    const sel = $("logSubject");
    if (!sel.options.length) {
      for (const k of Object.keys(PLAN.subjects)) { const o = el("option"); o.value = k; o.textContent = `${k}（${subj(k).name}）`; sel.appendChild(o); }
      // 今週の科目を初期選択
      const cur = tasksOfWeek(Math.max(1, w)).find(t => t.subject !== "全科目");
      if (cur) sel.value = cur.subject;
    }
    renderLogs($("todayLogs"), logsOf(l => l.date === d));
    // 今週の時間
    const wk = Math.min(Math.max(1, w), PLAN.meta.weeks);
    const min = w === 0
      ? state.logs.filter(l => l.date < PLAN.meta.start && (parse(today) - parse(l.date)) / DAY < 7).reduce((a, l) => a + l.minutes, 0)
      : weekMinutes(wk);
    const target = state.targetHours * 60;
    $("weekMeterBar").style.width = Math.min(100, min / target * 100) + "%";
    $("weekMeterBar").style.background = min >= target ? "var(--ok)" : "var(--warn)";
    $("weekHoursText").textContent = `今週 ${(min / 60).toFixed(1)}h`;
    $("weekTargetText").textContent = `目標 ${state.targetHours}h／週`;
    // 連続日数
    let streak = 0; let sd = parse(today);
    const days = new Set(state.logs.map(l => l.date));
    if (!days.has(today)) sd = new Date(sd - DAY);
    while (days.has(iso(sd))) { streak++; sd = new Date(sd - DAY); }
    $("streakText").textContent = streak ? `🔥 ${streak}日連続で学習中` : "今日の記録を入れると連続日数がカウントされます";
  }

  const shiftDay = n => { viewDate = iso(new Date(parse(viewDate).getTime() + n * DAY)); renderAll(); };
  $("dayPrev").addEventListener("click", () => shiftDay(-1));
  $("dayNext").addEventListener("click", () => shiftDay(1));
  $("dayToday").addEventListener("click", () => { viewDate = todayStr(); renderAll(); });
  $("dayPick").addEventListener("change", () => { if ($("dayPick").value) { viewDate = $("dayPick").value; renderAll(); } });

  $("logAdd").addEventListener("click", () => {
    const m = parseInt($("logMinutes").value, 10);
    if (!m || m <= 0) { $("logMinutes").focus(); return; }
    state.logs.push({ id: "l" + Date.now(), date: viewDate, minutes: m, subject: $("logSubject").value, memo: $("logMemo").value.trim() });
    $("logMinutes").value = ""; $("logMemo").value = "";
    save(); renderAll();
  });

  // ---------- 今週（任意の週） ----------
  let viewWeek = Math.min(Math.max(1, weekOf(todayStr())), PLAN.meta.weeks);
  function renderWeek() {
    const wi = weekInfo(viewWeek); const ph = phaseOf(wi.phase);
    const cur = weekOf(todayStr()) === viewWeek;
    $("weekTitle").textContent = `第${viewWeek}週 ${fmt(wi.start)}〜${fmt(wi.end)}${cur ? "（今週）" : ""}`;
    $("weekPhase").textContent = `フェーズ${ph.id} ${ph.name} — ${ph.desc}`;
    const tasks = tasksOfWeek(viewWeek);
    renderTaskList($("weekTasks"), tasks);
    const plan = tasks.reduce((a, t) => a + t.hours, 0);
    $("weekPlanHours").textContent = `計画 ${plan}h ／ 実績 ${(weekMinutes(viewWeek) / 60).toFixed(1)}h`;
    renderLogs($("weekLogs"), logsOf(l => l.date >= wi.start && l.date <= wi.end));
    $("weekPrev").disabled = viewWeek <= 1; $("weekNext").disabled = viewWeek >= PLAN.meta.weeks;
  }
  $("weekPrev").addEventListener("click", () => { viewWeek--; renderWeek(); });
  $("weekNext").addEventListener("click", () => { viewWeek++; renderWeek(); });
  $("weekToday").addEventListener("click", () => { viewWeek = Math.min(Math.max(1, weekOf(todayStr())), PLAN.meta.weeks); renderWeek(); });

  // ---------- 進捗 ----------
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function renderProgress() {
    const all = PLAN.tasks; const doneH = all.reduce((a, t) => a + t.hours * taskRatio(t), 0);
    const totalH = all.reduce((a, t) => a + t.hours, 0);
    const p = pct(doneH, totalH);
    $("overallPct").textContent = p + "%";
    $("overallBar").style.width = p + "%";
    $("overallText").textContent = `完了 ${all.filter(taskDone).length}/${all.length} タスク（${doneH.toFixed(1)}h / ${totalH}h）`;
    // ペース: 今日までに予定されていた時間 vs 完了時間
    const w = Math.min(Math.max(0, weekOf(todayStr())), PLAN.meta.weeks);
    const expected = all.filter(t => t.week < w).reduce((a, t) => a + t.hours, 0);
    const diff = doneH - expected;
    const logged = state.logs.reduce((a, l) => a + l.minutes, 0) / 60;
    $("paceText").textContent = w === 0 ? "開始前" :
      `先週までの計画 ${expected}h に対して ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}h ${diff >= 0 ? "（順調）" : "（遅れ）"} ／ 累計学習時間 ${logged.toFixed(1)}h`;

    const hoursDone = ts => ts.reduce((a, t) => a + t.hours * taskRatio(t), 0);
    const hoursAll = ts => ts.reduce((a, t) => a + t.hours, 0);
    const pp = $("phaseProgress"); pp.innerHTML = "";
    for (const ph of PLAN.phases) {
      const ts = all.filter(t => t.week >= ph.weeks[0] && t.week <= ph.weeks[1]);
      const d = ts.filter(taskDone).length; const r = pct(hoursDone(ts), hoursAll(ts));
      pp.appendChild(el("div", "prow", `<span class="n">フェーズ${ph.id} ${esc(ph.name)}</span><div class="meter small"><div style="width:${r}%"></div></div><span>${r}%<br><small class="muted">${d}/${ts.length}</small></span>`));
    }
    // 科目 × セクション（タスク種別）の進捗
    const sp = $("subjectProgress"); sp.innerHTML = "";
    const TYPE_ORDER = ["テキスト", "肢別", "復習", "答練", "特訓", "模試", "手続き", "準備", "その他"];
    for (const k of Object.keys(PLAN.subjects)) {
      const ts = all.filter(t => t.subject === k); if (!ts.length) continue;
      const r = pct(hoursDone(ts), hoursAll(ts));
      const card = el("div", "subj-card");
      card.innerHTML = `<div class="prow"><span class="n"><span class="badge" style="background:${subj(k).color}">${esc(k)}</span>${esc(subj(k).name)}</span><div class="meter small"><div style="width:${r}%"></div></div><span>${r}%</span></div>`;
      const sec = el("div", "sections");
      for (const ty of TYPE_ORDER) {
        const tt = ts.filter(t => t.type === ty); if (!tt.length) continue;
        if (k === "全科目") { // 件数が多いので種別ごとのバーだけ
          const r2 = pct(hoursDone(tt), hoursAll(tt));
          sec.appendChild(el("div", "secrow", `<span class="sec-name">${esc(ty)}</span><div class="meter small" style="flex:1;margin:4px 0"><div style="width:${r2}%"></div></div><span style="min-width:72px;text-align:right">${r2}%（${tt.filter(taskDone).length}/${tt.length}）</span>`));
          continue;
        }
        // 同じ種別の中を「週」単位のセクションに分けて1つずつ表示（例: テキスト前半／後半）
        const chips = tt.map(t => {
          const q = taskRatio(t); const cls = q >= 0.999 ? "ok" : q > 0 ? "part" : "";
          const label = t.title.replace(/^(総合講義テキスト|肢別過去問集|テキスト)\s*/, "").replace(/（|）/g, m => m === "（" ? " " : "").trim();
          return `<span class="chip ${cls}" title="第${t.week}週 ${esc(t.title)}">${esc(label || t.title)}<em>${Math.round(q * 100)}%</em></span>`;
        }).join("");
        sec.appendChild(el("div", "secrow", `<span class="sec-name">${esc(ty)}</span><span class="chips">${chips}</span>`));
      }
      card.appendChild(sec);
      sp.appendChild(card);
    }
    // 週別チャート
    const ch = $("hoursChart"); ch.innerHTML = "";
    const curW = weekOf(todayStr());
    const maxH = Math.max(state.targetHours * 1.3, ...PLAN.weeks.map(x => weekMinutes(x.week) / 60));
    for (const x of PLAN.weeks) {
      const h = weekMinutes(x.week) / 60;
      const b = el("div", "bar" + (x.week > curW ? " future" : h < state.targetHours ? " under" : "") + (x.week === curW ? " cur" : ""));
      b.style.height = Math.max(2, h / maxH * 100) + "%";
      b.dataset.tip = `第${x.week}週 ${h.toFixed(1)}h`;
      ch.appendChild(b);
    }
  }

  // ---------- 全体計画 ----------
  function renderPlan() {
    const ul = $("milestones"); ul.innerHTML = "";
    const today = todayStr();
    for (const m of PLAN.meta.milestones.slice().sort((a, b) => a.date < b.date ? -1 : 1)) {
      ul.appendChild(el("li", m.date < today ? "past" : "", `<span class="d">${fmt(m.date)}</span><span>${esc(m.label)}</span>`));
    }
    const ml = $("materials"); ml.innerHTML = "";
    for (const m of (PLAN.meta.materials || [])) ml.appendChild(el("li", "", `<span>${esc(m.name)}<br><small class="muted">${esc(m.use)}</small></span>`));
    const rm = $("roadmap"); rm.innerHTML = "";
    const curW = weekOf(today);
    for (const x of PLAN.weeks) {
      const ts = tasksOfWeek(x.week);
      const subs = [...new Set(ts.map(t => t.subject).filter(s => s !== "全科目"))];
      const main = subs.length ? subs.join("・") : (ts[0] ? ts[0].type : "");
      const d = ts.filter(taskDone).length;
      const r = el("div", `rw p${x.phase}` + (x.week === curW ? " cur" : ""),
        `<div class="w">第${x.week}週</div><div class="s">${fmt(x.start).replace(/\(.\)/, "")}〜</div><div class="m">${esc(main)}</div><div class="s">${d}/${ts.length}</div>`);
      r.addEventListener("click", () => { viewWeek = x.week; switchTab("week"); });
      rm.appendChild(r);
    }
  }

  // ---------- 設定 ----------
  $("targetHours").value = state.targetHours;
  $("saveTarget").addEventListener("click", () => { const v = parseFloat($("targetHours").value); if (v > 0) { state.targetHours = v; save(); renderAll(); } });
  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = el("a"); a.href = URL.createObjectURL(blob); a.download = `sharoushi-study-${todayStr()}.json`; a.click();
  });
  $("importFile").addEventListener("change", ev => {
    const f = ev.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { const s = JSON.parse(r.result); if (!s.done || !s.logs) throw new Error("形式が違います"); state = Object.assign(defaultState(), s); save(); renderAll(); alert("インポートしました"); } catch (e) { alert("読み込めませんでした: " + e.message); } };
    r.readAsText(f);
  });
  $("resetBtn").addEventListener("click", () => { if (confirm("進捗と学習記録をすべて削除します。よろしいですか？")) { state = defaultState(); save(); renderAll(); } });

  // ---------- タブ ----------
  function switchTab(name) {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "tab-" + name));
    renderAll();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  // ---------- 全体 ----------
  function renderHeader() {
    $("courseName").textContent = PLAN.meta.course;
    $("examDate").textContent = fmt(PLAN.meta.exam);
    $("daysLeft").textContent = Math.max(0, Math.ceil((exam - parse(todayStr())) / DAY));
  }
  function renderAll() { renderHeader(); renderToday(); renderWeek(); renderProgress(); renderPlan(); }
  renderAll();
})();
