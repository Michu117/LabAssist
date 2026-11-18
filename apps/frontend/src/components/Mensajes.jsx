export function MensajeError({ error }) {
  if (!error) return null;
  return (
    <div className="error" role="alert">
      <strong>{error.mensaje}</strong>
      {error.detalles && error.detalles.length > 0 && (
        <ul>
          {error.detalles.map((detalle, indice) => (
            <li key={indice}>
              {detalle.campo && detalle.campo !== "(cuerpo)"
                ? `${detalle.campo}: ${detalle.mensaje}`
                : detalle.mensaje}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MensajeExito({ mensaje }) {
  if (!mensaje) return null;
  return (
    <div className="exito" role="status">
      {mensaje}
    </div>
  );
}
