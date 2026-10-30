import {createDraftStore} from './draft-core';
import * as SecureStore from 'expo-secure-store';
import type {Vault,StoredSession} from './client';
const key='ctfarm.mobile.session.v1';
const options={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
export const vault:Vault={
 async read(){const raw=await SecureStore.getItemAsync(key);if(!raw)return null;const v=JSON.parse(raw);if(typeof v.refreshToken!=='string'||v.refreshToken.length<40||v.refreshToken.length>256||typeof v.userId!=='string'||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(v.userId))throw Error('안전한 로그인 저장소를 확인해 주세요.');return v as StoredSession;},
 async write(value){await SecureStore.setItemAsync(key,JSON.stringify(value),options);},
 async clear(){await SecureStore.deleteItemAsync(key);}
};
export const draftStore=createDraftStore({get:key=>SecureStore.getItemAsync(key),set:(key,value)=>SecureStore.setItemAsync(key,value,options),remove:key=>SecureStore.deleteItemAsync(key)},async()=>(await vault.read())?.userId);
