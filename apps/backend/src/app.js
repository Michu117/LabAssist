const express = require("express");
const cors = require("cors");

const config = require("./config");
const saludRoutes = require("./modules/salud/salud.routes");
const authRoutes = require("./modules/auth/auth.routes");
const usuariosRoutes = require("./modules/usuarios/usuarios.routes");
const biometriaRoutes = require("./modules/biometria/biometria.routes");
const reservasRoutes = require("./modules/reservas/reservas.routes");
const ocupacionRoutes = require("./modules/ocupacion/ocupacion.routes");
const laboratoriosRoutes = require("./modules/laboratorios/laboratorios.routes");
const { manejarNoEncontrado, manejarError } = require("./middlewares/error");

const app = express();

app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());

app.use("/api/v1/salud", saludRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/usuarios", usuariosRoutes);
app.use("/api/v1/biometria", biometriaRoutes);
app.use("/api/v1/reservas", reservasRoutes);
app.use("/api/v1/ocupacion", ocupacionRoutes);
app.use("/api/v1/laboratorios", laboratoriosRoutes);

app.use(manejarNoEncontrado);
app.use(manejarError);

module.exports = app;
