import { z } from "zod";

export const farmInput = z.object({
  name: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).max(300),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  areaM2: z.number().finite().positive().max(1_000_000_000),
  crop: z.string().trim().min(1).max(80),
  variety: z.string().trim().max(80).default(""),
  stage: z.enum(["PREPARING", "SOWING", "GROWING", "HARVESTING", "RESTING"])
}).strict();
const version = z.number().int().positive().max(2147483646);
export const farmUpdate = farmInput.extend({ version });
export const versionInput = z.object({ version }).strict();
// 날짜는 한국 농장 작업일로 저장하며 UTC 변환으로 날짜가 바뀌지 않게 합니다.
const workDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "실제 존재하는 작업 날짜를 입력해 주세요.");
export const diaryInput = z.object({
  workDate, title: z.string().trim().min(1).max(120), content: z.string().trim().min(1).max(5000)
}).strict();
export const diaryUpdate = diaryInput.extend({ version });
export const diaryParams = z.object({ id: z.string().uuid(), entryId: z.string().uuid() }).strict();
export const listQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
