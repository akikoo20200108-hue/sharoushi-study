/* 社労士2027 学習ナビ - app.js
 * 依存: plan.js (window.PLAN)
 * 保存先: localStorage (キー: sharoushi-study-v1)
 */
(function () {
  "use strict";
  const PLAN = window.PLAN;
  const KEY = "sharoushi-study-v1";

  // ---------- 状態 ----------
  const defaultState = () => ({ done: {}, logs: [], targetHours: PLAN.meta.targetHoursPerWeek });
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
      const done = !!state.done[t.id];
      const row = el("div", "task" + (done ? " done" : ""));
      const cb = el("input"); cb.type = "checkbox"; cb.checked = done;
      cb.addEventListener("change", () => { if (cb.checked) state.done[t.id] = todayStr(); else delete state.done[t.id]; save(); renderAll(); });
      const s = subj(t.subject);
      const body = el("div", "", `<div class="t-title"><span class="type">${esc(t.type)}</span><span class="badge" style="background:${s.color}">${esc(t.subject)}</span>${esc(t.title)}</div>` +
        (t.detail ? `<div class="t-detail">${esc(t.detail)}</div>` : "") +
        (done ? `<div class="t-meta">完了: ${esc(state.done[t.id])}</div>` : ""));
      const h = el("div", "t-hours", `${t.hours}h`);
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

  // ---------- 今日 ----------
  function renderToday() {
    const today = todayStr();
    const w = weekOf(today);
    $("todayTitle").textContent = `今日 ${fmt(today)}`;
    const ms = $("todayMilestone");
    const upcoming = PLAN.meta.milestones.filter(m => m.date >= today && (parse(m.date) - parse(today)) / DAY <= 14);
    if (upcoming.length) { ms.classList.remove("hidden"); ms.textContent = upcoming.map(m => `📌 ${fmt(m.date)} ${m.label}`).join(" ／ "); }
    else ms.classList.add("hidden");

    if (w === 0) {
      $("todayPhase").textContent = `学習開始は ${fmt(PLAN.meta.start)} から`;
      $("todayTasks").innerHTML = `<div class="muted">まだ開始前です。第1週のタスクを先取りしてもOK。</div>`;
      renderTaskList($("todayTasks"), tasksOfWeek(1));
    } else if (w > PLAN.meta.weeks) {
      $("todayPhase").textContent = "本試験当日 / 試験後";
      $("todayTasks").innerHTML = `<div class="muted">お疲れさまでした。</div>`;
    } else {
      const wi = weekInfo(w); const ph = phaseOf(wi.phase);
      $("todayPhase").textContent = `第${w}週 ／ フェーズ${ph.id} ${ph.name}`;
      const tasks = tasksOfWeek(w);
      const undone = tasks.filter(t => !state.done[t.id]);
      renderTaskList($("todayTasks"), undone.length ? undone.concat(tasks.filter(t => state.done[t.id])) : tasks);
    }
    // 学習記録
    const sel = $("logSubject");
    if (!sel.options.length) {
      for (const k of Object.keys(PLAN.subjects)) { const o = el("option"); o.value = k; o.textContent = `${k}（${subj(k).name}）`; sel.appendChild(o); }
      // 今週の科目を初期選択
      const cur = tasksOfWeek(Math.max(1, w)).find(t => t.subject !== "全科目");
      if (cur) sel.value = cur.subject;
    }
    renderLogs($("todayLogs"), logsOf(l => l.date === today));
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
    let streak = 0; let d = parse(today);
    const days = new Set(state.logs.map(l => l.date));
    if (!days.has(today)) d = new Date(d - DAY);
    while (days.has(iso(d))) { streak++; d = new Date(d - DAY); }
    $("streakText").textContent = streak ? `🔥 ${streak}日連続で学習中` : "今日の記録を入れると連続日数がカウントされます";
  }

  $("logAdd").addEventListener("click", () => {
    const m = parseInt($("logMinutes").value, 10);
    if (!m || m <= 0) { $("logMinutes").focus(); return; }
    state.logs.push({ id: "l" + Date.now(), date: todayStr(), minutes: m, subject: $("logSubject").value, memo: $("logMemo").value.trim() });
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
    const all = PLAN.tasks; const doneH = all.filter(t => state.done[t.id]).reduce((a, t) => a + t.hours, 0);
    const totalH = all.reduce((a, t) => a + t.hours, 0);
    const p = pct(doneH, totalH);
    $("overallPct").textContent = p + "%";
    $("overallBar").style.width = p + "%";
    $("overallText").textContent = `完了 ${all.filter(t => state.done[t.id]).length}/${all.length} タスク（${doneH}h / ${totalH}h）`;
    // ペース: 今日までに予定されていた時間 vs 完了時間
    const w = Math.min(Math.max(0, weekOf(todayStr())), PLAN.meta.weeks);
    const expected = all.filter(t => t.week < w).reduce((a, t) => a + t.hours, 0);
    const diff = doneH - expected;
    const logged = state.logs.reduce((a, l) => a + l.minutes, 0) / 60;
    $("paceText").textContent = w === 0 ? "開始前" :
      `先週までの計画 ${expected}h に対して ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}h ${diff >= 0 ? "（順調）" : "（遅れ）"} ／ 累計学習時間 ${logged.toFixed(1)}h`;

    const pp = $("phaseProgress"); pp.innerHTML = "";
    for (const ph of PLAN.phases) {
      const ts = all.filter(t => t.week >= ph.weeks[0] && t.week <= ph.weeks[1]);
      const d = ts.filter(t => state.done[t.id]).length;
      pp.appendChild(el("div", "prow", `<span class="n">フェーズ${ph.id} ${esc(ph.name)}</span><div class="meter small"><div style="width:${pct(d, ts.length)}%"></div></div><span>${d}/${ts.length}</span>`));
    }
    const sp = $("subjectProgress"); sp.innerHTML = "";
    for (const k of Object.keys(PLAN.subjects)) {
      const ts = all.filter(t => t.subject === k); if (!ts.length) continue;
      const d = ts.filter(t => state.done[t.id]).length;
      sp.appendChild(el("div", "prow", `<span class="n"><span class="badge" style="background:${subj(k).color}">${esc(k)}</span>${esc(subj(k).name)}</span><div class="meter small"><div style="width:${pct(d, ts.length)}%"></div></div><span>${d}/${ts.length}</span>`));
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
    const rm = $("roadmap"); rm.innerHTML = "";
    const curW = weekOf(today);
    for (const x of PLAN.weeks) {
      const ts = tasksOfWeek(x.week);
      const subs = [...new Set(ts.map(t => t.subject).filter(s => s !== "全科目"))];
      const main = subs.length ? subs.join("・") : (ts[0] ? ts[0].type : "");
      const d = ts.filter(t => state.done[t.id]).length;
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
