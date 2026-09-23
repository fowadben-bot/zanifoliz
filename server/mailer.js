import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASSWORD;
const from = process.env.MAIL_FROM || 'no-reply@example.invalid';
const publicOrigin = (process.env.PUBLIC_ORIGIN || 'http://localhost:8080').replace(/\/$/, '');
const production = process.env.NODE_ENV === 'production';

const transporter = host && user && pass
  ? nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      requireTLS: port !== 465
    })
  : null;

export function mailerReady() {
  return Boolean(transporter);
}

async function send(to, subject, text) {
  if (!transporter) {
    if (!production) console.info(`[mail:dev] ${subject} -> ${to}\n${text}`);
    return false;
  }
  await transporter.sendMail({ from, to, subject, text });
  return true;
}

export async function sendVerificationEmail(to, token) {
  const link = `${publicOrigin}/api/parent/verify?token=${encodeURIComponent(token)}`;
  await send(to, 'Confirmez votre compte parent', `Confirmez votre compte parent : ${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`);
  return link;
}

export async function sendPasswordResetEmail(to, token) {
  const link = `${publicOrigin}/compte.html?reset=${encodeURIComponent(token)}`;
  await send(to, 'Réinitialisation du mot de passe', `Utilisez ce lien pour réinitialiser votre mot de passe : ${link}\n\nLe lien expire rapidement.`);
  return link;
}
