import { useEffect, useState } from "react";
import { abrirSesion, consultarOcupante, consultarPlano, finalizarSesion, listarLaboratorios } from "../api/ocupacion";
import { MensajeError, MensajeExito } from "../components/Mensajes";
import { useSondeo } from "../hooks/useSondeo";
import "./OcupacionLaboratorio.css";

const fechaIngreso = new Intl.DateTimeFormat("es-EC", {
  dateStyle: "medium", timeStyle: "medium", timeZone: "America/Guayaquil",
});

function Equipo({ pc, seleccionado, seleccionar }) {
  const contenido = (
    <>
      <strong>{pc.codigo_pc}</strong>
      <span>{pc.estado}</span>
      {pc.estado === "Ocupada" && pc.estado_fisico === "DAÑADA" && <span>Equipo dañado</span>}
    </>
  );
  const posicion = pc.fila === null ? undefined : { gridRow: pc.fila, gridColumn: pc.columna };
  return (
    <li className="ocupacion-equipo" data-estado={pc.estado} style={posicion}>
      {pc.estado === "Ocupada" ? (
        <button type="button" aria-pressed={seleccionado} onClick={seleccionar}>{contenido}</button>
      ) : contenido}
    </li>
  );
}

function PlanoLaboratorio({ laboratorioId }) {
  const [revision, setRevision] = useState(0);
  const resultado = useSondeo(consultarPlano, laboratorioId, revision);
  const [seleccion, setSeleccion] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const pcOcupada = resultado?.data?.computadoras.find((pc) => pc.id === seleccion && pc.estado === "Ocupada");
  const pcId = pcOcupada?.id;

  useEffect(() => {
    if (!pcId) {
      setSeleccion(null);
      setDetalle(null);
      return;
    }
    let vigente = true;
    consultarOcupante(laboratorioId, pcId)
      .then((ocupante) => vigente && setDetalle({ pcId, ocupante }))
      .catch((error) => vigente && setDetalle({ pcId, error }));
    return () => { vigente = false; };
  }, [laboratorioId, pcId]);

  if (!resultado) return <p className="cargando">Cargando ocupación…</p>;
  if (resultado.error) {
    return (
      <>
        <MensajeError error={resultado.error} />
        <p className="vacio">No hay datos actuales. La pantalla volverá a intentar la consulta.</p>
      </>
    );
  }

  const plano = resultado.data;
  const { estadisticas, sesion, laboratorio } = plano;
  const abierta = sesion?.estado === "ABIERTA";
  const activo = abierta && laboratorio.habilitado;
  const ubicadas = plano.computadoras.filter((pc) => pc.fila !== null);
  const sinUbicacion = plano.computadoras.filter((pc) => pc.fila === null);
  const consulta = detalle?.pcId === pcId ? detalle : null;

  async function actualizarSesion() {
    if (guardando) return;
    const ocupada = estadisticas.ocupadas > 0;
    if (abierta && !window.confirm(ocupada
      ? "¿Confirmas que el laboratorio está desocupado y deseas desactivarlo?"
      : "¿Desactivar el laboratorio, finalizar la sesión y liberar las reservas pendientes?")) return;
    setGuardando(true);
    setErrorAccion(null);
    setMensaje("");
    try {
      if (abierta) await finalizarSesion(laboratorioId, sesion.id, ocupada);
      else await abrirSesion(laboratorioId);
      setMensaje(abierta ? "Laboratorio desactivado y sesión finalizada." : "Laboratorio activado y sesión abierta.");
      setRevision((valor) => valor + 1);
    } catch (error) {
      setErrorAccion(error);
    } finally {
      setGuardando(false);
    }
  }

  function equipo(pc) {
    return (
      <Equipo key={pc.id} pc={pc} seleccionado={pc.id === seleccion} seleccionar={() => {
        setDetalle(null);
        setSeleccion(pc.id === seleccion ? null : pc.id);
      }} />
    );
  }

  return (
    <>
      <div className="ocupacion-resumen">
        <MensajeError error={errorAccion} />
        <MensajeExito mensaje={mensaje} />
        <dl className="datos">
          <dt>Laboratorio</dt><dd>{activo ? "Activo" : "Inactivo"}</dd>
          <dt>Sesión</dt><dd>{abierta ? "Abierta" : "Cerrada"}</dd>
          {sesion && (
            <>
              <dt>Responsable de apertura</dt><dd>{sesion.abierta_por_nombre}</dd>
              <dt>Hora de apertura</dt><dd>{fechaIngreso.format(new Date(sesion.inicio))}</dd>
            </>
          )}
        </dl>
        <button
          type="button" onClick={actualizarSesion}
          disabled={guardando || (!abierta && !plano.computadoras.some((pc) => pc.estado_fisico === "NORMAL"))}
        >
          {guardando ? "Guardando…" : abierta ? "Desactivar laboratorio" : "Activar laboratorio"}
        </button>
        <dl className="datos">
          <dt>Total de computadoras</dt><dd>{estadisticas.total}</dd>
          <dt>Disponibles</dt><dd>{estadisticas.disponibles}</dd>
          <dt>Reservadas</dt><dd>{estadisticas.reservadas}</dd>
          <dt>Ocupadas</dt><dd>{estadisticas.ocupadas}</dd>
          <dt>Inactivas</dt><dd>{estadisticas.inactivas}</dd>
          <dt>Ocupación</dt><dd>{estadisticas.porcentaje_ocupacion ?? "Pendiente"}{estadisticas.porcentaje_ocupacion !== null && " %"}</dd>
          <dt>Estudiantes presentes</dt><dd>{estadisticas.presentes ?? "Pendiente"}</dd>
        </dl>
        {!plano.asistencia_integrada && <p>La integración de asistencia biométrica está pendiente.</p>}
      </div>
      {plano.computadoras.length === 0 && <p className="vacio">Este laboratorio aún no tiene computadoras registradas.</p>}
      {ubicadas.length > 0 && (
        <section aria-labelledby="titulo-plano">
          <h2 id="titulo-plano">Plano de computadoras</h2>
          <div className="ocupacion-plano">
            <ul className="ocupacion-cuadricula">{ubicadas.map(equipo)}</ul>
          </div>
        </section>
      )}
      {sinUbicacion.length > 0 && (
        <section aria-labelledby="titulo-sin-ubicacion">
          <h2 id="titulo-sin-ubicacion">Equipos sin ubicación</h2>
          <ul className="ocupacion-sin-ubicacion">{sinUbicacion.map(equipo)}</ul>
        </section>
      )}
      {pcOcupada && (
        <section aria-labelledby="titulo-ocupante">
          <h2 id="titulo-ocupante">Ocupante de {pcOcupada.codigo_pc}</h2>
          {!consulta && <p className="cargando">Consultando ocupante…</p>}
          <MensajeError error={consulta?.error} />
          {consulta?.ocupante && (
            <dl className="datos">
              <dt>Estudiante</dt><dd>{consulta.ocupante.nombre} {consulta.ocupante.apellido}</dd>
              <dt>Identificación</dt><dd>{consulta.ocupante.identificacion}</dd>
              <dt>Hora de ingreso</dt><dd>{fechaIngreso.format(new Date(consulta.ocupante.ingreso_en))}</dd>
            </dl>
          )}
        </section>
      )}
    </>
  );
}

