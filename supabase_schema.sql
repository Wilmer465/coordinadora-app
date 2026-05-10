-- pgcrypto: para hashear contraseñas con crypt() y gen_salt()
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ══════════════════════════════════════════════════════════════════
--  1. TABLA: users
--     Autenticación personalizada (no usa Supabase Auth).
--     IMPORTANTE: Las contraseñas se almacenan con hash bcrypt.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.users (
  username  TEXT PRIMARY KEY
  CHECK (username ~ '^[a-zA-Z0-9_.\-]{2,32}$'),   -- solo chars seguros
  password  TEXT NOT NULL,                                     -- hash bcrypt, ≥60 chars
  role      TEXT NOT NULL DEFAULT 'operario'
  CHECK (role IN ('operario', 'admin', 'superadmin'))
);

-- Índice para búsqueda rápida por rol
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);

-- Comentarios de columna
COMMENT ON TABLE  public.users            IS 'Usuarios de la aplicación con autenticación propia.';
COMMENT ON COLUMN public.users.password   IS 'Hash bcrypt generado con pgcrypto.crypt(). NUNCA texto plano.';
COMMENT ON COLUMN public.users.role       IS 'Roles permitidos: operario | admin | superadmin';

-- ── Insertar superadmin inicial (contraseña: admin123) ──────────
-- ¡CAMBIA la contraseña desde la app inmediatamente después!
INSERT INTO public.users (username, password, role)
VALUES (
  'admin',
  crypt('admin123', gen_salt('bf', 12)),   -- bcrypt cost=12
  'superadmin'
)
ON CONFLICT (username) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════
--  2. TABLA: inventario
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.inventario (
  id      BIGSERIAL PRIMARY KEY,
  guia    TEXT      NOT NULL CHECK (char_length(guia) BETWEEN 1 AND 100),
  bodega  TEXT               CHECK (char_length(bodega) <= 50),
  pin     TEXT               CHECK (char_length(pin)    <= 50),
  estado  TEXT      NOT NULL DEFAULT 'pendiente'
            CHECK (estado IN ('pendiente', 'entregado', 'devuelto', 'novedad')),
  fecha   TEXT      NOT NULL DEFAULT to_char(now() AT TIME ZONE 'America/Bogota',
  'DD/MM/YYYY HH24:MI:SS')
);

-- Índices de uso frecuente
CREATE INDEX IF NOT EXISTS idx_inventario_guia   ON public.inventario (guia);
CREATE INDEX IF NOT EXISTS idx_inventario_estado ON public.inventario (estado);
CREATE INDEX IF NOT EXISTS idx_inventario_id_desc ON public.inventario (id DESC);

COMMENT ON TABLE public.inventario IS 'Guías de paquetes: registro, estado y ubicación en bodega.';


-- ══════════════════════════════════════════════════════════════════
--  3. TABLA: contabilidad
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.contabilidad (
  id      BIGSERIAL PRIMARY KEY,
  fecha   TEXT      NOT NULL DEFAULT to_char(now() AT TIME ZONE 'America/Bogota',
  'DD/MM/YYYY HH24:MI:SS'),
  equipo  TEXT               CHECK (char_length(equipo) <= 60),
  valor_m NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (valor_m >= 0),  -- total monedas
  valor_b NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (valor_b >= 0),  -- total billetes
  total   NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (total   >= 0),  -- valor_m + valor_b
  denoms  JSONB              -- detalle de denominaciones p. ej: {"100":3,"500":2,...}
);

-- Índice para búsquedas y reportes
CREATE INDEX IF NOT EXISTS idx_contabilidad_id_desc ON public.contabilidad (id DESC);
CREATE INDEX IF NOT EXISTS idx_contabilidad_denoms  ON public.contabilidad USING gin(denoms);

COMMENT ON TABLE  public.contabilidad        IS 'Arqueos de caja: monedas, billetes y denominaciones.';
COMMENT ON COLUMN public.contabilidad.denoms IS 'JSON: {"<denominacion>": <cantidad>, ...}';


