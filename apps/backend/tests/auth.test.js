const bcrypt = require("bcrypt");
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

const registroValido = {
  nombre: "Ana",
  apellido: "Pérez",
  cedula: "0100000009",
  correo: "ana.perez@unl.edu.ec",
  contrasena: "Segura123",
  confirmar_contrasena: "Segura123",
  carrera: "Computación",
  ciclo: "2026-1",
};

const mensajeCredenciales = "Credenciales de acceso inválidas";

(hayBase ? describe : describe.skip)("Registro e inicio de sesión", () => {
  let pool;

  beforeAll(async () => {
    pool = crearPoolPrueba();
    await reiniciarEsquema(pool);
    await ejecutarMigraciones(pool);
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE usuario CASCADE");
  });

  afterAll(async () => {
    await pool.end();
    await cerrarPool();
  });

  describe("POST /api/v1/auth/registro", () => {
    it("registra un estudiante con 201 y guarda la contraseña como hash", async () => {
      const res = await request(app)
        .post("/api/v1/auth/registro")
        .send(registroValido);

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.usuario).toMatchObject({
        nombre: "Ana",
        apellido: "Pérez",
        cedula: "0100000009",
        correo: "ana.perez@unl.edu.ec",
        carrera: "Computación",
        ciclo: "2026-1",
        tipo: "ESTUDIANTE",
      });
      expect(res.body.data.usuario.id).toBeDefined();

      const { rows } = await pool.query(
        "SELECT clave FROM cuenta WHERE cuenta = $1",
        [registroValido.correo]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].clave).toMatch(/^\$2[aby]\$\d\d\$/);
      expect(await bcrypt.compare(registroValido.contrasena, rows[0].clave)).toBe(
        true
      );
    });

    it("no devuelve clave, huella ni confirmar_contrasena", async () => {
      const res = await request(app)
        .post("/api/v1/auth/registro")
        .send(registroValido);

      const cuerpo = JSON.stringify(res.body);
      expect(cuerpo).not.toContain("clave");
      expect(cuerpo).not.toContain("huella");
      expect(cuerpo).not.toContain("confirmar_contrasena");
    });

    it("rechaza la cédula duplicada con 409", async () => {
      await request(app).post("/api/v1/auth/registro").send(registroValido);

      const res = await request(app)
        .post("/api/v1/auth/registro")
        .send({ ...registroValido, correo: "otra.persona@unl.edu.ec" });

      expect(res.status).toBe(409);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.codigo).toBe("CONFLICTO");
    });

    it("rechaza el correo duplicado con 409", async () => {
      await request(app).post("/api/v1/auth/registro").send(registroValido);

      const res = await request(app)
        .post("/api/v1/auth/registro")
        .send({ ...registroValido, cedula: "1710000009" });

      expect(res.status).toBe(409);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.codigo).toBe("CONFLICTO");
    });

    it("rechaza una cédula con dígito verificador inválido con 400", async () => {
      const res = await request(app)
        .post("/api/v1/auth/registro")
        .send({ ...registroValido, cedula: "0100000000" });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe("VALIDACION");
      expect(res.body.error.detalles.some((d) => d.campo === "cedula")).toBe(
        true
      );
    });

    it("rechaza una cédula con provincia inválida con 400", async () => {
      const res = await request(app)
        .post("/api/v1/auth/registro")
        .send({ ...registroValido, cedula: "9900000002" });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe("VALIDACION");
    });

    it("rechaza un correo que no termina en @unl.edu.ec con 400", async () => {
      const res = await request(app)
        .post("/api/v1/auth/registro")
        .send({ ...registroValido, correo: "ana@gmail.com" });

      expect(res.status).toBe(400);
      expect(res.body.error.detalles.some((d) => d.campo === "correo")).toBe(
        true
      );
    });

    it("rechaza una contraseña menor a 8 caracteres con 400", async () => {
      const res = await request(app)
        .post("/api/v1/auth/registro")
        .send({ ...registroValido, contrasena: "corta12", confirmar_contrasena: "corta12" });

      expect(res.status).toBe(400);
      expect(res.body.error.detalles.some((d) => d.campo === "contrasena")).toBe(
        true
      );
    });

    it("rechaza contraseñas que no coinciden con 400", async () => {
      const res = await request(app)
        .post("/api/v1/auth/registro")
        .send({ ...registroValido, confirmar_contrasena: "Distinta123" });

      expect(res.status).toBe(400);
      expect(
        res.body.error.detalles.some((d) => d.campo === "confirmar_contrasena")
      ).toBe(true);
    });

    it("rechaza campos fuera del UML como huella o rol con 400", async () => {
      const res = await request(app)
        .post("/api/v1/auth/registro")
        .send({ ...registroValido, huella: "x", rol: "ADMIN" });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe("VALIDACION");
    });
  });

  describe("POST /api/v1/auth/login", () => {
    beforeEach(async () => {
      await request(app).post("/api/v1/auth/registro").send(registroValido);
    });

    it("inicia sesión con 200, devuelve el token y el usuario", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        correo: "ANA.PEREZ@UNL.EDU.EC",
        contrasena: registroValido.contrasena,
      });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(typeof res.body.data.token).toBe("string");
      expect(res.body.data.usuario).toEqual({
        id: expect.any(Number),
        nombre: "Ana",
        apellido: "Pérez",
        correo: "ana.perez@unl.edu.ec",
        tipo: "ESTUDIANTE",
      });
      expect(JSON.stringify(res.body)).not.toContain("clave");
      expect(JSON.stringify(res.body)).not.toContain("huella");
    });

    it("genera un JWT con solo sub, iat y exp", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        correo: registroValido.correo,
        contrasena: registroValido.contrasena,
      });

      const payload = jwt.verify(res.body.data.token, process.env.JWT_SECRET);
      expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sub"]);
      expect(payload.sub).toBe(String(res.body.data.usuario.id));
    });

    it("responde 401 con el mensaje exacto si la contraseña es incorrecta", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        correo: registroValido.correo,
        contrasena: "incorrecta123",
      });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        ok: false,
        error: {
          codigo: "CREDENCIALES",
          mensaje: mensajeCredenciales,
          detalles: [],
        },
      });
    });

    it("responde 401 con el mensaje exacto si el correo no está registrado", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        correo: "nadie@unl.edu.ec",
        contrasena: "Segura123",
      });

      expect(res.status).toBe(401);
      expect(res.body.error.mensaje).toBe(mensajeCredenciales);
    });

    it("responde 400 si el correo tiene un formato inválido", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        correo: "no-es-correo",
        contrasena: "Segura123",
      });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe("VALIDACION");
    });

    it("responde 400 si falta la contraseña", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        correo: registroValido.correo,
      });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe("VALIDACION");
    });
  });
});
