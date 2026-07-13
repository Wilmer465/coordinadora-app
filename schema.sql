


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."change_password"("p_target_user" "text", "p_new_password" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_target_role text;
BEGIN
  -- Validar longitud mínima
  IF char_length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres';
  END IF;

  -- Obtener el rol del usuario destino
  SELECT role INTO v_target_role FROM public.users WHERE username = p_target_user;

  -- Un superadmin no puede cambiar la contraseña de otro superadmin
  IF public.session_role_app() = 'superadmin'
      AND v_target_role = 'superadmin'
      AND public.session_username() <> p_target_user THEN
    RAISE EXCEPTION 'Un superadmin no puede modificar a otro superadmin';
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


ALTER FUNCTION "public"."change_password"("p_target_user" "text", "p_new_password" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."change_password"("p_target_user" "text", "p_new_password" "text") IS 'Actualiza el hash bcrypt de la contraseña. Validar autorización antes de llamar.';



CREATE OR REPLACE FUNCTION "public"."create_user"("p_username" "text", "p_password" "text", "p_role" "text" DEFAULT 'usuario'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF char_length(p_password) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres';
  END IF;

  IF NOT (p_role IN ('usuario', 'admin', 'superadmin')) THEN
    RAISE EXCEPTION 'Rol inválido. Usa: usuario, admin o superadmin';
  END IF;

  INSERT INTO public.users (username, password, role)
  VALUES (p_username, crypt(p_password, gen_salt('bf', 12)), p_role);
END;
$$;


ALTER FUNCTION "public"."create_user"("p_username" "text", "p_password" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user"("p_username" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_target_role text;
BEGIN
  IF public.session_role_app() <> 'superadmin' THEN
    RAISE EXCEPTION 'Solo el superadmin puede eliminar usuarios';
  END IF;

  IF public.session_username() = p_username THEN
    RAISE EXCEPTION 'No puedes eliminar tu propio usuario';
  END IF;

  SELECT role INTO v_target_role
  FROM public.users
  WHERE username = p_username
  LIMIT 1;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  IF v_target_role = 'superadmin' THEN
    RAISE EXCEPTION 'No se puede eliminar un superadmin';
  END IF;

  DELETE FROM public.users
  WHERE username = p_username;
END;
$$;


ALTER FUNCTION "public"."delete_user"("p_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_contabilidad"("p_username" "text", "p_role" "text", "p_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM set_config('app.current_user', p_username, true);
  PERFORM set_config('app.current_role',  p_role,     true);

  DELETE FROM contabilidad WHERE id = p_id;
END;
$$;


ALTER FUNCTION "public"."delete_contabilidad"("p_username" "text", "p_role" "text", "p_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_inventario"("p_username" "text", "p_role" "text", "p_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM set_config('app.current_user', p_username, true);
  PERFORM set_config('app.current_role',  p_role,     true);

  DELETE FROM inventario WHERE id = p_id;
END;
$$;


ALTER FUNCTION "public"."delete_inventario"("p_username" "text", "p_role" "text", "p_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_admin_action"("p_username" "text", "p_role" "text", "p_id" bigint, "p_type" "text", "p_by" "text", "p_affected" "text", "p_detail" "text", "p_fecha" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM set_config('app.current_user', p_username, true);
  PERFORM set_config('app.current_role',  p_role,     true);

  INSERT INTO admin_actions (id, type, by, affected, detail, fecha)
  VALUES (p_id, p_type, p_by, p_affected, p_detail, p_fecha);
END;
$$;


ALTER FUNCTION "public"."insert_admin_action"("p_username" "text", "p_role" "text", "p_id" bigint, "p_type" "text", "p_by" "text", "p_affected" "text", "p_detail" "text", "p_fecha" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_contabilidad"("p_username" "text", "p_role" "text", "p_fecha" "text", "p_equipo" "text", "p_valor_m" numeric, "p_valor_b" numeric, "p_total" numeric, "p_denoms" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  new_id INTEGER;
BEGIN
  PERFORM set_config('app.current_user', p_username, true);
  PERFORM set_config('app.current_role',  p_role,     true);

  INSERT INTO contabilidad (fecha, equipo, valor_m, valor_b, total, denoms)
  VALUES (p_fecha, p_equipo, p_valor_m, p_valor_b, p_total, p_denoms)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."insert_contabilidad"("p_username" "text", "p_role" "text", "p_fecha" "text", "p_equipo" "text", "p_valor_m" numeric, "p_valor_b" numeric, "p_total" numeric, "p_denoms" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_inventario"("p_username" "text", "p_role" "text", "p_guia" "text", "p_bodega" "text", "p_pin" "text", "p_estado" "text", "p_fecha" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  new_id INTEGER;
BEGIN
  PERFORM set_config('app.current_user', p_username, true);
  PERFORM set_config('app.current_role',  p_role,     true);

  INSERT INTO inventario (guia, bodega, pin, estado, fecha)
  VALUES (p_guia, p_bodega, p_pin, p_estado, p_fecha)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."insert_inventario"("p_username" "text", "p_role" "text", "p_guia" "text", "p_bodega" "text", "p_pin" "text", "p_estado" "text", "p_fecha" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_session_log"("p_username" "text", "p_role" "text", "p_id" bigint, "p_usuario" "text", "p_ingreso" "text", "p_ingreso_ts" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM set_config('app.current_user', p_username, true);
  PERFORM set_config('app.current_role',  p_role,     true);

  INSERT INTO session_log (id, usuario, ingreso, ingreso_ts, salida, salida_ts)
  VALUES (p_id, p_usuario, p_ingreso, p_ingreso_ts, NULL, NULL);
END;
$$;


ALTER FUNCTION "public"."insert_session_log"("p_username" "text", "p_role" "text", "p_id" bigint, "p_usuario" "text", "p_ingreso" "text", "p_ingreso_ts" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_action"("p_type" "text", "p_by" "text", "p_affected" "text", "p_detail" "text", "p_fecha" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.admin_actions (id, type, by, affected, detail, fecha)
  VALUES (
    (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint,
    p_type, p_by, p_affected, p_detail, p_fecha
  );
END;
$$;


ALTER FUNCTION "public"."log_action"("p_type" "text", "p_by" "text", "p_affected" "text", "p_detail" "text", "p_fecha" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rename_user"("p_username" "text", "p_role" "text", "p_old_name" "text", "p_new_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM set_config('app.current_user', p_username, true);
  PERFORM set_config('app.current_role',  p_role,     true);

  UPDATE users SET username = p_new_name WHERE username = p_old_name;
END;
$$;


ALTER FUNCTION "public"."rename_user"("p_username" "text", "p_role" "text", "p_old_name" "text", "p_new_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
      IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
      ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
      END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."session_role_app"() RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT NULLIF(current_setting('app.current_role', TRUE), '')
$$;


ALTER FUNCTION "public"."session_role_app"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."session_username"() RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT NULLIF(current_setting('app.current_user', TRUE), '')
$$;


ALTER FUNCTION "public"."session_username"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_session_user"("p_username" "text", "p_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."set_session_user"("p_username" "text", "p_role" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_session_user"("p_username" "text", "p_role" "text") IS 'Llamar inmediatamente tras login exitoso para activar RLS basado en sesión.';



CREATE OR REPLACE FUNCTION "public"."trg_calc_total"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.total := COALESCE(NEW.valor_m, 0) + COALESCE(NEW.valor_b, 0);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_calc_total"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_contabilidad"("p_username" "text", "p_role" "text", "p_id" integer, "p_fecha" "text", "p_equipo" "text", "p_valor_m" numeric, "p_valor_b" numeric, "p_total" numeric, "p_denoms" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM set_config('app.current_user', p_username, true);
  PERFORM set_config('app.current_role',  p_role,     true);

  UPDATE contabilidad
  SET fecha   = p_fecha,
      equipo  = p_equipo,
      valor_m = p_valor_m,
      valor_b = p_valor_b,
      total   = p_total,
      denoms  = p_denoms
  WHERE id = p_id;
END;
$$;


ALTER FUNCTION "public"."update_contabilidad"("p_username" "text", "p_role" "text", "p_id" integer, "p_fecha" "text", "p_equipo" "text", "p_valor_m" numeric, "p_valor_b" numeric, "p_total" numeric, "p_denoms" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_inventario"("p_username" "text", "p_role" "text", "p_id" integer, "p_guia" "text", "p_bodega" "text", "p_pin" "text", "p_estado" "text", "p_fecha" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM set_config('app.current_user', p_username, true);
  PERFORM set_config('app.current_role',  p_role,     true);

  UPDATE inventario
  SET guia   = p_guia,
      bodega = p_bodega,
      pin    = p_pin,
      estado = p_estado,
      fecha  = p_fecha
  WHERE id = p_id;
END;
$$;


ALTER FUNCTION "public"."update_inventario"("p_username" "text", "p_role" "text", "p_id" integer, "p_guia" "text", "p_bodega" "text", "p_pin" "text", "p_estado" "text", "p_fecha" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_session_log"("p_username" "text", "p_role" "text", "p_id" bigint, "p_salida" "text", "p_salida_ts" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM set_config('app.current_user', p_username, true);
  PERFORM set_config('app.current_role',  p_role,     true);

  UPDATE session_log
  SET salida    = p_salida,
      salida_ts = p_salida_ts
  WHERE id = p_id;
END;
$$;


ALTER FUNCTION "public"."update_session_log"("p_username" "text", "p_role" "text", "p_id" bigint, "p_salida" "text", "p_salida_ts" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_meta"("p_username" "text", "p_role" "text", "p_target" "text", "p_updates" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM set_config('app.current_user', p_username, true);
  PERFORM set_config('app.current_role',  p_role,     true);

  -- Actualiza role si viene en p_updates
  IF p_updates ? 'role' THEN
    UPDATE users SET role = p_updates->>'role' WHERE username = p_target;
  END IF;
END;
$$;


ALTER FUNCTION "public"."update_user_meta"("p_username" "text", "p_role" "text", "p_target" "text", "p_updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_password"("p_username" "text", "p_password" "text") RETURNS TABLE("ok" boolean, "role" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_hash TEXT;
  v_role TEXT;
BEGIN
  SELECT u.password, u.role
  INTO v_hash, v_role
  FROM users u
  WHERE u.username = p_username
  LIMIT 1;

  IF v_hash IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT (v_hash = crypt(p_password, v_hash)), v_role;
END;
$$;


ALTER FUNCTION "public"."verify_password"("p_username" "text", "p_password" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."verify_password"("p_username" "text", "p_password" "text") IS 'Verificación segura de contraseña con bcrypt. El cliente NUNCA recibe el hash.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_actions" (
    "id" bigint NOT NULL,
    "type" "text",
    "by" "text",
    "affected" "text",
    "detail" "text",
    "fecha" "text"
);


ALTER TABLE "public"."admin_actions" OWNER TO "postgres";


COMMENT ON TABLE "public"."admin_actions" IS 'Auditoría permanente de acciones administrativas. No se puede vaciar desde la app.';



CREATE TABLE IF NOT EXISTS "public"."contabilidad" (
    "id" bigint NOT NULL,
    "fecha" "text",
    "equipo" "text",
    "valor_m" numeric DEFAULT 0,
    "valor_b" numeric DEFAULT 0,
    "total" numeric DEFAULT 0,
    "denoms" "jsonb"
);

ALTER TABLE ONLY "public"."contabilidad" REPLICA IDENTITY FULL;


ALTER TABLE "public"."contabilidad" OWNER TO "postgres";


COMMENT ON TABLE "public"."contabilidad" IS 'Arqueos de caja: monedas, billetes y denominaciones.';



COMMENT ON COLUMN "public"."contabilidad"."denoms" IS 'JSON: {"<denominacion>": <cantidad>, ...}';



ALTER TABLE "public"."contabilidad" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."contabilidad_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."inventario" (
    "id" bigint NOT NULL,
    "guia" "text" NOT NULL,
    "bodega" "text" DEFAULT '—'::"text",
    "pin" "text" DEFAULT '—'::"text",
    "estado" "text" DEFAULT 'pendiente'::"text",
    "fecha" "text"
);

ALTER TABLE ONLY "public"."inventario" REPLICA IDENTITY FULL;


ALTER TABLE "public"."inventario" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventario" IS 'Guías de paquetes: registro, estado y ubicación en bodega.';



ALTER TABLE "public"."inventario" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."inventario_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."session_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."session_log_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_log" (
    "id" bigint DEFAULT "nextval"('"public"."session_log_id_seq"'::"regclass") NOT NULL,
    "usuario" "text",
    "ingreso" "text",
    "ingreso_ts" bigint,
    "salida" "text",
    "salida_ts" bigint
);


ALTER TABLE "public"."session_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."session_log" IS 'Registro de ingresos y salidas de cada usuario. Auditoría permanente.';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "username" "text" NOT NULL,
    "password" "text" NOT NULL,
    "role" "text" DEFAULT 'usuario'::"text" NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON TABLE "public"."users" IS 'Usuarios de la aplicación con autenticación propia.';



COMMENT ON COLUMN "public"."users"."password" IS 'Hash bcrypt generado con pgcrypto.crypt(). NUNCA texto plano.';



COMMENT ON COLUMN "public"."users"."role" IS 'Roles permitidos: usuario | admin | superadmin';



CREATE OR REPLACE VIEW "public"."users_safe" WITH ("security_invoker"='on') AS
  SELECT "username",
    "role"
    FROM "public"."users";


ALTER VIEW "public"."users_safe" OWNER TO "postgres";


COMMENT ON VIEW "public"."users_safe" IS 'Vista sin columna password. Usar esta vista en el cliente para listar usuarios.';



ALTER TABLE ONLY "public"."admin_actions"
    ADD CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contabilidad"
    ADD CONSTRAINT "contabilidad_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventario"
    ADD CONSTRAINT "inventario_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_log"
    ADD CONSTRAINT "session_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");



CREATE INDEX "idx_admin_actions_by" ON "public"."admin_actions" USING "btree" ("by");



CREATE INDEX "idx_admin_actions_id_desc" ON "public"."admin_actions" USING "btree" ("id" DESC);



CREATE INDEX "idx_admin_actions_type" ON "public"."admin_actions" USING "btree" ("type");



CREATE INDEX "idx_contabilidad_denoms" ON "public"."contabilidad" USING "gin" ("denoms");



CREATE INDEX "idx_contabilidad_id_desc" ON "public"."contabilidad" USING "btree" ("id" DESC);



CREATE INDEX "idx_inventario_estado" ON "public"."inventario" USING "btree" ("estado");



CREATE INDEX "idx_inventario_guia" ON "public"."inventario" USING "btree" ("guia");



CREATE INDEX "idx_inventario_id_desc" ON "public"."inventario" USING "btree" ("id" DESC);



CREATE INDEX "idx_session_log_activas" ON "public"."session_log" USING "btree" ("salida_ts") WHERE ("salida_ts" IS NULL);



CREATE INDEX "idx_session_log_id_desc" ON "public"."session_log" USING "btree" ("id" DESC);



CREATE INDEX "idx_session_log_usuario" ON "public"."session_log" USING "btree" ("usuario");



CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");



CREATE OR REPLACE TRIGGER "tg_contabilidad_total" BEFORE INSERT OR UPDATE ON "public"."contabilidad" FOR EACH ROW EXECUTE FUNCTION "public"."trg_calc_total"();



CREATE POLICY "actions_all" ON "public"."admin_actions" TO "authenticated", "anon" USING ((( SELECT "current_setting"('app.current_user'::"text", true) AS "current_setting") IS NOT NULL)) WITH CHECK ((( SELECT "current_setting"('app.current_user'::"text", true) AS "current_setting") IS NOT NULL));



ALTER TABLE "public"."admin_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cont_all" ON "public"."contabilidad" USING ((public.session_username() IS NOT NULL)) WITH CHECK ((public.session_username() IS NOT NULL));



ALTER TABLE "public"."contabilidad" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inv_all" ON "public"."inventario" USING ((public.session_username() IS NOT NULL)) WITH CHECK ((public.session_username() IS NOT NULL));



ALTER TABLE "public"."inventario" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "log_all" ON "public"."session_log" TO "authenticated", "anon" USING ((( SELECT "current_setting"('app.current_user'::"text", true) AS "current_setting") IS NOT NULL)) WITH CHECK ((( SELECT "current_setting"('app.current_user'::"text", true) AS "current_setting") IS NOT NULL));



ALTER TABLE "public"."session_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "slog_all" ON "public"."session_log" USING (true) WITH CHECK (true);



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_all" ON "public"."users" TO "authenticated", "anon" USING ((( SELECT "current_setting"('app.current_user'::"text", true) AS "current_setting") IS NOT NULL)) WITH CHECK ((( SELECT "current_setting"('app.current_user'::"text", true) AS "current_setting") IS NOT NULL));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."change_password"("p_target_user" "text", "p_new_password" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."change_password"("p_target_user" "text", "p_new_password" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_user"("p_username" "text", "p_password" "text", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_user"("p_username" "text", "p_password" "text", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_contabilidad"("p_username" "text", "p_role" "text", "p_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_contabilidad"("p_username" "text", "p_role" "text", "p_id" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_contabilidad"("p_username" "text", "p_role" "text", "p_id" integer) TO "anon";



REVOKE ALL ON FUNCTION "public"."delete_inventario"("p_username" "text", "p_role" "text", "p_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_inventario"("p_username" "text", "p_role" "text", "p_id" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_inventario"("p_username" "text", "p_role" "text", "p_id" integer) TO "anon";



REVOKE ALL ON FUNCTION "public"."delete_user"("p_username" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user"("p_username" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_user"("p_username" "text") TO "anon";


REVOKE ALL ON FUNCTION "public"."get_my_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";



REVOKE ALL ON FUNCTION "public"."insert_admin_action"("p_username" "text", "p_role" "text", "p_id" bigint, "p_type" "text", "p_by" "text", "p_affected" "text", "p_detail" "text", "p_fecha" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."insert_admin_action"("p_username" "text", "p_role" "text", "p_id" bigint, "p_type" "text", "p_by" "text", "p_affected" "text", "p_detail" "text", "p_fecha" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."insert_admin_action"("p_username" "text", "p_role" "text", "p_id" bigint, "p_type" "text", "p_by" "text", "p_affected" "text", "p_detail" "text", "p_fecha" "text") TO "anon";



REVOKE ALL ON FUNCTION "public"."insert_contabilidad"("p_username" "text", "p_role" "text", "p_fecha" "text", "p_equipo" "text", "p_valor_m" numeric, "p_valor_b" numeric, "p_total" numeric, "p_denoms" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."insert_contabilidad"("p_username" "text", "p_role" "text", "p_fecha" "text", "p_equipo" "text", "p_valor_m" numeric, "p_valor_b" numeric, "p_total" numeric, "p_denoms" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."insert_contabilidad"("p_username" "text", "p_role" "text", "p_fecha" "text", "p_equipo" "text", "p_valor_m" numeric, "p_valor_b" numeric, "p_total" numeric, "p_denoms" "jsonb") TO "anon";



REVOKE ALL ON FUNCTION "public"."insert_inventario"("p_username" "text", "p_role" "text", "p_guia" "text", "p_bodega" "text", "p_pin" "text", "p_estado" "text", "p_fecha" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."insert_inventario"("p_username" "text", "p_role" "text", "p_guia" "text", "p_bodega" "text", "p_pin" "text", "p_estado" "text", "p_fecha" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."insert_inventario"("p_username" "text", "p_role" "text", "p_guia" "text", "p_bodega" "text", "p_pin" "text", "p_estado" "text", "p_fecha" "text") TO "anon";



REVOKE ALL ON FUNCTION "public"."insert_session_log"("p_username" "text", "p_role" "text", "p_id" bigint, "p_usuario" "text", "p_ingreso" "text", "p_ingreso_ts" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."insert_session_log"("p_username" "text", "p_role" "text", "p_id" bigint, "p_usuario" "text", "p_ingreso" "text", "p_ingreso_ts" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."insert_session_log"("p_username" "text", "p_role" "text", "p_id" bigint, "p_usuario" "text", "p_ingreso" "text", "p_ingreso_ts" bigint) TO "anon";



GRANT ALL ON FUNCTION "public"."log_action"("p_type" "text", "p_by" "text", "p_affected" "text", "p_detail" "text", "p_fecha" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_action"("p_type" "text", "p_by" "text", "p_affected" "text", "p_detail" "text", "p_fecha" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_action"("p_type" "text", "p_by" "text", "p_affected" "text", "p_detail" "text", "p_fecha" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rename_user"("p_username" "text", "p_role" "text", "p_old_name" "text", "p_new_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rename_user"("p_username" "text", "p_role" "text", "p_old_name" "text", "p_new_name" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."rename_user"("p_username" "text", "p_role" "text", "p_old_name" "text", "p_new_name" "text") TO "anon";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."session_role_app"() TO "anon";
GRANT ALL ON FUNCTION "public"."session_role_app"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."session_role_app"() TO "service_role";



GRANT ALL ON FUNCTION "public"."session_username"() TO "anon";
GRANT ALL ON FUNCTION "public"."session_username"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."session_username"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_session_user"("p_username" "text", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_session_user"("p_username" "text", "p_role" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."set_session_user"("p_username" "text", "p_role" "text") TO "anon";



GRANT ALL ON FUNCTION "public"."trg_calc_total"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_calc_total"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_calc_total"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_contabilidad"("p_username" "text", "p_role" "text", "p_id" integer, "p_fecha" "text", "p_equipo" "text", "p_valor_m" numeric, "p_valor_b" numeric, "p_total" numeric, "p_denoms" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_contabilidad"("p_username" "text", "p_role" "text", "p_id" integer, "p_fecha" "text", "p_equipo" "text", "p_valor_m" numeric, "p_valor_b" numeric, "p_total" numeric, "p_denoms" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_contabilidad"("p_username" "text", "p_role" "text", "p_id" integer, "p_fecha" "text", "p_equipo" "text", "p_valor_m" numeric, "p_valor_b" numeric, "p_total" numeric, "p_denoms" "jsonb") TO "anon";



REVOKE ALL ON FUNCTION "public"."update_inventario"("p_username" "text", "p_role" "text", "p_id" integer, "p_guia" "text", "p_bodega" "text", "p_pin" "text", "p_estado" "text", "p_fecha" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_inventario"("p_username" "text", "p_role" "text", "p_id" integer, "p_guia" "text", "p_bodega" "text", "p_pin" "text", "p_estado" "text", "p_fecha" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_inventario"("p_username" "text", "p_role" "text", "p_id" integer, "p_guia" "text", "p_bodega" "text", "p_pin" "text", "p_estado" "text", "p_fecha" "text") TO "anon";



REVOKE ALL ON FUNCTION "public"."update_session_log"("p_username" "text", "p_role" "text", "p_id" bigint, "p_salida" "text", "p_salida_ts" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_session_log"("p_username" "text", "p_role" "text", "p_id" bigint, "p_salida" "text", "p_salida_ts" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."update_session_log"("p_username" "text", "p_role" "text", "p_id" bigint, "p_salida" "text", "p_salida_ts" bigint) TO "anon";



REVOKE ALL ON FUNCTION "public"."update_user_meta"("p_username" "text", "p_role" "text", "p_target" "text", "p_updates" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_user_meta"("p_username" "text", "p_role" "text", "p_target" "text", "p_updates" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_user_meta"("p_username" "text", "p_role" "text", "p_target" "text", "p_updates" "jsonb") TO "anon";



REVOKE ALL ON FUNCTION "public"."verify_password"("p_username" "text", "p_password" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_password"("p_username" "text", "p_password" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."verify_password"("p_username" "text", "p_password" "text") TO "anon";



GRANT ALL ON TABLE "public"."admin_actions" TO "anon";
GRANT ALL ON TABLE "public"."admin_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_actions" TO "service_role";



GRANT ALL ON TABLE "public"."contabilidad" TO "anon";
GRANT ALL ON TABLE "public"."contabilidad" TO "authenticated";
GRANT ALL ON TABLE "public"."contabilidad" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contabilidad_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contabilidad_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contabilidad_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."inventario" TO "anon";
GRANT ALL ON TABLE "public"."inventario" TO "authenticated";
GRANT ALL ON TABLE "public"."inventario" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inventario_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inventario_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inventario_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."session_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."session_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."session_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."session_log" TO "anon";
GRANT ALL ON TABLE "public"."session_log" TO "authenticated";
GRANT ALL ON TABLE "public"."session_log" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."users" TO "anon";



GRANT ALL ON TABLE "public"."users_safe" TO "anon";
GRANT ALL ON TABLE "public"."users_safe" TO "authenticated";
GRANT ALL ON TABLE "public"."users_safe" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



