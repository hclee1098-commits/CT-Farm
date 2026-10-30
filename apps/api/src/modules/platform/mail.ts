import { AppError } from "../../common/app-error";
export interface MailMessage { to: string; kind: "VERIFY" | "RESET" | "CHANGE_EMAIL"; token: string }
export interface MailTransport { send(message: MailMessage): Promise<void> }
// 테스트용 구현은 외부 발송을 하지 않으며 원문 인증정보를 로그에 출력하지 않습니다.
export class MemoryMailTransport implements MailTransport {
  readonly messages: MailMessage[] = [];
  async send(message: MailMessage) {
    if (this.messages.length >= 100) this.messages.shift();
    this.messages.push(message);
  }
}
let transport: MailTransport | undefined;
export function configureMailTransport(value: MailTransport) { transport = value; }
export function getMailTransport(): MailTransport {
  if (!transport) throw new AppError(503, "MAIL_NOT_CONFIGURED", "이메일 발송 서비스 설정이 필요합니다.");
  return transport;
}
