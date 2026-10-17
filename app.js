const $ = document.getElementById('app');
const KEY = 'novelcraft:v1';
const grad = (h, h2 = h + 50) => `linear-gradient(160deg,hsl(${h} 70% 62%),hsl(${h2} 65% 38%) 70%,hsl(${h2 + 30} 50% 18%))`;
const def = {
  projects: [
    { id: 1, name: 'Звёздный путь', scenes: 12, chars: 3, when: 'Сегодня, 14:32', h: 270 },
    { id: 2, name: 'Тени города', scenes: 8, chars: 2, when: 'Вчера, 21:17', h: 20 },
    { id: 3, name: 'Новая история', scenes: 5, chars: 1, when: '12 окт. 2024', h: 330 }],
  chars: [
    { id: 1, name: 'Луна', role: 'Главная героиня', main: 1, h: 265 },
    { id: 2, name: 'Алекс', role: 'Главный герой', main: 1, h: 35 },
    { id: 3, name: 'Мия', role: 'Подруга', main: 0, h: 335 },
    { id: 4, name: 'Кай', role: 'Второстепенный', main: 0, h: 190 }],
  bgs: [['Город', 20], ['Город', 270], ['Интерьер', 30], ['Природа', 120], ['Природа', 195], ['Интерьер', 15], ['Город', 230], ['Город', 300]],
  bg: 0, branches: ['Пойти с ним', 'Остаться'], vars: [['доверие', 3], ['ключ найден', 'нет']], events: ['Гроза над городом', 'Звонок в дверь'],
  lines: ['Это только начало…', 'Город сегодня светится иначе.', 'Ты пойдёшь со мной?']
};
let S; try { S = { ...def, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { S = def }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)) } catch {} };
let route = 'splash', tab = { chars: 'all', scripts: 'br', bgs: 'Все' }, line = 0, q = '';

const nav = r => `<nav class="nav">${[['home', '⌂', 'Главная'], ['chars', '▤', 'Проекты'], ['profile', '☺', 'Профиль']].map(([k, i, t]) =>
  `<button class="${route == k || (k == 'chars' && route == 'chars') ? 'on' : ''}" data-go="${k}"><i>${i}</i>${t}</button>`).join('')}</nav>`;
const top = (t, r = '') => `<div class="top"><button class="ib" data-go="home" aria-label="Назад">←</button><span>${t}</span><span class="sp"></span>${r}</div>`;
const chips = (items, cur, key) => `<div class="tabs">${items.map(([k, t]) => `<button class="chip ${cur == k ? 'on' : ''}" data-tab="${key}" data-v="${k}">${t}</button>`).join('')}</div>`;

