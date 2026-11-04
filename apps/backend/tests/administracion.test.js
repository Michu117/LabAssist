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

(hayBase ? describe : describe.skip)("Administración de usuarios", () => {
  let pool;
  let tokenEstudiante;
  let tokenTecnico;
  let idEstudiante;
  let idTecnico;

  const iniciarSesion = async (correo, contrasena) => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo, contrasena });
    return res.body.data;
  };

  beforeAll(async () => {
    pool = crearPoolPrueba();
    await reiniciarEsquema(pool);
    await ejecutarMigraciones(pool);

    const registro = await request(app)
      .post("/api/v1/auth/registro")
      .send(registroEstudiante);
    idEstudiante = registro.body.data.usuario.id;
    tokenEstudiante = (await iniciarSesion(registroEstudiante.correo, "Segura123")).token;

    await sembrarTecnico(pool, semillaTecnico);
    const tecnico = await iniciarSesion(semillaTecnico.correo, semillaTecnico.clave);
    tokenTecnico = tecnico.token;
    idTecnico = tecnico.usuario.id;
  });

  afterAll(async () => {
    await pool.end();
    await cerrarPool();
  });

  describe("GET /api/v1/usuarios", () => {
    it("responde 401 sin token", async () => {
      const res = await request(app).get("/api/v1/usuarios");
      expect(res.status).toBe(401);
    });

    it("responde 403 a un estudiante", async () => {
      const res = await request(app)
        .get("/api/v1/usuarios")
        .set("Authorization", `Bearer ${tokenEstudiante}`);

      expect(res.status).toBe(403);
      expect(res.body.error.codigo).toBe("PROHIBIDO");
    });

    it("lista los usuarios con total y sin clave ni huella", async () => {
      const res = await request(app)
        .get("/api/v1/usuarios")
        .set("Authorization", `Bearer ${tokenTecnico}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.pagina).toBe(1);
      expect(res.body.data.usuarios).toHaveLength(2);
      expect(JSON.stringify(res.body)).not.toContain("clave");
      expect(JSON.stringify(res.body)).not.toContain("huella");
    });

    it("filtra por tipo", async () => {
      const res = await request(app)
        .get("/api/v1/usuarios?tipo=ESTUDIANTE")
        .set("Authorization", `Bearer ${tokenTecnico}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.usuarios[0].tipo).toBe("ESTUDIANTE");
    });

    it("filtra por búsqueda sobre nombre, cédula o correo", async () => {
      const res = await request(app)
        .get("/api/v1/usuarios?busqueda=1100000007")
        .set("Authorization", `Bearer ${tokenTecnico}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.usuarios[0].cedula).toBe("1100000007");
    });

    it("pagina con pagina y limite", async () => {
      const res = await request(app)
        .get("/api/v1/usuarios?pagina=1&limite=1")
        .set("Authorization", `Bearer ${tokenTecnico}`);

      expect(res.status).toBe(200);
      expect(res.body.data.usuarios).toHaveLength(1);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.limite).toBe(1);
    });

    it("rechaza un tipo inválido con 400", async () => {
      const res = await request(app)
        .get("/api/v1/usuarios?tipo=ADMIN")
        .set("Authorization", `Bearer ${tokenTecnico}`);

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe("VALIDACION");
    });
  });

  describe("GET /api/v1/usuarios/:id", () => {
    it("consulta un usuario existente", async () => {
      const res = await request(app)
        .get(`/api/v1/usuarios/${idEstudiante}`)
        .set("Authorization", `Bearer ${tokenTecnico}`);

      expect(res.status).toBe(200);
      expect(res.body.data.usuario).toMatchObject({
        id: idEstudiante,
        tipo: "ESTUDIANTE",
        carrera: "Computación",
      });
      expect(JSON.stringify(res.body)).not.toContain("clave");
    });

    it("responde 404 si el usuario no existe", async () => {
      const res = await request(app)
        .get("/api/v1/usuarios/999999")
        .set("Authorization", `Bearer ${tokenTecnico}`);

      expect(res.status).toBe(404);
    });

    it("responde 400 si el identificador no es numérico", async () => {
      const res = await request(app)
        .get("/api/v1/usuarios/abc")
        .set("Authorization", `Bearer ${tokenTecnico}`);

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/v1/usuarios", () => {
    const nuevoTecnico = {
      nombre: "Fabricio",
      apellido: "Ruiz",
      cedula: "1000000008",
      correo: "fabricio.ruiz@unl.edu.ec",
      contrasena: "Segura123",
      confirmar_contrasena: "Segura123",
    };

    it("crea un Técnico Docente con 201 y permite iniciar sesión", async () => {
      const res = await request(app)
        .post("/api/v1/usuarios")
        .set("Authorization", `Bearer ${tokenTecnico}`)
        .send(nuevoTecnico);

      expect(res.status).toBe(201);
      expect(res.body.data.usuario.tipo).toBe("TECNICO_DOCENTE");
      expect(JSON.stringify(res.body)).not.toContain("clave");

      const sesion = await iniciarSesion(nuevoTecnico.correo, nuevoTecnico.contrasena);
      expect(sesion.usuario.tipo).toBe("TECNICO_DOCENTE");
    });

    it("rechaza cédula o correo duplicados con 409", async () => {
      const res = await request(app)
        .post("/api/v1/usuarios")
        .set("Authorization", `Bearer ${tokenTecnico}`)
        .send({ ...nuevoTecnico, correo: "otro@unl.edu.ec" });

      expect(res.status).toBe(409);
    });

    it("responde 403 a un estudiante", async () => {
      const res = await request(app)
        .post("/api/v1/usuarios")
        .set("Authorization", `Bearer ${tokenEstudiante}`)
        .send(nuevoTecnico);

      expect(res.status).toBe(403);
    });
  });

  describe("PATCH /api/v1/usuarios/:id", () => {
    it("actualiza usuario.correo y cuenta.cuenta en la misma transacción", async () => {
      const correoNuevo = "ana.perez2@unl.edu.ec";

      const res = await request(app)
        .patch(`/api/v1/usuarios/${idEstudiante}`)
        .set("Authorization", `Bearer ${tokenTecnico}`)
        .send({ correo: correoNuevo });

      expect(res.status).toBe(200);
      expect(res.body.data.usuario.correo).toBe(correoNuevo);

      const { rows } = await pool.query(
        "SELECT u.correo, c.cuenta FROM usuario u JOIN cuenta c ON c.usuario_id = u.id WHERE u.id = $1",
        [idEstudiante]
      );
      expect(rows[0].correo).toBe(correoNuevo);
      expect(rows[0].cuenta).toBe(correoNuevo);

      const sesion = await iniciarSesion(correoNuevo, "Segura123");
      expect(sesion.usuario.id).toBe(idEstudiante);
    });

    it("rechaza intentar cambiar tipo o huella con 400", async () => {
      for (const campo of ["tipo", "huella"]) {
        const res = await request(app)
          .patch(`/api/v1/usuarios/${idEstudiante}`)
          .set("Authorization", `Bearer ${tokenTecnico}`)
          .send({ [campo]: "x" });

        expect(res.status).toBe(400);
        expect(res.body.error.codigo).toBe("VALIDACION");
      }
    });

    it("rechaza carrera o ciclo en un Técnico Docente con 400", async () => {
      const res = await request(app)
        .patch(`/api/v1/usuarios/${idTecnico}`)
        .set("Authorization", `Bearer ${tokenTecnico}`)
        .send({ carrera: "Computación" });

      expect(res.status).toBe(400);
    });

    it("responde 404 si el usuario no existe", async () => {
      const res = await request(app)
        .patch("/api/v1/usuarios/999999")
        .set("Authorization", `Bearer ${tokenTecnico}`)
        .send({ nombre: "Nadie" });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/v1/usuarios/:id", () => {
    it("responde 409 al intentar eliminar la cuenta propia", async () => {
      const res = await request(app)
        .delete(`/api/v1/usuarios/${idTecnico}`)
        .set("Authorization", `Bearer ${tokenTecnico}`);

      expect(res.status).toBe(409);
      expect(res.body.error.mensaje).toBe("No puedes eliminar tu propia cuenta");
    });

    it("elimina un usuario y su token deja de dar acceso", async () => {
      const res = await request(app)
        .delete(`/api/v1/usuarios/${idEstudiante}`)
        .set("Authorization", `Bearer ${tokenTecnico}`);

      expect(res.status).toBe(200);

      const perfil = await request(app)
        .get("/api/v1/usuarios/me")
        .set("Authorization", `Bearer ${tokenEstudiante}`);
      expect(perfil.status).toBe(401);

      const consulta = await request(app)
        .get(`/api/v1/usuarios/${idEstudiante}`)
        .set("Authorization", `Bearer ${tokenTecnico}`);
      expect(consulta.status).toBe(404);
    });

    it("responde 404 al eliminar un usuario inexistente", async () => {
      const res = await request(app)
        .delete("/api/v1/usuarios/999999")
        .set("Authorization", `Bearer ${tokenTecnico}`);

      expect(res.status).toBe(404);
    });
  });
});
