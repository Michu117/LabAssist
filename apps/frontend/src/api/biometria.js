import { api } from "./cliente";

export function iniciarCaptura() {
  return api.post("/biometria/capturas", {});
}

export function consultarCaptura(id) {
  return api.get(`/biometria/capturas/${id}`);
}
