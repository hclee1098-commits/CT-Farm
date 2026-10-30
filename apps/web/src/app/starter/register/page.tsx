// filepath: apps/web/src/app/starter/register/page.tsx - 회원가입 입력 화면과 API 연결
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

export default function RegisterPage() {

  const router = useRouter();

  const {
    register
  } = useAuth();

  const [name, setName] = useState("");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [passwordConfirm, setPasswordConfirm] =
    useState("");

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();

    if (submitting) {
      return;
    }

    if (password !== passwordConfirm) {

      setError(
        "비밀번호 확인이 일치하지 않습니다."
      );

      return;
    }

    setSubmitting(true);

    setError("");

    try {

      await register(
        email,
        password,
        name
      );

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

        <h1>회원가입</h1>

        <p>
          새로운 계정을 생성합니다.
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

          <label htmlFor="register-name">
            이름
          </label>

          <input
            id="register-name"
            type="text"
            required
            minLength={2}
            maxLength={60}
            autoComplete="name"
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
          />

          <label htmlFor="register-email">
            이메일
          </label>

          <input
            id="register-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
          />

          <label htmlFor="register-password">
            비밀번호
          </label>

          <input
            id="register-password"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
          />

          <label htmlFor="register-password-confirm">
            비밀번호 확인
          </label>

          <input
            id="register-password-confirm"
            type="password"
            required
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(event) =>
              setPasswordConfirm(event.target.value)
            }
          />

          <button
            type="submit"
            className="starter-button full"
            disabled={submitting}
          >
            {submitting
              ? "회원가입 중..."
              : "회원가입"}
          </button>

        </form>

        <div className="starter-auth-bottom">

          이미 계정이 있으신가요?

          <Link href="/starter/login">
            로그인
          </Link>

        </div>

      </div>

    </div>
  );
}

