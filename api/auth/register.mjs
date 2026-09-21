import { handle } from "../../server/vercel-api.mjs";

export default function handler(req, res) {
  return handle(req, res, "auth/register");
}
