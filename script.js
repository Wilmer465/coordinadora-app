const SUPABASE_URL = 'https://llkfdckqovgfguponutg.supabase.co'; // ← cambia esto
const SUPABASE_KEY = 'sb_publishable_3LLyKJdKoG1ag4bIdDfpQg_IolLFXUQ';                       // ← cambia esto

const _sb = supabase.createClient('https://llkfdckqovgfguponutg.supabase.co', 'sb_publishable_3LLyKJdKoG1ag4bIdDfpQg_IolLFXUQ');

/* ── ESTADO GLOBAL ── */
var invData = [], contData = [], users = [], sessionLog = [], adminActions = [];
var currentUser = null, currentRole = null;
var invSort = 'reciente', invFiltroEstado = 'todos', isDark = false;
var SUPERADMIN = 'admin';
var DEFAULT_ADMIN = { username: 'admin', password: 'admin123', role: 'superadmin' };

/* ── HELPERS ── */
var fmt = function (n) { return '$' + Number(n).toLocaleString('es-CO'); };
var nowStr = function () { return new Date().toLocaleString('es-CO'); };
// isAdmin: acceso admin O superadmin (superadmin tiene todos los permisos de admin)
var isAdmin = function () { return currentRole === 'admin' || currentRole === 'superadmin'; };
// isSuperAdmin: identificado por ROL, no por nombre de usuario
var isSuperAdmin = function () { return currentRole === 'superadmin'; };

/* ══════════════════════════════════════════════════════
    SUPABASE — CAPA DE DATOS
   ══════════════════════════════════════════════════════ */

/* ── Mappers Supabase ↔ JS (snake_case ↔ camelCase) ── */
function invFromDb(r) {
  return { id: r.id, guia: r.guia, bodega: r.bodega, pin: r.pin, estado: r.estado || 'pendiente', fecha: r.fecha };
}
function invToDb(r) {
  return { id: r.id, guia: r.guia, bodega: r.bodega, pin: r.pin, estado: r.estado || 'pendiente', fecha: r.fecha };
}
function contFromDb(r) {
  return { id: r.id, fecha: r.fecha, equipo: r.equipo, valorM: r.valor_m, valorB: r.valor_b, total: r.total, denoms: r.denoms };
}
function contToDb(r) {
  return { id: r.id, fecha: r.fecha, equipo: r.equipo, valor_m: r.valorM, valor_b: r.valorB, total: r.total, denoms: r.denoms || null };
}
function logFromDb(r) {
  return { id: r.id, user: r.usuario, ingreso: r.ingreso, ingresoTS: r.ingreso_ts, salida: r.salida, salidaTS: r.salida_ts };
}
function logToDb(r) {
  return { id: r.id, usuario: r.user, ingreso: r.ingreso, ingreso_ts: r.ingresoTS, salida: r.salida || null, salida_ts: r.salidaTS || null };
}
function actionFromDb(r) {
  return { id: r.id, type: r.type, by: r.by, affected: r.affected, detail: r.detail, fecha: r.fecha };
}
function actionToDb(r) {
  return { id: r.id, type: r.type, by: r.by, affected: r.affected, detail: r.detail, fecha: r.fecha };
}

/* ── Inventario ── */
async function dbLoadInv() {
  var { data, error } = await _sb.from('inventario').select('*').order('id', { ascending: false });
  if (error) { console.error('Error cargando inventario:', error); return []; }
  return (data || []).map(invFromDb);
}
async function dbInsertInv(item) {
  var { error } = await _sb.from('inventario').insert(invToDb(item));
  if (error) console.error('Error insertando inventario:', error);
}
async function dbUpdateInv(item) {
  var { error } = await _sb.from('inventario').update(invToDb(item)).eq('id', item.id);
  if (error) console.error('Error actualizando inventario:', error);
}
async function dbDeleteInv(id) {
  var { error } = await _sb.from('inventario').delete().eq('id', id);
  if (error) console.error('Error eliminando inventario:', error);
}

/* ── Contabilidad ── */
async function dbLoadCont() {
  var { data, error } = await _sb.from('contabilidad').select('*').order('id', { ascending: false });
  if (error) { console.error('Error cargando contabilidad:', error); return []; }
  return (data || []).map(contFromDb);
}
async function dbInsertCont(item) {
  var { error } = await _sb.from('contabilidad').insert(contToDb(item));
  if (error) console.error('Error insertando contabilidad:', error);
}
async function dbUpdateCont(item) {
  var { error } = await _sb.from('contabilidad').update(contToDb(item)).eq('id', item.id);
  if (error) console.error('Error actualizando contabilidad:', error);
}
async function dbDeleteCont(id) {
  var { error } = await _sb.from('contabilidad').delete().eq('id', id);
  if (error) console.error('Error eliminando contabilidad:', error);
}

/* ── Usuarios ── */
async function dbLoadUsers() {
  var { data, error } = await _sb.from('users').select('username, password, role');
  if (error) { console.error('Error cargando usuarios:', error); return []; }
  return data || [];
}
async function dbInsertUser(u) {
  var { error } = await _sb.from('users').insert({ username: u.username, password: u.password, role: u.role });
  if (error) console.error('Error insertando usuario:', error);
}
async function dbUpdateUser(oldUsername, changes) {
  var { error } = await _sb.from('users').update(changes).eq('username', oldUsername);
  if (error) console.error('Error actualizando usuario:', error);
}
async function dbDeleteUser(username) {
  var { error } = await _sb.from('users').delete().eq('username', username);
  if (error) console.error('Error eliminando usuario:', error);
}

/* ── Sesiones ── */
async function dbLoadLog() {
  var { data, error } = await _sb.from('session_log').select('*').order('id', { ascending: false });
  if (error) { console.error('Error cargando sesiones:', error); return []; }
  return (data || []).map(logFromDb);
}
async function dbInsertLog(entry) {
  var { error } = await _sb.from('session_log').insert(logToDb(entry));
  if (error) console.error('Error insertando sesión:', error);
}
async function dbUpdateLog(id, changes) {
  // changes en snake_case: { salida, salida_ts }
  var { error } = await _sb.from('session_log').update(changes).eq('id', id);
  if (error) console.error('Error actualizando sesión:', error);
}

