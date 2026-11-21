import { api } from "./cliente";

export const listarSesiones = () => api.get("/reservas/sesiones");
export const listarComputadoras = (sesionId) =>
  api.get(`/reservas/sesiones/${sesionId}/computadoras`);
export const consultarReservaActiva = () => api.get("/reservas/me/activa");
export const reservarComputadora = (sesionId, computadoraId) =>
  api.post("/reservas", { sesionId, computadoraId });
