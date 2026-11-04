import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "../components/Layout";
import { RutaProtegida } from "../components/RutaProtegida";
import { Login } from "../pages/Login";
import { Registro } from "../pages/Registro";
import { Perfil } from "../pages/Perfil";
import { CambioContrasena } from "../pages/CambioContrasena";
import { Usuarios } from "../pages/Usuarios";
import { UsuarioNuevo } from "../pages/UsuarioNuevo";
import { UsuarioDetalle } from "../pages/UsuarioDetalle";

export function Rutas() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/registro" element={<Registro />} />

        <Route element={<RutaProtegida />}>
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/perfil/contrasena" element={<CambioContrasena />} />
        </Route>

        <Route element={<RutaProtegida tipo="TECNICO_DOCENTE" />}>
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="/usuarios/nuevo" element={<UsuarioNuevo />} />
          <Route path="/usuarios/:id" element={<UsuarioDetalle />} />
        </Route>

        <Route path="/" element={<Navigate to="/perfil" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
