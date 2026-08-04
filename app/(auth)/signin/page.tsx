"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DEV_USERS = [
  "mark@edlerzain.com",
  "jordan@edlerzain.com",
  "sam@edlerzain.com",
];

export default function SignInPage() {
  const [email, setEmail] = useState("mark@edlerzain.com");
  const [loading, setLoading] = useState(false);
  const devEnabled = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN !== "false";

  const doDevLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    await signIn("dev-login", { email, callbackUrl: "/leads" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-1 text-2xl font-bold tracking-tight">LAPS</div>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Lead Generation · Appointments · Proposals · Sales
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Button
            className="w-full"
            onClick={() => signIn("microsoft-entra-id", { callbackUrl: "/leads" })}
          >
            Sign in with Microsoft 365
          </Button>

          {devEnabled && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Dev login
                  </span>
                </div>
              </div>

              <form onSubmit={doDevLogin} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email (seeded user)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {DEV_USERS.map((u) => (
                    <Button
                      key={u}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEmail(u)}
                    >
                      {u.split("@")[0]}
                    </Button>
                  ))}
                </div>
                <Button type="submit" variant="secondary" className="w-full" disabled={loading}>
                  {loading ? "Signing in…" : "Continue"}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
