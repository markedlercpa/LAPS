import { redirect } from "next/navigation";

// Marketing no longer has a separate overview tab — land on the Evidence vault.
export default function EchoRedirect() {
  redirect("/marketing/evidence");
}
