const URL_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1";

export class ErrorApi extends Error {
  constructor(status, codigo, mensaje, detalles = []) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

function obtenerToken() {
  return localStorage.getItem("token");
}

function cerrarSesionLocal() {
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
}

// Todas las solicitudes pasan por aquí: JSON, token en Authorization y
// conversión del error de la API en una excepción con mensaje y detalles.
export async function pedir(ruta, { metodo = "GET", cuerpo } = {}) {
  const token = obtenerToken();
  const encabezados = { "Content-Type": "application/json" };
  if (token) encabezados.Authorization = `Bearer ${token}`;

  let respuesta;
  try {
    respuesta = await fetch(`${URL_BASE}${ruta}`, {
      method: metodo,
      headers: encabezados,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi(0, "RED", "No se pudo conectar con el servidor");
  }

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }

  if (!respuesta.ok) {
    const error = (datos && datos.error) || {};
    // Ante un 401 con sesión abierta se cierra y se regresa al login.
    if (respuesta.status === 401 && token) {
      cerrarSesionLocal();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
    }
    throw new ErrorApi(
      respuesta.status,
      error.codigo || "ERROR",
      error.mensaje || "Error inesperado",
      error.detalles || []
    );
  }

  return datos ? datos.data : null;
}

export const api = {
  get: (ruta) => pedir(ruta),
  post: (ruta, cuerpo) => pedir(ruta, { metodo: "POST", cuerpo }),
  patch: (ruta, cuerpo) => pedir(ruta, { metodo: "PATCH", cuerpo }),
  delete: (ruta) => pedir(ruta, { metodo: "DELETE" }),
};
