// Exam Lens app logic. Scoring: right +1, wrong -1 and the question is re-queued until answered correctly.
const Q = RAW.map(([v, q, o, e], id) => ({ id, v, unit: +v.split(".")[0], q, o, e }));

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const CODEY = /(innerHTML|textContent|document\.cookie|compare_digest|predict_proba|predict\(\[\[7\]\]\)|train_test_split|max_iter|MLPClassifier|PolynomialFeatures|LinearRegression|shutil\.copy2|datetime|pathlib|\.gitignore|__init__|filter_by|order_by|Student\.query[^?]*?\.all\(\)|DELETE FROM students;|LIKE 'N%'|student_id|echo "x" &gt;&gt; log|echo "x" &gt; log|grep "\w+" app\.log|ls "\w+" app\.log|touch "\w+" app\.log|mkdir "\w+" app\.log|#a \{color:red\}|\.b \{color:blue\}|p \{color:green\}|display: standalone|position: fixed|service-worker: true|https: required|\/api\/timetable|except:|x in a_set|x in a_list|ok: false|&lt;article&gt;|&lt;time datetime&gt;|&lt;div&gt;|resolve\(\)|is_relative_to\(\))/g;
const fmt = (s) => esc(s).replace(CODEY, (m) => "<code>" + m + "</code>");
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const signed = (n) => (n > 0 ? "+" + n : n < 0 ? "−" + Math.abs(n) : "0");
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem("examlens:" + k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem("examlens:" + k, JSON.stringify(v)); } catch (e) {} }
};

// ---------- state ----------
let S = { view: "home", unit: null, videos: [], quiz: null, lastMissed: [] };

function show(view) {
  S.view = view;
  for (const v of ["home", "setup", "quiz", "results"]) $(v).hidden = v !== view;
  document.body.dataset.unit = S.unit || "";
  window.scrollTo({ top: 0 });
  saveSession();
}
function saveSession() { store.set("session", S); }

// ---------- home ----------
function renderHome() {
  $("home-lede").textContent = Q.length + " questions drawn from the 40 revision videos. Pick a unit, choose which videos to cover, and read the reasoning after every answer.";
  $("units").innerHTML = Object.entries(UNITS).map(([n, u]) => {
    const count = Q.filter((q) => q.unit === +n).length;
    const best = store.get("best:" + n);
    const bestTxt = best ? "Best: <b>" + signed(best.net) + "</b> out of " + best.max : "Not attempted yet";
    return '<button class="unit-card" type="button" data-unit="' + n + '" style="--c:var(--u' + n + ')">' +
      '<span class="num">' + n + '</span>' +
      '<span class="meta">UNIT ' + n + ' · VIDEOS ' + u.range + ' · ' + count + ' Q</span>' +
      '<h2>' + u.name + '</h2>' +
      '<span class="best">' + bestTxt + '</span></button>';
  }).join("");
  $("units").querySelectorAll(".unit-card").forEach((b) => b.addEventListener("click", () => openSetup(+b.dataset.unit)));
}

// ---------- setup ----------
const videosOf = (unit) => Object.keys(VIDEOS).filter((v) => +v.split(".")[0] === unit);
function openSetup(unit) {
  S.unit = unit;
  const saved = store.get("videos:" + unit);
  S.videos = Array.isArray(saved) && saved.length ? saved : videosOf(unit);
  $("setup-eyebrow").textContent = "Unit " + unit + " · videos " + UNITS[unit].range;
  $("setup-title").textContent = UNITS[unit].name;
  $("vlist").innerHTML = videosOf(unit).map((v) => {
    const n = Q.filter((q) => q.v === v).length;
    const id = "v-" + v.replace(".", "-");
    return '<label class="vitem" for="' + id + '"><input type="checkbox" id="' + id + '" value="' + v + '"' + (S.videos.includes(v) ? " checked" : "") + '>' +
      '<span class="vn">' + v + '</span><span>' + VIDEOS[v] + '</span><span class="vc">' + n + ' Q</span></label>';
  }).join("");
  $("vlist").querySelectorAll("input").forEach((i) => i.addEventListener("change", syncVideos));
  syncVideos();
  show("setup");
}
function syncVideos() {
  S.videos = [...$("vlist").querySelectorAll("input:checked")].map((i) => i.value);
  store.set("videos:" + S.unit, S.videos);
  const pool = Q.filter((q) => S.videos.includes(q.v)).length;
  $("go-all").textContent = "All " + pool + " questions";
  $("go-quick").textContent = pool >= 10 ? "Quick 10" : "Quick " + pool;
  $("go-all").disabled = $("go-quick").disabled = pool === 0;
}
$("sel-all").addEventListener("click", () => { $("vlist").querySelectorAll("input").forEach((i) => (i.checked = true)); syncVideos(); });
$("sel-none").addEventListener("click", () => { $("vlist").querySelectorAll("input").forEach((i) => (i.checked = false)); syncVideos(); });
$("setup-back").addEventListener("click", goHome);
$("go-quick").addEventListener("click", () => startQuiz(shuffle(Q.filter((q) => S.videos.includes(q.v))).slice(0, 10).map((q) => q.id)));
$("go-all").addEventListener("click", () => startQuiz(shuffle(Q.filter((q) => S.videos.includes(q.v))).map((q) => q.id)));

