import nodemailer from "nodemailer";

let transporter;

function mailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "1",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export function mailConfigured() {
  return Boolean(mailer());
}

export async function sendCodeMail(to, code, subject) {
  const transport = mailer();
  if (!transport) return false;
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text: `Your Axiom code is ${code}. It expires in 10 minutes.`,
  });
  return true;
}
