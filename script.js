/* ── CLIENTE SUPABASE ─────────────────────────────────────────── */
const SUPABASE_URL = 'https://llkfdckqovgfguponutg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3LLyKJdKoG1ag4bIdDfpQg_IolLFXUQ';
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── ESTADO GLOBAL ────────────────────────────────────────────── */
var invData = [], contData = [], users = [], sessionLog = [], adminActions = [];
var currentUser = null, currentRole = null;
var invSort = 'reciente', invFiltroEstado = 'todos', isDark = false;

/* ── HELPERS ──────────────────────────────────────────────────── */
var fmt    = function (n) { return '$' + Number(n).toLocaleString('es-CO'); };
var nowStr = function () { return new Date().toLocaleString('es-CO'); };
var isAdmin      = function () { return currentRole === 'admin' || currentRole === 'superadmin'; };
var isSuperAdmin = function () { return currentRole === 'superadmin'; };

/* ══════════════════════════════════════════════════════════════════
  REALTIME — Sincronización en vivo
   ══════════════════════════════════════════════════════════════════ */
var _realtimeChannel = null;

function initRealtime() {
  /* Si ya está suscrito no hacer nada */
  if (_realtimeChannel) return;

  _realtimeChannel = _sb.channel('cambios_app')

    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventario' },
      function (payload) {
        var nuevo = invFromDb(payload.new);
        if (invData.find(function (r) { return r.id === nuevo.id; })) return;
        invData.unshift(nuevo);
        renderInv(); renderDash();
      }
    )
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'inventario' },
      function (payload) {
        var actualizado = invFromDb(payload.new);
        var idx = invData.findIndex(function (r) { return r.id === actualizado.id; });
        if (idx !== -1) { invData[idx] = actualizado; renderInv(); renderDash(); }
      }
    )
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'inventario' },
      function (payload) {
        invData = invData.filter(function (r) { return r.id !== payload.old.id; });
        renderInv(); renderDash();
      }
    )

    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contabilidad' },
      function (payload) {
        var nuevo = contFromDb(payload.new);
        if (contData.find(function (r) { return r.id === nuevo.id; })) return;
        contData.unshift(nuevo);
        renderCont(); renderDash();
      }
    )
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contabilidad' },
      function (payload) {
        var actualizado = contFromDb(payload.new);
        var idx = contData.findIndex(function (r) { return r.id === actualizado.id; });
        if (idx !== -1) { contData[idx] = actualizado; renderCont(); renderDash(); }
      }
    )
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'contabilidad' },
      function (payload) {
        contData = contData.filter(function (r) { return r.id !== payload.old.id; });
        renderCont(); renderDash();
      }
    )

    .subscribe(function (status) {
      console.log('Realtime:', status);
    });
}


/* ══════════════════════════════════════════════════════════════════
    SUPABASE — CAPA DE DATOS
   ══════════════════════════════════════════════════════════════════ */

/* ── Mappers Supabase ↔ JS ────────────────────────────────────── */
function invFromDb(r)    { return { id: r.id, guia: r.guia, bodega: r.bodega, pin: r.pin, estado: r.estado || 'pendiente', fecha: r.fecha }; }
function invToDb(r)      { return { id: r.id, guia: r.guia, bodega: r.bodega, pin: r.pin, estado: r.estado || 'pendiente', fecha: r.fecha }; }
function contFromDb(r)   { return { id: r.id, fecha: r.fecha, equipo: r.equipo, valorM: r.valor_m, valorB: r.valor_b, total: r.total, denoms: r.denoms }; }
function contToDb(r)     { return { id: r.id, fecha: r.fecha, equipo: r.equipo, valor_m: r.valorM, valor_b: r.valorB, total: r.total, denoms: r.denoms || null }; }
function logFromDb(r)    { return { id: r.id, user: r.usuario, ingreso: r.ingreso, ingresoTS: r.ingreso_ts, salida: r.salida, salidaTS: r.salida_ts }; }
function logToDb(r)      { return { id: r.id, usuario: r.user, ingreso: r.ingreso, ingreso_ts: r.ingresoTS, salida: r.salida || null, salida_ts: r.salidaTS || null }; }
function actionFromDb(r) { return { id: r.id, type: r.type, by: r.by, affected: r.affected, detail: r.detail, fecha: r.fecha }; }
function actionToDb(r)   { return { id: r.id, type: r.type, by: r.by, affected: r.affected, detail: r.detail, fecha: r.fecha }; }

