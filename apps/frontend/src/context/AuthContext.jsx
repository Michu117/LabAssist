import { createContext, useContext, useState } from "react";

const ContextoAuth = createContext(null);

function leerUsuario() {
  const guardado = localStorage.getItem("usuario");
  return guardado ? JSON.parse(guardado) : null;
}

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(leerUsuario);

  function abrirSesion(token, nuevoUsuario) {
    localStorage.setItem("token", token);
    localStorage.setItem("usuario", JSON.stringify(nuevoUsuario));
    setUsuario(nuevoUsuario);
  }

  function cerrarSesion() {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    setUsuario(null);
  }

  return (
    <ContextoAuth.Provider
      value={{ usuario, esTecnico: usuario?.tipo === "TECNICO_DOCENTE", abrirSesion, cerrarSesion }}
    >
      {children}
    </ContextoAuth.Provider>
  );
}

export function useAuth() {
  return useContext(ContextoAuth);
}
