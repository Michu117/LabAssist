import { useState } from "react";
import { consultarReservaActiva, listarComputadoras, listarSesiones, reservarComputadora } from "../api/reservas";
import { MensajeError, MensajeExito } from "../components/Mensajes";
import { useSondeo } from "../hooks/useSondeo";

const formatoFecha = new Intl.DateTimeFormat("es-EC", {
  dateStyle: "medium", timeStyle: "medium", timeZone: "America/Guayaquil",
});

function fecha(valor) {
  return formatoFecha.format(new Date(valor));
}

function nombreLaboratorio(sesion) {
  return sesion.laboratorio_codigo
    ? `${sesion.laboratorio_codigo} · ${sesion.laboratorio}`
    : sesion.laboratorio;
}

async function consultarReservas() {
  const [{ sesiones }, activa] = await Promise.all([listarSesiones(), consultarReservaActiva()]);
  return { sesiones, activa };
}

function tiempoRestante(reserva, recibidoEn) {
  const ahora = Date.parse(reserva.hora_servidor) + (performance.now() - recibidoEn);
  const segundos = Math.max(0, Math.ceil((Date.parse(reserva.vence_en) - ahora) / 1_000));
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

function ReservaActiva({ reserva, recibidoEn }) {
  return (
    <>
      <h2>Mi reserva activa</h2>
      <dl className="datos">
        <dt>Computadora</dt><dd>{reserva.codigo_pc}</dd>
        <dt>Laboratorio</dt><dd>{reserva.laboratorio}</dd>
        <dt>Creada</dt><dd>{fecha(reserva.creada_en)}</dd>
        <dt>Estado</dt><dd>{reserva.estado_pc}</dd>
        {reserva.estado_pc === "Reservada" && (
          <>
            <dt>Vencimiento sin asistencia</dt><dd>{fecha(reserva.vence_en)}</dd>
            <dt>Tiempo restante para confirmar asistencia</dt><dd>{tiempoRestante(reserva, recibidoEn)}</dd>
          </>
        )}
      </dl>
    </>
  );
}

function Inventario({ sesion, activa, inventario, guardando, reservar }) {
  const [pcId, setPcId] = useState("");
  const pcs = inventario?.data?.inventario ?? [];
  const permiteReserva = sesion.admite_reservas && !activa;
  const elegida = pcs.some((pc) => pc.id === pcId && pc.estado === "Disponible");

  function confirmar(evento) {
    evento.preventDefault();
    if (permiteReserva && elegida && !guardando) void reservar(sesion.id, pcId);
  }

  return (
    <section aria-labelledby="equipos-reservas">
      <h2 id="equipos-reservas">Computadoras de {nombreLaboratorio(sesion)}</h2>
      {!sesion.admite_reservas && <p className="vacio">El plazo de reserva de esta sesión terminó.</p>}
      {!inventario && <p className="cargando">Cargando computadoras…</p>}
      <MensajeError error={inventario?.error} />
      {inventario?.data && pcs.length === 0 && <p className="vacio">Este laboratorio no tiene computadoras registradas.</p>}
      {pcs.length > 0 && (
        <ul className="lista">
          {pcs.map((pc) => <li key={pc.id} className="elemento">{pc.codigo_pc} · {pc.estado}</li>)}
        </ul>
      )}
      {permiteReserva && pcs.some((pc) => pc.estado === "Disponible") && (
        <form onSubmit={confirmar}>
          <label>
            Computadora disponible
            <select value={elegida ? pcId : ""} onChange={(evento) => setPcId(Number(evento.target.value) || "")} disabled={guardando} required>
              <option value="">Selecciona una computadora</option>
              {pcs.filter((pc) => pc.estado === "Disponible").map((pc) => (
                <option key={pc.id} value={pc.id}>{pc.codigo_pc}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!elegida || guardando}>
            {guardando ? "Reservando…" : "Confirmar reserva"}
          </button>
        </form>
      )}
    </section>
  );
}

export function Reservas() {
  const [seleccion, setSeleccion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [confirmada, setConfirmada] = useState(null);
  const [revision, setRevision] = useState(0);
  const consulta = useSondeo(consultarReservas, "reservas", revision);
  const sesiones = consulta?.data?.sesiones ?? [];
  const activa = consulta?.data?.activa;
  const sesion = sesiones.find(({ id }) => id === (seleccion ?? activa?.sesion_id));
  const inventario = useSondeo(listarComputadoras, sesion?.id ?? null, revision);

  async function reservar(sesionId, pcId) {
    setError(null);
    setGuardando(true);
    try {
      const reserva = await reservarComputadora(sesionId, pcId);
      setConfirmada(reserva.id);
      setRevision((valor) => valor + 1);
    } catch (problema) {
      setError(problema);
      if (problema.status === 409 || problema.status === 404) setRevision((valor) => valor + 1);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="tarjeta">
      <h1>Reservar PC</h1>
      <MensajeError error={error || consulta?.error} />
      <MensajeExito mensaje={activa?.id === confirmada ? "Tu reserva fue confirmada." : ""} />
      {!consulta && <p className="cargando">Cargando sesiones…</p>}
      {activa && <ReservaActiva reserva={activa} recibidoEn={consulta.recibidoEn} />}
      {consulta?.data && sesiones.length === 0 && (
        <p className="vacio">No hay laboratorios habilitados actualmente. Espera a que el Técnico Docente abra una sesión</p>
      )}
      {sesiones.length > 0 && (
        <ul className="lista" aria-label="Laboratorios habilitados">
          {sesiones.map((actual) => (
            <li key={actual.id} className="elemento">
              <div className="elemento-datos">
                <strong className="elemento-nombre">{nombreLaboratorio(actual)}</strong>
                <span className="elemento-meta">Sesión abierta · {fecha(actual.inicio)}</span>
                <span className="elemento-meta">{actual.cantidad_computadoras} computadoras · {actual.cantidad_disponibles} disponibles</span>
                {!actual.admite_reservas && <span className="elemento-meta">Plazo de reserva cerrado</span>}
              </div>
              <button type="button" aria-pressed={sesion?.id === actual.id} disabled={guardando} onClick={() => {
                setError(null);
                setSeleccion(actual.id);
              }}>Ver computadoras</button>
            </li>
          ))}
        </ul>
      )}
      {sesion && <Inventario key={sesion.id} sesion={sesion} activa={activa} inventario={inventario} guardando={guardando} reservar={reservar} />}
    </section>
  );
}