/* ── Acciones de admin ── */
async function dbLoadActions() {
  var { data, error } = await _sb.from('admin_actions').select('*').order('id', { ascending: false });
  if (error) { console.error('Error cargando acciones:', error); return []; }
  return (data || []).map(actionFromDb);
}
async function dbInsertAction(a) {
  var { error } = await _sb.from('admin_actions').insert(actionToDb(a));
  if (error) console.error('Error insertando acción:', error);
}

/* ── logAction (ahora persiste en Supabase) ── */
async function logAction(type, affected, detail) {
  var a = { id: Date.now(), type: type, by: currentUser, affected: affected, detail: detail, fecha: nowStr() };
  adminActions.unshift(a);
  await dbInsertAction(a);
}

/* ══════════════════════════════════════════════════════
   SESIÓN DE NAVEGADOR (localStorage nativo, no Supabase)
   ══════════════════════════════════════════════════════ */
function sessGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function sessSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
function sessDel(k) { try { localStorage.removeItem(k); } catch (e) { } }

/* ══════════════════════════════════════════════════════
   INICIO — CARGA GENERAL
   ══════════════════════════════════════════════════════ */
async function loadAll() {
  // Tema
  var th = sessGet('theme_v9');
  if (th === 'dark') {
    isDark = true;
    document.body.classList.add('dark');
    document.getElementById('theme-btn').textContent = '☀️';
  }

  // Mostrar spinner mientras carga
  showScreen('screen-login');

  // Cargar datos en paralelo
  var results = await Promise.all([
    dbLoadInv(),
    dbLoadCont(),
    dbLoadUsers(),
    dbLoadLog(),
    dbLoadActions()
  ]);

  invData     = results[0];
  contData    = results[1];
  users       = results[2];
  sessionLog  = results[3];
  adminActions = results[4];

  // Migrar registros de inventario sin estado
  invData.forEach(function (r) { if (!r.estado) r.estado = 'pendiente'; });

  // Asegurar que exista el superadmin (buscado por ROL, no por nombre)
  if (!users.find(function (u) { return u.role === 'superadmin'; })) {
    users.unshift(DEFAULT_ADMIN);
    await dbInsertUser(DEFAULT_ADMIN);
  }

  // Restaurar sesión previa
  var sess = sessGet('sess_v9');
  if (sess && users.find(function (u) { return u.username === sess; })) {
    currentUser = sess;
    enterApp();
  } else {
    showScreen('screen-login');
  }
}

/* ══════════════════════════════════════════════════════
   PANTALLAS / TABS / DRAWER
   ══════════════════════════════════════════════════════ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

function toggleTheme() {
  isDark = !isDark;
  document.body.classList.toggle('dark', isDark);
  var tb = document.getElementById('theme-btn');
  if (tb) tb.textContent = isDark ? '☀️' : '🌙';
  sessSet('theme_v9', isDark ? 'dark' : 'light');
}

var TABS = ['dashboard', 'inventario', 'contabilidad', 'admin'];
function showTab(t) {
  TABS.forEach(function (id) { var el = document.getElementById('tab-' + id); if (el) el.style.display = id === t ? '' : 'none'; });
  document.querySelectorAll('.nav-tab').forEach(function (el, i) { el.classList.toggle('active', ['dashboard', 'inventario', 'contabilidad'][i] === t); });
  ['dashboard', 'inventario', 'contabilidad', 'admin'].forEach(function (k) {
    var b = document.getElementById('bnav-' + k); if (b) b.classList.toggle('active', k === t);
  });
  if (t === 'dashboard')   renderDash();
  if (t === 'inventario')  renderInv();
  if (t === 'contabilidad') renderCont();
  if (t === 'admin')       switchAdminTab('usuarios');
}

function switchAdminTab(t) {
  ['usuarios', 'sesiones', 'acciones'].forEach(function (k) {
    document.getElementById('apanel-' + k).style.display = k === t ? '' : 'none';
    document.getElementById('atab-' + k[0]).classList.toggle('active', k === t);
  });
  if (t === 'usuarios') renderUList();
  if (t === 'sesiones') renderLog();
  if (t === 'acciones') renderAcciones();
}

function toggleDrawer() {
  var isOpen = document.getElementById('drawer').classList.toggle('open');
  document.getElementById('drawer-ov').classList.toggle('open', isOpen);
  document.querySelector('.hamburger').classList.toggle('open', isOpen);
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawer-ov').classList.remove('open');
  document.querySelector('.hamburger').classList.remove('open');
}

/* ══════════════════════════════════════════════════════
   AUTENTICACIÓN
   ══════════════════════════════════════════════════════ */
function doLogin() {
  var u = document.getElementById('l-user').value.trim();
  var p = document.getElementById('l-pass').value;
  var err = document.getElementById('login-err');
  if (!u || !p) { err.style.display = 'block'; err.textContent = 'Ingresa usuario y contraseña.'; return; }
  var found = users.find(function (x) { return x.username === u && x.password === p; });
  if (!found) { err.style.display = 'block'; err.textContent = 'Usuario o contraseña incorrectos.'; return; }
  err.style.display = 'none';
  currentUser = u; currentRole = found.role;
  var entry = { id: Date.now(), user: u, ingreso: nowStr(), ingresoTS: Date.now(), salida: null, salidaTS: null };
  sessionLog.unshift(entry);
  dbInsertLog(entry);
  sessSet('sess_v9', u);
  enterApp();
}

function doLogout() {
  var open = sessionLog.find(function (s) { return s.user === currentUser && !s.salida; });
  if (open) {
    open.salida = nowStr(); open.salidaTS = Date.now();
    dbUpdateLog(open.id, { salida: open.salida, salida_ts: open.salidaTS });
  }
  currentUser = null; currentRole = null;
  sessDel('sess_v9');
  document.getElementById('l-user').value = '';
  document.getElementById('l-pass').value = '';
  document.getElementById('login-err').style.display = 'none';
  closeDrawer(); showScreen('screen-login');
}

