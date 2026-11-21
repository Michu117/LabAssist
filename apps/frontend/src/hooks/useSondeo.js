import { useEffect, useRef, useState } from "react";

const INTERVALO_MS = 1_000;

export function useSondeo(consultar, clave, revision = 0) {
  const [resultado, setResultado] = useState(null);
  const enCurso = useRef(null);

  useEffect(() => {
    if (clave === null) return;
    let vigente = true;
    let consultando = false;
    let temporizador;

    async function actualizar() {
      if (!vigente || document.hidden || consultando) return;
      consultando = true;
      let inicio;
      try {
        await enCurso.current?.catch(() => {});
        if (!vigente || document.hidden) return;
        inicio = performance.now();
        const consulta = consultar(clave);
        enCurso.current = consulta;
        const data = await consulta;
        if (vigente) setResultado({ clave, revision, data, recibidoEn: performance.now() });
      } catch (error) {
        if (vigente) setResultado({ clave, revision, error });
      } finally {
        consultando = false;
        if (vigente && !document.hidden && inicio !== undefined) {
          temporizador = window.setTimeout(actualizar, Math.max(0, INTERVALO_MS - (performance.now() - inicio)));
        }
      }
    }

    function alCambiarVisibilidad() {
      window.clearTimeout(temporizador);
      if (!document.hidden) void actualizar();
    }

    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    void actualizar();
    return () => {
      vigente = false;
      window.clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [consultar, clave, revision]);

  return resultado?.clave === clave && resultado.revision === revision ? resultado : null;
}