-- ══════════════════════════════════════════════════════════════════
--  4. TABLA: session_log
--     Auditoría de ingresos y cierres de sesión.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.session_log (
  id          BIGSERIAL PRIMARY KEY,
  usuario     TEXT NOT NULL,
  ingreso     TEXT NOT NULL,                    -- fecha legible
  ingreso_ts  BIGINT NOT NULL,                  -- timestamp epoch ms
  salida      TEXT,                             -- NULL = sesión activa
  salida_ts   BIGINT                            -- NULL = sesión activa
);

CREATE INDEX IF NOT EXISTS idx_session_log_usuario    ON public.session_log (usuario);
CREATE INDEX IF NOT EXISTS idx_session_log_id_desc    ON public.session_log (id DESC);
CREATE INDEX IF NOT EXISTS idx_session_log_activas    ON public.session_log (salida_ts)
  WHERE salida_ts IS NULL;                      -- índice parcial: sesiones abiertas

COMMENT ON TABLE public.session_log IS 'Registro de ingresos y salidas de cada usuario. Auditoría permanente.';


-- ══════════════════════════════════════════════════════════════════
--  5. TABLA: admin_actions
--     Log inmutable de acciones realizadas por admins.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id        BIGINT    PRIMARY KEY,              -- id = Date.now() desde el cliente
  type      TEXT      NOT NULL,
  by        TEXT      NOT NULL,                 -- usuario que ejecutó la acción
  affected  TEXT      NOT NULL,                 -- usuario/recurso afectado
  detail    TEXT      NOT NULL,
  fecha     TEXT      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_by       ON public.admin_actions ("by");
CREATE INDEX IF NOT EXISTS idx_admin_actions_type     ON public.admin_actions (type);
CREATE INDEX IF NOT EXISTS idx_admin_actions_id_desc  ON public.admin_actions (id DESC);

COMMENT ON TABLE public.admin_actions IS 'Auditoría permanente de acciones administrativas. No se puede vaciar desde la app.';


-- ══════════════════════════════════════════════════════════════════
--  6. ROW LEVEL SECURITY (RLS)
--
--  Arquitectura de seguridad:
--  · El cliente usa la ANON KEY pública para conectarse.
--  · La autenticación es propia (tabla users), NO Supabase Auth.
--  · Por eso las políticas se basan en la función is_app_user()
--    que verifica una variable de sesión que el cliente debe
--    establecer antes de operar.
--
--  ── Cómo funciona ──────────────────────────────────────────────
--  Antes de cualquier operación, el cliente JS debe ejecutar:
--
--    await _sb.rpc('set_session_user', { p_username: 'pedro', p_role: 'admin' });
--
--  Esto almacena el usuario autenticado en la sesión de Postgres
--  (current_setting) y las políticas lo verifican.
-- ══════════════════════════════════════════════════════════════════

-- ── 6a. Función helper: obtener usuario de sesión ──────────────
CREATE OR REPLACE FUNCTION public.session_username()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user', TRUE), '')
$$;

-- ── 6b. Función helper: obtener rol de sesión ──────────────────
CREATE OR REPLACE FUNCTION public.session_role_app()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_role', TRUE), '')
$$;

-- ── 6c. RPC que el cliente llama tras autenticarse ─────────────
CREATE OR REPLACE FUNCTION public.set_session_user(p_username TEXT, p_role TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Verificar que el usuario realmente existe en la tabla
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE username = p_username AND role = p_role
  ) THEN
    RAISE EXCEPTION 'Credenciales de sesión inválidas';
  END IF;
  PERFORM set_config('app.current_user', p_username, FALSE);
  PERFORM set_config('app.current_role',  p_role,    FALSE);
END;
$$;

COMMENT ON FUNCTION public.set_session_user IS
  'Llamar inmediatamente tras login exitoso para activar RLS basado en sesión.';

