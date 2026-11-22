
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { restablecerContrasena } from "../api/auth";
import { MensajeError } from "../components/Mensajes";

export function RestablecerContrasena() {
  const [parametros] = useSearchParams();
  const token = parametros.get("token");

  const [contrasena, setContrasena] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [completado, setCompletado] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    setError(null);

    if (contrasena !== confirmar) {
      setError(new Error("Las contraseñas no coinciden"));
      return;
    }

    setCargando(true);

    try {
      await restablecerContrasena({
        token,
        contrasena,
        confirmar_contrasena: confirmar,
      });

      setCompletado(true);
    } catch (err) {
      setError(err);
    } finally {
      setCargando(false);
    }
  }

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return (
      <div className="tarjeta">
        <h1>Enlace inválido</h1>
        <p>El enlace de recuperación no es válido.</p>
        <Link to="/recuperar-contrasena">
          Solicitar otro enlace
        </Link>
      </div>
    );
  }

  if (completado) {
    return (
      <div className="tarjeta">
        <h1>Contraseña actualizada</h1>
        <p>
          Tu contraseña se actualizó correctamente.
          Ya puedes iniciar sesión.
        </p>
        <Link to="/login">Iniciar sesión</Link>
      </div>
    );
  }

  return (
    <div className="tarjeta">
      <h1>Restablecer contraseña</h1>
      <p>Introduce tu nueva contraseña.</p>

      <MensajeError error={error} />

      <form onSubmit={enviar}>
        <label>
          Nueva contraseña
          <input
            type="password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />
        </label>

        <label>
          Confirmar contraseña
          <input
            type="password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />
        </label>

        <button type="submit" disabled={cargando}>
          {cargando ? "Guardando..." : "Cambiar contraseña"}
        </button>
      </form>

      <p className="enlaces">
        <Link to="/login">Volver al inicio de sesión</Link>
      </p>
    </div>
  );
}
