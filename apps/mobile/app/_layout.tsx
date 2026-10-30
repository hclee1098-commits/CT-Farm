import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {AppProvider,useSession} from '../src/provider';
import {Button,Loading,Notice,Screen} from '../src/ui';
function Routes(){const {status,user,api,message}=useSession();if(status==='loading')return <Screen title="CT-Farm"><Loading/></Screen>;if(status==='unavailable')return <Screen title="연결을 확인해 주세요"><Notice error message={message}/><Notice message="연결 오류만으로 초안을 지우지 않습니다."/><Button title="다시 확인" onPress={()=>void api.initialize()}/><Button title="로그인 화면" secondary onPress={()=>api.showLogin()}/></Screen>;return <Stack screenOptions={{headerTitle:'CT-Farm',headerBackButtonDisplayMode:'minimal'}}><Stack.Protected guard={!user}><Stack.Screen name="login" options={{headerShown:false}}/></Stack.Protected><Stack.Protected guard={!!user}><Stack.Screen name="(tabs)" options={{headerShown:false}}/><Stack.Screen name="farm/[id]" options={{title:'농장 살펴보기'}}/><Stack.Screen name="diary/[farmId]/[entryId]" options={{title:'영농일지'}}/><Stack.Screen name="assistant" options={{title:'농장 관리 도우미'}}/><Stack.Screen name="notifications" options={{title:'알림'}}/></Stack.Protected></Stack>;}
export default function Root(){return <SafeAreaProvider><AppProvider><StatusBar style="auto"/><Routes/></AppProvider></SafeAreaProvider>;}
