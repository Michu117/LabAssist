import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Exige sesión y, opcionalmente, un tipo de usuario concreto. La autorización
// real la valida el backend; aquí solo se ocultan las opciones.
export function RutaProtegida({ tipo }) {
  const { usuario } = useAuth();
  const ubicacion = useLocation();

  if (!usuario) {
    return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  }
  if (tipo && usuario.tipo !== tipo) {
    return <Navigate to="/perfil" replace />;
  }
  if (
    usuario.debe_cambiar_contrasena &&
    ubicacion.pathname !== "/perfil/contrasena"
  ) {
    return <Navigate to="/perfil/contrasena" replace />;
  }
  return <Outlet />;
}
