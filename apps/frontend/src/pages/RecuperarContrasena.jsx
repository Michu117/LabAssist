
import { useState } from "react";
import { Link } from "react-router-dom";
import { solicitarRecuperacion } from "../api/auth";
import { MensajeError } from "../components/Mensajes";

export function RecuperarContrasena() {
  const [correo, setCorreo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState("");

  async function enviar(evento) {
    evento.preventDefault();
    setError(null);
    setMensaje("");
    setCargando(true);

    try {
      const resultado = await solicitarRecuperacion({ correo });
      setMensaje(resultado.mensaje);
    } catch (err) {
      setError(err);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="tarjeta">
      <h1>Recuperar contraseña</h1>
      <p>
        Ingresa tu correo institucional para recibir
        un enlace de recuperación.
      </p>

      <MensajeError error={error} />

      {mensaje && <p role="status">{mensaje}</p>}

      <form onSubmit={enviar}>
        <label>
          Correo institucional
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <button type="submit" disabled={cargando}>
          {cargando ? "Enviando..." : "Enviar enlace"}
        </button>
      </form>

      <p className="enlaces">
        <Link to="/login">Volver a iniciar sesión</Link>
      </p>
    </div>
  );
}
