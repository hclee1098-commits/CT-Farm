import {navPaths} from './nav-paths';
export function NavIcon({name}:{name:'home'|'farm'|'diary'|'calendar'|'menu'|'bell'|'voice'}){
 const paths=navPaths;
 return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
