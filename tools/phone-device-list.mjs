// adb devices -l은 버전에 따라 탭 또는 여러 공백으로 열을 구분합니다.
export function parseDevices(stdout){return stdout.split(/\r?\n/).filter(x=>/^\S+\s+(device|unauthorized|offline|recovery|sideload)\b/.test(x.trim())).map(x=>{const [id,status,...rest]=x.trim().split(/\s+/);return {id,status,emulator:id.startsWith('emulator-'),model:rest.find(v=>v.startsWith('model:'))?.slice(6)};});}
