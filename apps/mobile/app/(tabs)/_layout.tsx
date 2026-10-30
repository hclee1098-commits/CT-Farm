import {Icon} from '../../src/Icon';
import {Link,Slot,usePathname} from 'expo-router';
import {Pressable,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../../src/ui';
const items=[['/','home','홈'],['/farms','farm','내 농장'],['/diary','diary','영농일지'],['/schedule','calendar','일정'],['/more','menu','전체']] as const;
export default function Tabs(){const c=useTheme(),insets=useSafeAreaInsets(),pathname=usePathname();return <View style={{flex:1,paddingTop:insets.top,backgroundColor:c.background}}><View style={{flex:1}}><Slot/></View><View accessibilityRole="tablist" style={{flexDirection:'row',paddingBottom:insets.bottom,backgroundColor:c.surface,borderTopWidth:1,borderColor:c.border}}>{items.map(([href,icon,label])=><Link key={href} href={href} asChild><Pressable accessibilityRole="tab" accessibilityState={{selected:pathname===href}} style={{flex:1,minHeight:72,alignItems:'center',justifyContent:'center',padding:4,gap:2}}><Icon name={icon} color={pathname===href?c.primary:c.muted}/><Text style={{fontSize:15,fontWeight:pathname===href?'800':'500',color:pathname===href?c.primary:c.muted}}>{label}</Text></Pressable></Link>)}</View></View>;}