export function OcupacionLaboratorio() {
  const [laboratorios, setLaboratorios] = useState(null);
  const [seleccionLaboratorio, setSeleccionLaboratorio] = useState(null);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  const laboratorioId = seleccionLaboratorio?.id ?? "";

  useEffect(() => {
    let vigente = true;
    listarLaboratorios().then(({ laboratorios: lista }) => {
      if (!vigente) return;
      setLaboratorios(lista);
      if (lista.length > 0) setSeleccionLaboratorio({ id: lista[0].id });
    }).catch((problema) => vigente && setError(problema));
    return () => { vigente = false; };
  }, [intento]);

  return (
    <section className="tarjeta ancho ocupacion">
      <h1>Ocupación de laboratorio</h1>
      <MensajeError error={error} />
      {error && (
        <button type="button" onClick={() => { setError(null); setIntento((valor) => valor + 1); }}>Reintentar</button>
      )}
      {!laboratorios && !error && <p className="cargando">Cargando laboratorios…</p>}
      {laboratorios?.length === 0 && <p className="vacio">No hay laboratorios registrados.</p>}
      {laboratorios?.length > 0 && (
        <>
          <label htmlFor="laboratorio-ocupacion">Laboratorio</label>
          <select id="laboratorio-ocupacion" value={laboratorioId} onChange={(evento) => setSeleccionLaboratorio({ id: Number(evento.target.value) })}>
            {laboratorios.map((lab) => <option key={lab.id} value={lab.id}>{lab.nombre}</option>)}
          </select>
          <PlanoLaboratorio key={laboratorioId} laboratorioId={laboratorioId} />
        </>
      )}
    </section>
  );
}