function enterApp() {
  var u = users.find(function (x) { return x.username === currentUser; }) || {};
  currentRole = u.role || 'usuario';
  document.getElementById('d-av').textContent = (currentUser || '?').slice(0, 1).toUpperCase();
  document.getElementById('d-name').textContent = currentUser;
  document.getElementById('d-roletxt').textContent = isSuperAdmin() ? 'Superadmin' : currentRole === 'admin' ? 'Administrador' : 'Usuario';
  document.getElementById('drw-admin').style.display = isAdmin() ? 'block' : 'none';
  var bnavAdmin = document.getElementById('bnav-admin'); if (bnavAdmin) bnavAdmin.style.display = isAdmin() ? 'flex' : 'none';
  var addSec = document.getElementById('add-user-section'); if (addSec) addSec.style.display = isSuperAdmin() ? '' : 'none';
  var now = new Date();
  document.getElementById('c-fecha').value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  showScreen('screen-app'); showTab('dashboard');
}

/* ══════════════════════════════════════════════════════
   MODAL DE CONFIRMACIÓN
   ══════════════════════════════════════════════════════ */
var _mRes = null;
function showModal(title, msg, okLabel, okColor) {
  return new Promise(function (res) {
    _mRes = res;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-msg').textContent = msg;
    var ok = document.getElementById('modal-ok');
    ok.textContent = okLabel || 'Confirmar';
    ok.style.background = okColor || 'var(--danger)';
    document.getElementById('modal-bg').style.display = 'flex';
  });
}
function modalResolve(v) { document.getElementById('modal-bg').style.display = 'none'; if (_mRes) { _mRes(v); _mRes = null; } }

/* ══════════════════════════════════════════════════════
   INVENTARIO
   ══════════════════════════════════════════════════════ */
function setSort(s) {
  invSort = s;
  ['reciente', 'pin', 'fecha'].forEach(function (k) { var el = document.getElementById('sb-' + k); if (el) el.classList.toggle('active', k === s); });
  renderInv();
}

function setFiltroEstado(f) {
  invFiltroEstado = f;
  ['todos', 'pendiente', 'entregado', 'no_entregado'].forEach(function (k) {
    var el = document.getElementById('fest-' + k); if (el) el.classList.toggle('active', k === f);
  });
  renderInv();
}

function getSorted(rows) {
  var arr = rows.slice();
  if (invSort === 'pin') arr.sort(function (a, b) { return String(a.pin).localeCompare(String(b.pin), undefined, { numeric: true }); });
  else arr.sort(function (a, b) { return b.id - a.id; });
  return arr;
}

function getDupGuias() {
  var count = {};
  invData.forEach(function (r) { count[r.guia.toLowerCase()] = (count[r.guia.toLowerCase()] || 0) + 1; });
  var dups = {};
  Object.keys(count).forEach(function (k) { if (count[k] > 1) dups[k] = count[k]; });
  return dups;
}

async function toggleEstado(id) {
  var rec = invData.find(function (r) { return r.id === id; });
  if (!rec) return;
  var ciclo = { pendiente: 'entregado', entregado: 'no_entregado', no_entregado: 'pendiente' };
  rec.estado = ciclo[rec.estado || 'pendiente'];
  await dbUpdateInv(rec);
  renderInv();
}

async function addInventario() {
  var g = document.getElementById('i-guia').value.trim();
  var b = document.getElementById('i-bodega').value.trim();
  var p = document.getElementById('i-pin').value.trim();
  if (!g) { alert('La guía es obligatoria.'); return; }
  var item = { id: Date.now(), guia: g, bodega: b || '—', pin: p || '—', estado: 'pendiente', fecha: nowStr() };
  invData.unshift(item);
  await dbInsertInv(item);
  renderInv(); clearInvForm();
}

async function delInv(id) {
  if (!isAdmin()) return;
  var rec = invData.find(function (r) { return r.id === id; }); if (!rec) return;
  var ok = await showModal('Eliminar guía', '¿Eliminar la guía "' + rec.guia + '" — PIN: ' + rec.pin + '?', 'Eliminar');
  if (!ok) return;
  invData = invData.filter(function (r) { return r.id !== id; });
  await dbDeleteInv(id);
  await logAction('eliminacion_inv', rec.guia, 'Eliminó guía "' + rec.guia + '" | Bodega: ' + rec.bodega + ' | PIN: ' + rec.pin);
  renderInv();
}

function autoAddGuia(inp) {
  var val = inp.value.replace(/\s/g, '');
  if (/^\d{16}$/.test(val)) { val = val.slice(1, 13); inp.value = val; }
  if (/^\d{12}$/.test(val)) {
    var b = document.getElementById('i-bodega').value.trim();
    var p = document.getElementById('i-pin').value.trim();
    var item = { id: Date.now(), guia: val, bodega: b || '—', pin: p || '—', estado: 'pendiente', fecha: nowStr() };
    invData.unshift(item);
    dbInsertInv(item);
    renderInv(); clearInvForm();
    var si = document.getElementById('inv-search');
    if (si) { si.value = val; renderInv(); setTimeout(function () { si.value = ''; renderInv(); }, 1800); }
  }
}

function estadoLabel(e) {
  if (e === 'entregado')    return '<button class="estado-btn estado-entregado"    onclick="toggleEstado(ID)">✓ Entregado</button>';
  if (e === 'no_entregado') return '<button class="estado-btn estado-no-entregado" onclick="toggleEstado(ID)">✕ No entregado</button>';
  return '<button class="estado-btn estado-pendiente" onclick="toggleEstado(ID)">○ Pendiente</button>';
}

