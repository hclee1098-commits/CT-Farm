import type {ConfigContext,ExpoConfig} from 'expo/config';
// 기본값은 외부 연결이 일어나지 않는 예약 도메인입니다. 운영은 HTTPS만 허용합니다.
export default ({config}:ConfigContext):ExpoConfig=>({
 ...config,name:'CT-Farm',slug:'ct-farm',scheme:'ctfarm',version:'0.1.0',orientation:'default',
 userInterfaceStyle:'automatic',icon:'./assets/icon.png',
 ios:{supportsTablet:true,bundleIdentifier:'kr.ctfarm.mobile',infoPlist:{NSCameraUsageDescription:'영농일지에 농장 사진을 찍어 첨부합니다.',NSPhotoLibraryUsageDescription:'선택한 농장 사진만 일지에 첨부합니다.'}},
 android:{package:'kr.ctfarm.mobile',allowBackup:false,adaptiveIcon:{foregroundImage:'./assets/icon.png',backgroundColor:'#edf5ee'},blockedPermissions:['android.permission.RECORD_AUDIO']},
 plugins:['expo-router','./plugins/release-signing.cjs',['expo-secure-store',{configureAndroidBackup:true}],['expo-image-picker',{photosPermission:'선택한 농장 사진을 일지에 첨부합니다.',cameraPermission:'영농일지 사진을 촬영합니다.',microphonePermission:false}]],
 experiments:{typedRoutes:false},
 extra:{apiUrl:process.env.EXPO_PUBLIC_API_URL||'https://staging.example.invalid/api/v1'}
});
