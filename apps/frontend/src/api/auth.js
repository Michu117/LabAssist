import { api } from "./cliente";

export function registrarEstudiante(datos) {
  return api.post("/auth/registro", datos);
}

export function iniciarSesion(datos) {
  return api.post("/auth/login", datos);
}

export function solicitarRecuperacion(datos) {
  return api.post("/auth/forgot-password", datos);
}

export function restablecerContrasena(datos) {
  return api.post("/auth/reset-password", datos);
}