const express = require("express");
const cors = require("cors");

const config = require("./config");
const saludRoutes = require("./modules/salud/salud.routes");
const authRoutes = require("./modules/auth/auth.routes");
const usuariosRoutes = require("./modules/usuarios/usuarios.routes");
const { manejarNoEncontrado, manejarError } = require("./middlewares/error");

const app = express();

app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());

app.use("/api/v1/salud", saludRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/usuarios", usuariosRoutes);

app.use(manejarNoEncontrado);
app.use(manejarError);

module.exports = app;
