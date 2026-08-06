import { redirect } from "next/navigation";

// ECHO no longer has a separate overview tab — land on the Evidence vault.
export default function EchoRedirect() {
  redirect("/echo/evidence");
}
