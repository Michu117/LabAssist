const { obtenerPool } = require("../../database/pool");
const { expirar } = require("./reservas.repository");

const INTERVALO_MS = 30_000;

async function liberarReservasVencidas() {
  return expirar(obtenerPool());
}

function iniciarExpiracionReservas() {
  let temporizador;
  let detenido = false;

  async function ejecutar() {
    try {
      await liberarReservasVencidas();
    } catch (error) {
      console.error("No se pudieron liberar las reservas vencidas:", error.message);
    } finally {
      if (!detenido) temporizador = setTimeout(ejecutar, INTERVALO_MS).unref();
    }
  }

  void ejecutar();
  return () => {
    detenido = true;
    clearTimeout(temporizador);
  };
}

module.exports = { iniciarExpiracionReservas };
