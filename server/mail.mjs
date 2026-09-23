import nodemailer from "nodemailer";

let transporter;

function smtpSettings() {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "1",
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS || "",
    };
  }
  if (!resendKey) return null;
  return {
    host: "smtp.resend.com",
    port: 587,
    secure: false,
    user: "resend",
    pass: resendKey,
  };
}

function mailer() {
  const smtp = smtpSettings();
  if (!smtp?.host || !smtp.user || !smtp.pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
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
