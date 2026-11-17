const request = require("supertest");

const {
  prepararEntornoPrueba,
  crearPoolPrueba,
  reiniciarEsquema,
} = require("./utilidades/db");

const hayBase = prepararEntornoPrueba();

const app = hayBase ? require("../src/app") : null;
const { cerrarPool } = require("../src/database/pool");
const { ejecutarMigraciones } = require("../src/database/migrate");
const { sembrarTecnico } = require("../src/database/seed-tecnico");

const registroEstudiante = {
  nombre: "Ana",
  apellido: "Pérez",
  cedula: "0100000009",
  correo: "ana.perez@unl.edu.ec",
  contrasena: "Segura123",
  confirmar_contrasena: "Segura123",
  carrera: "Computación",
  ciclo: "2026-1",
};

const semillaTecnico = {
  nombre: "Tecnico",
  apellido: "Docente",
  cedula: "1100000007",
  correo: "tecnico@unl.edu.ec",
  clave: "Tecnico123",
};

(hayBase ? describe : describe.skip)("Perfil propio", () => {
  let pool;
  let tokenEstudiante;
  let tokenTecnico;

  const autenticarComo = async (correo, contrasena) => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo, contrasena });
    return res.body.data.token;
  };

  beforeAll(async () => {
    pool = crearPoolPrueba();
    await reiniciarEsquema(pool);
    await ejecutarMigraciones(pool);

    await request(app).post("/api/v1/auth/registro").send(registroEstudiante);
    tokenEstudiante = await autenticarComo(
      registroEstudiante.correo,
      registroEstudiante.contrasena
    );

    await sembrarTecnico(pool, semillaTecnico);
    tokenTecnico = await autenticarComo(semillaTecnico.correo, semillaTecnico.clave);
  });

  afterAll(async () => {
    await pool.end();
    await cerrarPool();
  });

  describe("GET /api/v1/usuarios/me", () => {
    it("devuelve el perfil del estudiante con su tipo y sin datos sensibles", async () => {
      const res = await request(app)
        .get("/api/v1/usuarios/me")
        .set("Authorization", `Bearer ${tokenEstudiante}`);

      expect(res.status).toBe(200);
      expect(res.body.data.usuario).toMatchObject({
        nombre: "Ana",
        apellido: "Pérez",
        cedula: "0100000009",
        correo: "ana.perez@unl.edu.ec",
        tipo: "ESTUDIANTE",
        carrera: "Computación",
        ciclo: "2026-1",
      });
      expect(JSON.stringify(res.body)).not.toContain("clave");
      expect(JSON.stringify(res.body)).not.toContain("huella");
    });

    it("responde 401 sin token", async () => {
      const res = await request(app).get("/api/v1/usuarios/me");

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it("no muestra carrera ni ciclo al Técnico Docente", async () => {
      const res = await request(app)
        .get("/api/v1/usuarios/me")
        .set("Authorization", `Bearer ${tokenTecnico}`);

      expect(res.status).toBe(200);
      expect(res.body.data.usuario.tipo).toBe("TECNICO_DOCENTE");
      expect(res.body.data.usuario).not.toHaveProperty("carrera");
      expect(res.body.data.usuario).not.toHaveProperty("ciclo");
    });
  });

  describe("PATCH /api/v1/usuarios/me", () => {
    it("actualiza nombre, apellido, carrera y ciclo", async () => {
      const res = await request(app)
        .patch("/api/v1/usuarios/me")
        .set("Authorization", `Bearer ${tokenEstudiante}`)
        .send({ nombre: "Ana Maria", apellido: "Pérez López", ciclo: "2026-2" });

      expect(res.status).toBe(200);
      expect(res.body.data.usuario).toMatchObject({
        nombre: "Ana Maria",
        apellido: "Pérez López",
        ciclo: "2026-2",
      });

      const consulta = await request(app)
        .get("/api/v1/usuarios/me")
        .set("Authorization", `Bearer ${tokenEstudiante}`);
      expect(consulta.body.data.usuario.nombre).toBe("Ana Maria");
    });

    it("rechaza cedula, correo, tipo o huella con 400", async () => {
      for (const campo of ["cedula", "correo", "tipo", "huella"]) {
        const res = await request(app)
          .patch("/api/v1/usuarios/me")
          .set("Authorization", `Bearer ${tokenEstudiante}`)
          .send({ [campo]: "x" });

        expect(res.status).toBe(400);
        expect(res.body.error.codigo).toBe("VALIDACION");
      }
    });

    it("rechaza carrera o ciclo en un Técnico Docente con 400", async () => {
      const res = await request(app)
        .patch("/api/v1/usuarios/me")
        .set("Authorization", `Bearer ${tokenTecnico}`)
        .send({ carrera: "Computación" });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe("VALIDACION");
    });

    it("responde 401 sin token", async () => {
      const res = await request(app)
        .patch("/api/v1/usuarios/me")
        .send({ nombre: "Sin Token" });

      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/v1/usuarios/me/contrasena", () => {
    it("cambia la contraseña con la actual correcta y permite iniciar sesión con la nueva", async () => {
      const res = await request(app)
        .patch("/api/v1/usuarios/me/contrasena")
        .set("Authorization", `Bearer ${tokenEstudiante}`)
        .send({
          contrasena_actual: "Segura123",
          contrasena: "NuevaClave123",
          confirmar_contrasena: "NuevaClave123",
        });

      expect(res.status).toBe(200);

      const nuevaSesion = await request(app)
        .post("/api/v1/auth/login")
        .send({ correo: registroEstudiante.correo, contrasena: "NuevaClave123" });
      expect(nuevaSesion.status).toBe(200);

      const viejaSesion = await request(app)
        .post("/api/v1/auth/login")
        .send({ correo: registroEstudiante.correo, contrasena: "Segura123" });
      expect(viejaSesion.status).toBe(401);
    });

    it("responde 401 con la contraseña actual incorrecta", async () => {
      const res = await request(app)
        .patch("/api/v1/usuarios/me/contrasena")
        .set("Authorization", `Bearer ${tokenEstudiante}`)
        .send({
          contrasena_actual: "Incorrecta123",
          contrasena: "OtraClave123",
          confirmar_contrasena: "OtraClave123",
        });

      expect(res.status).toBe(401);
      expect(res.body.error.mensaje).toBe("La contraseña actual es incorrecta");
    });

    it("rechaza contraseñas nuevas que no coinciden con 400", async () => {
      const res = await request(app)
        .patch("/api/v1/usuarios/me/contrasena")
        .set("Authorization", `Bearer ${tokenEstudiante}`)
        .send({
          contrasena_actual: "NuevaClave123",
          contrasena: "FinalClave123",
          confirmar_contrasena: "Distinta123",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe("VALIDACION");
    });
  });
});
