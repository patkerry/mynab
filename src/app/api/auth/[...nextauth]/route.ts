import { handlers } from "@/auth";

// Auth.js route handlers (sign-in, callback, sign-out, session). Web-only; the desktop build never
// hits these because it isn't served behind auth.
export const { GET, POST } = handlers;