/* ── Inventario ───────────────────────────────────────────────── */
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

/* ── Contabilidad ─────────────────────────────────────────────── */
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

/* ── Usuarios — usa vista segura (sin columna password) ────────
   ⚠  Para crear / cambiar contraseñas se usan RPCs de servidor.   */
async function dbLoadUsers() {
  var { data, error } = await _sb.from('users_safe').select('username, role');
  if (error) { console.error('Error cargando usuarios:', error); return []; }
  return data || [];
}
async function dbCreateUser(username, password, role) {
  /* Llama a la función SECURITY DEFINER que hashea con bcrypt */
  var { error } = await _sb.rpc('create_user', {
    p_username: username,
    p_password: password,
    p_role:     role
  });
  return error;
}
async function dbUpdateUserMeta(oldUsername, changes) {
  /* Solo actualiza username y/o role — NUNCA la contraseña */
  var { error } = await _sb.from('users').update(changes).eq('username', oldUsername);
  if (error) console.error('Error actualizando usuario:', error);
}
async function dbChangePassword(targetUser, newPassword) {
  /* Delega el hash bcrypt al servidor */
  var { error } = await _sb.rpc('change_password', {
    p_target_user:  targetUser,
    p_new_password: newPassword
  });
  return error;
}
async function dbDeleteUser(username) {
  var { error } = await _sb.from('users').delete().eq('username', username);
  if (error) console.error('Error eliminando usuario:', error);
}

/* ── Sesiones ─────────────────────────────────────────────────── */
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
  var { error } = await _sb.from('session_log').update(changes).eq('id', id);
  if (error) console.error('Error actualizando sesión:', error);
}

/* ── Acciones de admin ────────────────────────────────────────── */
async function dbLoadActions() {
  var { data, error } = await _sb.from('admin_actions').select('*').order('id', { ascending: false });
  if (error) { console.error('Error cargando acciones:', error); return []; }
  return (data || []).map(actionFromDb);
}
async function dbInsertAction(a) {
  var { error } = await _sb.from('admin_actions').insert(actionToDb(a));
  if (error) console.error('Error insertando acción:', error);
}

async function logAction(type, affected, detail) {
  var a = { id: Date.now(), type: type, by: currentUser, affected: affected, detail: detail, fecha: nowStr() };
  adminActions.unshift(a);
  await dbInsertAction(a);
}

/* ══════════════════════════════════════════════════════════════════
    SESIÓN DE NAVEGADOR  (localStorage)
   ══════════════════════════════════════════════════════════════════ */
function sessGet(k)    { try { return localStorage.getItem(k);    } catch (e) { return null; } }
function sessSet(k, v) { try { localStorage.setItem(k, v);        } catch (e) { }             }
function sessDel(k)    { try { localStorage.removeItem(k);         } catch (e) { }             }

/* ══════════════════════════════════════════════════════════════════
    INICIO — CARGA GENERAL
   ══════════════════════════════════════════════════════════════════ */
async function loadAll() {
  /* Tema guardado */
  var th = sessGet('theme_v9');
  if (th === 'dark') {
    isDark = true;
    document.body.classList.add('dark');
    var tb = document.getElementById('theme-btn');
    if (tb) tb.textContent = '☀️';
  }

  showScreen('screen-login');

  /* ── Intentar restaurar sesión previa ── */
  var savedUser = sessGet('sess_v9');
  var savedRole = sessGet('role_v9');

  if (savedUser && savedRole) {
    try {
      /* Verifica que el usuario siga existiendo y activa el contexto RLS */
      await _sb.rpc('set_session_user', { p_username: savedUser, p_role: savedRole });
      currentUser = savedUser;
      currentRole = savedRole;
    } catch (e) {
      /* Sesión inválida (usuario eliminado / rol cambiado) */
      sessDel('sess_v9');
      sessDel('role_v9');
      currentUser = null;
      currentRole = null;
    }
  }

  /* ── Cargar datos en paralelo ── */
  var results = await Promise.all([
    dbLoadInv(),
    dbLoadCont(),
    dbLoadUsers(),
    dbLoadLog(),
    dbLoadActions()
  ]);

  invData      = results[0];
  contData     = results[1];
  users        = results[2];
  sessionLog   = results[3];
  adminActions = results[4];

  /* Migrar registros sin estado */
  invData.forEach(function (r) { if (!r.estado) r.estado = 'pendiente'; });

  if (currentUser) {
    enterApp();
  } else {
    showScreen('screen-login');
  }
}

