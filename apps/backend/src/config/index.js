const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  mqttUrl: process.env.MQTT_URL || "mqtt://localhost:1883",
  mqttUsername: process.env.MQTT_USERNAME || "",
  mqttPassword: process.env.MQTT_PASSWORD || "",
  mqttDeviceId: process.env.MQTT_DEVICE_ID || "esp32-as608-01",
};

module.exports = config;
