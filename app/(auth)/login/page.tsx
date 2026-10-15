"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, Suspense } from "react";
import { loginAction } from "@/actions/auth";
import { requestLoginLinkAction, startLoginAction } from "@/actions/login-link";

/**
 * iter-032 T-011: dvoukrokové přihlášení (rozhodnutí uživatele 15. 10. 2026).
 * Krok 1: jen e-mail a „Pokračovat". Krok 2: vedení s heslem zadá heslo,
 * ostatním se pošle odkaz do e-mailu (vždy stejná odpověď, aspoň 2,5 s).
 * Z kroku 1 se pozná, že e-mail patří vedení s heslem, člena a neexistující
 * e-mail rozlišit nejde (viz startLoginAction).
 */

type Step = "email" | "password" | "link";

const INPUT_CLASS =
  "w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500";
const PRIMARY_BUTTON =
  "w-full min-h-[44px] py-2.5 px-4 bg-red-600 text-white font-semibold rounded-full hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
const SECONDARY_BUTTON =
  "w-full min-h-[44px] py-2.5 px-4 bg-white text-red-700 border border-red-600 font-semibold rounded-full hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
const LINK_BUTTON =
  "w-full min-h-[44px] py-2 px-4 text-sm text-red-700 underline focus:outline-none focus:ring-2 focus:ring-red-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed";

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">
      {children}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm" role="status">
      {children}
    </div>
  );
}

function LoginFormInner() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const urlInfo = searchParams.get("info");

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Po chybě se fokus vrací do pole, kde se chyba stala (review M-1).
  const [focusRequest, setFocusRequest] = useState<{ target: "email" | "password"; n: number } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusRequest) return;
    (focusRequest.target === "email" ? emailRef : passwordRef).current?.focus();
  }, [focusRequest]);

  function focusAfterError(target: "email" | "password") {
    setFocusRequest((prev) => ({ target, n: (prev?.n ?? 0) + 1 }));
  }

  function backToEmail() {
    setStep("email");
    setPassword("");
    setFormError(null);
    setMessage(null);
  }

  function handleStart(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await startLoginAction(email);
        if (!result.success) {
          setFormError(result.error);
          focusAfterError("email");
        } else if (result.data?.next === "password") {
          setStep("password");
        } else {
          setMessage(result.data?.message ?? null);
          setStep("link");
        }
      } catch {
        setFormError("Přihlášení se nepovedlo, zkus to znovu.");
        focusAfterError("email");
      }
    });
  }

  function handlePassword(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await loginAction(email, password);
        // loginAction při úspěchu přesměruje (výsledek je pak undefined);
        // chyba je jen explicitní success === false (review M-4).
        if (result?.success === false) {
          setFormError(result.error);
          focusAfterError("password");
        }
      } catch {
        setFormError("Přihlášení se nepovedlo, zkus to znovu.");
        focusAfterError("password");
      }
    });
  }

  function handleSendLink() {
    setFormError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await requestLoginLinkAction(email);
        if (result.success) {
          setMessage(result.data?.message ?? null);
        } else {
          setFormError(result.error);
        }
      } catch {
        setFormError("Odeslání se nepovedlo, zkus to znovu.");
      }
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-card border border-gray-200 p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-center mb-6">
            Přihlášení do BNI Plzeň
          </h1>

          {urlError === "invalid_token" && (
            <ErrorBox>Odkaz je neplatný nebo mu vypršela platnost.</ErrorBox>
          )}
          {urlInfo === "new_link_sent" && (
            <InfoBox>
              Tvému odkazu vypršela platnost. Nový odkaz jsme ti právě poslali
              e-mailem.
            </InfoBox>
          )}

          {formError && <ErrorBox>{formError}</ErrorBox>}

          {step === "email" && (
            <form onSubmit={handleStart} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  E-mail
                </label>
                <input
                  id="email"
                  name="email"
                  ref={emailRef}
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="jmeno@firma.cz"
                  readOnly={isPending}
                />
              </div>
              <button type="submit" disabled={isPending} className={PRIMARY_BUTTON}>
                {isPending ? "Ověřuji..." : "Pokračovat"}
              </button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={handlePassword} className="space-y-4">
              {message && <InfoBox>{message}</InfoBox>}
              <div>
                <label htmlFor="email-readonly" className="block text-sm font-medium text-gray-700 mb-1">
                  E-mail
                </label>
                <input
                  id="email-readonly"
                  name="email"
                  type="email"
                  readOnly
                  autoComplete="username"
                  value={email}
                  className={`${INPUT_CLASS} bg-gray-50 text-gray-600`}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Heslo
                </label>
                <input
                  id="password"
                  name="password"
                  ref={passwordRef}
                  type="password"
                  required
                  autoFocus
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="••••••••"
                  readOnly={isPending}
                />
                <p className="mt-2 text-sm text-gray-600">
                  Heslo ještě nemáš? Nastav si ho odkazem z mailu, který ti
                  poslal admin. Nebo se přihlas odkazem níž.
                </p>
              </div>
              <button type="submit" disabled={isPending} className={PRIMARY_BUTTON}>
                {isPending ? "Přihlašuji..." : "Přihlásit se"}
              </button>
              <button
                type="button"
                onClick={handleSendLink}
                disabled={isPending}
                className={SECONDARY_BUTTON}
              >
                Poslat odkaz místo hesla
              </button>
              <button type="button" onClick={backToEmail} disabled={isPending} className={LINK_BUTTON}>
                Změnit e-mail
              </button>
            </form>
          )}

          {step === "link" && (
            <div className="space-y-4">
              {message && <InfoBox>{message}</InfoBox>}
              <p className="text-sm text-gray-600 break-all">{email}</p>
              <button type="button" onClick={backToEmail} className={LINK_BUTTON}>
                Změnit e-mail
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Načítání...</div>
      </div>
    }>
      <LoginFormInner />
    </Suspense>
  );
}