function renderInv() {
  var dups = getDupGuias();
  var dupCount = Object.keys(dups).length;
  var alertEl = document.getElementById('dup-alert');
  if (dupCount > 0) {
    var totalDupItems = Object.values(dups).reduce(function (a, b) { return a + b; }, 0);
    alertEl.style.display = 'block';
    alertEl.textContent = '⚠ Se detectaron ' + dupCount + ' guía' + (dupCount !== 1 ? 's' : '') + ' duplicada' + (dupCount !== 1 ? 's' : '') + ' (' + totalDupItems + ' registros en total). Las filas resaltadas en amarillo tienen guías repetidas.';
  } else { alertEl.style.display = 'none'; }

  var q = (document.getElementById('inv-search').value || '').toLowerCase();
  var rows = getSorted(invData.filter(function (r) {
    var matchQ = !q || r.guia.toLowerCase().includes(q) || r.bodega.toLowerCase().includes(q) || r.pin.toLowerCase().includes(q);
    var matchE = invFiltroEstado === 'todos' || (r.estado || 'pendiente') === invFiltroEstado;
    return matchQ && matchE;
  }));

  var tb = document.getElementById('inv-body');
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" class="empty">Sin registros</td></tr>'; return; }
  tb.innerHTML = rows.map(function (r, i) {
    var estado = r.estado || 'pendiente';
    var isDup = dups[r.guia.toLowerCase()] > 1;
    var dupTag = isDup ? '<span class="tag-dup">Duplicada</span>' : '';
    var rowClass = isDup ? 'row-dup' : (estado === 'entregado' ? 'row-entg' : (estado === 'no_entregado' ? 'row-noentg' : ''));
    var del = isAdmin() ? '<button class="btn-del" onclick="delInv(' + r.id + ')">✕</button>' : '';
    var editInvBtn = isAdmin() ? '<button class="btn-ghost" style="padding:3px 9px;font-size:12px" onclick="openEditInv(' + r.id + ')">✎</button>' : '';
    var estBtn = estadoLabel(estado).replace('ID', r.id);
    var bodegaTxt = r.bodega === '—' ? '<span style="color:var(--text3);font-style:italic;font-size:12px">—</span>' : r.bodega;
    var pinTxt = r.pin === '—' ? '<span style="color:var(--text3);font-style:italic;font-size:12px">—</span>' : '<span style="font-weight:600;font-family:monospace">' + r.pin + '</span>';
    return '<tr class="' + rowClass + '">'
      + '<td class="inv-th-num" style="font-size:12px;text-align:center">' + (i + 1) + '</td>'
      + '<td class="inv-td-guia"><span class="tag">' + r.guia + '</span>' + dupTag + '</td>'
      + '<td class="inv-td-bodega">' + bodegaTxt + '</td>'
      + '<td class="inv-td-pin">' + pinTxt + '</td>'
      + '<td class="inv-td-estado">' + estBtn + '</td>'
      + '<td style="font-size:11px;color:var(--text2);white-space:nowrap">' + r.fecha + '</td>'
      + '<td style="display:flex;gap:4px;align-items:center">' + editInvBtn + del + '</td>'
      + '</tr>';
  }).join('');
}

/* ── Editar Inventario ── */
var _editInvId = null;
function openEditInv(id) {
  if (!isAdmin()) return;
  var r = invData.find(function (x) { return x.id === id; }); if (!r) return;
  _editInvId = id;
  document.getElementById('ei-guia').value = r.guia;
  document.getElementById('ei-bodega').value = r.bodega === '—' ? '' : r.bodega;
  document.getElementById('ei-pin').value = r.pin === '—' ? '' : r.pin;
  document.getElementById('ei-err').style.display = 'none';
  document.getElementById('edit-inv-bg').style.display = 'flex';
  setTimeout(function () { document.getElementById('ei-guia').focus(); }, 80);
}
function closeEditInv() { document.getElementById('edit-inv-bg').style.display = 'none'; _editInvId = null; }

async function confirmEditInv() {
  var g = document.getElementById('ei-guia').value.trim();
  var b = document.getElementById('ei-bodega').value.trim();
  var p = document.getElementById('ei-pin').value.trim();
  var errEl = document.getElementById('ei-err');
  if (!g) { errEl.textContent = 'La guía es obligatoria.'; errEl.style.display = 'block'; return; }
  var r = invData.find(function (x) { return x.id === _editInvId; }); if (!r) return;
  var old = Object.assign({}, r);
  r.guia = g; r.bodega = b || '—'; r.pin = p || '—';
  await dbUpdateInv(r);
  await logAction('edicion_inv', r.guia, 'Editó guía: "' + old.guia + '" → "' + r.guia + '" | Bodega: "' + old.bodega + '" → "' + r.bodega + '" | PIN: "' + old.pin + '" → "' + r.pin + '"');
  closeEditInv(); renderInv();
}

/* ══════════════════════════════════════════════════════
   CONTABILIDAD
   ══════════════════════════════════════════════════════ */
function calcTotals() {
  var m = 0, b = 0;
  document.querySelectorAll('.denom').forEach(function (inp) { var q = parseInt(inp.value) || 0, v = parseInt(inp.dataset.val); if (inp.dataset.tipo === 'M') m += q * v; else b += q * v; });
  document.getElementById('tot-m').textContent = fmt(m);
  document.getElementById('tot-b').textContent = fmt(b);
  document.getElementById('tot-total').textContent = fmt(m + b);
}

async function addContabilidad() {
  var fecha = document.getElementById('c-fecha').value;
  var equipo = document.getElementById('c-equipo').value.trim();
  if (!fecha || !equipo) { alert('Completa fecha y equipo.'); return; }
  var m = 0, b = 0, denoms = {};
  document.querySelectorAll('.denom').forEach(function (inp) {
    var q = parseInt(inp.value) || 0, v = parseInt(inp.dataset.val);
    var key = inp.dataset.tipo + v; if (q > 0) denoms[key] = q;
    if (inp.dataset.tipo === 'M') m += q * v; else b += q * v;
  });
  if (m + b === 0) { alert('Ingresa al menos una denominación.'); return; }
  var item = { id: Date.now(), fecha: new Date(fecha).toLocaleString('es-CO'), equipo: equipo, valorM: m, valorB: b, total: m + b, denoms: denoms };
  contData.unshift(item);
  await dbInsertCont(item);
  renderCont(); clearContForm();
}

