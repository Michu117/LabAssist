const app = require("./app");
const config = require("./config");

app.listen(config.port, () => {
  console.log(`API de LabAssist escuchando en http://localhost:${config.port}`);
});
