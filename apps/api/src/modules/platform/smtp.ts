import { telemetry } from "../../infrastructure/telemetry";
// 전송 제공자 교체는 기존 MailTransport 계약을 사용합니다. 토큰/주소를 로그에 남기지 않습니다.
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { configureMailTransport, type MailMessage, type MailTransport } from './mail';

const settings=z.object({
 SMTP_HOST:z.string().min(1), SMTP_PORT:z.coerce.number().int().min(1).max(65535).default(587),
 SMTP_USER:z.string().optional(), SMTP_PASSWORD:z.string().optional(),
 MAIL_FROM:z.string().email(), MAIL_PUBLIC_URL:z.string().url(),
 NODE_ENV:z.string().default('development')
}).superRefine((s,c)=>{
 const url=new URL(s.MAIL_PUBLIC_URL);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)c.addIssue({code:'custom',message:'메일 링크 기준 URL을 확인하세요.'});
 if(s.NODE_ENV==='production'&&url.protocol!=='https:')c.addIssue({code:'custom',message:'운영 메일 링크는 HTTPS가 필요합니다.'});
 if(Boolean(s.SMTP_USER)!==Boolean(s.SMTP_PASSWORD))c.addIssue({code:'custom',message:'SMTP 인증 설정이 불완전합니다.'});
});
export function configureSmtp(source:NodeJS.ProcessEnv=process.env){
 if(!source.SMTP_HOST){telemetry("mail",{status:"not_configured"});return false;}
 const s=settings.parse(source);
 const local=['localhost','127.0.0.1','::1'].includes(s.SMTP_HOST);
 const sender=nodemailer.createTransport({host:s.SMTP_HOST,port:s.SMTP_PORT,secure:s.SMTP_PORT===465,requireTLS:s.NODE_ENV==='production'||!local,auth:s.SMTP_USER?{user:s.SMTP_USER,pass:s.SMTP_PASSWORD}:undefined,connectionTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true});
 configureMailTransport(new SmtpMailTransport(sender,s.MAIL_FROM,s.MAIL_PUBLIC_URL));return true;
}
export class SmtpMailTransport implements MailTransport{
 private pending=0;
 constructor(private sender:Pick<ReturnType<typeof nodemailer.createTransport>,'sendMail'>,private from:string,private publicUrl:string){}
 async send(message:MailMessage){
  // 무제한 메모리 큐 대신 포화 시 실패 처리합니다. 내구성 큐/자동 재시도는 별도 구축이 필요합니다.
  if(this.pending>=20)throw Error('MAIL_CAPACITY');this.pending++;
  try{
   const link=new URL('/starter/email',this.publicUrl);
   // Fragment는 HTTP 요청/접근 로그에 전송되지 않습니다. 계정 화면에서 수동 입력합니다.
   link.hash=new URLSearchParams({kind:message.kind,token:message.token}).toString();
   const labels={VERIFY:'이메일 인증',RESET:'비밀번호 재설정',CHANGE_EMAIL:'이메일 변경 인증'};
   await this.sender.sendMail({from:this.from,to:message.to,subject:`SECURE STARTER ${labels[message.kind]}`,text:`${labels[message.kind]} 요청입니다.\n15분 이내에 계정 화면의 해당 작업에 아래 코드를 입력하세요.\n${message.token}\n\n계정 화면: ${link.toString()}\n요청하지 않았다면 이 메일을 무시하세요.`,disableFileAccess:true,disableUrlAccess:true});
   telemetry("mail",{result:"success"});
  }catch(error){telemetry("mail",{result:"failed"});throw error;}finally{this.pending--;}
 }
}
