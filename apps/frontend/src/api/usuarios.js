import { api } from "./cliente";

// Perfil propio
export function obtenerPerfil() {
  return api.get("/usuarios/me");
}

export function editarPerfil(datos) {
  return api.patch("/usuarios/me", datos);
}

export function cambiarContrasena(datos) {
  return api.patch("/usuarios/me/contrasena", datos);
}

// Administración (Técnico Docente)
export function listarUsuarios({ pagina, limite, tipo, busqueda } = {}) {
  const parametros = new URLSearchParams();
  if (pagina) parametros.set("pagina", pagina);
  if (limite) parametros.set("limite", limite);
  if (tipo) parametros.set("tipo", tipo);
  if (busqueda) parametros.set("busqueda", busqueda);
  const consulta = parametros.toString();
  return api.get(`/usuarios${consulta ? `?${consulta}` : ""}`);
}

export function obtenerUsuario(id) {
  return api.get(`/usuarios/${id}`);
}

export function crearTecnico(datos) {
  return api.post("/usuarios", datos);
}

export function editarUsuario(id, datos) {
  return api.patch(`/usuarios/${id}`, datos);
}

export function eliminarUsuario(id) {
  return api.delete(`/usuarios/${id}`);
}
