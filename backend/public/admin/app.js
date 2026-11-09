// Vorian admin panel. Every number comes from /admin/api after an admin
// signs in; the page itself holds no data. All text from the server is
// escaped before it reaches the page.
(function () {
  'use strict';

  var STORE_KEY = 'vorian-admin-session';
  var main = document.getElementById('main');
  var drawer = document.getElementById('drawer');
  var modalBack = document.getElementById('modal');
  var session = readSession();
  var current = null;
  var refreshTimer = null;
  var usersState = { filter: 'all', search: '', page: 0 };
  var errorsDays = 7;

  // ---------- small helpers ----------
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) { return Number(n || 0).toLocaleString('es-CL'); }
  function money(n) { return n == null ? 'Por definir' : '$ ' + num(n); }
  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return esc(((parts[0] || '')[0] || '?') + ((parts[1] || '')[0] || '')).toUpperCase();
  }
  function date(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function dateTime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function ago(value) {
    if (!value) return 'Nunca';
    var s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
    if (s < 60) return 'Ahora';
    var m = Math.round(s / 60); if (m < 60) return 'Hace ' + m + ' min';
    var h = Math.round(m / 60); if (h < 24) return 'Hace ' + h + ' h';
    var d = Math.round(h / 24); if (d === 1) return 'Ayer';
    if (d < 30) return 'Hace ' + d + ' días';
    return date(value);
  }
  function phone(platform, version) {
    if (!platform) return '<small>Sin datos aún</small>';
    var name = platform === 'ios' ? 'iPhone' : platform === 'android' ? 'Android' : 'Otro';
    return esc(name) + (version ? ' · ' + esc(version) : '');
  }
  var PLAN = {
    trial: ['blue', 'En prueba'], trial_ending: ['warn', 'Prueba por vencer'], expired: ['bad', 'Prueba vencida'],
    paid: ['ok', 'Pagando'], free_access: ['vio', 'Acceso gratis'], suspended: ['bad', 'Suspendida'],
  };
  function planChip(plan) { var p = PLAN[plan] || ['mute', plan]; return '<span class="chip ' + p[0] + '">' + esc(p[1]) + '</span>'; }
  function onlineChip(person) {
    return person.online
      ? '<span class="chip ok live"><span class="dot"></span>Conectado</span>'
      : '<span class="chip mute">' + esc(ago(person.lastSeen)) + '</span>';
  }
  function trialCell(person, total) {
    if (person.plan === 'free_access') return '<small>Sin límite</small><div class="bar silver"><i style="width:100%"></i></div>';
    if (person.plan === 'paid') return '<small>Terminó la prueba</small><div class="bar green"><i style="width:100%"></i></div>';
    var left = person.trialDaysLeft;
    if (left == null) return '<small>—</small>';
    if (left <= 0) return '<small>Venció ' + esc(ago(person.trialEndsAt).toLowerCase()) + '</small><div class="bar red"><i style="width:100%"></i></div>';
    // A lengthened trial adds its extra days to the total.
    total = Math.max(total, left);
    var used = Math.min(100, Math.max(4, Math.round((1 - left / total) * 100)));
    return '<small>Quedan ' + left + ' de ' + total + '</small><div class="bar ' + (left <= 7 ? 'amber' : '') + '"><i style="width:' + used + '%"></i></div>';
  }
  function toast(text, bad) {
    var el = document.getElementById('toast');
    el.textContent = text; el.className = 'toast' + (bad ? ' bad' : ''); el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3800);
  }
  var trialDays = 30;

  // ---------- session ----------
  function readSession() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveSession(next) {
    session = next;
    try { next ? localStorage.setItem(STORE_KEY, JSON.stringify(next)) : localStorage.removeItem(STORE_KEY); } catch (e) { /* private mode */ }
  }
  function showLogin(message) {
    saveSession(null);
    clearInterval(refreshTimer);
    document.getElementById('app').hidden = true;
    document.getElementById('login').hidden = false;
    var err = document.getElementById('login-error');
    err.hidden = !message; err.textContent = message || '';
  }
  function showApp() {
    document.getElementById('login').hidden = true;
    document.getElementById('app').hidden = false;
    document.getElementById('me-name').textContent = session.name;
    document.getElementById('me-initials').innerHTML = initials(session.name);
    route();
  }

  function request(path, options) {
    options = options || {};
    var headers = { 'Content-Type': 'application/json' };
    if (session) headers.Authorization = 'Bearer ' + session.accessToken;
    return fetch('/admin/api' + path, {
      method: options.method || 'GET', headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; });
    });
  }
  var refreshing = null;
  function renew() {
    if (!refreshing) {
      refreshing = request('/refresh', { method: 'POST', body: { refreshToken: session.refreshToken } }).then(function (r) {
        refreshing = null;
        if (!r.res.ok) throw new Error('expired');
        saveSession(r.data);
      }, function (e) { refreshing = null; throw e; });
    }
    return refreshing;
  }
  function api(path, options) {
    if (!session) { showLogin(); return Promise.reject(new Error('signed out')); }
    return request(path, options).then(function (r) {
      if (r.res.status === 401) {
        return renew().then(function () { return request(path, options); }, function () {
          showLogin('Tu sesión terminó. Vuelve a entrar.');
          throw new Error('signed out');
        });
      }
      return r;
    }).then(function (r) {
      if (r.res.status === 401) { showLogin('Tu sesión terminó. Vuelve a entrar.'); throw new Error('signed out'); }
      if (r.res.status === 403) { showLogin('Esta cuenta no tiene acceso a la administración.'); throw new Error('forbidden'); }
      if (!r.res.ok) throw new Error((r.data && r.data.message && r.data.message !== 'Internal Server Error') ? r.data.message : 'Algo falló. Inténtalo de nuevo.');
      return r.data;
    });
  }

  document.getElementById('login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var form = event.target;
    var button = document.getElementById('login-button');
    var err = document.getElementById('login-error');
    button.disabled = true; button.textContent = 'Entrando…'; err.hidden = true;
    request('/login', { method: 'POST', body: { email: form.email.value, password: form.password.value } }).then(function (r) {
      button.disabled = false; button.textContent = 'Entrar';
      if (!r.res.ok) { err.textContent = (r.data && r.data.message) || 'No se pudo entrar.'; err.hidden = false; return; }
      form.password.value = '';
      saveSession(r.data);
      showApp();
    }, function () {
      button.disabled = false; button.textContent = 'Entrar';
      err.textContent = 'Sin conexión con el servidor.'; err.hidden = false;
    });
  });
  document.getElementById('logout').addEventListener('click', function () { closeDrawer(); showLogin(); });

  // ---------- routing ----------
  var VIEWS = { resumen: viewOverview, usuarios: viewUsers, planes: viewPlans, errores: viewErrors, opiniones: viewFeedback, asistente: viewAssistant, gastos: viewCosts, sistema: viewSystem, ajustes: viewSettings };
  function route() {
    if (!session) return;
    var name = (location.hash || '#resumen').slice(1);
    if (!VIEWS[name]) name = 'resumen';
    current = name;
    clearInterval(refreshTimer);
    closeDrawer();
    document.querySelectorAll('#nav a').forEach(function (a) { a.classList.toggle('on', a.dataset.s === name); });
    main.innerHTML = '<div class="skeleton"></div>';
    window.scrollTo(0, 0);
    VIEWS[name]();
  }
  window.addEventListener('hashchange', route);
  function failView(error) {
    if (/signed out|forbidden/.test(error.message)) return;
    main.innerHTML = '<div class="card"><div class="empty">' + esc(error.message) + '<br><br><button class="btn" id="retry">Reintentar</button></div></div>';
    document.getElementById('retry').onclick = route;
  }
  function header(title, subtitle, right) {
    return '<div class="top"><div><h1>' + esc(title) + '</h1><p>' + esc(subtitle) + '</p></div>' + (right ? '<div class="right">' + right + '</div>' : '') + '</div>';
  }
  function kpi(label, value, delta, icon, tone) {
    return '<div class="card kpi"><div class="label">' + (icon ? '<span class="ic" style="background:var(--' + tone + 'T);color:var(--' + (tone === 'accent' ? 'accentB' : tone) + ')">' + icon + '</span>' : '') + esc(label) + '</div><div class="num">' + value + '</div><div class="delta">' + (delta || '&nbsp;') + '</div></div>';
  }
  var ICON = {
    online: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M5 12a7 7 0 0 1 14 0M2 12a10 10 0 0 1 20 0"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>',
  };

  function setBadges(o) {
    var e = document.getElementById('nav-errors'); e.hidden = !o.quality.unresolvedErrors; e.textContent = o.quality.unresolvedErrors;
    var r = document.getElementById('nav-reports'); r.hidden = !o.quality.openReports; r.textContent = o.quality.openReports;
  }

  // ---------- Resumen ----------
  function chart(series) {
    if (!series.length) return '<div class="empty">Aún no hay actividad registrada.</div>';
    var W = 640, H = 190, max = 1;
    series.forEach(function (d) { max = Math.max(max, d.active, d.signups); });
    var step = W / Math.max(1, series.length - 1);
    function y(v) { return 16 + (H - 26) * (1 - v / max); }
    function line(key) { return series.map(function (d, i) { return (i ? 'L' : 'M') + (i * step).toFixed(1) + ' ' + y(d[key]).toFixed(1); }).join(' '); }
    var area = line('active') + ' L' + W + ' ' + H + ' L0 ' + H + ' Z';
    var last = series[series.length - 1];
    var label = function (d) { return new Date(d.day + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }); };
    return '<svg class="chart" viewBox="0 0 640 214" role="img" aria-label="Actividad de los últimos 30 días">' +
      '<defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B82F6" stop-opacity=".35"/><stop offset="1" stop-color="#3B82F6" stop-opacity="0"/></linearGradient></defs>' +
      '<g stroke="rgba(255,255,255,.06)"><line x1="0" y1="16" x2="640" y2="16"/><line x1="0" y1="98" x2="640" y2="98"/><line x1="0" y1="190" x2="640" y2="190"/></g>' +
      '<text x="0" y="11" fill="#6f7a8c" font-size="10">' + num(max) + '</text>' +
      '<path d="' + area + '" fill="url(#ga)"/>' +
      '<path d="' + line('active') + '" fill="none" stroke="#5B9BFF" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="' + line('signups') + '" fill="none" stroke="#d3d8e0" stroke-width="2" stroke-dasharray="4 5"/>' +
      '<circle cx="' + W + '" cy="' + y(last.active) + '" r="4.5" fill="#7DB2FF"/>' +
      '<g fill="#6f7a8c" font-size="11"><text x="0" y="210">' + esc(label(series[0])) + '</text><text x="300" y="210">' + esc(label(series[Math.floor(series.length / 2)])) + '</text><text x="612" y="210">hoy</text></g></svg>';
  }
  function viewOverview() {
    api('/overview').then(function (o) {
      if (current !== 'resumen') return;
      setBadges(o);
      trialDays = o.settings.trialDays;
      var hour = new Date().getHours();
      var hello = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
      var today = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
      var first = String(session.name).split(' ')[0];
      var p = o.plans, trialTotal = Math.max(1, p.trial + p.expired + p.paid);
      var online = o.online.length ? o.online.map(function (u) {
        return '<div class="li click" data-user="' + esc(u.id) + '"><div class="av">' + initials(u.name) + '</div><div><div class="t">' + esc(u.name) + '</div><div class="s">' + phone(u.platform, u.appVersion) + '</div></div><div class="r"><span class="chip ok"><span class="dot"></span>' + esc(ago(u.lastSeen).toLowerCase()) + '</span></div></div>';
      }).join('') : '<div class="empty">Nadie conectado en este momento.</div>';
      var errors = o.recentErrors.length ? o.recentErrors.map(errorRow).join('') : '<div class="empty">Sin errores pendientes. Todo bien.</div>';
      main.innerHTML = header(hello + ', ' + first, 'Así está Vorian hoy, ' + today,
        '<span class="sub">Se actualiza solo cada 30 segundos</span>') +
        '<div class="kpis">' +
        kpi('Conectados ahora', num(o.users.onlineNow), '<span class="chip ok live"><span class="dot"></span>en vivo</span> · ' + num(o.users.activeToday) + ' usaron la app hoy', ICON.online, 'ok') +
        kpi('Usuarios registrados', num(o.users.total), '<b>+' + num(o.users.newThisWeek) + '</b> esta semana', ICON.users, 'accent') +
        kpi('Teléfonos con la app', num(o.installs.total), 'Android ' + num(o.installs.android) + ' · iPhone ' + num(o.installs.ios), ICON.phone, 'violet') +
        kpi('Errores 24 horas', num(o.quality.errors24h), num(o.quality.unresolvedErrors) + ' tipos sin resolver', ICON.alert, o.quality.unresolvedErrors ? 'bad' : 'ok') +
        '</div><div class="grid2">' +
        '<div class="card"><h3>Actividad de los últimos 30 días<span class="legend"><span><i style="background:#5B9BFF"></i>Usaron la app</span><span><i style="background:#d3d8e0"></i>Registros nuevos</span></span></h3>' + chart(o.series) + '</div>' +
        '<div class="card"><h3>Planes<a class="more" href="#planes">Ver detalle</a></h3><div class="sub">Prueba gratis de ' + o.settings.trialDays + ' días desde el registro</div><div class="funnel">' +
        funnelRow('En prueba gratis', p.trial, trialTotal, 'silver') +
        funnelRow('Les quedan 7 días o menos', p.ending, trialTotal, 'amber') +
        funnelRow('Pagando', p.paid, trialTotal, 'green') +
        funnelRow('Prueba vencida sin pagar', p.expired, trialTotal, 'red') +
        '</div><div class="sub" style="margin-top:16px">Con acceso gratis: <b style="color:var(--text)">' + num(p.free) + '</b></div></div></div>' +
        '<div class="grid3">' +
        '<div class="card"><h3>Conectados ahora<a class="more" href="#usuarios">Ver todos</a></h3><div class="list">' + online + '</div></div>' +
        '<div class="card"><h3>Errores recientes<a class="more" href="#errores">Ver todos</a></h3><div class="list">' + errors + '</div></div>' +
        '<div class="card"><h3>Calidad</h3><div class="list">' +
        '<div class="sys"><span>Reportes por revisar</span><span class="end">' + (o.quality.openReports ? '<span class="chip warn">' + num(o.quality.openReports) + '</span>' : '<span class="chip ok">Ninguno</span>') + '</span></div>' +
        '<div class="sys"><span>Opiniones esta semana</span><span class="end"><span class="chip blue">' + num(o.quality.feedbackWeek) + '</span></span></div>' +
        '<div class="sys"><span>Servidor</span><span class="end"><span class="chip ok"><span class="dot"></span>Funcionando</span></span></div>' +
        '<div class="sys"><span>Última actualización</span><span class="end"><span class="sub">' + esc(dateTime(o.generatedAt)) + '</span></span></div>' +
        '</div><a class="more" href="#sistema" style="display:block;margin-top:10px;color:var(--accentB);font-size:12px;text-decoration:none">Ver estado del sistema</a></div></div>';
      bindUserLinks();
      clearInterval(refreshTimer);
      refreshTimer = setInterval(function () { if (current === 'resumen' && !drawer.classList.contains('open') && document.visibilityState === 'visible') viewOverview(); }, 30000);
    }, failView);
  }
  function funnelRow(label, value, total, tone) {
    var width = value ? Math.max(3, Math.round(value / total * 100)) : 0;
    return '<div class="frow"><div class="fl"><span>' + esc(label) + '</span><b>' + num(value) + '</b></div><div class="bar ' + tone + '"><i style="width:' + width + '%"></i></div></div>';
  }
  function errorRow(g) {
    var tone = g.people >= 3 || g.occurrences >= 10 ? 'var(--bad)' : 'var(--warn)';
    return '<div class="err"><div class="sev" style="background:' + tone + '"></div><div><div class="t">' + esc(g.title) + '</div><div class="s">' + num(g.occurrences) + ' veces · ' + num(g.people) + (g.people === 1 ? ' persona' : ' personas') + ' · ' + (g.source === 'app' ? 'App' : 'Servidor') + '</div></div><div class="r">' + esc(ago(g.lastAt)) + '</div></div>';
  }

  // ---------- Usuarios ----------
  var FILTERS = [['all', 'Todos'], ['online', 'Conectados'], ['trial', 'En prueba'], ['ending', 'Por vencer'], ['expired', 'Vencidos'], ['paid', 'Pagando'], ['free', 'Acceso gratis'], ['suspended', 'Suspendidos']];
  function viewUsers() {
    main.innerHTML = header('Usuarios', 'Todas las personas registradas en Vorian',
      '<div class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="user-search" placeholder="Buscar por nombre, correo o teléfono" value="' + esc(usersState.search) + '"></div>') +
      '<div class="card"><div class="filters" id="user-filters">' + FILTERS.map(function (f) {
        return '<button data-f="' + f[0] + '" class="' + (usersState.filter === f[0] ? 'on' : '') + '">' + esc(f[1]) + '</button>';
      }).join('') + '</div><div id="user-table"><div class="loading">Cargando…</div></div></div>';
    var timer;
    document.getElementById('user-search').addEventListener('input', function (e) {
      clearTimeout(timer);
      timer = setTimeout(function () { usersState.search = e.target.value; usersState.page = 0; loadUsers(); }, 300);
    });
    document.querySelectorAll('#user-filters button').forEach(function (b) {
      b.onclick = function () {
        usersState.filter = b.dataset.f; usersState.page = 0;
        document.querySelectorAll('#user-filters button').forEach(function (x) { x.classList.toggle('on', x === b); });
        loadUsers();
      };
    });
    loadUsers();
  }
  function loadUsers() {
    var q = '?filter=' + usersState.filter + '&page=' + usersState.page + (usersState.search ? '&search=' + encodeURIComponent(usersState.search) : '');
    api('/users' + q).then(function (r) {
      var box = document.getElementById('user-table');
      if (!box) return;
      if (!r.users.length) { box.innerHTML = '<div class="empty">No hay personas que coincidan.</div>'; return; }
      box.innerHTML = '<div class="tablewrap"><table><thead><tr><th>Persona</th><th>Conexión</th><th>Plan</th><th>Días de prueba</th><th>Registro</th><th>Teléfono</th></tr></thead><tbody>' +
        r.users.map(function (u) {
          return '<tr class="row" data-user="' + esc(u.id) + '"><td><div class="person"><div class="av">' + initials(u.name) + '</div><div>' + esc(u.name) + '<small>' + esc(u.email || '') + '</small></div></div></td><td>' + onlineChip(u) + '</td><td>' + planChip(u.plan) + '</td><td class="trial">' + trialCell(u, trialDays) + '</td><td>' + esc(date(u.createdAt)) + '</td><td>' + phone(u.platform, u.appVersion) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="pager"><span>' + num(r.page * r.pageSize + 1) + '–' + num(r.page * r.pageSize + r.users.length) + ' de ' + num(r.total) + '</span>' +
        '<button class="btn small" id="prev"' + (r.page === 0 ? ' disabled' : '') + '>Anterior</button><button class="btn small" id="next"' + ((r.page + 1) * r.pageSize >= r.total ? ' disabled' : '') + '>Siguiente</button></div>';
      document.getElementById('prev').onclick = function () { usersState.page--; loadUsers(); };
      document.getElementById('next').onclick = function () { usersState.page++; loadUsers(); };
      bindUserLinks();
    }, function (e) { var box = document.getElementById('user-table'); if (box) box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  }
  function bindUserLinks() {
    document.querySelectorAll('[data-user]').forEach(function (el) {
      el.onclick = function () {
        document.querySelectorAll('tr.row').forEach(function (r) { r.classList.toggle('sel', r === el); });
        openUser(el.dataset.user);
      };
    });
  }

  // ---------- Ficha de persona ----------
  var ACTION_TEXT = {
    trial_extended: 'Se alargó su prueba', free_access_granted: 'Recibió acceso gratis', free_access_removed: 'Se le quitó el acceso gratis',
    suspended: 'Cuenta suspendida', reactivated: 'Cuenta reactivada', notice_sent: 'Se le envió un aviso',
  };
  function closeDrawer() { drawer.classList.remove('open'); document.querySelectorAll('tr.row').forEach(function (r) { r.classList.remove('sel'); }); }
  function openUser(id) {
    drawer.innerHTML = '<div class="loading">Cargando…</div>';
    drawer.classList.add('open');
    api('/users/' + id).then(function (u) {
      var devices = u.devices.length ? u.devices.map(function (d) {
        return '<div class="li"><div><div class="t">' + phone(d.platform, d.app_version) + (d.os_version ? ' <small>(sistema ' + esc(d.os_version) + ')</small>' : '') + '</div><div class="s">Instalada ' + esc(date(d.first_seen)) + '</div></div><div class="r">' + esc(ago(d.last_seen)) + '</div></div>';
      }).join('') : '<div class="sub">Aún no abre la versión nueva de la app.</div>';
      var history = u.history.length ? u.history.map(function (h) {
        var extra = h.action === 'trial_extended' && h.detail && h.detail.days ? ' (' + h.detail.days + ' días)' : h.action === 'notice_sent' && h.detail && h.detail.title ? ': «' + esc(h.detail.title) + '»' : '';
        return '<div class="li"><div><div class="t">' + esc(ACTION_TEXT[h.action] || h.action) + extra + '</div><div class="s">' + esc(dateTime(h.created_at)) + '</div></div></div>';
      }).join('') : '';
      history += '<div class="li"><div><div class="t">Creó su cuenta</div><div class="s">' + esc(date(u.createdAt)) + '</div></div></div>';
      var trialText = u.plan === 'free_access' ? 'Sin límite' : u.plan === 'paid' ? 'Pagando' : (u.trialDaysLeft > 0 ? 'Quedan ' + u.trialDaysLeft + ' días' : 'Vencida');
      drawer.innerHTML =
        '<div class="head"><div class="av">' + initials(u.name) + '</div><div><h2>' + esc(u.name) + '</h2><div class="sub">' + esc(u.email || '') + (u.phone ? ' · ' + esc(u.phone) : '') + '</div></div><button class="icon-btn" id="close-drawer" aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
        '<div class="chips">' + (u.online ? '<span class="chip ok live"><span class="dot"></span>Conectado ahora</span>' : '<span class="chip mute">Última vez: ' + esc(ago(u.lastSeen).toLowerCase()) + '</span>') + planChip(u.plan) + '</div>' +
        '<div class="facts">' +
        '<div class="fact"><span>Se registró</span><b>' + esc(date(u.createdAt)) + '</b></div>' +
        '<div class="fact"><span>Prueba</span><b>' + esc(trialText) + '</b></div>' +
        '<div class="fact"><span>Termina la prueba</span><b>' + esc(date(u.trialEndsAt)) + '</b></div>' +
        '<div class="fact"><span>Días que usó la app (30 días)</span><b>' + num(u.counts.activeDays30) + '</b></div>' +
        '<div class="fact"><span>Conversaciones</span><b>' + num(u.counts.conversations) + '</b></div>' +
        '<div class="fact"><span>Compromisos creados</span><b>' + num(u.counts.commitments) + '</b></div>' +
        '<div class="fact"><span>Mensajes al asistente</span><b>' + num(u.counts.assistantTurns) + '</b></div>' +
        '<div class="fact"><span>Teléfono</span><b>' + phone(u.platform, u.appVersion) + '</b></div>' +
        '</div>' +
        '<div><div class="section-label">Acciones</div><div class="actions">' +
        '<button class="btn primary" data-act="extend">Alargar la prueba</button>' +
        (u.plan === 'free_access' ? '<button class="btn" data-act="unfree">Quitar acceso gratis</button>' : '<button class="btn" data-act="free">Dar acceso gratis</button>') +
        '<button class="btn" data-act="notice">Enviarle un aviso</button>' +
        (u.suspended ? '<button class="btn" data-act="unsuspend">Reactivar cuenta</button>' : '<button class="btn danger" data-act="suspend">Suspender cuenta</button>') +
        '</div></div>' +
        '<div><div class="section-label">Teléfonos</div><div class="list" style="margin-top:0">' + devices + '</div></div>' +
        '<div><div class="section-label">Historial</div><div class="list" style="margin-top:0">' + history + '</div></div>' +
        '<div class="note">Por privacidad, aquí nunca se ven sus mensajes, compromisos ni lo que habla con Vorian. Solo cuántos hay.</div>';
      document.getElementById('close-drawer').onclick = closeDrawer;
      drawer.querySelectorAll('[data-act]').forEach(function (b) { b.onclick = function () { userAction(u, b.dataset.act); }; });
    }, function (e) { drawer.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  }
  function done(u, text) { toast(text); openUser(u.id); if (current === 'usuarios') loadUsers(); }
  function userAction(u, act) {
    var who = esc(u.name);
    if (act === 'extend') {
      ask('Alargar la prueba de ' + who, 'Se suman días desde hoy o desde el fin actual de su prueba, lo que sea más tarde.',
        '<label>Días a sumar<input type="number" id="f-days" min="1" max="365" value="15"></label>', 'Alargar', function () {
          var days = parseInt(document.getElementById('f-days').value, 10);
          if (!(days >= 1 && days <= 365)) { toast('Escribe entre 1 y 365 días', true); return false; }
          return api('/users/' + u.id + '/extend-trial', { method: 'POST', body: { days: days } }).then(function () { done(u, 'Prueba alargada ' + days + ' días'); });
        });
    } else if (act === 'free' || act === 'unfree') {
      var free = act === 'free';
      ask(free ? 'Dar acceso gratis a ' + who : 'Quitar el acceso gratis a ' + who,
        free ? 'Podrá usar todo Vorian sin pagar y sin fecha de término. Sirve para ti, tu familia o quienes prueban la app.' : 'Volverá a la prueba normal, con la fecha de término que tenía.',
        '', free ? 'Dar acceso gratis' : 'Quitar acceso', function () {
          return api('/users/' + u.id + '/plan', { method: 'POST', body: { plan: free ? 'free_access' : 'trial' } }).then(function () { done(u, free ? 'Acceso gratis activado' : 'Acceso gratis quitado'); });
        });
    } else if (act === 'notice') {
      ask('Enviar un aviso a ' + who, 'Le llega como notificación a su teléfono.',
        '<label>Título<input type="text" id="f-title" maxlength="60" value="Vorian"></label><label>Mensaje<textarea id="f-body" maxlength="240" placeholder="Escribe el aviso"></textarea></label>', 'Enviar aviso', function () {
          var title = document.getElementById('f-title').value.trim(), body = document.getElementById('f-body').value.trim();
          if (!title || !body) { toast('Escribe el título y el mensaje', true); return false; }
          return api('/users/' + u.id + '/notice', { method: 'POST', body: { title: title, body: body } }).then(function () { done(u, 'Aviso enviado'); });
        });
    } else if (act === 'suspend' || act === 'unsuspend') {
      var suspend = act === 'suspend';
      ask(suspend ? 'Suspender la cuenta de ' + who : 'Reactivar la cuenta de ' + who,
        suspend ? 'No podrá entrar a Vorian hasta que la reactives. Sus datos no se borran.' : 'Podrá volver a entrar a Vorian.',
        '', suspend ? 'Suspender' : 'Reactivar', function () {
          return api('/users/' + u.id + '/suspend', { method: 'POST', body: { suspended: suspend } }).then(function () { done(u, suspend ? 'Cuenta suspendida' : 'Cuenta reactivada'); });
        }, suspend);
    }
  }
  function ask(title, text, fields, confirmLabel, onConfirm, danger) {
    modalBack.innerHTML = '<div class="card modal" role="dialog" aria-modal="true"><h2>' + title + '</h2><p>' + esc(text) + '</p>' + fields +
      '<div class="row-actions"><button class="btn" id="m-cancel">Cancelar</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" id="m-ok">' + esc(confirmLabel) + '</button></div></div>';
    modalBack.hidden = false;
    var first = modalBack.querySelector('input,textarea'); if (first) first.focus();
    function close() { modalBack.hidden = true; modalBack.innerHTML = ''; }
    document.getElementById('m-cancel').onclick = close;
    modalBack.onclick = function (e) { if (e.target === modalBack) close(); };
    document.getElementById('m-ok').onclick = function () {
      var ok = document.getElementById('m-ok');
      var result = onConfirm();
      if (result === false) return;
      ok.disabled = true; ok.textContent = 'Un momento…';
      Promise.resolve(result).then(close, function (e) { ok.disabled = false; ok.textContent = confirmLabel; toast(e.message, true); });
    };
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!modalBack.hidden) { modalBack.hidden = true; modalBack.innerHTML = ''; } else closeDrawer();
  });

  // ---------- Pruebas y pagos ----------
  function viewPlans() {
    Promise.all([api('/overview'), api('/plans')]).then(function (r) {
      var o = r[0], p = r[1], s = o.settings;
      if (current !== 'planes') return;
      function people(list, emptyText) {
        return list.length ? list.map(function (u) {
          return '<div class="li click" data-user="' + esc(u.id) + '"><div class="av">' + initials(u.name) + '</div><div><div class="t">' + esc(u.name) + '</div><div class="s">' + esc(u.email || '') + '</div></div><div class="r">' + (u.trialDaysLeft > 0 ? 'Quedan ' + u.trialDaysLeft + ' días' : 'Venció ' + esc(date(u.trialEndsAt))) + '</div></div>';
        }).join('') : '<div class="empty">' + esc(emptyText) + '</div>';
      }
      main.innerHTML = header('Pruebas y pagos', 'Quién está probando, a quién se le acaba y quién paga') +
        '<div class="kpis">' +
        kpi('En prueba gratis', num(o.plans.trial), num(o.plans.ending) + ' vencen en 7 días o menos') +
        kpi('Pagando', num(o.plans.paid), 'Se conectará con Google Play y App Store') +
        kpi('Prueba vencida', num(o.plans.expired), 'No han pagado todavía') +
        kpi('Acceso gratis', num(o.plans.free), 'Dado por ti desde el panel') +
        '</div><div class="grid2 even">' +
        '<div class="card"><h3>Se les acaba la prueba</h3><div class="sub">Próximos 7 días</div><div class="list">' + people(p.ending, 'A nadie se le vence la prueba esta semana.') + '</div></div>' +
        '<div class="card"><h3>Prueba vencida hace poco</h3><div class="sub">Últimos 30 días, sin pagar</div><div class="list">' + people(p.recentlyExpired, 'Nadie en este grupo.') + '</div></div>' +
        '</div><div class="grid2 even"><div class="card"><h3>Precios</h3><div class="list">' +
        '<div class="sys"><span>Plan mensual</span><span class="end">' + esc(money(s.monthlyPriceClp)) + '</span></div>' +
        '<div class="sys"><span>Plan anual</span><span class="end">' + esc(money(s.annualPriceClp)) + '</span></div>' +
        '<div class="sys"><span>Días de prueba gratis</span><span class="end">' + s.trialDays + ' días</span></div></div><a href="#ajustes" class="more" style="display:block;margin-top:10px;color:var(--accentB);font-size:12px;text-decoration:none">Cambiar en Ajustes</a></div>' +
        '<div class="card"><h3>Avisos de fin de prueba</h3><div class="sub">Enviados al teléfono en los últimos 7 días' + (s.enforceTrial ? '' : ' · apagados en Ajustes') + '</div><div class="list">' +
        s.noticeDays.map(function (d) { return '<div class="sys"><span>' + (d === 1 ? 'Falta 1 día' : 'Faltan ' + d + ' días') + '</span><span class="end"><span class="chip blue">' + num((p.noticesWeek || {})['days_' + d]) + '</span></span></div>'; }).join('') +
        '<div class="sys"><span>Prueba terminada</span><span class="end"><span class="chip mute">' + num((p.noticesWeek || {}).ended) + '</span></span></div></div></div>' +
        '</div><div class="grid2 even"><div class="card"><h3>Pagos recientes</h3><div class="empty">Aún no hay pagos. Esta lista se llenará cuando conectemos el cobro con Google Play y App Store.</div></div></div>';
      bindUserLinks();
    }, failView);
  }

  // ---------- Errores ----------
  function viewErrors() {
    api('/errors?days=' + errorsDays).then(function (groups) {
      if (current !== 'errores') return;
      var open = groups.filter(function (g) { return !g.resolved; });
      var fixed = groups.filter(function (g) { return g.resolved; });
      function table(list) {
        if (!list.length) return '<div class="empty">Nada aquí.</div>';
        return '<div class="tablewrap"><table><thead><tr><th>Qué pasó</th><th>Dónde</th><th>Veces</th><th>Personas</th><th>Primera vez</th><th>Última vez</th><th></th></tr></thead><tbody>' +
          list.map(function (g) {
            var sev = g.people >= 3 || g.occurrences >= 10 ? '<span class="chip bad">Grave</span>' : '<span class="chip warn">Media</span>';
            return '<tr class="row" data-error="' + esc(g.fingerprint) + '"><td style="white-space:normal;max-width:380px"><b>' + esc(g.title) + '</b><br><small>' + esc(g.location || '') + '</small></td><td>' + (g.source === 'app' ? 'App' + (g.platform ? ' · ' + esc(g.platform === 'ios' ? 'iPhone' : g.platform === 'android' ? 'Android' : g.platform) : '') + (g.appVersion ? ' ' + esc(g.appVersion) : '') : 'Servidor') + '</td><td>' + num(g.occurrences) + '</td><td>' + num(g.people) + '</td><td>' + esc(dateTime(g.firstAt)) + '</td><td>' + esc(ago(g.lastAt)) + '</td><td>' + (g.resolved ? '<span class="chip ok">Resuelto</span>' : sev) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      }
      main.innerHTML = header('Errores', 'Fallas del servidor y de la app, agrupadas para ver qué arreglar primero',
        '<div class="filters" id="err-days">' + [[1, '24 horas'], [7, '7 días'], [30, '30 días']].map(function (d) {
          return '<button data-d="' + d[0] + '" class="' + (errorsDays === d[0] ? 'on' : '') + '">' + d[1] + '</button>';
        }).join('') + '</div>') +
        '<div class="card"><h3>Sin resolver · ' + open.length + '</h3>' + table(open) +
        '<div class="note" style="margin-top:14px">Haz clic en un error para ver el detalle y marcarlo como resuelto. Si vuelve a pasar, aparece de nuevo aquí. Nunca se guarda el texto de mensajes ni datos privados: solo qué falló, dónde y cuántas veces.</div></div>' +
        (fixed.length ? '<div class="card" style="margin-top:14px"><h3>Resueltos · ' + fixed.length + '</h3>' + table(fixed) + '</div>' : '');
      document.querySelectorAll('#err-days button').forEach(function (b) { b.onclick = function () { errorsDays = Number(b.dataset.d); viewErrors(); }; });
      document.querySelectorAll('[data-error]').forEach(function (row) {
        row.onclick = function () { openError(groups.filter(function (g) { return g.fingerprint === row.dataset.error; })[0]); };
      });
    }, failView);
  }
  function openError(g) {
    drawer.innerHTML = '<div class="loading">Cargando…</div>';
    drawer.classList.add('open');
    api('/errors/' + g.fingerprint).then(function (d) {
      drawer.innerHTML = '<div class="head"><div><h2>' + esc(g.title) + '</h2><div class="sub">' + esc(g.location || (g.source === 'app' ? 'App' : 'Servidor')) + '</div></div><button class="icon-btn" id="close-drawer" aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
        '<div class="facts"><div class="fact"><span>Veces</span><b>' + num(g.occurrences) + '</b></div><div class="fact"><span>Personas</span><b>' + num(g.people) + '</b></div><div class="fact"><span>Primera vez</span><b>' + esc(dateTime(g.firstAt)) + '</b></div><div class="fact"><span>Última vez</span><b>' + esc(dateTime(g.lastAt)) + '</b></div></div>' +
        '<button class="btn ' + (g.resolved ? '' : 'primary') + '" id="resolve">' + (g.resolved ? 'Marcar como no resuelto' : 'Marcar como resuelto') + '</button>' +
        '<div><div class="section-label">Últimas veces</div><div class="list" style="margin-top:0">' + d.occurrences.map(function (o) {
          return '<div class="li" style="align-items:flex-start"><div style="min-width:0"><div class="t">' + esc(dateTime(o.created_at)) + (o.app_version ? ' · versión ' + esc(o.app_version) : '') + '</div>' + (o.detail ? '<pre class="sub" style="white-space:pre-wrap;word-break:break-word;font-size:11px;margin-top:6px">' + esc(o.detail) + '</pre>' : '') + '</div></div>';
        }).join('') + '</div></div>';
      document.getElementById('close-drawer').onclick = closeDrawer;
      document.getElementById('resolve').onclick = function () {
        api('/errors/' + g.fingerprint + '/resolve', { method: 'POST', body: { resolved: !g.resolved } }).then(function () {
          toast(g.resolved ? 'Marcado como no resuelto' : 'Marcado como resuelto'); closeDrawer(); viewErrors();
        }, function (e) { toast(e.message, true); });
      };
    }, function (e) { drawer.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  }

  // ---------- Opiniones y reportes ----------
  var KIND = { idea: ['blue', 'Idea'], problem: ['bad', 'Problema'], other: ['mute', 'Otro'] };
  var REASON = { spam: 'Spam', abuse: 'Acoso o abuso', inappropriate: 'Contenido inapropiado', false: 'Información falsa', other: 'Otro motivo' };
  var REPORT_KIND = { user: 'Una persona', message: 'Un mensaje', assistant: 'Una respuesta de Vorian' };
  var STATUS = { open: ['warn', 'Por revisar'], reviewed: ['ok', 'Revisado'], dismissed: ['mute', 'Descartado'] };
  function viewFeedback() {
    api('/feedback').then(function (d) {
      if (current !== 'opiniones') return;
      var feedback = d.feedback.length ? d.feedback.map(function (f) {
        var k = KIND[f.kind] || KIND.other;
        return '<div class="li" style="align-items:flex-start"><span class="chip ' + k[0] + '">' + k[1] + '</span><div style="min-width:0"><div class="msg">' + esc(f.message) + '</div><div class="s">' + esc(f.person) + ' · ' + phone(f.platform, f.appVersion) + '</div></div><div class="r">' + esc(ago(f.createdAt)) + '</div></div>';
      }).join('') : '<div class="empty">Aún no llegan opiniones.</div>';
      var reports = d.reports.length ? d.reports.map(function (r) {
        var st = STATUS[r.status] || STATUS.open;
        return '<div class="li" style="align-items:flex-start"><span class="chip ' + st[0] + '">' + st[1] + '</span><div style="min-width:0"><div class="t">' + esc(REASON[r.reason] || r.reason) + ' · ' + esc(REPORT_KIND[r.kind] || r.kind) + (r.reported ? ': ' + esc(r.reported) : '') + '</div>' +
          (r.details ? '<div class="msg sub">' + esc(r.details) + '</div>' : '') + (r.excerpt ? '<div class="msg sub" style="margin-top:4px">«' + esc(r.excerpt) + '»</div>' : '') +
          '<div class="s">Reportado por ' + esc(r.reporter) + '</div><div style="display:flex;gap:6px;margin-top:8px">' +
          (r.status !== 'reviewed' ? '<button class="btn small" data-report="' + esc(r.id) + '" data-status="reviewed">Marcar revisado</button>' : '') +
          (r.status !== 'dismissed' ? '<button class="btn small" data-report="' + esc(r.id) + '" data-status="dismissed">Descartar</button>' : '') +
          (r.status !== 'open' ? '<button class="btn small" data-report="' + esc(r.id) + '" data-status="open">Volver a abrir</button>' : '') +
          (r.reportedUserId ? '<button class="btn small" data-user="' + esc(r.reportedUserId) + '">Ver persona</button>' : '') +
          '</div></div><div class="r">' + esc(ago(r.createdAt)) + '</div></div>';
      }).join('') : '<div class="empty">No hay reportes. Todo tranquilo.</div>';
      main.innerHTML = header('Opiniones y reportes', 'Lo que escriben desde Perfil y los reportes de contenido') +
        '<div class="grid2 even"><div class="card"><h3>Opiniones</h3><div class="list">' + feedback + '</div></div>' +
        '<div class="card"><h3>Reportes de contenido</h3><div class="sub">Google y Apple exigen revisarlos. Desde «Ver persona» puedes suspender la cuenta.</div><div class="list">' + reports + '</div></div></div>';
      document.querySelectorAll('[data-report]').forEach(function (b) {
        b.onclick = function () {
          api('/reports/' + b.dataset.report + '/status', { method: 'POST', body: { status: b.dataset.status } }).then(function () { toast('Reporte actualizado'); viewFeedback(); }, function (e) { toast(e.message, true); });
        };
      });
      bindUserLinks();
    }, failView);
  }

  // ---------- Asistente ----------
  var VOICE_NAMES = [
    ['cedar', 'Cedar · masculina, cálida (la más natural)'], ['marin', 'Marin · femenina, cálida (la más natural)'],
    ['ash', 'Ash · masculina, clara'], ['ballad', 'Ballad · masculina, suave'], ['verse', 'Verse · masculina, expresiva'], ['echo', 'Echo · masculina, neutra'],
    ['coral', 'Coral · femenina, alegre'], ['sage', 'Sage · femenina, serena'], ['shimmer', 'Shimmer · femenina, luminosa'], ['alloy', 'Alloy · neutra'],
  ];
  function voiceCard(v) {
    var opts = VOICE_NAMES.map(function (n) { return '<option value="' + n[0] + '"' + (n[0] === v.voice ? ' selected' : '') + '>' + esc(n[1]) + '</option>'; }).join('');
    return '<form class="card" id="voice-form"><h3>Voz del asistente</h3><div class="settings-form">' +
      '<label>Voz<select name="voice">' + opts + '</select></label>' +
      '<label>Velocidad: <b id="speed-label">' + Number(v.speed).toFixed(2).replace('.', ',') + '</b><input type="range" name="speed" min="0.8" max="1.2" step="0.05" value="' + v.speed + '"></label>' +
      '</div><p class="sub" style="margin:14px 0">1,00 es la velocidad normal. Más bajo habla más pausado; más alto, más rápido. El cambio se nota en la siguiente conversación por voz, sin actualizar la app.</p>' +
      '<button class="btn primary" type="submit">Guardar voz</button></form>';
  }
  function viewAssistant() {
    Promise.all([api('/assistant'), api('/voice')]).then(function (r) {
      var a = r[0], v = r[1];
      if (current !== 'asistente') return;
      var top = a.top.length ? a.top.map(function (t) {
        return '<div class="li click" data-user="' + esc(t.userId) + '"><div class="av">' + initials(t.name) + '</div><div><div class="t">' + esc(t.name) + '</div><div class="s">' + num(t.turns) + ' mensajes · ' + num(t.voiceTurns) + ' por voz</div></div></div>';
      }).join('') : '<div class="empty">Nadie ha usado el asistente este mes.</div>';
      main.innerHTML = header('Uso del asistente', 'Cuánto se usa Vorian, el asistente') +
        '<div class="kpis">' + kpi('Últimas 24 horas', num(a.day), 'mensajes al asistente') + kpi('Últimos 7 días', num(a.week)) + kpi('Últimos 30 días', num(a.month)) + kpi('Por voz (30 días)', num(a.voiceMonth)) + '</div>' +
        '<div class="grid2"><div class="card"><h3>Quiénes más lo usan</h3><div class="sub">Últimos 30 días. Sirve para detectar abuso o gastos fuera de lo normal.</div><div class="list">' + top + '</div></div>' + voiceCard(v) + '</div>';
      bindUserLinks();
      var form = document.getElementById('voice-form');
      form.speed.addEventListener('input', function () { document.getElementById('speed-label').textContent = Number(form.speed.value).toFixed(2).replace('.', ','); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        api('/voice', { method: 'PUT', body: { voice: form.voice.value, speed: Number(form.speed.value) } })
          .then(function () { toast('Voz guardada'); }, function (err) { toast(err.message, true); });
      });
    }, failView);
  }

  // ---------- Gastos ----------
  var FEATURES = { asistente: 'Asistente Vorian (texto)', voz_en_vivo: 'Asistente por voz', voz_transcripcion: 'Voz: entender lo que dices', transcripcion: 'Notas de voz y llamadas', resumen_chat: 'Resúmenes de chats', resumen_llamada: 'Resúmenes de llamadas', compromisos: 'Detectar compromisos' };
  function usd(v) {
    v = Number(v || 0);
    var digits = v === 0 ? 2 : v < 0.01 ? 4 : v < 0.1 ? 3 : 2;
    return 'US$ ' + v.toLocaleString('es-CL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  function tokens(v) {
    v = Number(v || 0);
    return v >= 1e6 ? (v / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' M' : v >= 1e3 ? (v / 1e3).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' mil' : num(v);
  }
  function costChart(days) {
    if (!days.length) return '<div class="empty">Todavía no hay gasto en inteligencia artificial registrado. Aparece apenas alguien use el asistente.</div>';
    var byDay = {};
    days.forEach(function (d) { byDay[d.day] = Number(d.cost); });
    var series = [], max = 0;
    for (var i = 29; i >= 0; i--) {
      var day = new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
      series.push({ day: day, cost: byDay[day] || 0 });
      max = Math.max(max, byDay[day] || 0);
    }
    max = max || 1;
    var H = 190, bw = 640 / series.length;
    var bars = series.map(function (d, i) {
      var h = d.cost ? Math.max(2, (H - 26) * d.cost / max) : 0;
      return '<rect x="' + (i * bw + 2).toFixed(1) + '" y="' + (H - h).toFixed(1) + '" width="' + (bw - 4).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" fill="' + (i === series.length - 1 ? '#7DB2FF' : 'url(#gc)') + '"><title>' + esc(d.day) + ': ' + esc(usd(d.cost)) + '</title></rect>';
    }).join('');
    var label = function (d) { return new Date(d.day + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }); };
    return '<svg class="chart" viewBox="0 0 640 214" role="img" aria-label="Gasto diario en inteligencia artificial">' +
      '<defs><linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5B9BFF"/><stop offset="1" stop-color="#2563EB" stop-opacity=".55"/></linearGradient></defs>' +
      '<g stroke="rgba(255,255,255,.06)"><line x1="0" y1="16" x2="640" y2="16"/><line x1="0" y1="98" x2="640" y2="98"/><line x1="0" y1="190" x2="640" y2="190"/></g>' +
      '<text x="0" y="11" fill="#6f7a8c" font-size="10">' + esc(usd(max)) + '</text>' + bars +
      '<g fill="#6f7a8c" font-size="11"><text x="0" y="210">' + esc(label(series[0])) + '</text><text x="300" y="210">' + esc(label(series[15])) + '</text><text x="612" y="210">hoy</text></g></svg>';
  }
  function meter(label, used, limit, unit) {
    var share = limit ? used / limit : 0, tone = share >= 0.9 ? 'red' : share >= 0.8 ? 'amber' : '';
    return '<div class="frow"><div class="fl"><span>' + esc(label) + '</span><b>' + num(used) + ' de ' + num(limit) + (unit ? ' ' + esc(unit) : '') + '</b></div><div class="bar ' + tone + '"><i style="width:' + Math.min(100, Math.max(used ? 2 : 0, Math.round(share * 100))) + '%"></i></div></div>';
  }
  function viewCosts() {
    api('/costs').then(function (c) {
      if (current !== 'gastos') return;
      var t = c.totals, ai = c.ai;
      var budget = '<div class="delta">Sin presupuesto. Ponlo abajo para recibir avisos.</div>';
      if (t.budget) {
        var share = t.budgetUsed || 0, tone = share >= 1 ? 'red' : share >= 0.8 ? 'amber' : 'green';
        budget = '<div class="frow" style="margin-top:6px"><div class="fl"><span>Usado</span><b>' + Math.round(share * 100) + ' %</b></div><div class="bar ' + tone + '"><i style="width:' + Math.min(100, Math.max(2, Math.round(share * 100))) + '%"></i></div></div>';
      }
      var total = ai.byFeature.reduce(function (sum, f) { return sum + f.cost; }, 0) || 1;
      var features = ai.byFeature.length ? ai.byFeature.map(function (f) {
        return '<div class="frow"><div class="fl"><span>' + esc(FEATURES[f.feature] || f.feature) + '</span><b>' + esc(usd(f.cost)) + '</b></div><div class="bar"><i style="width:' + Math.max(2, Math.round(f.cost / total * 100)) + '%"></i></div><div class="sub" style="margin-top:4px">' + num(f.calls) + ' usos · ' + tokens(f.input_tokens) + ' tokens de entrada · ' + tokens(f.output_tokens) + ' de salida</div></div>';
      }).join('') : '<div class="empty">Sin uso este mes.</div>';
      var models = ai.byModel.length ? '<table><thead><tr><th>Modelo</th><th>Usos</th><th>Entrada</th><th>Salida</th><th>Costo</th></tr></thead><tbody>' + ai.byModel.map(function (m) {
        return '<tr><td>' + esc(m.model) + '</td><td>' + num(m.calls) + '</td><td>' + tokens(m.input_tokens) + '</td><td>' + tokens(m.output_tokens) + '</td><td><b>' + esc(usd(m.cost)) + '</b></td></tr>';
      }).join('') + '</tbody></table>' : '<div class="empty">Sin uso este mes.</div>';
      var people = ai.topUsers.length ? ai.topUsers.map(function (u) {
        return '<div class="li click" data-user="' + esc(u.user_id) + '"><div class="av">' + initials(u.name) + '</div><div><div class="t">' + esc(u.name) + '</div><div class="s">' + num(u.calls) + ' usos</div></div><div class="r"><b>' + esc(usd(u.cost)) + '</b></div></div>';
      }).join('') : '<div class="empty">Nadie ha generado gasto este mes.</div>';
      var o = c.official, official;
      if (!o.configured) official = '<div class="note">Para ver lo que OpenAI te cobra de verdad, crea una llave de administrador en platform.openai.com → Settings → Admin keys y pégala en Render como <b>OPENAI_ADMIN_KEY</b>.</div>';
      else if (!o.ok) official = '<div class="sub">OpenAI no respondió. Se vuelve a intentar en unos minutos.</div>';
      else official = '<div class="sys"><span>Cobrado este mes</span><span class="end"><b>' + esc(usd(o.monthUsd)) + '</b></span></div><div class="sys"><span>Cobrado hoy</span><span class="end">' + esc(usd(o.todayUsd)) + '</span></div><div class="sys"><span>Calculado por Vorian este mes</span><span class="end">' + esc(usd(t.monthAi)) + '</span></div><div class="sub" style="margin-top:8px">OpenAI actualiza su cuenta con algunas horas de retraso.</div>';
      var a = c.agora, agora;
      if (!a.configured) agora = '<div class="sub">Faltan las claves de Agora en el servidor.</div>';
      else if (!a.ok) agora = '<div class="sub">Agora no respondió. Se vuelve a intentar en unos minutos.</div>';
      else agora = meter('Minutos usados (gratis hasta 10.000)', a.audioMinutes + a.videoMinutes, a.freeMinutes, 'min') +
        '<div class="sys"><span>Audio · Video</span><span class="end">' + num(a.audioMinutes) + ' · ' + num(a.videoMinutes) + ' min</span></div><div class="sys"><span>Costo estimado</span><span class="end"><b>' + esc(usd(a.estimatedUsd)) + '</b></span></div>';
      var sb = c.supabase;
      var supa = meter('Base de datos', sb.databaseMb, sb.databaseLimitMb, 'MB') + meter('Fotos y archivos', sb.storageMb, sb.storageLimitMb, 'MB') + meter('Usuarios activos del mes', sb.monthlyUsers, sb.monthlyUsersLimit, '') +
        '<div class="sys"><span>Plan</span><span class="end"><span class="chip mute">' + (sb.plan === 'pro' ? 'Pro' : 'Gratis') + '</span><b>' + esc(usd(sb.price)) + ' al mes</b></span></div>';
      var planNames = { free: 'Gratis', starter: 'Starter', standard: 'Standard', pro: 'Pro' };
      var render = '<div class="sys"><span>Plan del servidor</span><span class="end"><span class="chip mute">' + esc(planNames[c.render.plan] || c.render.plan) + '</span><b>' + esc(usd(c.render.price)) + ' al mes</b></span></div>' +
        (c.render.plan === 'free' ? '<div class="sub" style="margin-top:8px">El plan gratis se duerme tras 15 minutos sin uso y aguanta unas 400 personas usando la app a la vez.</div>' : '');
      var st = c.settings;
      var opts = function (map, value) { return Object.keys(map).map(function (k) { return '<option value="' + k + '"' + (k === value ? ' selected' : '') + '>' + esc(map[k]) + '</option>'; }).join(''); };
      main.innerHTML = header('Gastos', 'Lo que cuesta Vorian este mes, en dólares', '<span class="sub">Se actualiza solo cada 30 segundos</span>') +
        '<div class="kpis">' +
        kpi('Hoy en inteligencia artificial', esc(usd(t.today)), 'últimos 7 días: ' + esc(usd(t.week))) +
        kpi('Este mes, todo', esc(usd(t.month)), 'inteligencia artificial: ' + esc(usd(t.monthAi))) +
        kpi('Proyección a fin de mes', esc(usd(t.projected)), 'si se sigue usando igual') +
        '<div class="card kpi"><div class="label">Presupuesto del mes</div><div class="num">' + (t.budget ? esc(usd(t.budget)) : '—') + '</div>' + budget + '</div>' +
        '</div><div class="grid2">' +
        '<div class="card"><h3>Gasto diario en inteligencia artificial<span class="legend"><span><i style="background:#5B9BFF"></i>Últimos 30 días</span></span></h3>' + costChart(ai.byDay) + '</div>' +
        '<div class="card"><h3>En qué se gasta</h3><div class="sub">Este mes · ' + num(ai.calls) + ' usos de OpenAI</div><div class="funnel">' + features + '</div></div></div>' +
        '<div class="grid2">' +
        '<div class="card"><h3>Tokens por modelo</h3><div class="sub">Este mes</div>' + models + '</div>' +
        '<div class="card"><h3>Quiénes gastan más</h3><div class="sub">Este mes</div><div class="list">' + people + '</div></div></div>' +
        '<div class="grid3">' +
        '<div class="card"><h3>Cuenta oficial de OpenAI</h3><div class="list">' + official + '</div></div>' +
        '<div class="card"><h3>Llamadas (Agora)</h3><div class="funnel">' + agora + '</div></div>' +
        '<div class="card"><h3>Base de datos (Supabase)</h3><div class="funnel">' + supa + '</div></div></div>' +
        '<div class="grid2 even" style="margin-top:14px">' +
        '<div class="card"><h3>Servidor (Render)</h3><div class="list">' + render + '</div></div>' +
        '<form class="card" id="costs-form"><h3>Presupuesto y planes</h3><div class="settings-form">' +
        '<label>Presupuesto mensual (dólares)<input type="number" name="budget" min="0" step="0.01" placeholder="Sin presupuesto" value="' + (st.monthlyBudgetUsd == null ? '' : st.monthlyBudgetUsd) + '"></label>' +
        '<label>Plan de Render<select name="render">' + opts(planNames, st.renderPlan) + '</select></label>' +
        '<label>Plan de Supabase<select name="supabase">' + opts({ free: 'Gratis', pro: 'Pro' }, st.supabasePlan) + '</select></label>' +
        '</div><p class="sub" style="margin:14px 0">Al llegar al 80 % y al 100 % del presupuesto te llega un aviso al teléfono, una vez por mes. Cambia el plan aquí cuando lo cambies en Render o Supabase.</p>' +
        '<button class="btn primary" type="submit">Guardar</button></form></div>';
      bindUserLinks();
      document.getElementById('costs-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var f = e.target, raw = f.budget.value.trim();
        api('/costs/settings', { method: 'PUT', body: { monthlyBudgetUsd: raw === '' ? null : Number(raw), renderPlan: f.render.value, supabasePlan: f.supabase.value } })
          .then(function () { toast('Cambios guardados'); viewCosts(); }, function (err) { toast(err.message, true); });
      });
      clearInterval(refreshTimer);
      refreshTimer = setInterval(function () {
        var editing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#costs-form');
        if (current === 'gastos' && !editing && !drawer.classList.contains('open') && document.visibilityState === 'visible') viewCosts();
      }, 30000);
    }, failView);
  }

  // ---------- Sistema ----------
  function viewSystem() {
    api('/system').then(function (s) {
      if (current !== 'sistema') return;
      function status(ok, slowMs, ms) {
        if (!ok) return '<span class="chip bad"><span class="dot"></span>Con problemas</span>';
        if (ms > slowMs) return '<span class="chip warn"><span class="dot"></span>Lento</span>';
        return '<span class="chip ok"><span class="dot"></span>Funcionando</span>';
      }
      var up = s.server.uptimeSeconds, upText = up < 3600 ? Math.round(up / 60) + ' min' : up < 86400 ? Math.round(up / 3600) + ' h' : Math.round(up / 86400) + ' días';
      var pushTotal = s.push.sent24h + s.push.failed24h;
      var versions = s.versions.length ? s.versions.map(function (v) {
        return '<div class="sys"><span>' + esc(v.label) + '</span><span class="end"><span class="chip mute">' + num(v.total) + '</span></span></div>';
      }).join('') : '<div class="empty">Aún no hay teléfonos con la versión que informa esto.</div>';
      main.innerHTML = header('Sistema', 'Servidor, base de datos, avisos y versiones de la app') +
        '<div class="grid2 even"><div class="card"><h3>Servicios</h3><div class="list">' +
        '<div class="sys"><span>Servidor</span><span class="end"><span class="sub">encendido hace ' + esc(upText) + ' · ' + num(s.server.memoryMb) + ' MB</span>' + status(true, 1, 0) + '</span></div>' +
        '<div class="sys"><span>Base de datos</span><span class="end"><span class="sub">' + num(s.database.ms) + ' ms</span>' + status(s.database.ok, 800, s.database.ms) + '</span></div>' +
        '<div class="sys"><span>Cuentas e inicio de sesión</span><span class="end"><span class="sub">' + num(s.auth.ms) + ' ms</span>' + status(s.auth.ok, 1500, s.auth.ms) + '</span></div>' +
        '<div class="sys"><span>Asistente Vorian</span><span class="end">' + (s.assistantConfigured ? '<span class="chip ok"><span class="dot"></span>Configurado</span>' : '<span class="chip bad">Sin configurar</span>') + '</span></div>' +
        '<div class="sys"><span>Avisos al teléfono (24 h)</span><span class="end"><span class="sub">' + num(s.push.sent24h) + ' enviados · ' + num(s.push.failed24h) + ' fallidos</span>' + (pushTotal && s.push.failed24h / pushTotal > 0.1 ? '<span class="chip warn">Revisar</span>' : '<span class="chip ok"><span class="dot"></span>Funcionando</span>') + '</span></div>' +
        '</div></div><div class="card"><h3>Versión del servidor</h3><div class="list">' +
        '<div class="sys"><span>Publicación</span><span class="end"><span class="chip mute">' + esc(s.server.commit || 'local') + '</span></span></div>' +
        '<div class="sys"><span>Entorno</span><span class="end"><span class="chip mute">' + esc(s.server.environment) + '</span></span></div>' +
        '<div class="sys"><span>Node</span><span class="end"><span class="chip mute">' + esc(s.server.node) + '</span></span></div>' +
        '</div></div></div>' +
        '<div class="card"><h3>Versiones de la app en uso</h3><div class="sub">Teléfonos que abrieron la app en los últimos 30 días</div><div class="list">' + versions + '</div></div>';
    }, failView);
  }

  // ---------- Ajustes ----------
  function viewSettings() {
    api('/settings').then(function (s) {
      if (current !== 'ajustes') return;
      main.innerHTML = header('Ajustes', 'Reglas de la prueba gratis y precios') +
        '<div class="grid2 even"><form class="card" id="settings-form"><h3>Prueba y precios</h3><div class="settings-form">' +
        '<label>Días de prueba gratis<input type="number" name="trialDays" min="1" max="365" required value="' + s.trialDays + '"></label>' +
        '<label>Avisos antes de terminar (días, separados por coma)<input type="text" name="noticeDays" value="' + esc(s.noticeDays.join(', ')) + '"></label>' +
        '<label>Plan mensual (pesos chilenos)<input type="number" name="monthly" min="0" placeholder="Por definir" value="' + (s.monthlyPriceClp == null ? '' : s.monthlyPriceClp) + '"></label>' +
        '<label>Plan anual (pesos chilenos)<input type="number" name="annual" min="0" placeholder="Por definir" value="' + (s.annualPriceClp == null ? '' : s.annualPriceClp) + '"></label>' +
        '</div><p class="sub" style="margin:14px 0">Los días de prueba se aplican a las personas que se registren desde ahora. Para alguien que ya está registrado, usa «Alargar la prueba» en su ficha.</p>' +
        '<button class="btn primary" type="submit">Guardar cambios</button></form>' +
        '<div class="card"><h3>Al vencer la prueba</h3>' +
        '<label class="switch"><input type="checkbox" form="settings-form" name="enforce"' + (s.enforceTrial ? ' checked' : '') + '><span><b>Bloqueo y avisos activos</b><small>' + (s.enforceTrial ? 'Encendido: se mandan los avisos y, al vencer, se pausan las funciones de abajo.' : 'Apagado: nadie queda bloqueado ni recibe avisos de fin de prueba.') + '</small></span></label>' +
        '<div class="list">' +
        '<div class="sys"><span>Leer y responder mensajes</span><span class="end"><span class="chip ok">Siempre disponible</span></span></div>' +
        '<div class="sys"><span>Ver sus compromisos</span><span class="end"><span class="chip ok">Siempre disponible</span></span></div>' +
        '<div class="sys"><span>Contestar llamadas</span><span class="end"><span class="chip ok">Siempre disponible</span></span></div>' +
        '<div class="sys"><span>Asistente Vorian (texto y voz)</span><span class="end"><span class="chip warn">Solo con plan</span></span></div>' +
        '<div class="sys"><span>Resúmenes de chats</span><span class="end"><span class="chip warn">Solo con plan</span></span></div>' +
        '<div class="sys"><span>Crear compromisos nuevos</span><span class="end"><span class="chip warn">Solo con plan</span></span></div>' +
        '<div class="sys"><span>Iniciar llamadas</span><span class="end"><span class="chip warn">Solo con plan</span></span></div>' +
        '</div><div class="note" style="margin-top:12px">Enciéndelo cuando el pago con Google Play y App Store esté listo. Tú y quienes tengan acceso gratis nunca quedan bloqueados.</div></div></div>';
      document.getElementById('settings-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var f = e.target;
        var notice = f.noticeDays.value.split(/[,\s]+/).filter(Boolean).map(Number);
        if (notice.some(function (n) { return !(n >= 1 && n <= 60 && Math.floor(n) === n); }) || notice.length > 5) { toast('Los avisos deben ser hasta 5 números entre 1 y 60', true); return; }
        var body = {
          trialDays: parseInt(f.trialDays.value, 10),
          noticeDays: notice,
          monthlyPriceClp: f.monthly.value === '' ? null : parseInt(f.monthly.value, 10),
          annualPriceClp: f.annual.value === '' ? null : parseInt(f.annual.value, 10),
          enforceTrial: f.enforce.checked,
        };
        if (body.enforceTrial && !s.enforceTrial && !window.confirm('¿Encender el bloqueo? Las personas con la prueba vencida no podrán usar el asistente, los resúmenes, crear compromisos ni iniciar llamadas hasta que paguen.')) return;
        api('/settings', { method: 'PUT', body: body }).then(function (saved) { trialDays = saved.trialDays; toast('Cambios guardados'); viewSettings(); }, function (err) { toast(err.message, true); });
      });
    }, failView);
  }

  // ---------- start ----------
  if (session) {
    api('/settings').then(function (s) { trialDays = s.trialDays; showApp(); }, function () { /* sign-in shown */ });
  } else {
    showLogin();
  }
})();