async function delCont(id) {
  if (!isAdmin()) return;
  var rec = contData.find(function (r) { return r.id === id; }); if (!rec) return;
  var ok = await showModal('Eliminar registro', '¿Eliminar el registro de ' + rec.equipo + ' (' + rec.fecha + ')?', 'Eliminar');
  if (!ok) return;
  contData = contData.filter(function (r) { return r.id !== id; });
  await dbDeleteCont(id);
  await logAction('eliminacion_cont', rec.equipo, 'Eliminó registro contable | Equipo: ' + rec.equipo + ' | Fecha: ' + rec.fecha + ' | Total: ' + fmt(rec.total));
  renderCont();
}

function renderCont() {
  var q = (document.getElementById('cont-search').value || '').toLowerCase();
  var rows = contData.filter(function (r) { return !q || r.equipo.toLowerCase().includes(q) || r.fecha.toLowerCase().includes(q); });
  var tb = document.getElementById('cont-body');
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" class="empty">Sin registros</td></tr>'; return; }
  tb.innerHTML = rows.map(function (r, i) {
    var del = isAdmin() ? '<button class="btn-del" onclick="delCont(' + r.id + ')">✕</button>' : '';
    var editContBtn = isAdmin() ? '<button class="btn-ghost" style="padding:3px 9px;font-size:12px" onclick="openEditCont(' + r.id + ')">✎</button>' : '';
    return '<tr><td style="color:var(--text3);font-size:12px">' + (i + 1) + '</td><td style="font-size:12px">' + r.fecha + '</td><td style="font-weight:600">' + r.equipo + '</td><td>' + fmt(r.valorM) + '</td><td>' + fmt(r.valorB) + '</td><td style="font-weight:700;color:var(--accent)">' + fmt(r.total) + '</td><td style="display:flex;gap:4px;align-items:center">' + editContBtn + del + '</td></tr>';
  }).join('');
}

/* ── Editar Contabilidad ── */
var _editContId = null;
function calcEditTotals() {
  var m = 0, b = 0;
  document.querySelectorAll('.ec-denom').forEach(function (inp) { var q = parseInt(inp.value) || 0, v = parseInt(inp.dataset.val); if (inp.dataset.tipo === 'M') m += q * v; else b += q * v; });
  document.getElementById('ec-tot-m').textContent = fmt(m);
  document.getElementById('ec-tot-b').textContent = fmt(b);
  document.getElementById('ec-tot-total').textContent = fmt(m + b);
}

function openEditCont(id) {
  if (!isAdmin()) return;
  var r = contData.find(function (x) { return x.id === id; }); if (!r) return;
  _editContId = id;
  var now = new Date();
  document.getElementById('ec-fecha').value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('ec-equipo').value = r.equipo;
  document.querySelectorAll('.ec-denom').forEach(function (inp) { inp.value = ''; });
  if (r.denoms) {
    document.querySelectorAll('.ec-denom').forEach(function (inp) {
      var key = inp.dataset.tipo + inp.dataset.val; if (r.denoms[key]) inp.value = r.denoms[key];
    });
  }
  calcEditTotals();
  document.getElementById('ec-err').style.display = 'none';
  document.getElementById('edit-cont-bg').style.display = 'flex';
  setTimeout(function () { document.getElementById('ec-equipo').focus(); }, 80);
}
function closeEditCont() { document.getElementById('edit-cont-bg').style.display = 'none'; _editContId = null; }

async function confirmEditCont() {
  var fecha = document.getElementById('ec-fecha').value;
  var equipo = document.getElementById('ec-equipo').value.trim();
  var errEl = document.getElementById('ec-err');
  if (!fecha || !equipo) { errEl.textContent = 'Completa fecha y equipo.'; errEl.style.display = 'block'; return; }
  var m = 0, b = 0, denoms = {};
  document.querySelectorAll('.ec-denom').forEach(function (inp) {
    var q = parseInt(inp.value) || 0, v = parseInt(inp.dataset.val);
    var key = inp.dataset.tipo + v; if (q > 0) denoms[key] = q;
    if (inp.dataset.tipo === 'M') m += q * v; else b += q * v;
  });
  if (m + b === 0) { errEl.textContent = 'Ingresa al menos una denominación.'; errEl.style.display = 'block'; return; }
  var r = contData.find(function (x) { return x.id === _editContId; }); if (!r) return;
  var oldTotal = r.total;
  r.fecha = new Date(fecha).toLocaleString('es-CO'); r.equipo = equipo; r.valorM = m; r.valorB = b; r.total = m + b; r.denoms = denoms;
  await dbUpdateCont(r);
  await logAction('edicion_cont', r.equipo, 'Editó registro contable "' + r.equipo + '" | Total: ' + fmt(oldTotal) + ' → ' + fmt(r.total));
  closeEditCont(); renderCont();
}