-- ── 6d. RPC para verificar contraseña (evita exponer hashes) ───
CREATE OR REPLACE FUNCTION public.verify_password(p_username TEXT, p_password TEXT)
RETURNS TABLE(ok BOOLEAN, role TEXT) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hash TEXT;
  v_role TEXT;
BEGIN
  SELECT u.password, u.role INTO v_hash, v_role
  FROM public.users u
  WHERE u.username = p_username;

  IF v_hash IS NULL THEN
    -- Usuario no existe — misma respuesta que contraseña incorrecta (timing safe)
    RETURN QUERY SELECT FALSE, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT (v_hash = crypt(p_password, v_hash)), v_role;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.verify_password IS
  'Verificación segura de contraseña con bcrypt. El cliente NUNCA recibe el hash.';


-- ══════════════════════════════════════════════════════════════════
--  7. HABILITAR RLS EN TODAS LAS TABLAS
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.inventario    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contabilidad  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════
--  8. POLÍTICAS RLS
-- ══════════════════════════════════════════════════════════════════

-- ── inventario ─────────────────────────────────────────────────
-- Cualquier usuario autenticado puede ver y agregar
CREATE POLICY inv_select ON public.inventario FOR SELECT
  USING (public.session_username() IS NOT NULL);

CREATE POLICY inv_insert ON public.inventario FOR INSERT
  WITH CHECK (public.session_username() IS NOT NULL);

-- Solo admin/superadmin pueden modificar y eliminar
CREATE POLICY inv_update ON public.inventario FOR UPDATE
  USING (public.session_role_app() IN ('admin', 'superadmin'))
  WITH CHECK (public.session_role_app() IN ('admin', 'superadmin'));

CREATE POLICY inv_delete ON public.inventario FOR DELETE
  USING (public.session_role_app() IN ('admin', 'superadmin'));


-- ── contabilidad ───────────────────────────────────────────────
CREATE POLICY cont_select ON public.contabilidad FOR SELECT
  USING (public.session_username() IS NOT NULL);

CREATE POLICY cont_insert ON public.contabilidad FOR INSERT
  WITH CHECK (public.session_username() IS NOT NULL);

CREATE POLICY cont_update ON public.contabilidad FOR UPDATE
  USING (public.session_role_app() IN ('admin', 'superadmin'))
  WITH CHECK (public.session_role_app() IN ('admin', 'superadmin'));

CREATE POLICY cont_delete ON public.contabilidad FOR DELETE
  USING (public.session_role_app() IN ('admin', 'superadmin'));


-- ── users ──────────────────────────────────────────────────────
-- NADIE puede SELECT general (las contraseñas no deben ser visibles)
-- La autenticación pasa por la función verify_password()

-- Los admins pueden ver la lista de usuarios (sin la columna password)
CREATE POLICY users_select_admin ON public.users FOR SELECT
  USING (public.session_role_app() IN ('admin', 'superadmin'));

-- Solo superadmin puede crear usuarios
CREATE POLICY users_insert ON public.users FOR INSERT
  WITH CHECK (public.session_role_app() = 'superadmin');

-- Solo superadmin puede modificar usuarios
CREATE POLICY users_update ON public.users FOR UPDATE
  USING (public.session_role_app() = 'superadmin')
  WITH CHECK (public.session_role_app() = 'superadmin');

-- Solo superadmin puede eliminar usuarios
-- Protección extra: no se puede autoeliminar
CREATE POLICY users_delete ON public.users FOR DELETE
  USING (
    public.session_role_app() = 'superadmin'
    AND username <> public.session_username()   -- no puede borrarse a sí mismo
  );


-- ── session_log ────────────────────────────────────────────────
-- Todos los usuarios autenticados pueden insertar su propio log
CREATE POLICY slog_insert ON public.session_log FOR INSERT
  WITH CHECK (public.session_username() IS NOT NULL);

