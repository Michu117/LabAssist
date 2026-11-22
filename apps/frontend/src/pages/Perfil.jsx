import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { editarPerfil, obtenerPerfil } from "../api/usuarios";
import { useAuth } from "../context/AuthContext";
import { MensajeError, MensajeExito } from "../components/Mensajes";

export function Perfil() {
  const { usuario: enSesion } = useAuth();
  const [perfil, setPerfil] = useState(null);
  const [formulario, setFormulario] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [exitoso, setExitoso] = useState(false);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const datos = await obtenerPerfil();
        if (activo) {
          setPerfil(datos.usuario);
          setFormulario(datos.usuario);
        }
      } catch (err) {
        if (activo) setError(err);
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  function cambiar(evento) {
    setFormulario({ ...formulario, [evento.target.name]: evento.target.value });
    setExitoso(false);
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    setExitoso(false);
    setGuardando(true);
    try {
      const campos = { nombre: formulario.nombre, apellido: formulario.apellido };
      if (perfil.tipo === "ESTUDIANTE") {
        campos.carrera = formulario.carrera;
        campos.ciclo = formulario.ciclo;
      }
      const datos = await editarPerfil(campos);
      setPerfil(datos.usuario);
      setExitoso(true);
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p className="cargando">Cargando perfil…</p>;
  if (!perfil) return <MensajeError error={error} />;

  const esEstudiante = perfil.tipo === "ESTUDIANTE";

  return (
    <div className="tarjeta">
      <h1>Mi perfil</h1>
      <MensajeError error={error} />
      <MensajeExito mensaje={exitoso ? "Perfil actualizado." : null} />

      <dl className="datos">
        <div>
          <dt>Correo</dt>
          <dd>{perfil.correo}</dd>
        </div>
        <div>
          <dt>Cédula</dt>
          <dd>{perfil.cedula}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{esEstudiante ? "Estudiante" : "Técnico Docente"}</dd>
        </div>
        <div>
          <dt>Sesión de</dt>
          <dd>{enSesion ? `${enSesion.nombre} ${enSesion.apellido}` : "—"}</dd>
        </div>
      </dl>

      <form onSubmit={guardar}>
        <div className="fila">
          <label>
            Nombre
            <input name="nombre" value={formulario.nombre || ""} onChange={cambiar} required maxLength={100} />
          </label>
          <label>
            Apellido
            <input name="apellido" value={formulario.apellido || ""} onChange={cambiar} required maxLength={100} />
          </label>
        </div>
        {esEstudiante && (
          <div className="fila">
            <label>
              Carrera
              <input name="carrera" value={formulario.carrera || ""} onChange={cambiar} required maxLength={100} />
            </label>
            <label>
              Ciclo
              <input name="ciclo" value={formulario.ciclo || ""} onChange={cambiar} required maxLength={20} />
            </label>
          </div>
        )}
        <button type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>

      <p className="enlaces">
        <Link to="/perfil/contrasena">Cambiar contraseña</Link>
      </p>
    </div>
  );
}
