// ANTES — Inseguro: compara en cliente
var found = users.find(x => x.username === u && x.password === p);

// DESPUÉS — Seguro: Supabase Auth
async function doLogin() {
  var u = document.getElementById('l-user').value.trim();
  var p = document.getElementById('l-pass').value;
  var err = document.getElementById('login-err');

  // Necesitas el email; puedes buscarlo por username con una Edge Function
  var { data, error } = await _sb.auth.signInWithPassword({
    email: u + '@tudominio.com', // o usar email directamente
    password: p
  });

  if (error) {
    err.style.display = 'block';
    err.textContent = 'Usuario o contraseña incorrectos.';
    return;
  }

  // Obtener rol desde profiles
  var { data: profile } = await _sb.from('profiles')
    .select('username, role')
    .eq('id', data.user.id)
    .single();

  currentUser = profile.username;
  currentRole = profile.role;
  // ... resto del login
}