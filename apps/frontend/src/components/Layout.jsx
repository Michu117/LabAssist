import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout() {
  const { usuario, esTecnico, cerrarSesion } = useAuth();
  const navigate = useNavigate();

  function salir() {
    cerrarSesion();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app">
      <header className="cabecera">
        <Link to="/" className="logo">LabAssist</Link>
        <nav>
          {!usuario && <Link to="/login">Iniciar sesión</Link>}
          {esTecnico && <Link to="/registro">Registro estudiante</Link>}
          {usuario && <Link to="/perfil">Perfil</Link>}
          {esTecnico && <Link to="/ocupacion">Ocupación de laboratorio</Link>}
          {esTecnico && <Link to="/laboratorios">Gestión de Laboratorios</Link>}
          {usuario?.tipo === "ESTUDIANTE" && <Link to="/reservas">Reservar PC</Link>}
          {esTecnico && <Link to="/usuarios">Usuarios</Link>}
          {usuario && (
            <button type="button" className="salir" onClick={salir}>
              Cerrar sesión
            </button>
          )}
        </nav>
      </header>
      <main className="contenido">
        <Outlet />
      </main>
      <footer className="pie">
        LabAssist — Carrera de Computación, UNL
      </footer>
    </div>
  );
}
