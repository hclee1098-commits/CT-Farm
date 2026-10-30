import {loadEvents} from './core.mjs';
const last=loadEvents(process.env.MONITOR_DIR,process.env.APP_ENV).filter(e=>e.kind==='heartbeat').at(-1);
process.exit(last&&Date.now()-Date.parse(last.time)<45000?0:1);