// ---------- quiz ----------
// queue holds one entry per attempt; a wrong answer appends the same question again with a fresh shuffle.
function startQuiz(ids) {
  S.quiz = {
    queue: ids.slice(),
    orders: ids.map((id) => shuffle(Q[id].o.map((_, k) => k))),
    picks: ids.map(() => null),
    i: 0
  };
  show("quiz");
  renderQuestion();
}
const isRight = (z, k) => z.picks[k] !== null && z.orders[k][z.picks[k]] === 0;
function tallies(z) {
  let right = 0, wrong = 0;
  z.picks.forEach((p, k) => { if (p === null) return; if (isRight(z, k)) right++; else wrong++; });
  return { right, wrong, net: right - wrong };
}
function renderQuestion() {
  const z = S.quiz, qid = z.queue[z.i], q = Q[qid], order = z.orders[z.i], pick = z.picks[z.i];
  const answered = pick !== null;
  const t = tallies(z);
  const repeat = z.queue.slice(0, z.i).includes(qid);
  const pending = z.queue.length - z.i - (answered ? 1 : 0);

  $("q-unit").innerHTML = "Unit " + S.unit + " · <b>" + UNITS[S.unit].name + "</b>";
  $("q-tally").textContent = pending + " left in queue";
  $("q-net").textContent = "Score " + signed(t.net);
  $("q-net").className = "net" + (t.net > 0 ? " pos" : t.net < 0 ? " neg" : "");
  $("segs").innerHTML = z.queue.map((id, k) => {
    const p = z.picks[k];
    const again = z.queue.slice(0, k).includes(id);
    let cls = p === null ? (k === z.i ? "cur" : again ? "again" : "") : (isRight(z, k) ? "ok" : "no");
    return '<i class="' + cls + '"></i>';
  }).join("");

  const vidx = Q.filter((x) => x.v === q.v).indexOf(q) + 1;
  $("q-id").innerHTML = esc("Q" + q.v + "-" + String(vidx).padStart(2, "0")) + (repeat ? ' · <span class="penalty">BACK AGAIN</span>' : " · 1 mark");
  $("q-video").textContent = "Video " + q.v + " · " + VIDEOS[q.v];
  $("q-text").innerHTML = fmt(q.q);
  $("opts").innerHTML = order.map((oi, k) => {
    let cls = "opt";
    if (answered) cls += oi === 0 ? " right" : k === pick ? " wrong" : " dim";
    return '<button type="button" class="' + cls + '" id="opt-' + k + '" data-k="' + k + '"' + (answered ? " disabled" : "") + '>' +
      '<span class="k">' + "ABCD"[k] + '</span><span>' + fmt(q.o[oi]) + '</span></button>';
  }).join("");
  $("opts").querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => answer(+b.dataset.k)));

  $("feedback").hidden = !answered;
  if (answered) {
    const ok = order[pick] === 0;
    $("verdict").className = "verdict " + (ok ? "ok" : "no");
    $("verdict").textContent = ok
      ? "✓ Correct · +1"
      : "✗ Wrong · −1 · answer " + "ABCD"[order.indexOf(0)] + " · this question comes back later";
    $("explain").innerHTML = fmt(q.e);
  }
  $("next").disabled = !answered;
  $("next").textContent = answered && z.i === z.queue.length - 1 ? "See results" : "Next question";
}
function answer(k) {
  const z = S.quiz;
  if (z.picks[z.i] !== null) return;
  z.picks[z.i] = k;
  if (!isRight(z, z.i)) {
    const qid = z.queue[z.i];
    z.queue.push(qid);
    z.orders.push(shuffle(Q[qid].o.map((_, n) => n)));
    z.picks.push(null);
    const sheet = $("sheet");
    sheet.classList.remove("hit");
    void sheet.offsetWidth;
    sheet.classList.add("hit");
    if (navigator.vibrate) navigator.vibrate(120);
  }
  renderQuestion();
  saveSession();
  $("next").focus({ preventScroll: true });
}
function next() {
  const z = S.quiz;
  if (z.picks[z.i] === null) return;
  $("sheet").classList.remove("hit");
  if (z.i < z.queue.length - 1) { z.i++; renderQuestion(); saveSession(); window.scrollTo({ top: 0 }); }
  else finish();
}
$("next").addEventListener("click", next);
$("quit").addEventListener("click", finish);
document.addEventListener("keydown", (e) => {
  if (S.view !== "quiz" || e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase();
  const map = { a: 0, b: 1, c: 2, d: 3, "1": 0, "2": 1, "3": 2, "4": 3 };
  if (key in map && S.quiz.picks[S.quiz.i] === null) { e.preventDefault(); answer(map[key]); }
  else if (key === "enter" && S.quiz.picks[S.quiz.i] !== null && document.activeElement !== $("quit")) { e.preventDefault(); next(); }
});

// ---------- results ----------
function finish() {
  const z = S.quiz;
  const t = tallies(z);
  // First attempt and wrong count per question.
  const per = new Map();
  z.queue.forEach((qid, k) => {
    if (z.picks[k] === null) return;
    if (!per.has(qid)) per.set(qid, { q: Q[qid], first: isRight(z, k), firstPick: Q[qid].o[z.orders[k][z.picks[k]]], wrongs: 0, solved: false });
    const r = per.get(qid);
    if (isRight(z, k)) r.solved = true; else r.wrongs++;
  });
  const rows = [...per.values()];
  const max = rows.length;
  const unsolved = rows.filter((r) => !r.solved).length;

  if (max >= 5 && unsolved === 0) {
    const best = store.get("best:" + S.unit);
    const ratio = t.net / max;
    if (!best || ratio > best.net / best.max || (ratio === best.net / best.max && max > best.max)) store.set("best:" + S.unit, { net: t.net, max });
  }
  S.lastMissed = rows.filter((r) => !r.first).map((r) => r.q.id);

  $("r-unit").textContent = "Unit " + S.unit + " · " + UNITS[S.unit].name;
  $("r-score").innerHTML = esc(signed(t.net)) + "<span> / " + max + "</span>";
  let line;
  if (max === 0) line = "No questions answered.";
  else {
    line = t.right + " right, " + t.wrong + " wrong (−" + t.wrong + "). ";
    if (unsolved) line += unsolved + " question" + (unsolved > 1 ? "s" : "") + " left unsolved, so this run doesn't count as a best score. ";
    const pct = t.net / max;
    line += pct >= 0.85 ? "Strong. Retry the misses to make it clean." : pct >= 0.5 ? "The penalties are adding up. Rewatch the weakest videos below." : pct >= 0 ? "Barely positive. Rewatch the videos below before your next attempt." : "Below zero. Guessing costs more than it earns. Rewatch the videos below, then go again.";
  }
  $("r-line").textContent = line;

  const byV = {};
  rows.forEach((r) => { (byV[r.q.v] ||= { r: 0, t: 0 }); byV[r.q.v].t++; if (r.first) byV[r.q.v].r++; });
  const minor = (v) => +v.split(".")[1];
  const vs = Object.keys(byV).sort((a, b) => (byV[a].r / byV[a].t) - (byV[b].r / byV[b].t) || minor(a) - minor(b));
  $("bars").innerHTML = vs.length ? vs.map((v) => {
    const { r, t: n } = byV[v];
    return '<div class="bar"><span class="vn">' + v + '</span><span class="track"><span class="fill" style="display:block;width:' + (r / n * 100) + '%"></span></span><span class="n">' + r + '/' + n + '</span><span class="lbl">' + VIDEOS[v] + '</span></div>';
  }).join("") : '<p class="empty-note">Nothing answered yet.</p>';

  const missed = rows.filter((r) => r.wrongs > 0).sort((a, b) => b.wrongs - a.wrongs);
  $("missed").innerHTML = missed.length ? missed.map((r) =>
    '<div class="miss"><span class="m-meta">Video ' + r.q.v + ' · ' + VIDEOS[r.q.v] + ' · <span class="penalty">wrong ' + r.wrongs + '× (−' + r.wrongs + ')</span>' + (r.solved ? "" : " · unsolved") + '</span>' +
    '<span class="m-q">' + fmt(r.q.q) + '</span>' +
    '<span class="m-a">✓ ' + fmt(r.q.o[0]) + '</span>' +
    '<span class="m-y">First answer: ' + fmt(r.firstPick) + '</span></div>'
  ).join("") : '<p class="empty-note">None. Every answer was right first time.</p>';
  $("retry-missed").hidden = missed.length === 0;
  show("results");
}
$("retry-missed").addEventListener("click", () => startQuiz(shuffle(S.lastMissed)));
$("again").addEventListener("click", () => openSetup(S.unit));
$("res-back").addEventListener("click", goHome);
function goHome() { S.unit = null; S.quiz = null; renderHome(); show("home"); }

// ---------- boot ----------
(function boot() {
  renderHome();
  const saved = store.get("session");
  if (saved && saved.unit && saved.view !== "home") {
    S = Object.assign(S, saved);
    if (S.view === "setup") return openSetup(S.unit);
    if (S.view === "quiz" && S.quiz) { show("quiz"); return renderQuestion(); }
    if (S.view === "results" && S.quiz) return finish();
  }
  show("home");
})();

// ---------- PWA ----------
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then(() => {
      $("offline-note").textContent = "Works offline once loaded";
    }).catch(() => {});
  });
}
