const express = require("express");
const jwt = require("jsonwebtoken");
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
const { manejarError } = require("../src/middlewares/error");
const { autenticar, soloTecnicoDocente } = require("../src/middlewares/autenticar");
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

const mensajeToken = "Se requiere un token de acceso válido";

(hayBase ? describe : describe.skip)("Autorización con JWT", () => {
  let pool;
  let tokenEstudiante;
  let tokenTecnico;
  let idEstudiante;

  beforeAll(async () => {
    pool = crearPoolPrueba();
    await reiniciarEsquema(pool);
    await ejecutarMigraciones(pool);

    const registro = await request(app)
      .post("/api/v1/auth/registro")
      .send(registroEstudiante);
    idEstudiante = registro.body.data.usuario.id;

    const loginEstudiante = await request(app).post("/api/v1/auth/login").send({
      correo: registroEstudiante.correo,
      contrasena: registroEstudiante.contrasena,
    });
    tokenEstudiante = loginEstudiante.body.data.token;

    await sembrarTecnico(pool, semillaTecnico);
    const loginTecnico = await request(app).post("/api/v1/auth/login").send({
      correo: semillaTecnico.correo,
      contrasena: semillaTecnico.clave,
    });
    tokenTecnico = loginTecnico.body.data.token;
  });

  afterAll(async () => {
    await pool.end();
    await cerrarPool();
  });

  // Rutas de prueba que usan los mismos middlewares que la API.
  const crearAppProtegida = () => {
    const protegida = express();
    protegida.get(
      "/protegida",
      autenticar,
      (req, res) => res.status(200).json({ ok: true, data: { usuario: req.usuario } })
    );
    protegida.get(
      "/administrativa",
      autenticar,
      soloTecnicoDocente,
      (req, res) => res.status(200).json({ ok: true })
    );
    protegida.use(manejarError);
    return protegida;
  };

  it("responde 401 sin token", async () => {
    const res = await request(crearAppProtegida()).get("/protegida");

    expect(res.status).toBe(401);
    expect(res.body.error.mensaje).toBe(mensajeToken);
  });

  it("responde 401 con un token inválido", async () => {
    const res = await request(crearAppProtegida())
      .get("/protegida")
      .set("Authorization", "Bearer no-es-un-jwt");

    expect(res.status).toBe(401);
    expect(res.body.error.mensaje).toBe(mensajeToken);
  });

  it("responde 401 con un token firmado con otro secreto", async () => {
    const tokenFalso = jwt.sign({ sub: String(idEstudiante) }, "otro_secreto", {
      expiresIn: "1h",
    });

    const res = await request(crearAppProtegida())
      .get("/protegida")
      .set("Authorization", `Bearer ${tokenFalso}`);

    expect(res.status).toBe(401);
    expect(res.body.error.mensaje).toBe(mensajeToken);
  });

  it("devuelve el usuario autenticado con su tipo", async () => {
    const res = await request(crearAppProtegida())
      .get("/protegida")
      .set("Authorization", `Bearer ${tokenEstudiante}`);

    expect(res.status).toBe(200);
    expect(res.body.data.usuario).toMatchObject({
      id: idEstudiante,
      correo: registroEstudiante.correo,
      tipo: "ESTUDIANTE",
    });
    expect(JSON.stringify(res.body)).not.toContain("clave");
    expect(JSON.stringify(res.body)).not.toContain("huella");
  });

  it("responde 403 cuando un estudiante usa una ruta administrativa", async () => {
    const res = await request(crearAppProtegida())
      .get("/administrativa")
      .set("Authorization", `Bearer ${tokenEstudiante}`);

    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe("PROHIBIDO");
  });

  it("permite el acceso al Técnico Docente", async () => {
    const res = await request(crearAppProtegida())
      .get("/administrativa")
      .set("Authorization", `Bearer ${tokenTecnico}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("responde 401 si el usuario fue eliminado, aunque el token siga vigente", async () => {
    await pool.query("DELETE FROM usuario WHERE id = $1", [idEstudiante]);

    const res = await request(crearAppProtegida())
      .get("/protegida")
      .set("Authorization", `Bearer ${tokenEstudiante}`);

    expect(res.status).toBe(401);
    expect(res.body.error.mensaje).toBe(mensajeToken);
  });
});
