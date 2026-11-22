const app = require("./app");
const config = require("./config");
const { iniciarRecepcionMQTT } = require("./modules/biometria/biometria.service");
const { iniciarExpiracionReservas } = require("./modules/reservas/reservas.expiracion");

iniciarRecepcionMQTT();
iniciarExpiracionReservas();
app.listen(config.port, () => {
  console.log(`API de LabAssist escuchando en http://localhost:${config.port}`);
});
