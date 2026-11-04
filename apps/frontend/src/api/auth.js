import { api } from "./cliente";

export function registrarEstudiante(datos) {
  return api.post("/auth/registro", datos);
}

export function iniciarSesion(datos) {
  return api.post("/auth/login", datos);
}
