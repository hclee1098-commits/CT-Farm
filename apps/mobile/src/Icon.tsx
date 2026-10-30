import Svg,{Path} from 'react-native-svg';import paths from '../../../packages/design-tokens/icons.json';
export function Icon({name,color}:{name:keyof typeof paths;color:string}){return <Svg accessible={false} viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Path d={paths[name]}/></Svg>;}
