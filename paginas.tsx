import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Verificar sesión antes de cualquier query
  // getUser() valida el token contra el servidor de Supabase (más seguro que getSession)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    redirect("/login");
  }

  // Supabase RLS se encargará de filtrar solo los todos del usuario autenticado
  const { data: todos, error: queryError } = await supabase
    .from("todos")
    .select();

  if (queryError) {
    console.error("Error al obtener todos:", queryError.message);
    return <p>Ocurrió un error al cargar los datos.</p>;
  }

  return (
    <ul>
      {todos?.map((todo) => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
  );
}