const views = {
  splash: () => `<div class="screen splash"><div style="font-size:54px">📖</div><div class="big">NovelCraft</div><p style="margin-top:10px;font-size:19px">Создавай свои<br>визуальные новеллы</p><button class="cta" data-go="home">✦ Начать</button></div>`,
  home: () => `<div class="screen"><div class="top"><span class="logo">✦ NovelCraft</span><span class="sp"></span><button class="ib" data-act="settings" aria-label="Настройки">⚙</button></div><div class="scroll">
    <button class="card hero" data-go="chars"><div><h2>Твоя история начинается здесь</h2><p>Создавай персонажей, локации и уникальные сюжеты</p></div><span class="ib" style="align-self:end;background:var(--grad);color:#2a1456">→</span></button>
    <div class="row"><h3>Мои проекты</h3><button class="ib" data-act="newproj" aria-label="Новый проект">+</button></div>
    ${S.projects.map(p => `<button class="card proj" data-go="scripts"><div class="th" style="background:${grad(p.h)}"></div><div style="flex:1"><b>${p.name}</b><small>${p.scenes} сцен · ${p.chars} персонажа</small><small style="margin-top:8px">Последнее изменение:<br>${p.when}</small></div><span>⋮</span></button>`).join('')}</div>${nav()}</div>`,
  chars: () => `<div class="screen">${top('Персонажи', '<button class="ib" data-act="newchar" aria-label="Добавить">+</button>')}${chips([['all', 'Все'], ['main', 'Главные'], ['sec', 'Второстепенные']], tab.chars, 'chars')}<div class="scroll"><div class="grid">
    ${S.chars.filter(c => tab.chars == 'all' || (tab.chars == 'main') == !!c.main).map(c => `<button class="card ch" data-go="bgs"><div class="ph" style="background:${grad(c.h)}"></div><b>${c.name}</b><small>${c.role}</small></button>`).join('')}</div></div>${nav()}</div>`,
  bgs: () => `<div class="screen">${top('Выбери фон')}${chips(['Все', 'Город', 'Природа', 'Интерьер'].map(x => [x, x]), tab.bgs, 'bgs')}<div class="scroll"><div class="grid">
    ${S.bgs.map((b, i) => [b, i]).filter(([b]) => (tab.bgs == 'Все' || b[0] == tab.bgs) && (!q || b[0].toLowerCase().includes(q.toLowerCase()))).map(([b, i]) => `<button class="bg ${S.bg == i ? 'on' : ''}" data-bg="${i}" style="background:${grad(b[1], b[1] + 70)}" aria-label="${b[0]} ${i + 1}"></button>`).join('')}</div></div>
    <label class="card search">🔍<input id="q" placeholder="Поиск по фонам…" value="${q}"></label></div>`,
  scripts: () => `<div class="screen">${top('Скрипты')}${chips([['br', 'Ветвления'], ['var', 'Переменные'], ['ev', 'События']], tab.scripts, 'scripts')}<div class="scroll">${tab.scripts == 'br' ? `<div class="flow">
    <div class="node">Сцена 3</div><div class="line"></div><div class="node q">? Выбрать:</div><div class="split">${S.branches.map(b => `<div class="flow"><div class="node">${b}</div><div class="line"></div><div class="node">Сцена ${S.branches.indexOf(b) + 4}</div></div>`).join('')}</div></div>
    <button class="card wide" data-act="branch" style="margin-top:28px">+ Добавить ветку</button>` :
      tab.scripts == 'var' ? `<ul class="vars">${S.vars.map(v => `<li class="card"><span>${v[0]}</span><b>${v[1]}</b></li>`).join('')}</ul>` :
        `<ul class="vars">${S.events.map(v => `<li class="card">${v}</li>`).join('')}</ul>`}</div>${nav()}</div>`,
  preview: () => `<div class="screen">${top('Предпросмотр')}<div class="stage" style="background:${grad(S.bgs[S.bg][1], S.bgs[S.bg][1] + 70)}"><div class="ph" style="background:none"></div><div class="card dlg"><span class="tag">Луна</span><p>${S.lines[line]}</p></div></div>
    <div class="ctl"><button class="ib" data-act="prev" aria-label="Назад">‹</button><button class="ib" data-go="scripts" aria-label="Скрипты">⑂</button><button class="ib play" data-act="next" aria-label="Дальше">▶</button><button class="ib" data-go="bgs" aria-label="Фон">⚙</button><button class="ib" data-act="full" aria-label="Во весь экран">⤢</button></div></div>`,
  profile: () => `<div class="screen">${top('Профиль')}<div class="scroll"><button class="card wide" data-go="preview">▶ Открыть предпросмотр</button><button class="card wide" data-act="reset" style="margin-top:12px">Сбросить данные</button></div>${nav()}</div>`
};
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $.append(d); setTimeout(() => d.remove(), 1600) }
function draw() { const keep = document.activeElement?.id == 'q'; $.innerHTML = views[route](); if (keep) { const i = document.getElementById('q'); i.focus(); i.setSelectionRange(99, 99) } }
const ask = (m) => (prompt(m) || '').trim();
const acts = {
  newproj() { const n = ask('Название проекта'); if (n) { S.projects.unshift({ id: Date.now(), name: n, scenes: 0, chars: 0, when: 'Только что', h: Math.random() * 360 | 0 }); save(); draw() } },
  newchar() { const n = ask('Имя персонажа'); if (n) { S.chars.push({ id: Date.now(), name: n, role: 'Второстепенный', main: 0, h: Math.random() * 360 | 0 }); save(); draw() } },
  branch() { const n = ask('Название ветки'); if (n) { if (S.branches.length >= 3) S.branches.shift(); S.branches.push(n); save(); draw() } },
  next() { line = (line + 1) % S.lines.length; draw() }, prev() { line = (line + S.lines.length - 1) % S.lines.length; draw() },
  full() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.() },
  settings() { toast('Настройки скоро появятся') },
  reset() { localStorage.removeItem(KEY); S = { ...def }; route = 'home'; draw() }
};
$.addEventListener('click', e => {
  const t = e.target.closest('[data-go],[data-act],[data-tab],[data-bg]'); if (!t) return;
  const d = t.dataset;
  if (d.go) { route = d.go; if (d.go == 'preview') line = 0; draw() }
  else if (d.act) acts[d.act]();
  else if (d.tab) { tab[d.tab] = d.v; draw() }
  else if (d.bg) { S.bg = +d.bg; save(); draw(); toast('Фон выбран') }
});
$.addEventListener('input', e => { if (e.target.id == 'q') { q = e.target.value; draw() } });
draw();
