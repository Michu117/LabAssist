import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { crearTecnico } from "../api/usuarios";
import { MensajeError } from "../components/Mensajes";

const VACIO = {
  nombre: "",
  apellido: "",
  cedula: "",
  correo: "",
  contrasena: "",
  confirmar_contrasena: "",
};

export function UsuarioNuevo() {
  const navigate = useNavigate();
  const [formulario, setFormulario] = useState(VACIO);
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
      await crearTecnico(formulario);
      navigate("/usuarios", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="tarjeta">
      <h1>Nuevo Técnico Docente</h1>
      <MensajeError error={error} />
      <form onSubmit={enviar}>
        <div className="fila">
          <label>
            Nombre
            <input name="nombre" value={formulario.nombre} onChange={cambiar} required maxLength={100} />
          </label>
          <label>
            Apellido
            <input name="apellido" value={formulario.apellido} onChange={cambiar} required maxLength={100} />
          </label>
        </div>
        <div className="fila">
          <label>
            Cédula
            <input
              name="cedula"
              value={formulario.cedula}
              onChange={cambiar}
              inputMode="numeric"
              pattern="[0-9]{10}"
              title="10 dígitos"
              required
            />
          </label>
          <label>
            Correo institucional
            <input
              type="email"
              name="correo"
              value={formulario.correo}
              onChange={cambiar}
              placeholder="nombre@unl.edu.ec"
              required
            />
          </label>
        </div>
        <div className="fila">
          <label>
            Contraseña
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
            Confirmar contraseña
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
        </div>
        <button type="submit" disabled={cargando}>
          {cargando ? "Creando…" : "Crear Técnico Docente"}
        </button>
      </form>
      <p className="enlaces">
        <Link to="/usuarios">Volver al listado</Link>
      </p>
    </div>
  );
}
