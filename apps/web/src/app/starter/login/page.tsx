// filepath: apps/web/src/app/starter/login/page.tsx - 이메일과 비밀번호를 이용한 로그인 화면
"use client";

import {
  useState
} from "react";

import Link from "next/link";

import {
  useRouter
} from "next/navigation";

import {
  useAuth
} from "../_lib/auth";

import {
  getErrorMessage
} from "../_lib/api";

export default function LoginPage() {

  const router = useRouter();

  const {
    login
  } = useAuth();

  const [email, setEmail] = useState("");

  const [mfaCode, setMfaCode] = useState("");

  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();

    if (submitting) {
      return;
    }

    setSubmitting(true);

    setError("");

    try {

      await login(email, password, mfaCode || undefined);

      router.push("/starter");

    }
    catch (caught) {

      setError(getErrorMessage(caught));

    }
    finally {

      setSubmitting(false);

    }
  }

  return (
    <div className="starter-auth-page">

      <div className="starter-auth-card">

        <h1>로그인</h1>

        <p>
          등록한 계정으로 로그인해 주세요.
        </p>

        {error && (
          <div
            className="starter-error"
            role="alert"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          <label htmlFor="login-email">
            이메일
          </label>

          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
          />

          <label htmlFor="login-password">
            비밀번호
          </label>

          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
          />

          <label htmlFor="login-mfa">MFA 코드 또는 복구 코드 (등록한 계정)</label>
          <input id="login-mfa" autoComplete="one-time-code" maxLength={32} value={mfaCode} onChange={event => setMfaCode(event.target.value)} />

          <button
            type="submit"
            className="starter-button full"
            disabled={submitting}
          >
            {submitting
              ? "로그인 중..."
              : "로그인"}
          </button>

        </form>

        <div className="starter-auth-bottom">

          아직 회원이 아니신가요?

          <Link href="/starter/register">
            회원가입
          </Link>

        </div>

      </div>

    </div>
  );
}

