const app = require("./app");
const config = require("./config");
const { iniciarRecepcionMQTT } = require("./modules/biometria/biometria.service");

iniciarRecepcionMQTT();
app.listen(config.port, () => {
  console.log(`API de LabAssist escuchando en http://localhost:${config.port}`);
});
