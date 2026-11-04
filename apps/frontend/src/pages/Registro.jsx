import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registrarEstudiante } from "../api/auth";
import { MensajeError, MensajeExito } from "../components/Mensajes";

const VACIO = {
  nombre: "",
  apellido: "",
  cedula: "",
  correo: "",
  contrasena: "",
  confirmar_contrasena: "",
  carrera: "",
  ciclo: "",
};

export function Registro() {
  const navigate = useNavigate();
  const [formulario, setFormulario] = useState(VACIO);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [exitoso, setExitoso] = useState(false);

  function cambiar(evento) {
    setFormulario({ ...formulario, [evento.target.name]: evento.target.value });
  }

  async function enviar(evento) {
    evento.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await registrarEstudiante(formulario);
      setExitoso(true);
      setTimeout(() => navigate("/login", { replace: true }), 800);
    } catch (err) {
      setError(err);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="tarjeta">
      <h1>Registro de estudiante</h1>
      <MensajeError error={error} />
      <MensajeExito mensaje={exitoso ? "Cuenta creada. Inicia sesión para continuar." : null} />
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
            Carrera
            <input name="carrera" value={formulario.carrera} onChange={cambiar} required maxLength={100} />
          </label>
          <label>
            Ciclo
            <input name="ciclo" value={formulario.ciclo} onChange={cambiar} placeholder="2026-1" required maxLength={20} />
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
        <button type="submit" disabled={cargando || exitoso}>
          {cargando ? "Creando cuenta…" : "Registrarme"}
        </button>
      </form>
      <p className="enlaces">
        <Link to="/login">Ya tengo cuenta</Link>
      </p>
    </div>
  );
}