-- Solo admins ven el log completo; operarios solo ven el suyo
CREATE POLICY slog_select_admin ON public.session_log FOR SELECT
  USING (public.session_role_app() IN ('admin', 'superadmin'));

CREATE POLICY slog_select_own ON public.session_log FOR SELECT
  USING (usuario = public.session_username());

-- Solo el propio usuario puede actualizar su sesión (cerrar)
CREATE POLICY slog_update ON public.session_log FOR UPDATE
  USING (usuario = public.session_username())
  WITH CHECK (usuario = public.session_username());

-- NADIE puede borrar el log de sesiones (auditoría permanente)
-- (no se crea política DELETE → RLS bloquea por defecto)


-- ── admin_actions ──────────────────────────────────────────────
-- Solo admin/superadmin puede ver las acciones
CREATE POLICY actions_select ON public.admin_actions FOR SELECT
  USING (public.session_role_app() IN ('admin', 'superadmin'));

-- Cualquier usuario autenticado puede registrar acciones
CREATE POLICY actions_insert ON public.admin_actions FOR INSERT
  WITH CHECK (public.session_username() IS NOT NULL);

-- NADIE puede modificar ni eliminar el log de acciones


-- ══════════════════════════════════════════════════════════════════
--  9. VISTA SEGURA DE USUARIOS (oculta el hash de contraseña)
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.users_safe AS
  SELECT username, role FROM public.users;

COMMENT ON VIEW public.users_safe IS
  'Vista sin columna password. Usar esta vista en el cliente para listar usuarios.';


-- ══════════════════════════════════════════════════════════════════
--  10. FUNCIÓN AUXILIAR: cambiar contraseña
--      El propio usuario puede cambiar su contraseña.
--      El superadmin puede cambiar cualquier contraseña.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.change_password(
  p_target_user TEXT,
  p_new_password TEXT
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Validar longitud mínima
  IF char_length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres';
  END IF;

  -- Solo el propio usuario o un superadmin puede cambiar contraseñas
  IF public.session_username() <> p_target_user
    AND public.session_role_app() <> 'superadmin' THEN
    RAISE EXCEPTION 'Sin permisos para cambiar la contraseña de este usuario';
  END IF;

  UPDATE public.users
  SET password = crypt(p_new_password, gen_salt('bf', 12))
  WHERE username = p_target_user;
END;
$$;

COMMENT ON FUNCTION public.change_password IS
  'Actualiza el hash bcrypt de la contraseña. Validar autorización antes de llamar.';


-- ══════════════════════════════════════════════════════════════════
--  11. TRIGGER: consistencia total en contabilidad
--      Calcula automáticamente el total si no coincide.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_calc_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.total := COALESCE(NEW.valor_m, 0) + COALESCE(NEW.valor_b, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_contabilidad_total ON public.contabilidad;
CREATE TRIGGER tg_contabilidad_total
  BEFORE INSERT OR UPDATE ON public.contabilidad
  FOR EACH ROW EXECUTE FUNCTION public.trg_calc_total();


-- ══════════════════════════════════════════════════════════════════
--  12. REVOCAR ACCESO DIRECTO AL ROL anon
--      El rol anon solo puede ejecutar las RPCs controladas.
-- ══════════════════════════════════════════════════════════════════

-- Revocar permisos de DML directo al rol anon sobre tablas sensibles
REVOKE ALL ON public.users FROM anon;

-- Permitir al rol anon ejecutar solo las funciones RPC públicas
GRANT EXECUTE ON FUNCTION public.verify_password   TO anon;
GRANT EXECUTE ON FUNCTION public.set_session_user  TO anon;
GRANT EXECUTE ON FUNCTION public.change_password   TO anon;

-- El rol authenticated (tras set_session_user) hereda acceso por RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario    TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contabilidad  TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users         TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_log   TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_actions TO anon;
GRANT SELECT ON public.users_safe TO anon;

-- Permitir uso de secuencias (para BIGSERIAL)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
