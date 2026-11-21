import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { registrarEstudiante } from "../api/auth";
import { consultarCaptura, iniciarCaptura } from "../api/biometria";
import { MensajeError, MensajeExito } from "../components/Mensajes";
import { useAuth } from "../context/AuthContext";

const VACIO = {
  nombre: "",
  apellido: "",
  cedula: "",
  correo: "",
  carrera: "",
  ciclo: "",
};

export function Registro() {
  const { esTecnico } = useAuth();
  const [formulario, setFormulario] = useState(VACIO);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [exitoso, setExitoso] = useState(false);
  const [captura, setCaptura] = useState(null);
  const [activando, setActivando] = useState(false);
  const [credencialTemporal, setCredencialTemporal] = useState(null);

  useEffect(() => {
    if (!captura || captura.estado !== "PENDIENTE") return undefined;
    let vigente = true;
    let temporizador;
    async function actualizar() {
      try {
        const resultado = await consultarCaptura(captura.captura_id);
        if (vigente) setCaptura({ ...captura, ...resultado.captura });
      } catch (err) {
        if (!vigente) return;
        if (err.status === 404 || err.status === 403) {
          setError(err);
          setCaptura(null);
        } else {
          temporizador = setTimeout(actualizar, 2000);
        }
      }
    }
    temporizador = setTimeout(actualizar, 2000);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [captura]);

  function cambiar(evento) {
    setFormulario({ ...formulario, [evento.target.name]: evento.target.value });
  }

  async function enviar(evento) {
    evento.preventDefault();
    setError(null);
    setCargando(true);
    try {
      if (!captura || captura.estado !== "COMPLETADA") {
        setError({
          mensaje: "Primero debes completar la captura de huella",
          detalles: [],
        });
        return;
      }
      const resultado = await registrarEstudiante({
        ...formulario,
        captura_id: captura.captura_id,
      });
      setCredencialTemporal(resultado.usuario.contrasena_temporal);
      setExitoso(true);
    } catch (err) {
      setError(err);
    } finally {
      setCargando(false);
    }
  }

  async function activarSensor() {
    setError(null);
    setCaptura(null);
    setActivando(true);
    try {
      const resultado = await iniciarCaptura();
      setCaptura(resultado);
    } catch (err) {
      setError(err);
    } finally {
      setActivando(false);
    }
  }

  return (
    <div className="tarjeta">
      <h1>Registro de estudiante</h1>
      <MensajeError error={error} />
      <MensajeExito
        mensaje={exitoso ? "Cuenta creada. Entrega la contraseña temporal al estudiante." : null}
      />
      {credencialTemporal && (
        <p className="mensaje-exito">
          Contraseña temporal: <strong>{credencialTemporal}</strong>
        </p>
      )}
      {!esTecnico && (
        <p>Un Técnico Docente debe iniciar la captura biométrica y completar este registro.</p>
      )}
      <button type="button" onClick={activarSensor}
        disabled={!esTecnico || cargando || exitoso || activando || captura?.estado === "PENDIENTE"}>
        {captura?.estado === "PENDIENTE" ? "Esperando huella…" : "Activar sensor y capturar huella"}
      </button>
      {captura?.estado === "PENDIENTE" && (
        <p>
          Captura activa. Esperando la respuesta de la ESP32/AS608...
        </p>
      )}
      {captura?.estado === "COMPLETADA" && <p>Huella capturada correctamente.</p>}
      {captura?.estado === "EXPIRADA" && <p role="alert">La captura venció. Activa el sensor para volver a intentarlo.</p>}
      {captura?.estado === "ERROR" && (
        <p role="alert">No se pudo capturar la huella: {captura.error_mensaje}</p>
      )}
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
        <button type="submit" disabled={cargando || exitoso}>
          {cargando ? "Creando cuenta…" : "Registrar estudiante"}
        </button>
      </form>
      <p className="enlaces">
        <Link to={esTecnico ? "/usuarios" : "/login"}>Volver</Link>
      </p>
    </div>
  );
}
