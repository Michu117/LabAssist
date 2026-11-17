// Error con estado HTTP y código controlado. El middleware de errores lo
// responde sin exponer detalles técnicos.
class ErrorApi extends Error {
  constructor(status, codigo, mensaje, detalles = []) {
    super(mensaje);
    this.name = "ErrorApi";
    this.status = status;
    this.codigo = codigo;
    this.mensaje = mensaje;
    this.detalles = detalles;
  }
}

module.exports = ErrorApi;
