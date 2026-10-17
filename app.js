const $ = document.getElementById('app');
const tg = window.Telegram && Telegram.WebApp;
const inTg = !!(tg && tg.initData);
const BGS = [['Город', 20], ['Город', 270], ['Интерьер', 30], ['Природа', 120], ['Природа', 195], ['Интерьер', 15], ['Город', 230], ['Город', 300]];
const grad = (h, h2 = h + 50) => `linear-gradient(160deg,hsl(${h} 70% 62%),hsl(${h2} 65% 38%) 70%,hsl(${h2 + 30} 50% 18%))`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const newData = () => ({ h: Math.random() * 360 | 0, bg: 0, chars: [], branches: ['Пойти с ним', 'Остаться'], vars: [['доверие', 3], ['ключ найден', 'нет']], events: ['Гроза над городом'], lines: ['Это только начало…', 'Город сегодня светится иначе.', 'Ты пойдёшь со мной?'] });
const hue = () => Math.random() * 360 | 0;

let route = 'splash', tab = { chars: 'all', scripts: 'br', bgs: 'Все' }, line = 0, q = '';
let P = [], cur = null, me = { name: '' }, botName = '', loadErr = false, timer;

async function api(method, path, body) {
  const r = await fetch('/api/' + path, { method, headers: { Authorization: 'tma ' + tg.initData, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(r.status); return r.json();
}
function persist(p = cur) { // сохранение в Supabase с задержкой
  clearTimeout(timer);
  timer = setTimeout(() => api('POST', 'projects', { id: p.id, name: p.name, data: p.data })
    .then(r => { p.updated_at = r.updated_at }).catch(() => toast('Не удалось сохранить')), 500);
}
const when = d => d ? new Date(d).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Только что';
const scenes = d => 1 + d.branches.length * 2;

const nav = () => `<nav class="nav">${[['home', '⌂', 'Главная'], ['chars', '▤', 'Персонажи'], ['profile', '☺', 'Профиль']].map(([k, i, t]) =>
  `<button class="${route == k ? 'on' : ''}" data-go="${k}"><i>${i}</i>${t}</button>`).join('')}</nav>`;
const top = (t, r = '') => `<div class="top"><button class="ib" data-go="home" aria-label="Назад">←</button><span>${t}</span><span class="sp"></span>${r}</div>`;
const chips = (items, c, key) => `<div class="tabs">${items.map(([k, t]) => `<button class="chip ${c == k ? 'on' : ''}" data-tab="${key}" data-v="${k}">${t}</button>`).join('')}</div>`;
const sub = () => cur ? `<small style="color:var(--mute);margin:-6px 0 10px;display:block">${esc(cur.name)}</small>` : '';

const views = {
  gate: () => `<div class="screen gate"><div style="font-size:54px">📖</div><div class="big">NovelCraft</div><p>Это приложение работает только внутри Telegram: проекты привязаны к вашему аккаунту.</p>${botName ? `<a class="cta" href="https://t.me/${esc(botName)}?startapp">Открыть в Telegram</a>` : '<p>Откройте бота NovelCraft в Telegram.</p>'}</div>`,
  splash: () => `<div class="screen splash"><div style="font-size:54px">📖</div><div class="big">NovelCraft</div><p style="margin-top:10px;font-size:19px">Создавай свои<br>визуальные новеллы</p><button class="cta" data-go="home">✦ Начать</button></div>`,
  home: () => `<div class="screen"><div class="top"><span class="logo">✦ NovelCraft</span></div><div class="scroll">
    <button class="card hero" data-act="newproj"><div><h2>${me.name ? esc(me.name) + ', т' : 'Т'}воя история начинается здесь</h2><p>Создавай персонажей, локации и уникальные сюжеты</p></div><span class="ib" style="align-self:end;background:var(--grad);color:#2a1456">+</span></button>
    <div class="row"><h3>Мои проекты</h3><button class="ib" data-act="newproj" aria-label="Новый проект">+</button></div>
    ${loadErr ? '<p class="empty">Не удалось загрузить проекты. Закройте и откройте приложение снова.</p>' : !P.length ? '<p class="empty">Проектов пока нет. Нажмите «+», чтобы создать первый.</p>' : ''}
    ${P.map(p => `<div class="card proj"><button class="open" data-open="${p.id}"><div class="th" style="background:${grad(p.data.h)}"></div><div style="min-width:0"><b>${esc(p.name)}</b><small>${scenes(p.data)} сцен · ${p.data.chars.length} персонажей</small><small style="margin-top:8px">Последнее изменение:<br>${when(p.updated_at)}</small></div></button><button class="more" data-del="${p.id}" aria-label="Удалить проект">⋮</button></div>`).join('')}</div>${nav()}</div>`,
  chars: () => `<div class="screen">${top('Персонажи', '<button class="ib" data-act="newchar" aria-label="Добавить">+</button>')}${sub()}${chips([['all', 'Все'], ['main', 'Главные'], ['sec', 'Второстепенные']], tab.chars, 'chars')}<div class="scroll">
    ${(() => { const l = cur.data.chars.filter(c => tab.chars == 'all' || (tab.chars == 'main') == !!c.main); return l.length ? `<div class="grid">${l.map(c => `<button class="card ch" data-go="bgs"><div class="ph" style="background:${grad(c.h)}"></div><b>${esc(c.name)}</b><small>${c.main ? 'Главный персонаж' : 'Второстепенный'}</small></button>`).join('')}</div>` : '<p class="empty">Здесь пока никого нет. Добавьте персонажа кнопкой «+».</p>' })()}</div>${nav()}</div>`,
  bgs: () => `<div class="screen">${top('Выбери фон')}${chips(['Все', 'Город', 'Природа', 'Интерьер'].map(x => [x, x]), tab.bgs, 'bgs')}<div class="scroll"><div class="grid">
    ${BGS.map((b, i) => [b, i]).filter(([b]) => (tab.bgs == 'Все' || b[0] == tab.bgs) && (!q || b[0].toLowerCase().includes(q.toLowerCase()))).map(([b, i]) => `<button class="bg ${cur.data.bg == i ? 'on' : ''}" data-bg="${i}" style="background:${grad(b[1], b[1] + 70)}" aria-label="${b[0]} ${i + 1}"></button>`).join('')}</div></div>
    <label class="card search">🔍<input id="q" placeholder="Поиск по фонам…" value="${esc(q)}"></label></div>`,
  scripts: () => `<div class="screen">${top('Скрипты')}${sub()}${chips([['br', 'Ветвления'], ['var', 'Переменные'], ['ev', 'События']], tab.scripts, 'scripts')}<div class="scroll">${tab.scripts == 'br' ? `<div class="flow">
    <div class="node">Сцена 3</div><div class="line"></div><div class="node q">? Выбрать:</div><div class="split">${cur.data.branches.map((b, i) => `<div class="flow"><div class="node">${esc(b)}</div><div class="line"></div><div class="node">Сцена ${i + 4}</div></div>`).join('')}</div></div>
    <button class="card wide" data-act="branch" style="margin-top:28px">+ Добавить ветку</button><button class="card wide" data-go="preview" style="margin-top:12px">▶ Предпросмотр</button>` :
      tab.scripts == 'var' ? `<ul class="vars">${cur.data.vars.map(v => `<li class="card"><span>${esc(v[0])}</span><b>${esc(v[1])}</b></li>`).join('')}</ul><button class="card wide" data-act="newvar">+ Добавить переменную</button>` :
        `<ul class="vars">${cur.data.events.map(v => `<li class="card">${esc(v)}</li>`).join('')}</ul><button class="card wide" data-act="newevent">+ Добавить событие</button>`}</div>${nav()}</div>`,
  preview: () => `<div class="screen">${top('Предпросмотр')}<div class="stage" style="background:${grad(BGS[cur.data.bg][1], BGS[cur.data.bg][1] + 70)}"><div class="ph" style="background:none"></div><div class="card dlg"><span class="tag">${esc(cur.data.chars[0]?.name || 'Рассказчик')}</span><p>${esc(cur.data.lines[line])}</p></div></div>
    <div class="ctl"><button class="ib" data-act="prev" aria-label="Назад">‹</button><button class="ib" data-go="scripts" aria-label="Скрипты">⑂</button><button class="ib play" data-act="next" aria-label="Дальше">▶</button><button class="ib" data-go="bgs" aria-label="Фон">⚙</button><button class="ib" data-act="full" aria-label="Во весь экран">⤢</button></div></div>`,
  profile: () => `<div class="screen">${top('Профиль')}<div class="scroll"><div class="card wide" style="flex-direction:column"><b style="font-size:19px">${esc(me.name)}</b><small style="color:var(--mute)">Проектов: ${P.length}. Данные хранятся в вашем аккаунте Telegram.</small></div></div>${nav()}</div>`
};

function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $.append(d); setTimeout(() => d.remove(), 1800) }
function ask(title, ok, ph = '') {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="card" role="dialog" aria-label="${esc(title)}"><b>${esc(title)}</b><input maxlength="60" placeholder="${esc(ph)}"><div class="btns"><button data-x>Отмена</button><button class="ok" data-ok>Готово</button></div></div>`;
  $.append(m); const i = m.querySelector('input'); i.focus();
  const done = () => { const v = i.value.trim(); m.remove(); if (v) ok(v) };
  m.onclick = e => { if (e.target.closest('[data-x]') || e.target === m) m.remove(); else if (e.target.closest('[data-ok]')) done() };
  i.onkeydown = e => { if (e.key == 'Enter') done() };
}
function draw() {
  const keep = document.activeElement?.id == 'q';
  const r = !inTg ? 'gate' : (['chars', 'bgs', 'scripts', 'preview'].includes(route) && !cur ? 'home' : route);
  $.innerHTML = views[r]();
  if (keep) { const i = document.getElementById('q'); i.focus(); i.setSelectionRange(99, 99) }
  if (inTg) { const back = !['home', 'splash', 'gate'].includes(route); back ? tg.BackButton.show() : tg.BackButton.hide() }
}
const tick = () => tg?.HapticFeedback?.impactOccurred('light');
const acts = {
  newproj() { ask('Название проекта', n => { const p = { id: crypto.randomUUID(), name: n, data: newData(), updated_at: null }; P.unshift(p); cur = p; persist(p); route = 'scripts'; draw() }, 'Например, «Звёздный путь»') },
  newchar() { ask('Имя персонажа', n => { cur.data.chars.push({ name: n, main: cur.data.chars.length < 2 ? 1 : 0, h: hue() }); persist(); draw() }) },
  branch() { ask('Название ветки', n => { if (cur.data.branches.length >= 3) cur.data.branches.shift(); cur.data.branches.push(n); persist(); draw() }) },
  newvar() { ask('Название переменной', n => { cur.data.vars.push([n, 0]); persist(); draw() }) },
  newevent() { ask('Название события', n => { cur.data.events.push(n); persist(); draw() }) },
  next() { line = (line + 1) % cur.data.lines.length; draw() }, prev() { line = (line + cur.data.lines.length - 1) % cur.data.lines.length; draw() },
  full() { tg.isFullscreen ? tg.exitFullscreen?.() : (tg.requestFullscreen ? tg.requestFullscreen() : tg.expand()) }
};
$.addEventListener('click', e => {
  const t = e.target.closest('[data-go],[data-act],[data-tab],[data-bg],[data-open],[data-del]'); if (!t) return;
  const d = t.dataset; tick();
  if (d.go) { route = d.go; if (d.go == 'preview') line = 0; draw() }
  else if (d.act) acts[d.act]();
  else if (d.tab) { tab[d.tab] = d.v; draw() }
  else if (d.bg) { cur.data.bg = +d.bg; persist(); draw(); toast('Фон выбран') }
  else if (d.open) { cur = P.find(p => p.id == d.open); route = 'scripts'; draw() }
  else if (d.del) {
    const p = P.find(x => x.id == d.del);
    tg.showConfirm(`Удалить проект «${p.name}»?`, ok => { if (!ok) return;
      api('DELETE', 'projects?id=' + p.id).then(() => { P = P.filter(x => x !== p); if (cur === p) cur = null; draw() }).catch(() => toast('Не удалось удалить')) });
  }
});
$.addEventListener('input', e => { if (e.target.id == 'q') { q = e.target.value; draw() } });

(async function init() {
  if (!inTg) { try { botName = (await (await fetch('/api/config')).json()).bot } catch {} return draw(); }
  tg.ready(); tg.expand(); tg.setHeaderColor?.('#14123a'); tg.setBackgroundColor?.('#14123a');
  tg.BackButton.onClick(() => { route = 'home'; draw() });
  me.name = tg.initDataUnsafe?.user?.first_name || '';
  draw();
  try { const r = await api('GET', 'projects'); P = r.projects; me.name = r.user.name || me.name } catch { loadErr = true }
  draw();
})();