/* ══════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════ */
function renderDash() {
  var tM = contData.reduce(function (a, r) { return a + r.valorM; }, 0);
  var tB = contData.reduce(function (a, r) { return a + r.valorB; }, 0);
  var tC = contData.reduce(function (a, r) { return a + r.total; }, 0);
  var bod = new Set(invData.map(function (r) { return r.bodega; })).size;
  var entregados = invData.filter(function (r) { return r.estado === 'entregado'; }).length;
  var pendientes = invData.filter(function (r) { return (r.estado || 'pendiente') === 'pendiente'; }).length;
  var noEntregados = invData.filter(function (r) { return r.estado === 'no_entregado'; }).length;
  var dups = getDupGuias(); var dupCount = Object.keys(dups).length;

  document.getElementById('dash-kpis').innerHTML =
    '<div class="kpi"><div class="kpi-label">Paquetes</div><div class="kpi-value">' + invData.length + '</div><div class="kpi-sub">' + bod + ' bodega' + (bod !== 1 ? 's' : '') + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Entregados</div><div class="kpi-value" style="color:var(--entregado-txt)">' + entregados + '</div><div class="kpi-sub">guías entregadas</div></div>' +
    '<div class="kpi"><div class="kpi-label">Pendientes</div><div class="kpi-value" style="color:var(--text2)">' + pendientes + '</div><div class="kpi-sub">por gestionar</div></div>' +
    '<div class="kpi"><div class="kpi-label">No entregados</div><div class="kpi-value" style="color:var(--danger)">' + noEntregados + '</div><div class="kpi-sub">requieren atención</div></div>' +
    (dupCount > 0 ? '<div class="kpi" style="border-left-color:var(--dup-border)"><div class="kpi-label">Guías duplicadas</div><div class="kpi-value" style="color:var(--dup-tag-txt)">' + dupCount + '</div><div class="kpi-sub">revisar inventario</div></div>' : '') +
    '<div class="kpi"><div class="kpi-label">Gran Total</div><div class="kpi-value" style="font-size:18px;color:var(--accent)">' + fmt(tC) + '</div><div class="kpi-sub">' + contData.length + ' registros contables</div></div>';

  var li = invData.slice(0, 5);
  document.getElementById('dash-inv').innerHTML = li.length ? li.map(function (r) {
    var dups2 = getDupGuias(); var isDup = dups2[r.guia.toLowerCase()] > 1;
    return '<div class="mini-row"><div><span class="mini-tag">' + r.guia + '</span>' + (isDup ? '<span class="tag-dup" style="margin-left:4px">Dup</span>' : '') + ' <span style="font-size:12px;color:var(--text2)">' + r.bodega + '</span></div><span style="font-size:12px;color:var(--text2)">' + r.pin + '</span></div>';
  }).join('') : '<div class="dash-empty">Sin registros</div>';

  var lc = contData.slice(0, 5);
  document.getElementById('dash-cont').innerHTML = lc.length ? lc.map(function (r) {
    return '<div class="mini-row"><div style="font-size:12px"><span style="font-weight:600">' + r.equipo + '</span><br><span style="color:var(--text2)">' + r.fecha + '</span></div><div class="mini-val">' + fmt(r.total) + '</div></div>';
  }).join('') : '<div class="dash-empty">Sin registros</div>';
}

/* ══════════════════════════════════════════════════════
   ADMIN — USUARIOS
   ══════════════════════════════════════════════════════ */