/* ══════════════════════════════════════════════════════════════════
    PANTALLAS / TABS / DRAWER
   ══════════════════════════════════════════════════════════════════ */
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
  document.querySelectorAll('.nav-tab').forEach(function (el, i) {
    el.classList.toggle('active', ['dashboard', 'inventario', 'contabilidad'][i] === t);
  });
  ['dashboard', 'inventario', 'contabilidad', 'admin'].forEach(function (k) {
    var b = document.getElementById('bnav-' + k); if (b) b.classList.toggle('active', k === t);
  });
  if (t === 'dashboard')    renderDash();
  if (t === 'inventario')   renderInv();
  if (t === 'contabilidad') renderCont();
  if (t === 'admin')        switchAdminTab('usuarios');
}

function switchAdminTab(t) {
  ['usuarios', 'sesiones', 'acciones'].forEach(function (k) {
    document.getElementById('apanel-' + k).style.display = k === t ? '' : 'none';
    document.getElementById('atab-' + k[0]).classList.toggle('active', k === t);
  });
  if (t === 'usuarios') {
    /* Recargar usuarios frescos cada vez que se abre la pestaña */
    _sb.rpc('set_session_user', { p_username: currentUser, p_role: currentRole })
      .then(function() { return dbLoadUsers(); })
      .then(function(data) { users = data; renderUList(); });
  }
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

/* ══════════════════════════════════════════════════════════════════
    AUTENTICACIÓN
   ══════════════════════════════════════════════════════════════════ */
async function doLogin() {
  var u   = document.getElementById('l-user').value.trim();
  var p   = document.getElementById('l-pass').value;
  var err = document.getElementById('login-err');

  err.style.display = 'none';
  if (!u || !p) {
    err.style.display = 'block';
    err.textContent = 'Ingresa usuario y contraseña.';
    return;
  }

  /* Bloquear botón durante la verificación */
  var btn = document.querySelector('.btn-login');
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando…'; }

  try {
    /* ① Verificación bcrypt en el servidor — contraseña NUNCA viaja en texto plano  */
    var { data: authData, error: authError } = await _sb.rpc('verify_password', {
      p_username: u,
      p_password: p
    });

    if (authError || !authData || !authData[0] || !authData[0].ok) {
      err.style.display = 'block';
      err.textContent = 'Usuario o contraseña incorrectos.';
      return;
    }

    var role = authData[0].role;

    /* ② Activar contexto de sesión para RLS */
    await _sb.rpc('set_session_user', { p_username: u, p_role: role });

    /* ③ Guardar sesión (sin contraseña) */
    currentUser = u;
    currentRole = role;
    sessSet('sess_v9', u);
    sessSet('role_v9', role);

    err.style.display = 'none';

    /* ④ Registrar ingreso */
    var entry = { id: Date.now(), user: u, ingreso: nowStr(), ingresoTS: Date.now(), salida: null, salidaTS: null };
    sessionLog.unshift(entry);
    dbInsertLog(entry);

    enterApp();

  } catch (e) {
    err.style.display = 'block';
    err.textContent = 'Error de conexión. Intenta de nuevo.';
    console.error('Login error:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Iniciar sesión'; }
  }
}

function doLogout() {
  /* Registrar cierre de sesión */
  var open = sessionLog.find(function (s) { return s.user === currentUser && !s.salida; });
  if (open) {
    open.salida   = nowStr();
    open.salidaTS = Date.now();
    dbUpdateLog(open.id, { salida: open.salida, salida_ts: open.salidaTS });
  }

  currentUser = null;
  currentRole = null;
  sessDel('sess_v9');
  sessDel('role_v9');

  document.getElementById('l-user').value = '';
  document.getElementById('l-pass').value = '';
  document.getElementById('login-err').style.display = 'none';
  closeDrawer();
  showScreen('screen-login');
}

function enterApp() {
  /* El rol ya está en currentRole (establecido en login o restauración) */
  var roleLabel = isSuperAdmin() ? 'Superadmin' : currentRole === 'admin' ? 'Administrador' : 'Operario';
  document.getElementById('d-av').textContent     = (currentUser || '?').slice(0, 1).toUpperCase();
  document.getElementById('d-name').textContent   = currentUser;
  document.getElementById('d-roletxt').textContent = roleLabel;
  document.getElementById('drw-admin').style.display = isAdmin() ? 'block' : 'none';

  var bnavAdmin = document.getElementById('bnav-admin');
  if (bnavAdmin) bnavAdmin.style.display = isAdmin() ? 'flex' : 'none';

  var addSec = document.getElementById('add-user-section');
  if (addSec) addSec.style.display = isSuperAdmin() ? '' : 'none';

  var now = new Date();
  var cFecha = document.getElementById('c-fecha');
  if (cFecha) cFecha.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

initRealtime();
  showScreen('screen-app');

  /* Recargar datos frescos al entrar */
  Promise.all([
    dbLoadInv(),
    dbLoadCont(),
    dbLoadUsers(),
    dbLoadLog(),
    dbLoadActions()
  ]).then(function(results) {
    invData      = results[0];
    contData     = results[1];
    users        = results[2];
    sessionLog   = results[3];
    adminActions = results[4];
    invData.forEach(function (r) { if (!r.estado) r.estado = 'pendiente'; });
    showTab('dashboard');
  });
}

/* ══════════════════════════════════════════════════════════════════
   EXPORTAR EXCEL CON RANGO DE FECHAS
   ══════════════════════════════════════════════════════════════════ */

function parseFechaCO(str) {
  if (!str) return null;
  try {
    var m = str.match(/(\d+)\/(\d+)\/(\d{4})/);
    if (!m) return null;
    return new Date(+m[3], +m[2] - 1, +m[1]);
  } catch (e) { return null; }
}

function filtrarPorFecha(arr, desde, hasta) {
  return arr.filter(function (r) {
    var d = parseFechaCO(r.fecha);
    if (!d) return true;
    if (desde && d < desde) return false;
    if (hasta && d > hasta) return false;
    return true;
  });
}

function closeExportModal() {
  var bg = document.getElementById('export-bg');
  if (bg) bg.remove();
}

function exportExcel() {
  /* Eliminar modal anterior si existe */
  closeExportModal();

  var hoy    = new Date().toISOString().slice(0, 10);
  var hace30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

  /* Crear modal en el momento */
  var modal = document.createElement('div');
  modal.id = 'export-bg';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div style="background:var(--bg2,#fff);border-radius:14px;padding:28px;width:340px;max-width:94vw">
      <div style="font-weight:600;font-size:15px;margin-bottom:18px;color:var(--text,#222)">
        Exportar Excel
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <label style="font-size:12px;color:var(--text2,#555);display:flex;flex-direction:column;gap:4px">
          Desde
          <input type="date" id="exp-desde" value="${hace30}"
            style="padding:8px 10px;border-radius:8px;border:1px solid var(--b,#ccc);
                   background:var(--bg2,#fff);color:var(--text,#222);font-size:13px">
        </label>
        <label style="font-size:12px;color:var(--text2,#555);display:flex;flex-direction:column;gap:4px">
          Hasta
          <input type="date" id="exp-hasta" value="${hoy}"
            style="padding:8px 10px;border-radius:8px;border:1px solid var(--b,#ccc);
                   background:var(--bg2,#fff);color:var(--text,#222);font-size:13px">
        </label>
        <div style="font-size:11px;color:var(--text3,#999)">
          Deja vacío para exportar todos los registros.
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:20px">
        <button id="exp-cancel"
          style="flex:1;padding:9px;border-radius:8px;border:1px solid var(--b,#ccc);
                 background:transparent;color:var(--text2,#555);font-size:13px;cursor:pointer">
          Cancelar
        </button>
        <button id="exp-ok"
          style="flex:1;padding:9px;border-radius:8px;border:none;
                 background:var(--accent,#1a6ef5);color:#fff;font-size:13px;
                 font-weight:600;cursor:pointer">
          Descargar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('exp-cancel').onclick = closeExportModal;
  document.getElementById('exp-ok').onclick     = doExportExcel;

  /* Cerrar al hacer clic fuera del panel */
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeExportModal();
  });
}

function doExportExcel() {
  if (typeof XLSX === 'undefined') {
    alert('La librería XLSX no está disponible. Verifica que el script esté cargado en el HTML.');
    return;
  }

  var desdeStr = (document.getElementById('exp-desde').value || '').trim();
  var hastaStr = (document.getElementById('exp-hasta').value || '').trim();

  var desde = desdeStr ? new Date(desdeStr + 'T00:00:00') : null;
  var hasta  = hastaStr ? new Date(hastaStr + 'T23:59:59') : null;

  var invFiltrado  = filtrarPorFecha(invData,  desde, hasta);
  var contFiltrado = filtrarPorFecha(contData, desde, hasta);

  var rango = (desdeStr || 'inicio') + '_a_' + (hastaStr || 'hoy');
  var CUR   = '#,##0';
  var wb    = XLSX.utils.book_new();

  /* ── Hoja Inventario ── */
  var invRows = invFiltrado.map(function (r, i) {
    return {
      '#':        i + 1,
      'Guia':     r.guia,
      'N Bodega': r.bodega,
      'PIN':      r.pin,
      'Estado':   r.estado || 'pendiente',
      'Fecha':    r.fecha
    };
  });
  var wsInv = XLSX.utils.json_to_sheet(
    invRows.length ? invRows
      : [{ '#': '', 'Guia': 'Sin registros en el rango', 'N Bodega': '', 'PIN': '', 'Estado': '', 'Fecha': '' }]
  );
  wsInv['!cols'] = [{ wch: 5 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsInv, 'Inventario');

  /* ── Hoja Contabilidad ── */
  var contRows = contFiltrado.map(function (r, i) {
    return {
      '#':             i + 1,
      'Fecha Hora':    r.fecha,
      'Equipo':        r.equipo,
      'Valor Moneda':  r.valorM,
      'Valor Billete': r.valorB,
      'Total':         r.total
    };
  });
  var wsCont = XLSX.utils.json_to_sheet(
    contRows.length ? contRows
      : [{ '#': '', 'Fecha Hora': 'Sin registros en el rango', 'Equipo': '', 'Valor Moneda': 0, 'Valor Billete': 0, 'Total': 0 }]
  );
  wsCont['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  var nRows = (contRows.length || 1) + 1;
  for (var row = 2; row <= nRows; row++) {
    ['D', 'E', 'F'].forEach(function (col) {
      var ref = col + row;
      if (wsCont[ref]) { wsCont[ref].t = 'n'; wsCont[ref].z = CUR; }
    });
  }
  XLSX.utils.book_append_sheet(wb, wsCont, 'Contabilidad');

  /* ── Hoja Resumen ── */
  var totalCont = contFiltrado.reduce(function (a, r) { return a + r.total; }, 0);
  var wsRes = XLSX.utils.json_to_sheet([
    { 'Campo': 'Rango',               'Valor': (desdeStr || 'Todos') + ' → ' + (hastaStr || 'Todos') },
    { 'Campo': 'Total guías',         'Valor': invFiltrado.length },
    { 'Campo': 'Entregadas',          'Valor': invFiltrado.filter(function (r) { return r.estado === 'entregado'; }).length },
    { 'Campo': 'Pendientes',          'Valor': invFiltrado.filter(function (r) { return (r.estado || 'pendiente') === 'pendiente'; }).length },
    { 'Campo': 'No entregadas',       'Valor': invFiltrado.filter(function (r) { return r.estado === 'no_entregado'; }).length },
    { 'Campo': 'Registros contables', 'Valor': contFiltrado.length },
    { 'Campo': 'Total recaudado',     'Valor': totalCont }
  ]);
  wsRes['!cols'] = [{ wch: 22 }, { wch: 20 }];
  if (wsRes['B7']) { wsRes['B7'].t = 'n'; wsRes['B7'].z = CUR; }
  XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen');

  closeExportModal();
  XLSX.writeFile(wb, 'Coordinadora_' + rango + '.xlsx');
}

/* ══════════════════════════════════════════════════════════════════
    UTILIDADES DE UI
   ══════════════════════════════════════════════════════════════════ */
function clearInvForm() {
  ['i-guia', 'i-bodega', 'i-pin'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
}
function clearContForm() {
  var cFecha = document.getElementById('c-fecha'); if (cFecha) cFecha.value = '';
  var cEquipo = document.getElementById('c-equipo'); if (cEquipo) cEquipo.value = '';
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

/* ── ARRANQUE ─────────────────────────────────────────────────── */
loadAll();