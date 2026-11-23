import { api } from "./cliente";

const base = "/laboratorios";

export const listarLaboratorios = () => api.get(base);
export const crearLaboratorio = (datos) => api.post(base, datos);
export const consultarComputadoras = (laboratorioId) =>
  api.get(`${base}/${laboratorioId}/computadoras`);
