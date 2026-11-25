import { useEffect, useState } from "react";
import {
  asignarLector,
  consultarComputadoras,
  crearLaboratorio,
  crearLector,
  listarLectores,
  listarLaboratorios,
} from "../api/laboratorios";
import { MensajeError, MensajeExito } from "../components/Mensajes";

const VACIO = { codigo: "", nombre: "", cantidad_computadoras: "" };
const LECTOR_VACIO = { id: "", capacidad: "" };

function nombreLaboratorio(laboratorio) {
  return `${laboratorio.codigo || "Sin código"} · ${laboratorio.nombre}`;
}

function Inventario({ laboratorioId }) {
  const [resultado, setResultado] = useState(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    consultarComputadoras(laboratorioId)
      .then((data) => vigente && setResultado({ data }))
      .catch((error) => vigente && setResultado({ error }));
    return () => { vigente = false; };
  }, [laboratorioId, intento]);

  if (!resultado) return <p className="cargando">Cargando computadoras…</p>;
  if (resultado.error) {
    return (
      <>
        <MensajeError error={resultado.error} />
        <button type="button" onClick={() => {
          setResultado(null);
          setIntento((valor) => valor + 1);
        }}>Reintentar</button>
      </>
    );
  }

  const { laboratorio, computadoras } = resultado.data;
  return (
    <section aria-labelledby="inventario-laboratorio">
      <h2 id="inventario-laboratorio">{nombreLaboratorio(laboratorio)}</h2>
      <p>Computadoras registradas: {laboratorio.cantidad_computadoras}</p>
      {computadoras.length === 0 ? <p className="vacio">No hay computadoras registradas.</p> : (
        <ul className="lista">
          {computadoras.map((pc) => (
            <li key={pc.id} className="elemento">
              <div className="elemento-datos">
                <strong className="elemento-nombre">{pc.codigo_pc}</strong>
                <span className="elemento-meta">{pc.estado_fisico === "NORMAL" ? "Normal" : "Dañada"}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function GestionLaboratorios() {
  const [formulario, setFormulario] = useState(VACIO);
  const [listado, setListado] = useState(null);
  const [laboratorioId, setLaboratorioId] = useState("");
  const [revision, setRevision] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [lectores, setLectores] = useState(null);
  const [lectorFormulario, setLectorFormulario] = useState(LECTOR_VACIO);
  const [lectorGuardando, setLectorGuardando] = useState(false);
  const [lectorError, setLectorError] = useState(null);

  useEffect(() => {
    let vigente = true;
    listarLaboratorios()
      .then((data) => vigente && setListado(data))
      .catch((problema) => vigente && setListado({ error: problema }));
    return () => { vigente = false; };
  }, [revision]);

  useEffect(() => {
    listarLectores()
      .then((data) => setLectores(data.lectores))
      .catch((problema) => setLectorError(problema));
  }, [revision]);

  function cambiar(evento) {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  }

  function recargar() {
    setListado(null);
    setRevision((valor) => valor + 1);
  }

  function cambiarLector(evento) {
    const { name, value } = evento.target;
    setLectorFormulario((actual) => ({ ...actual, [name]: value }));
  }

  async function guardarLector(evento) {
    evento.preventDefault();
    if (lectorGuardando) return;
    setLectorGuardando(true);
    setLectorError(null);
    try {
      await crearLector({
        id: lectorFormulario.id,
        capacidad: Number(lectorFormulario.capacidad),
        laboratorio_id: null,
      });
      setLectorFormulario(LECTOR_VACIO);
      setMensaje("Lector biométrico registrado. Puedes asociarlo a un laboratorio cuando lo necesites.");
      recargar();
    } catch (problema) {
      setLectorError(problema);
    } finally {
      setLectorGuardando(false);
    }
  }

  async function cambiarLaboratorioLector(lector, evento) {
    const laboratorioId = evento.target.value ? Number(evento.target.value) : null;
    try {
      const { lector: actualizado } = await asignarLector(lector.id, laboratorioId);
      setLectores((actuales) => actuales.map((actual) => (
        actual.id === actualizado.id
          ? { ...actual, laboratorio_id: actualizado.laboratorio_id }
          : actual
      )));
    } catch (problema) {
      setLectorError(problema);
    }
  }

  async function guardar(evento) {
    evento.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setError(null);
    setMensaje("");
    try {
      const { laboratorio } = await crearLaboratorio({
        ...formulario,
        cantidad_computadoras: Number(formulario.cantidad_computadoras),
      });
      setFormulario(VACIO);
      setMensaje(`Laboratorio ${laboratorio.codigo} registrado con ${laboratorio.cantidad_computadoras} computadoras.`);
      setLaboratorioId(String(laboratorio.id));
      recargar();
    } catch (problema) {
      setError(problema);
    } finally {
      setGuardando(false);
    }
  }

  const laboratorios = listado?.laboratorios;
  const seleccionado = laboratorios?.some((laboratorio) => String(laboratorio.id) === laboratorioId);

  return (
    <section className="tarjeta ancho">
      <h1>Gestión de Laboratorios</h1>
      <h2>Registrar laboratorio</h2>
      <MensajeError error={error} />
      <MensajeExito mensaje={mensaje} />
      <form onSubmit={guardar}>
        <div className="fila">
          <label>
            Código del laboratorio
            <input name="codigo" value={formulario.codigo} onChange={cambiar} required maxLength={30} disabled={guardando} />
          </label>
          <label>
            Nombre del laboratorio
            <input name="nombre" value={formulario.nombre} onChange={cambiar} required maxLength={100} disabled={guardando} />
          </label>
        </div>
        <label>
          Número de computadoras
          <input
            name="cantidad_computadoras" type="number" min={1} max={999} step={1}
            value={formulario.cantidad_computadoras} onChange={cambiar} required disabled={guardando}
          />
        </label>
        <button type="submit" disabled={guardando}>{guardando ? "Registrando…" : "Registrar laboratorio"}</button>
      </form>

      <section aria-labelledby="lectores-registrados">
        <h2 id="lectores-registrados">Lectores biométricos</h2>
        <p>Registra el lector sin laboratorio para enrolar huellas. La asociación al laboratorio se usa después para asistencia y reservas.</p>
        <MensajeError error={lectorError} />
        <form onSubmit={guardarLector}>
          <div className="fila">
            <label>
              Identificador del lector
              <input name="id" value={lectorFormulario.id} onChange={cambiarLector} placeholder="esp32-as608-01" required maxLength={100} disabled={lectorGuardando} />
            </label>
            <label>
              Capacidad de huellas
              <input name="capacidad" type="number" min={1} max={65535} value={lectorFormulario.capacidad} onChange={cambiarLector} required disabled={lectorGuardando} />
            </label>
          </div>
          <button type="submit" disabled={lectorGuardando}>{lectorGuardando ? "Registrando…" : "Registrar lector"}</button>
        </form>
        {!lectores && <p className="cargando">Cargando lectores…</p>}
        {lectores?.length === 0 && <p className="vacio">No hay lectores registrados.</p>}
        {lectores?.length > 0 && (
          <ul className="lista">
            {lectores.map((lector) => (
              <li key={lector.id} className="elemento">
                <div className="elemento-datos">
                  <strong className="elemento-nombre">{lector.id}</strong>
                  <span className="elemento-meta">Capacidad: {lector.capacidad}</span>
                </div>
                <label>
                  Laboratorio
                  <select
                    value={lector.laboratorio_id ?? ""}
                    onChange={(evento) => cambiarLaboratorioLector(lector, evento)}
                  >
                    <option value="">Sin laboratorio</option>
                    {laboratorios?.map((lab) => (
                      <option key={lab.id} value={lab.id}>{nombreLaboratorio(lab)}</option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="laboratorios-registrados">
        <h2 id="laboratorios-registrados">Laboratorios registrados</h2>
        {!listado && <p className="cargando">Cargando laboratorios…</p>}
        <MensajeError error={listado?.error} />
        {listado?.error && <button type="button" onClick={recargar}>Reintentar</button>}
        {laboratorios?.length === 0 && <p className="vacio">No hay laboratorios registrados.</p>}
        {laboratorios?.length > 0 && (
          <label>
            Seleccionar laboratorio
            <select value={seleccionado ? laboratorioId : ""} onChange={(evento) => setLaboratorioId(evento.target.value)}>
              <option value="">Selecciona un laboratorio</option>
              {laboratorios.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {nombreLaboratorio(lab)} ({lab.cantidad_computadoras} PC)
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      {seleccionado && <Inventario key={laboratorioId} laboratorioId={laboratorioId} />}
    </section>
  );
}
