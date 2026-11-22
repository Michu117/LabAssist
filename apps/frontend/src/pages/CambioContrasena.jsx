import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cambiarContrasena } from "../api/usuarios";
import { MensajeError, MensajeExito } from "../components/Mensajes";

const VACIO = { contrasena_actual: "", contrasena: "", confirmar_contrasena: "" };

export function CambioContrasena() {
  const navigate = useNavigate();
  const [formulario, setFormulario] = useState(VACIO);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [exitoso, setExitoso] = useState(false);

  function cambiar(evento) {
    setFormulario({ ...formulario, [evento.target.name]: evento.target.value });
    setExitoso(false);
  }

  async function enviar(evento) {
    evento.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await cambiarContrasena(formulario);
      setExitoso(true);
      setFormulario(VACIO);
      setTimeout(() => navigate("/perfil", { replace: true }), 800);
    } catch (err) {
      setError(err);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="tarjeta">
      <h1>Cambiar contraseña</h1>
      <MensajeError error={error} />
      <MensajeExito mensaje={exitoso ? "Contraseña actualizada." : null} />
      <form onSubmit={enviar}>
        <label>
          Contraseña actual
          <input
            type="password"
            name="contrasena_actual"
            value={formulario.contrasena_actual}
            onChange={cambiar}
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          Contraseña nueva
          <input
            type="password"
            name="contrasena"
            value={formulario.contrasena}
            onChange={cambiar}
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />
        </label>
        <label>
          Confirmar contraseña nueva
          <input
            type="password"
            name="confirmar_contrasena"
            value={formulario.confirmar_contrasena}
            onChange={cambiar}
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />
        </label>
        <button type="submit" disabled={cargando}>
          {cargando ? "Guardando…" : "Cambiar contraseña"}
        </button>
      </form>
      <p className="enlaces">
        <Link to="/perfil">Volver al perfil</Link>
      </p>
    </div>
  );
}
