import { api } from "./cliente";

const base = "/laboratorios";

export const listarLaboratorios = () => api.get(base);
export const crearLaboratorio = (datos) => api.post(base, datos);
export const consultarComputadoras = (laboratorioId) =>
  api.get(`${base}/${laboratorioId}/computadoras`);
export const listarLectores = () => api.get(`${base}/lectores`);
export const crearLector = (datos) => api.post(`${base}/lectores`, datos);
export const asignarLector = (id, laboratorio_id) =>
  api.patch(`${base}/lectores/${encodeURIComponent(id)}`, { laboratorio_id });
