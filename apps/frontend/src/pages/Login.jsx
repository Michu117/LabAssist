import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { iniciarSesion } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { MensajeError } from "../components/Mensajes";

export function Login() {
  const { abrirSesion } = useAuth();
  const navigate = useNavigate();
  const [formulario, setFormulario] = useState({ correo: "", contrasena: "" });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  function cambiar(evento) {
    setFormulario({ ...formulario, [evento.target.name]: evento.target.value });
  }

  async function enviar(evento) {
    evento.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const datos = await iniciarSesion(formulario);
      abrirSesion(datos.token, datos.usuario);
      navigate(
        datos.usuario.tipo === "TECNICO_DOCENTE" ? "/usuarios" : "/perfil",
        { replace: true }
      );
    } catch (err) {
      setError(err);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="tarjeta">
      <h1>Iniciar sesión</h1>
      <MensajeError error={error} />
      <form onSubmit={enviar}>
        <label>
          Correo institucional
          <input
            type="email"
            name="correo"
            value={formulario.correo}
            onChange={cambiar}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            name="contrasena"
            value={formulario.contrasena}
            onChange={cambiar}
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" disabled={cargando}>
          {cargando ? "Entrando…" : "Iniciar sesión"}
        </button>
      </form>
      <p className="enlaces">
        <Link to="/registro">Crear cuenta de estudiante</Link>
      </p>
    </div>
  );
}
