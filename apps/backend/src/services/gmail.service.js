
const { google } = require("googleapis");

async function enviarCorreoRecuperacion(destinatario, enlace) {
  const {
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_REFRESH_TOKEN,
    GMAIL_SENDER,
  } = process.env;

  if (
    !GMAIL_CLIENT_ID ||
    !GMAIL_CLIENT_SECRET ||
    !GMAIL_REFRESH_TOKEN ||
    !GMAIL_SENDER
  ) {
    throw new Error("Falta configurar Gmail API");
  }

  const oauth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: GMAIL_REFRESH_TOKEN,
  });

  const gmail = google.gmail({
    version: "v1",
    auth: oauth2Client,
  });

  const asunto = "Recuperación de contraseña - LabAssist";

  const mensaje = [
    `From: ${GMAIL_SENDER}`,
    `To: ${destinatario}`,
    `Subject: =?UTF-8?B?${Buffer.from(asunto, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "Hola,",
    "",
    "Recibimos una solicitud para restablecer tu contraseña de LabAssist.",
    "",
    `Accede al siguiente enlace: ${enlace}`,
    "",
    "Este enlace es válido durante 15 minutos.",
    "Si no solicitaste este cambio, ignora este mensaje.",
    "",
    "Equipo LabAssist",
  ].join("\r\n");

  const raw = Buffer.from(mensaje, "utf8").toString("base64url");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}

module.exports = { enviarCorreoRecuperacion };
