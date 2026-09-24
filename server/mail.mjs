import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, "mail-templates", "verification.html");

let transporter;
let templateHtml;

function resendKey() {
  return String(process.env.RESEND_API_KEY || "").trim();
}

function mailFrom() {
  return String(process.env.SMTP_FROM || process.env.SMTP_USER || "").trim();
}

function contactEmail() {
  const explicit = String(process.env.CONTACT_EMAIL || "").trim();
  if (explicit) return explicit;
  const from = mailFrom();
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from) || "noreply@2048pro.online";
}

function smtpSettings() {
  const key = resendKey();
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "1",
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS || "",
    };
  }
  if (!key) return null;
  return {
    host: "smtp.resend.com",
    port: 587,
    secure: false,
    user: "resend",
    pass: key,
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

function loadTemplate() {
  if (templateHtml) return templateHtml;
  if (!fs.existsSync(TEMPLATE_PATH)) return "";
  templateHtml = fs.readFileSync(TEMPLATE_PATH, "utf8");
  return templateHtml;
}

function fillTemplate(code) {
  const html = loadTemplate();
  if (!html) return "";
  return html
    .split("{{{VERIFICATION_CODE}}}")
    .join(String(code))
    .split("{{{CONTACT_EMAIL}}}")
    .join(contactEmail());
}

export function mailConfigured() {
  return Boolean(resendKey() || mailer());
}

async function sendViaResendApi(to, code, subject) {
  const key = resendKey();
  const from = mailFrom();
  const html = fillTemplate(code);
  if (!key || !from || !html) return false;
  const templateId = String(process.env.RESEND_TEMPLATE_ID || "").trim();
  const body = templateId
    ? {
        from,
        to: [to],
        subject,
        template: {
          id: templateId,
          variables: {
            VERIFICATION_CODE: String(code),
            CONTACT_EMAIL: contactEmail(),
          },
        },
      }
    : {
        from,
        to: [to],
        subject: subject || "Your Verification Code – Welcome to BiteByte",
        html,
        text: `Your Bitebyte code is ${code}. It expires in 10 minutes. Contact: ${contactEmail()}`,
      };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("[mail/resend]", res.status, detail);
    return false;
  }
  return true;
}

export async function sendCodeMail(to, code, subject) {
  if (resendKey()) {
    try {
      const ok = await sendViaResendApi(to, code, subject || "Your Verification Code – Welcome to BiteByte");
      if (ok) return true;
    } catch (err) {
      console.error("[mail/resend]", err instanceof Error ? err.message : err);
    }
  }
  const transport = mailer();
  if (!transport) return false;
  try {
    const html = fillTemplate(code);
    await transport.sendMail({
      from: mailFrom() || process.env.SMTP_USER,
      to,
      subject: subject || "Your Verification Code – Welcome to BiteByte",
      text: `Your Bitebyte code is ${code}. It expires in 10 minutes.`,
      html: html || undefined,
    });
    return true;
  } catch (err) {
    console.error("[mail/smtp]", err instanceof Error ? err.message : err);
    return false;
  }
}
