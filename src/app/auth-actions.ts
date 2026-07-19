"use server";

import { signOut } from "@/auth";

// Sign the current web user out and return them to the login page. (Desktop never calls this — it
// has no auth and the sign-out control isn't rendered there.)
export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
