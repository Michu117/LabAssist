const servicio = require("./usuarios.service");

async function obtenerPerfil(req, res, next) {
  try {
    const usuario = await servicio.obtenerPerfil(req.usuario.id);
    res.status(200).json({ ok: true, data: { usuario } });
  } catch (error) {
    next(error);
  }
}

async function editarPerfil(req, res, next) {
  try {
    const usuario = await servicio.editarPerfil(req.usuario.id, req.body);
    res.status(200).json({ ok: true, data: { usuario } });
  } catch (error) {
    next(error);
  }
}

async function cambiarContrasena(req, res, next) {
  try {
    await servicio.cambiarContrasena(req.usuario.id, req.body);
    res.status(200).json({ ok: true, data: {} });
  } catch (error) {
    next(error);
  }
}

async function listar(req, res, next) {
  try {
    const resultado = await servicio.listarUsuarios(req.queryValidada);
    res.status(200).json({ ok: true, data: resultado });
  } catch (error) {
    next(error);
  }
}

async function crear(req, res, next) {
  try {
    const usuario = await servicio.crearTecnico(req.body);
    res.status(201).json({ ok: true, data: { usuario } });
  } catch (error) {
    next(error);
  }
}

async function consultar(req, res, next) {
  try {
    const usuario = await servicio.obtenerPerfil(Number(req.params.id));
    res.status(200).json({ ok: true, data: { usuario } });
  } catch (error) {
    next(error);
  }
}

async function editar(req, res, next) {
  try {
    const usuario = await servicio.editarUsuario(Number(req.params.id), req.body);
    res.status(200).json({ ok: true, data: { usuario } });
  } catch (error) {
    next(error);
  }
}

async function eliminar(req, res, next) {
  try {
    await servicio.eliminarUsuario(req.usuario.id, Number(req.params.id));
    res.status(200).json({ ok: true, data: {} });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  obtenerPerfil,
  editarPerfil,
  cambiarContrasena,
  listar,
  crear,
  consultar,
  editar,
  eliminar,
};
