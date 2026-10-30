import {describe,it,expect,vi} from 'vitest';
import {SmtpMailTransport,configureSmtp} from './smtp';
describe('SMTP 발송 계약',()=>{
 it('메일 종류와 토큰을 텍스트로 전송한다',async()=>{const sendMail=vi.fn().mockResolvedValue({});const transport=new SmtpMailTransport({sendMail} as never,'sender@example.test','https://example.test');await transport.send({to:'recipient@example.test',kind:'VERIFY',token:'test-only-token'});expect(sendMail).toHaveBeenCalledOnce();expect(sendMail.mock.calls[0][0].text).toContain('test-only-token');expect(sendMail.mock.calls[0][0].disableFileAccess).toBe(true);});
 it('설정 누락은 비활성화, 운영 HTTP 링크는 거부한다',()=>{expect(configureSmtp({})).toBe(false);expect(()=>configureSmtp({SMTP_HOST:'smtp.example.test',MAIL_FROM:'sender@example.test',MAIL_PUBLIC_URL:'http://example.test',NODE_ENV:'production'})).toThrow();});
 it('실패를 호출자에게 전달하고 슬롯을 반환한다',async()=>{const sendMail=vi.fn().mockRejectedValueOnce(Error('failure')).mockResolvedValue({});const transport=new SmtpMailTransport({sendMail} as never,'sender@example.test','https://example.test');await expect(transport.send({to:'recipient@example.test',kind:'RESET',token:'test'})).rejects.toThrow();await transport.send({to:'recipient@example.test',kind:'RESET',token:'test'});expect(sendMail).toHaveBeenCalledTimes(2);});
});
