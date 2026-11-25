'use strict';

const STORAGE_KEY = 'todo-app.tasks.v1';
const THEME_KEY = 'todo-app.theme';
const UI_KEY = 'todo-app.ui';

const CATS = {
  cours: { label: 'Cours', icon: '📚' },
  alternance: { label: 'Alternance', icon: '💼' },
  perso: { label: 'Perso', icon: '🏠' },
};
const PRIOS = { high: 'Haute', medium: 'Moyenne', low: 'Basse' };
const PRIO_RANK = { high: 0, medium: 1, low: 2 };

const $ = (sel) => document.querySelector(sel);

// ---------- Stockage ----------
function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
}

let tasks = safeGet(STORAGE_KEY, []);
const ui = Object.assign({ cat: 'all', status: 'todo', sort: 'due' }, safeGet(UI_KEY, {}));

function save() { safeSet(STORAGE_KEY, tasks); }
function saveUi() { safeSet(UI_KEY, ui); }

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- Dates ----------
function todayStr() {
  const d = new Date();
  return toDateStr(d);
}
function toDateStr(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function daysUntil(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}
function formatDue(dateStr) {
  const n = daysUntil(dateStr);
  if (n === 0) return "Aujourd'hui";
  if (n === 1) return 'Demain';
  if (n === -1) return 'Hier';
  if (n < 0) return `En retard de ${-n} j`;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const opts = n < 7 ? { weekday: 'long' } : { day: 'numeric', month: 'short' };
  if (date.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString('fr-FR', opts);
}
function groupOf(task) {
  if (task.done) return 'done';
  if (!task.due) return 'nodate';
  const n = daysUntil(task.due);
  if (n < 0) return 'overdue';
  if (n === 0) return 'today';
  if (n <= 7) return 'week';
  return 'later';
}
const GROUP_LABELS = {
  overdue: 'En retard',
  today: "Aujourd'hui",
  week: 'Cette semaine',
  later: 'Plus tard',
  nodate: 'Sans échéance',
  done: 'Terminées',
};
const GROUP_ORDER = ['overdue', 'today', 'week', 'later', 'nodate', 'done'];

// ---------- Rendu ----------
function filtered() {
  const q = $('#search').value.trim().toLowerCase();
  return tasks.filter((t) => {
    if (ui.cat !== 'all' && t.cat !== ui.cat) return false;
    if (ui.status === 'todo' && t.done) return false;
    if (ui.status === 'done' && !t.done) return false;
    if (q) {
      const hay = `${t.title} ${t.notes || ''} ${t.tag || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function sortTasks(list) {
  const byDue = (a, b) => (a.due || '9999') .localeCompare(b.due || '9999');
  const byPrio = (a, b) => PRIO_RANK[a.prio] - PRIO_RANK[b.prio];
  const byCreated = (a, b) => b.created - a.created;
  const chain = {
    due: [byDue, byPrio, byCreated],
    priority: [byPrio, byDue, byCreated],
    created: [byCreated],
  }[ui.sort];
  return list.slice().sort((a, b) => {
    for (const f of chain) { const r = f(a, b); if (r) return r; }
    return 0;
  });
}

function renderStats() {
  const open = tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.due && daysUntil(t.due) < 0).length;
  const today = open.filter((t) => t.due && daysUntil(t.due) === 0).length;
  const week = open.filter((t) => t.due && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 7).length;
  $('#stats').innerHTML = `
    <div class="stat"><div class="n">${open.length}</div><div class="l">À faire</div></div>
    <div class="stat ${overdue ? 'warn' : ''}"><div class="n">${overdue}</div><div class="l">En retard</div></div>
    <div class="stat"><div class="n">${today}</div><div class="l">Aujourd'hui</div></div>
    <div class="stat"><div class="n">${week}</div><div class="l">Sous 7 jours</div></div>`;

  document.querySelectorAll('.tab').forEach((tab) => {
    const cat = tab.dataset.cat;
    const n = open.filter((t) => cat === 'all' || t.cat === cat).length;
    let c = tab.querySelector('.count');
    if (!c) { c = document.createElement('span'); c.className = 'count'; tab.appendChild(c); }
    c.textContent = n;
    tab.classList.toggle('active', cat === ui.cat);
  });
}

function taskEl(t) {
  const el = document.createElement('div');
  el.className = 'task' + (t.done ? ' done' : '');
  el.dataset.cat = t.cat;
  el.dataset.id = t.id;

  const check = document.createElement('button');
  check.className = 'check';
  check.setAttribute('aria-label', t.done ? 'Marquer comme à faire' : 'Marquer comme terminée');
  check.textContent = t.done ? '✓' : '';
  check.addEventListener('click', (e) => { e.stopPropagation(); toggleDone(t.id); });

  const body = document.createElement('div');
  body.className = 'task-body';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = t.title;
  body.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const add = (text, cls) => { const s = document.createElement('span'); s.textContent = text; if (cls) s.className = cls; meta.appendChild(s); };

  if (ui.cat === 'all') add(`${CATS[t.cat].icon} ${CATS[t.cat].label}`);
  if (t.due) {
    const n = daysUntil(t.due);
    add('📅 ' + formatDue(t.due), 'due' + (!t.done && n < 0 ? ' late' : !t.done && n === 0 ? ' today' : ''));
  }
  if (t.prio !== 'medium') add(t.prio === 'high' ? '▲ Prioritaire' : '▽ Basse', 'prio-' + t.prio);
  if (t.tag) add(t.tag, 'pill');
  if (t.subs && t.subs.length) add(`☑ ${t.subs.filter((s) => s.done).length}/${t.subs.length}`);
  if (meta.children.length) body.appendChild(meta);

  if (t.notes) {
    const n = document.createElement('div');
    n.className = 'notes-preview';
    n.textContent = t.notes;
    body.appendChild(n);
  }

  el.append(check, body);
  el.addEventListener('click', () => openEdit(t.id));
  return el;
}

function render() {
  renderStats();
  const list = $('#list');
  list.innerHTML = '';
  const items = sortTasks(filtered());

  if (!items.length) {
    const msg = tasks.length === 0
      ? 'Aucune tâche pour l’instant. Ajoute ta première tâche ci-dessus 👆'
      : ui.status === 'todo' ? 'Rien à faire ici 🎉' : 'Aucune tâche ne correspond.';
    list.innerHTML = `<div class="empty">${msg}</div>`;
    return;
  }

  if (ui.sort === 'due') {
    const groups = {};
    items.forEach((t) => { (groups[groupOf(t)] ||= []).push(t); });
    GROUP_ORDER.forEach((g) => {
      if (!groups[g]) return;
      const h = document.createElement('div');
      h.className = 'group-title' + (g === 'overdue' ? ' overdue' : '');
      h.textContent = `${GROUP_LABELS[g]} · ${groups[g].length}`;
      list.appendChild(h);
      groups[g].forEach((t) => list.appendChild(taskEl(t)));
    });
  } else {
    items.forEach((t) => list.appendChild(taskEl(t)));
  }
}

// ---------- Actions ----------
function addTask(data) {
  const t = {
    id: uid(),
    title: data.title.trim(),
    cat: data.cat,
    due: data.due || '',
    prio: data.prio || 'medium',
    tag: data.tag || '',
    notes: data.notes || '',
    subs: data.subs || [],
    done: false,
    created: Date.now(),
  };
  tasks.push(t);
  save();
  render();
  return t;
}

function toggleDone(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;
  save();
  render();
  if (t.done) toast('Tâche terminée ✓', () => toggleDone(id));
}

function deleteTask(id) {
  const idx = tasks.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const [removed] = tasks.splice(idx, 1);
  save();
  render();
  toast('Tâche supprimée', () => { tasks.splice(idx, 0, removed); save(); render(); });
}

// ---------- Toast avec annulation ----------
let toastTimer;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  if (undo) {
    const b = document.createElement('button');
    b.textContent = 'Annuler';
    b.addEventListener('click', () => { undo(); el.hidden = true; });
    el.appendChild(b);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

// ---------- Dialogue d'édition ----------
let editingId = null;
let editSubs = [];

function renderSubs() {
  const ul = $('#edSubs');
  ul.innerHTML = '';
  editSubs.forEach((s, i) => {
    const li = document.createElement('li');
    if (s.done) li.className = 'done';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = s.done;
    cb.addEventListener('change', () => { s.done = cb.checked; renderSubs(); });
    const span = document.createElement('span');
    span.textContent = s.text;
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Supprimer la sous-tâche');
    del.addEventListener('click', () => { editSubs.splice(i, 1); renderSubs(); });
    li.append(cb, span, del);
    ul.appendChild(li);
  });
}

function addSub() {
  const input = $('#edSubInput');
  const text = input.value.trim();
  if (!text) return;
  editSubs.push({ text, done: false });
  input.value = '';
  renderSubs();
  input.focus();
}

function openEdit(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  editingId = id;
  $('#editHeading').textContent = 'Modifier la tâche';
  $('#edTitle').value = t.title;
  $('#edCat').value = t.cat;
  $('#edPrio').value = t.prio;
  $('#edDate').value = t.due;
  $('#edTag').value = t.tag;
  $('#edNotes').value = t.notes;
  editSubs = (t.subs || []).map((s) => ({ ...s }));
  $('#edSubInput').value = '';
  $('#edDelete').hidden = false;
  renderSubs();
  $('#editDialog').showModal();
}

$('#editDialog').addEventListener('close', () => {
  if ($('#editDialog').returnValue !== 'save' || !editingId) { editingId = null; return; }
  const t = tasks.find((x) => x.id === editingId);
  const title = $('#edTitle').value.trim();
  if (t && title) {
    // Une sous-tâche saisie mais pas encore ajoutée est conservée
    const pending = $('#edSubInput').value.trim();
    if (pending) editSubs.push({ text: pending, done: false });
    Object.assign(t, {
      title,
      cat: $('#edCat').value,
      prio: $('#edPrio').value,
      due: $('#edDate').value,
      tag: $('#edTag').value.trim(),
      notes: $('#edNotes').value.trim(),
      subs: editSubs,
    });
    save();
    render();
  }
  editingId = null;
});

$('#edSubAdd').addEventListener('click', addSub);
$('#edSubInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addSub(); }
});
$('#edDelete').addEventListener('click', () => {
  const id = editingId;
  editingId = null;
  $('#editDialog').close('cancel');
  deleteTask(id);
});

// ---------- Ajout rapide ----------
$('#quickAdd').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#qaTitle').value.trim();
  if (!title) return;
  addTask({ title, cat: $('#qaCat').value, due: $('#qaDate').value });
  $('#qaTitle').value = '';
  $('#qaDate').value = '';
  $('#qaTitle').focus();
});

// ---------- Filtres ----------
$('#tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  ui.cat = tab.dataset.cat;
  if (ui.cat !== 'all') $('#qaCat').value = ui.cat;
  saveUi();
  render();
});
$('#search').addEventListener('input', render);
$('#statusFilter').addEventListener('change', (e) => { ui.status = e.target.value; saveUi(); render(); });
$('#sortBy').addEventListener('change', (e) => { ui.sort = e.target.value; saveUi(); render(); });

// ---------- Thème ----------
function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
applyTheme(safeGet(THEME_KEY, null));
$('#themeBtn').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  safeSet(THEME_KEY, next);
});

// ---------- Menu sauvegarde ----------
$('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#menu').hidden = !$('#menu').hidden; });
document.addEventListener('click', (e) => { if (!e.target.closest('#menu')) $('#menu').hidden = true; });

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `taches-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  $('#menu').hidden = true;
});

$('#importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  $('#menu').hidden = true;
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error('format');
    const known = new Set(tasks.map((t) => t.id));
    let added = 0;
    data.forEach((t) => {
      if (!t || typeof t.title !== 'string' || !CATS[t.cat]) return;
      if (t.id && known.has(t.id)) return;
      tasks.push({
        id: t.id || uid(), title: t.title, cat: t.cat, due: t.due || '',
        prio: PRIOS[t.prio] ? t.prio : 'medium', tag: t.tag || '', notes: t.notes || '',
        subs: Array.isArray(t.subs) ? t.subs : [], done: !!t.done, created: t.created || Date.now(),
      });
      added++;
    });
    save();
    render();
    toast(`${added} tâche(s) importée(s)`);
  } catch {
    toast('Fichier invalide');
  }
});

$('#clearDoneBtn').addEventListener('click', () => {
  $('#menu').hidden = true;
  const done = tasks.filter((t) => t.done);
  if (!done.length) { toast('Aucune tâche terminée'); return; }
  const before = tasks.slice();
  tasks = tasks.filter((t) => !t.done);
  save();
  render();
  toast(`${done.length} tâche(s) supprimée(s)`, () => { tasks = before; save(); render(); });
});

// ---------- Init ----------
$('#statusFilter').value = ui.status;
$('#sortBy').value = ui.sort;
if (ui.cat !== 'all') $('#qaCat').value = ui.cat;
render();
// Rafraîchit les libellés de date (« Aujourd'hui », « En retard ») quand on revient sur l'onglet
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
