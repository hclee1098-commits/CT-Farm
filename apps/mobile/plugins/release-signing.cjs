const {withAppBuildGradle}=require('expo/config-plugins');
// Expo의 개발용 기본 키를 release에 그대로 사용하지 않습니다. EAS/운영 서명은 별도 설정합니다.
module.exports=config=>withAppBuildGradle(config,c=>{
 c.modResults.contents=c.modResults.contents.replace(/(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,'$1signingConfig null // CT-Farm: 실제 release 서명 설정 전 unsigned');
 return c;
});
