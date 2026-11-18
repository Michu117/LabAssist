import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { editarUsuario, obtenerUsuario } from "../api/usuarios";
import { MensajeError, MensajeExito } from "../components/Mensajes";

export function UsuarioDetalle() {
  const { id } = useParams();
  const [usuario, setUsuario] = useState(null);
  const [formulario, setFormulario] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [exitoso, setExitoso] = useState(false);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const datos = await obtenerUsuario(id);
        if (activo) {
          setUsuario(datos.usuario);
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
  }, [id]);

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
      const campos = {
        nombre: formulario.nombre,
        apellido: formulario.apellido,
        cedula: formulario.cedula,
        correo: formulario.correo,
      };
      if (usuario.tipo === "ESTUDIANTE") {
        campos.carrera = formulario.carrera;
        campos.ciclo = formulario.ciclo;
      }
      const datos = await editarUsuario(id, campos);
      setUsuario(datos.usuario);
      setFormulario(datos.usuario);
      setExitoso(true);
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p className="cargando">Cargando usuario…</p>;
  if (!usuario) {
    return (
      <div className="tarjeta">
        <MensajeError error={error} />
        <p className="enlaces">
          <Link to="/usuarios">Volver al listado</Link>
        </p>
      </div>
    );
  }

  const esEstudiante = usuario.tipo === "ESTUDIANTE";

  return (
    <div className="tarjeta">
      <h1>
        {usuario.nombre} {usuario.apellido}
      </h1>
      <MensajeError error={error} />
      <MensajeExito mensaje={exitoso ? "Usuario actualizado." : null} />

      <dl className="datos">
        <div>
          <dt>Tipo</dt>
          <dd>{esEstudiante ? "Estudiante" : "Técnico Docente"}</dd>
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
        <div className="fila">
          <label>
            Cédula
            <input
              name="cedula"
              value={formulario.cedula || ""}
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
              value={formulario.correo || ""}
              onChange={cambiar}
              required
            />
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
        <Link to="/usuarios">Volver al listado</Link>
      </p>
    </div>
  );
}
