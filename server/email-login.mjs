import {
  clearLoginCode,
  claimCodeSend,
  findAccountByEmail,
  rememberPlayer,
  saveAccount,
  stashLoginCode,
  takeLoginCode,
} from "./lobby.mjs";
import { sendCodeMail } from "./mail.mjs";

const MAX_ATTEMPTS = 5;

function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function requestEmailCode(email) {
  const claim = await claimCodeSend("login", email);
  if (!claim.ok) {
    throw fail(`Wait ${claim.wait}s before asking for another code`, 429);
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  // Overwrite any previous code so older mails stop working.
  await stashLoginCode(email, { code, sentAt: claim.sentAt || Date.now(), attempts: 0 });
  const sent = await sendCodeMail(email, code, "Your Verification Code – Welcome to BiteByte");
  if (!sent) console.log(`[mock mail] ${email} login code = ${code}`);
  return {
    needCode: true,
    cooldownSec: 60,
    hint: sent
      ? "A code was sent to your email. It expires in 10 minutes. You can request another in 60 seconds."
      : `SMTP is not configured. Your code is ${code}. It expires in 10 minutes.`,
  };
}

export async function consumeEmailCode(email, code) {
  const pending = await takeLoginCode(email);
  if (!pending) throw fail("Code missing or expired");
  if (String(pending.code) !== String(code).trim()) {
    const attempts = Number(pending.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await clearLoginCode(email);
      throw fail("Too many attempts. Request a new code.");
    }
    await stashLoginCode(email, { ...pending, attempts });
    throw fail("Wrong code");
  }
  await clearLoginCode(email);
}

export async function accountForEmailCode(email) {
  const existing = await findAccountByEmail(email);
  if (existing) {
    await rememberPlayer(existing);
    return existing;
  }
  const user = {
    id: `u_${Date.now()}`,
    email,
    chips: 1000,
    createdAt: new Date().toISOString(),
    provider: "email",
    name: email.split("@")[0],
  };
  await saveAccount(user);
  return user;
}
