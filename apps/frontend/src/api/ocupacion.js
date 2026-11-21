import { api } from "./cliente";

const base = "/ocupacion/laboratorios";

export const listarLaboratorios = () => api.get(base);
export const consultarPlano = (laboratorioId) => api.get(`${base}/${laboratorioId}`);
export const consultarOcupante = (laboratorioId, computadoraId) =>
  api.get(`${base}/${laboratorioId}/computadoras/${computadoraId}/ocupante`);
export const abrirSesion = (laboratorioId) => api.post(`${base}/${laboratorioId}/sesiones`, {});
export const finalizarSesion = (laboratorioId, sesionId, desocupado) =>
  api.post(`${base}/${laboratorioId}/sesiones/${sesionId}/finalizar`, { desocupado });
