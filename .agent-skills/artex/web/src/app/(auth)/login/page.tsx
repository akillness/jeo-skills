"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { AlertTriangle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [readToEnd, setReadToEnd] = useState(false);
  const termsBodyRef = useRef<HTMLDivElement>(null);

  // Scroll to the bottom of the terms (including when everything fits without scrolling) to unlock "Agree".
  function handleTermsScroll() {
    const el = termsBodyRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadToEnd(true);
  }

  useEffect(() => {
    if (!termsOpen) return;
    // Reset on open, and cover the case where the content is shorter than one screen and never fires a scroll.
    setReadToEnd(false);
    const el = termsBodyRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 8) setReadToEnd(true);
  }, [termsOpen]);

  useEffect(() => {
    // Already signed in — go straight to the main UI (static export has no middleware to do this redirect).
    const token = auth.getToken();
    if (token) {
      // localStorage may still hold credentials while the cookie is gone. Sync first, then start a fresh request,
      // so a server-side guard or route cache cannot bounce the redirect back to the login page still in its checking state.
      auth.setToken(token);
      window.location.replace("/function/tasks");
      return;
    }
    api
      .authStatus()
      .then(({ initialized }) => {
        if (!initialized) router.replace("/setup");
      })
      .catch(() => setError(t("Unable to connect to the backend service")))
      .finally(() => setChecking(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setError(t("Please read and agree to the Terms of Use first"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { token } = await api.login("ARTEX", password);
      auth.setToken(token);
      window.location.replace("/function/tasks");
    } catch {
      setError(t("Incorrect username or password"));
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      // Prerendered in the build-time locale; the reader's locale may differ for this brief state.
      <div role="status" className="flex min-h-dvh items-center justify-center text-muted-foreground" suppressHydrationWarning>
        {t("Checking login state…")}
      </div>
    );
  }

  // Keep the agreement sentence whole: the link text is placed through a placeholder so the word order can follow the locale.
  const [agreeBefore, agreeAfter = ""] = t("I have read and agree to {terms}").split("{terms}");

  return (
    <div className="flex h-dvh">
      {/* Left panel */}
      <div className="hidden flex-col items-center justify-center bg-primary p-12 text-center lg:flex lg:w-1/3">
        <div className="relative flex items-center justify-center">
          <div className="absolute size-80 rounded-full border border-primary-foreground/10" />
          <div className="absolute size-60 rounded-full border border-primary-foreground/15" />
          <div className="absolute size-40 rounded-full border border-primary-foreground/20" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <picture className="contents">
            <source srcSet="/logo.webp" type="image/webp" />
            <img src="/logo.png" alt="ARTEX" width={160} height={160} className="relative brightness-0 invert" />
          </picture>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex w-full items-center justify-center bg-background p-8 lg:w-2/3">
        <div className="w-full max-w-md space-y-10 py-24 lg:py-32">
          <div className="space-y-4 text-center">
            <h2 className="text-2xl font-medium tracking-tight">{t("Sign in")}</h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              {t("Welcome back — enter your password to continue using ARTEX")}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">{t("Username")}</Label>
              <Input id="username" value="ARTEX" readOnly className="bg-muted text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("Password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("Enter your password")}
                autoFocus
                autoComplete="current-password"
              />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="agree-terms"
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="agree-terms" className="text-sm font-normal leading-relaxed text-muted-foreground">
                {agreeBefore}
                <button
                  type="button"
                  onClick={() => setTermsOpen(true)}
                  className="mx-0.5 font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("Terms of Use")}
                </button>
                {agreeAfter}
              </Label>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !password || !agreed}>
              {loading ? t("Signing in...") : t("Sign in")}
            </Button>
          </form>
        </div>
      </div>

      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="flex-row items-center gap-3 border-b px-6 py-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div className="space-y-0.5">
              <DialogTitle className="text-base">{t("ARTEX Terms of Use and Disclaimer")}</DialogTitle>
              <p className="text-xs text-muted-foreground">
                {t("Version v1.1 · Effective 2026-10-11 · Please read all the following terms in full before signing in")}
              </p>
            </div>
          </DialogHeader>

          <div
            ref={termsBodyRef}
            onScroll={handleTermsScroll}
            className="max-h-[60vh] space-y-5 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-muted-foreground"
          >
            <p className="rounded-lg border bg-muted/40 p-3 text-foreground/80">
              {t(
                'This Terms of Use and Disclaimer (the "Statement") is the agreement between you and the ARTEX project authors and contributors regarding your use of this software. Please read it carefully and fully understand each provision before use, especially the disclaimer, liability-limitation, and prohibition clauses highlighted in bold or color blocks.',
              )}
              <span className="font-medium text-foreground">
                {" "}
                {t(
                  "Once you download, install, access, or use this software in any way, you are deemed to have read, understood, and agreed to be bound by all of this Statement.",
                )}
              </span>
            </p>

            <section className="space-y-1.5">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  1
                </span>
                {t("Article 1 · Definitions and Open-Source License")}
              </h4>
              <p className="pl-7">
                {t(
                  "This software (ARTEX) is an open-source program released under the GNU Affero General Public License v3.0 (AGPL-3.0). You may freely use, copy, modify, and distribute it under that license; however, any derivative work (including online services provided to third parties over a network) must likewise be open-sourced under the AGPL-3.0 license with the complete corresponding source code made public to its users. The full AGPL-3.0 terms are governed by the accompanying LICENSE file.",
                )}
              </p>
            </section>

            <section className="space-y-1.5">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  2
                </span>
                {t("Article 2 · Permitted Scope of Use")}
              </h4>
              <p className="pl-7">
                {t(
                  "This software is a security-testing platform. You may use it for: personal study, code research, and technical verification in environments you set up yourself; security testing of systems you own; security testing of third-party systems when you hold the owner's explicit authorization; and testing within the written scope of a bug bounty or vulnerability disclosure program, in compliance with that program's rules of engagement. You are responsible for obtaining and keeping proof of authorization, for staying inside the authorized scope, and for the safety and proportionality of every action the software takes on your behalf.",
                )}
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="flex items-center gap-2 font-medium text-destructive">
                <span className="flex size-5 items-center justify-center rounded-md bg-destructive/10 text-xs font-semibold text-destructive">
                  3
                </span>
                <AlertTriangle className="size-4" />
                {t("Article 3 · Prohibited Conduct")}
              </h4>
              <ul className="ml-7 list-decimal space-y-1.5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 pl-8 text-foreground/80 marker:text-destructive/70">
                <li>
                  {t(
                    "Strictly forbidden: scanning, probing, exploiting, or attacking any system whose owner has not explicitly authorized you to test it, or exceeding the authorized scope or a program's rules of engagement once granted;",
                  )}
                </li>
                <li>
                  {t(
                    "Strictly forbidden: using this software for illegal intrusion, data theft, extortion, denial of service (DoS/DDoS), or any destructive or criminal activity;",
                  )}
                </li>
                <li>
                  {t(
                    "Strictly forbidden: removing, tampering with, or circumventing any copyright, license, or security notice in this software or its output;",
                  )}
                </li>
                <li>
                  {t(
                    "Strictly forbidden: engaging in any conduct that violates the laws, regulations, or regulatory rules of your country or region.",
                  )}
                </li>
              </ul>
            </section>

            <section className="space-y-1.5">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  4
                </span>
                {t("Article 4 · Intellectual Property")}
              </h4>
              <p className="pl-7">
                {t(
                  "The copyright and related intellectual property of this software belong to the project authors and contributors, who grant you the corresponding rights within the scope of the AGPL-3.0 license. Beyond the rights expressly granted by that license, this Statement grants you no other rights, expressly or by implication.",
                )}
              </p>
            </section>

            <section className="space-y-1.5">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  5
                </span>
                {t("Article 5 · Data and Privacy")}
              </h4>
              <p className="pl-7">
                {t(
                  "This software is a self-deployable open-source program; the authors run no centralized service and neither collect nor upload your usage data. All data you generate, process, or touch while using it stays under your control, and you are responsible for its legality and security; any consequence of improper data handling is yours to bear.",
                )}
              </p>
            </section>

            <section className="space-y-1.5">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  6
                </span>
                {t("Article 6 · Compliance and Legal Liability")}
              </h4>
              <p className="pl-7">
                {t(
                  "You must comply on your own with all laws and regulations of your country or region on cybersecurity, data security and personal-information protection, computer crime, and the like (for example, laws on unauthorized access to computer systems, on personal-data protection, and on the responsibilities of security researchers and penetration testers in your jurisdiction).",
                )}
                <span className="font-medium text-foreground">
                  {" "}
                  {t(
                    "All legal liability and consequences arising from your violation of the above laws and regulations or of this Statement are borne by you alone and have nothing to do with this software's authors and contributors.",
                  )}
                </span>
              </p>
            </section>

            <section className="space-y-1.5">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  7
                </span>
                {t("Article 7 · Disclaimer and Limitation of Liability")}
              </h4>
              <p className="pl-7">
                {t(
                  'This software is provided on an "AS IS" and "AS AVAILABLE" basis, without any express or implied warranty, including but not limited to warranties of merchantability, fitness for a particular purpose, accuracy, and non-infringement. To the maximum extent permitted by applicable law, this software\'s authors and contributors are not liable for any direct, indirect, incidental, special, or consequential loss arising from using or being unable to use this software (regardless of whether it is used properly), including but not limited to data loss, system damage, business interruption, loss of profit, or legal disputes.',
                )}
              </p>
            </section>

            <section className="space-y-1.5">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  8
                </span>
                {t("Article 8 · Changes to the Terms and Final Interpretation")}
              </h4>
              <p className="pl-7">
                {t(
                  "The authors may update this Statement from time to time as laws, regulations, or project development require; the updated version ships with the project and takes effect on its publication date, and your continued use of this software means you accept the revised terms. To the extent permitted by law, the authors hold the final right of interpretation of this Statement. If any provision of this Statement is held invalid, the remaining provisions stay in effect.",
                )}
              </p>
            </section>
          </div>

          <DialogFooter className="mx-0 mb-0 flex-col items-stretch gap-2 rounded-b-xl px-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {readToEnd ? t("You have read all the terms") : t("Scroll the terms to the bottom to confirm")}
            </p>
            <DialogClose asChild>
              <Button
                type="button"
                disabled={!readToEnd}
                onClick={() => {
                  setAgreed(true);
                  setError("");
                }}
              >
                {t("I have read and agree to all the terms")}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