async function addUser() {
  if (!isSuperAdmin()) { alert('Solo el superadmin puede agregar usuarios.'); return; }
  var u = document.getElementById('nu-user').value.trim();
  var p = document.getElementById('nu-pass').value.trim();
  var err = document.getElementById('merr');
  if (!u || !p) { err.textContent = 'Completa usuario y contraseña.'; err.style.display = 'block'; return; }
  if (users.find(function (x) { return x.username === u; })) { err.textContent = 'Ese usuario ya existe.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  var newUser = { username: u, password: p, role: 'usuario' };
  users.push(newUser);
  await dbInsertUser(newUser);
  await logAction('creacion_usuario', u, 'Creó el usuario "' + u + '" con rol: usuario');
  renderUList();
  document.getElementById('nu-user').value = ''; document.getElementById('nu-pass').value = '';
}

async function delUser(u) {
  if (!isSuperAdmin()) return;
  if (u === currentUser) { alert('No puedes eliminar tu propio usuario.'); return; }
  var target = users.find(function (x) { return x.username === u; }) || {};
  if (target.role === 'superadmin') { alert('No se puede eliminar el superadmin.'); return; }
  var ok = await showModal('Eliminar usuario', '¿Eliminar al usuario "' + u + '"? Su historial de sesiones y acciones se conservará.', 'Eliminar');
  if (!ok) return;
  users = users.filter(function (x) { return x.username !== u; });
  await dbDeleteUser(u);
  await logAction('eliminacion', u, 'Eliminó al usuario "' + u + '" (rol: ' + (target.role || 'usuario') + ')');
  renderUList();
}

async function changeRole(username, newRole) {
  if (!isSuperAdmin()) { alert('Solo el superadmin puede cambiar roles.'); return; }
  var u = users.find(function (x) { return x.username === username; });
  if (u && u.role === 'superadmin') { alert('No se puede cambiar el rol del superadmin.'); return; }
  if (username === currentUser) { alert('No puedes cambiar tu propio rol.'); return; }
  if (!u || u.role === newRole) return;
  var ok = await showModal('Cambiar rol', '¿Cambiar a "' + username + '" de ' + u.role + ' a ' + newRole + '?', 'Confirmar', 'var(--accent)');
  if (!ok) return;
  var oldRole = u.role; u.role = newRole;
  await dbUpdateUser(username, { role: newRole });
  await logAction('cambio_rol', username, 'Cambió rol de "' + username + '" de ' + oldRole + ' a ' + newRole);
  renderUList();
}

function renderUList() {
  var el = document.getElementById('ulist');
  if (!users.length) { el.innerHTML = '<div class="empty">Sin usuarios</div>'; return; }
  el.innerHTML = users.map(function (u) {
    var last = sessionLog.find(function (s) { return s.user === u.username; });
    var info = last ? 'Últ. ingreso: ' + last.ingreso : 'Sin sesiones';
    var isSA = u.role === 'superadmin';
    var isMe = u.username === currentUser;
    var canChangeRole = isSuperAdmin() && !isSA && !isMe;
    var canDelete = isSuperAdmin() && !isSA && !isMe;
    var canEdit = isSuperAdmin() && (!isSA || isMe) || (!isSuperAdmin() && isMe && isAdmin());
    var roleCtrl = '';
    if (isSA) { roleCtrl = '<span class="badge-super">superadmin</span>'; }
    else if (canChangeRole) {
      var isAR = u.role === 'admin';
      roleCtrl = '<div class="role-toggle"><button class="' + (isAR ? 'ractive' : '') + '" onclick="changeRole(\'' + u.username + '\',\'admin\')">Admin</button><button class="' + ((!isAR) ? 'ractive' : '') + '" onclick="changeRole(\'' + u.username + '\',\'usuario\')">Usuario</button></div>';
    } else { roleCtrl = '<span class="' + (u.role === 'admin' ? 'badge-admin' : 'badge-user') + '">' + u.role + '</span>'; }
    var delBtn = canDelete ? '<button class="btn-del" onclick="delUser(\'' + u.username + '\')">✕</button>' : '';
    var editBtn = canEdit ? '<button class="btn-ghost" style="padding:4px 10px;font-size:12px" onclick="openEditModal(\'' + u.username + '\')">✎ Editar</button>' : '';
    var pwHtml = '';
    if (isSuperAdmin() && !isSA) {
      var pwId = 'pw-' + u.username.replace(/[^a-zA-Z0-9]/g, '_');
      pwHtml = '<div class="pw-show-wrap"><span class="pw-dots" id="dots-' + pwId + '">••••••</span>'
        + '<span class="pw-plain" id="plain-' + pwId + '" style="display:none">' + u.password + '</span>'
        + '<button class="pw-reveal-btn" onclick="toggleUPw(\'' + pwId + '\')" title="Mostrar/ocultar contraseña">'
        + '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>'
        + '</button></div>';
    }
    return '<div class="urow"><div style="display:flex;align-items:center;gap:10px"><div class="u-av">' + u.username.slice(0, 1).toUpperCase() + '</div><div><div style="font-weight:600;font-size:13px;color:var(--text)">' + u.username + (isMe ? ' <span style="font-size:10px;color:var(--text2)">(tú)</span>' : '') + '</div><div style="font-size:11px;color:var(--text3)">' + info + '</div>' + pwHtml + '</div></div><div style="display:flex;align-items:center;gap:8px">' + roleCtrl + editBtn + delBtn + '</div></div>';
  }).join('');
}

/* ── Editar usuario ── */
var _editTarget = null;
function openEditModal(username) {
  if (!isAdmin()) return;
  if (!isSuperAdmin() && username !== currentUser) { alert('Solo el superadmin puede editar otros usuarios.'); return; }
  _editTarget = username;
  var isMe = username === currentUser;
  document.getElementById('edit-modal-title').textContent = 'Editar usuario: ' + username + (isMe ? ' (tú)' : '');
  document.getElementById('edit-modal-sub').textContent = isMe
    ? 'Cambia tu nombre o contraseña. Si cambias el nombre, úsalo en tu próximo inicio de sesión.'
    : 'Edita el nombre o contraseña de este usuario.';
  document.getElementById('edit-name-input').value = username;
  document.getElementById('edit-pass-input').value = '';
  document.getElementById('edit-err').style.display = 'none';
  document.getElementById('edit-modal-bg').style.display = 'flex';
  setTimeout(function () { document.getElementById('edit-name-input').focus(); }, 80);
}
function closeEditModal() { document.getElementById('edit-modal-bg').style.display = 'none'; _editTarget = null; }

async function confirmEdit() {
  if (!isAdmin() || !_editTarget) return;
  var newName = document.getElementById('edit-name-input').value.trim();
  var newPass = document.getElementById('edit-pass-input').value;
  var errEl = document.getElementById('edit-err');
  var oldName = _editTarget;
  var u = users.find(function (x) { return x.username === oldName; }); if (!u) return;
  if (!newName) { errEl.textContent = 'El nombre de usuario no puede estar vacío.'; errEl.style.display = 'block'; return; }
  if (!/^[a-zA-Z0-9_.\-]+$/.test(newName)) { errEl.textContent = 'Solo se permiten letras, números, guiones y puntos.'; errEl.style.display = 'block'; return; }
  if (newName !== oldName && users.find(function (x) { return x.username === newName; })) { errEl.textContent = 'Ese nombre de usuario ya está en uso.'; errEl.style.display = 'block'; return; }
  if (!newPass && newName === oldName) { errEl.textContent = 'No hay cambios que guardar.'; errEl.style.display = 'block'; return; }

  var changes = []; var dbChanges = {};
  // Nunca incluir 'role' en dbChanges para evitar que el rol sea sobreescrito accidentalmente

  if (newName !== oldName) {
    u.username = newName; dbChanges.username = newName;
    // Actualizar referencias en memoria
    sessionLog.forEach(function (s) { if (s.user === oldName) s.user = newName; });
    adminActions.forEach(function (a) { if (a.by === oldName) a.by = newName; if (a.affected === oldName) a.affected = newName; });
    changes.push('nombre: "' + oldName + '" → "' + newName + '"');
    if (oldName === currentUser) {
      currentUser = newName; sessSet('sess_v9', newName);
      document.getElementById('d-av').textContent = newName.slice(0, 1).toUpperCase();
      document.getElementById('d-name').textContent = newName;
    }
  }

  if (newPass) { u.password = newPass; dbChanges.password = newPass; changes.push('contraseña actualizada'); }

  await dbUpdateUser(oldName, dbChanges);
  await logAction('edicion_usuario', newName, 'Editó usuario "' + oldName + '": ' + changes.join(' | '));
  closeEditModal(); renderUList();
  alert('Usuario actualizado: ' + changes.join(', ') + '.');
}

/* ══════════════════════════════════════════════════════
   ADMIN — SESIONES Y ACCIONES
   ══════════════════════════════════════════════════════ */
function clearLog() { }    // Deshabilitado — auditoría permanente
function clearAcciones() { }

function duracion(a, b) { var ms = (b || Date.now()) - a, m = Math.floor(ms / 60000), h = Math.floor(m / 60); return h > 0 ? h + 'h ' + (m % 60) + 'm' : (m % 60) + 'm'; }

function renderLog() {
  var q = (document.getElementById('log-search').value || '').toLowerCase();
  var rows = sessionLog.filter(function (r) { return !q || r.user.toLowerCase().includes(q); });
  var tb = document.getElementById('log-body');
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="5" class="empty">Sin registros</td></tr>'; return; }
  tb.innerHTML = rows.map(function (r) {
    var activo = !r.salida;
    var sal = activo ? '<span style="font-size:11px;background:var(--accent-bg);color:var(--accent-txt);padding:2px 9px;border-radius:99px;font-weight:600">En sesión</span>' : r.salida;
    return '<tr><td><span class="dot ' + (activo ? 'dot-on' : 'dot-off') + '"></span></td><td style="font-weight:600">' + r.user + '</td><td style="font-size:12px">' + r.ingreso + '</td><td style="font-size:12px">' + sal + '</td><td><span class="sess-dur">' + duracion(r.ingresoTS, r.salidaTS) + (activo ? ' ↑' : '') + '</span></td></tr>';
  }).join('');
}

function renderAcciones() {
  var q = (document.getElementById('acc-search').value || '').toLowerCase();
  var rows = adminActions.filter(function (r) { return !q || r.by.toLowerCase().includes(q) || r.affected.toLowerCase().includes(q); });
  var tb = document.getElementById('acc-body');
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="5" class="empty">Sin acciones registradas</td></tr>'; return; }
  tb.innerHTML = rows.map(function (r) {
    var tag;
    if (r.type === 'eliminacion')         tag = '<span class="action-tag-del">Usuario eliminado</span>';
    else if (r.type === 'eliminacion_inv')  tag = '<span class="action-tag-del">Inventario eliminado</span>';
    else if (r.type === 'eliminacion_cont') tag = '<span class="action-tag-del">Contabilidad eliminada</span>';
    else if (r.type === 'cambio_rol')       tag = '<span class="action-tag-role">Cambio de rol</span>';
    else if (r.type === 'cambio_nombre')    tag = '<span class="action-tag-role">Cambio de nombre</span>';
    else if (r.type === 'edicion_usuario')  tag = '<span class="action-tag-role">Edición de usuario</span>';
    else if (r.type === 'edicion_inv')      tag = '<span class="action-tag-role">Edición inventario</span>';
    else if (r.type === 'edicion_cont')     tag = '<span class="action-tag-role">Edición contabilidad</span>';
    else if (r.type === 'creacion_usuario') tag = '<span style="background:var(--entregado-bg);color:var(--entregado-txt);font-size:10px;padding:2px 8px;border-radius:99px;font-weight:600;border:0.5px solid var(--entregado-border);white-space:nowrap">Usuario creado</span>';
    else tag = '<span class="action-tag-role">' + r.type + '</span>';
    return '<tr><td>' + tag + '</td><td style="font-weight:600">' + r.by + '</td><td>' + r.affected + '</td><td style="font-size:12px;color:var(--text2)">' + r.detail + '</td><td style="font-size:12px;color:var(--text3)">' + r.fecha + '</td></tr>';
  }).join('');
}

/* ══════════════════════════════════════════════════════
   EXPORT EXCEL
   ══════════════════════════════════════════════════════ */
function exportExcel() {
  if (typeof XLSX === 'undefined') { alert('La librería de exportación no está disponible.'); return; }
  var wb = XLSX.utils.book_new();
  var CUR = '#,##0';

  var invRows = invData.map(function (r, i) {
    return { '#': i + 1, 'Guia': r.guia, 'N Bodega': r.bodega, 'PIN': r.pin, 'Estado': r.estado || 'pendiente', 'Fecha': r.fecha };
  });
  var wsInv = XLSX.utils.json_to_sheet(invRows.length ? invRows : [{ '#': '', 'Guia': 'Sin registros', 'N Bodega': '', 'PIN': '', 'Estado': '', 'Fecha': '' }]);
  wsInv['!cols'] = [{ wch: 5 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsInv, 'Inventario');

  var contRows = contData.map(function (r, i) {
    return { '#': i + 1, 'Fecha Hora': r.fecha, 'Equipo': r.equipo, 'Valor Moneda': r.valorM, 'Valor Billete': r.valorB, 'Total': r.total };
  });
  var wsCont = XLSX.utils.json_to_sheet(contRows.length ? contRows : [{ '#': '', 'Fecha Hora': 'Sin registros', 'Equipo': '', 'Valor Moneda': 0, 'Valor Billete': 0, 'Total': 0 }]);
  wsCont['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  var nRows = (contRows.length || 1) + 1;
  for (var row = 2; row <= nRows; row++) {
    ['D', 'E', 'F'].forEach(function (col) { var ref = col + row; if (wsCont[ref]) { wsCont[ref].t = 'n'; wsCont[ref].z = CUR; } });
  }
  XLSX.utils.book_append_sheet(wb, wsCont, 'Contabilidad');
  XLSX.writeFile(wb, 'Coordinadora_' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

/* ══════════════════════════════════════════════════════
   UTILIDADES DE UI
   ══════════════════════════════════════════════════════ */
function clearInvForm() { ['i-guia', 'i-bodega', 'i-pin'].forEach(function (id) { document.getElementById(id).value = ''; }); }
function clearContForm() {
  document.getElementById('c-fecha').value = '';
  document.getElementById('c-equipo').value = '';
  document.querySelectorAll('.denom').forEach(function (i) { i.value = ''; });
  calcTotals();
}

function togglePw(id, btn) {
  var inp = document.getElementById(id); if (!inp) return;
  var showing = inp.type === 'text'; inp.type = showing ? 'password' : 'text';
  btn.innerHTML = showing
    ? '<svg viewBox="0 0 24 24"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
}

function toggleUPw(pwId) {
  var dots = document.getElementById('dots-' + pwId); var plain = document.getElementById('plain-' + pwId);
  if (!dots || !plain) return;
  var showing = plain.style.display !== 'none';
  dots.style.display = showing ? '' : 'none';
  plain.style.display = showing ? 'none' : '';
}

/* ── ARRANQUE ── */
loadAll();