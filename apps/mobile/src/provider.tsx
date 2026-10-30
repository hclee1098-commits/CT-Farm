import {createContext,useContext,useEffect,useSyncExternalStore,type ReactNode} from 'react';
import Constants from 'expo-constants';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MobileClient,apiBase} from './client';
import {vault,draftStore} from './storage';
export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:30000,refetchOnWindowFocus:false},mutations:{retry:false}}});
export const client=new MobileClient(apiBase(Constants.expoConfig?.extra?.apiUrl||'https://staging.example.invalid/api/v1',__DEV__),vault,fetch,async userId=>{queryClient.clear();if(userId)await draftStore.clearUser(userId);await draftStore.clear();});
const Context=createContext(client);
export function AppProvider({children}:{children:ReactNode}){useEffect(()=>{void client.initialize();},[]);return <QueryClientProvider client={queryClient}><Context.Provider value={client}>{children}</Context.Provider></QueryClientProvider>;}
export function useSession(){const api=useContext(Context);return {...useSyncExternalStore(api.subscribe,api.snapshot,api.snapshot),api};}
