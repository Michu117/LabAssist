import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { eliminarUsuario, listarUsuarios } from "../api/usuarios";
import { MensajeError, MensajeExito } from "../components/Mensajes";

const LIMITE = 10;

export function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [tipo, setTipo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaEnviada, setBusquedaEnviada] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const datos = await listarUsuarios({
        pagina,
        limite: LIMITE,
        tipo: tipo || undefined,
        busqueda: busquedaEnviada || undefined,
      });
      setUsuarios(datos.usuarios);
      setTotal(datos.total);
    } catch (err) {
      setError(err);
    } finally {
      setCargando(false);
    }
  }, [pagina, tipo, busquedaEnviada]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));

  function buscar(evento) {
    evento.preventDefault();
    setPagina(1);
    setBusquedaEnviada(busqueda.trim());
  }

  async function eliminar(usuario) {
    const confirmado = window.confirm(
      `¿Eliminar a ${usuario.nombre} ${usuario.apellido}? Esta acción no se puede deshacer.`
    );
    if (!confirmado) return;
    setError(null);
    setMensaje(null);
    try {
      await eliminarUsuario(usuario.id);
      setMensaje(`Usuario ${usuario.nombre} ${usuario.apellido} eliminado.`);
      await cargar();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="ancho">
      <div className="cabecera-pagina">
        <h1>Usuarios</h1>
        <Link className="accion" to="/usuarios/nuevo">
          Nuevo Técnico Docente
        </Link>
      </div>

      <MensajeError error={error} />
      <MensajeExito mensaje={mensaje} />

      <form className="filtros" onSubmit={buscar}>
        <input
          type="search"
          placeholder="Buscar por nombre, cédula o correo"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          aria-label="Buscar usuarios"
        />
        <select
          value={tipo}
          onChange={(evento) => {
            setPagina(1);
            setTipo(evento.target.value);
          }}
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos los tipos</option>
          <option value="ESTUDIANTE">Estudiantes</option>
          <option value="TECNICO_DOCENTE">Técnicos Docentes</option>
        </select>
        <button type="submit">Buscar</button>
      </form>

      {cargando ? (
        <p className="cargando">Cargando usuarios…</p>
      ) : usuarios.length === 0 ? (
        <p className="vacio">No se encontraron usuarios.</p>
      ) : (
        <ul className="lista">
          {usuarios.map((usuario) => (
            <li className="elemento" key={usuario.id}>
              <div className="elemento-datos">
                <Link to={`/usuarios/${usuario.id}`} className="elemento-nombre">
                  {usuario.nombre} {usuario.apellido}
                </Link>
                <span className="elemento-correo">{usuario.correo}</span>
                <span className="elemento-meta">
                  C.I. {usuario.cedula} ·{" "}
                  {usuario.tipo === "ESTUDIANTE" ? "Estudiante" : "Técnico Docente"}
                </span>
              </div>
              <div className="elemento-acciones">
                <Link className="accion" to={`/usuarios/${usuario.id}`}>
                  Editar
                </Link>
                <button
                  type="button"
                  className="peligro"
                  onClick={() => eliminar(usuario)}
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="paginacion">
        <button
          type="button"
          disabled={pagina <= 1}
          onClick={() => setPagina(pagina - 1)}
        >
          Anterior
        </button>
        <span>
          Página {pagina} de {totalPaginas} ({total} en total)
        </span>
        <button
          type="button"
          disabled={pagina >= totalPaginas}
          onClick={() => setPagina(pagina + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
