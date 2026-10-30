const {getDefaultConfig}=require('expo/metro-config');
const path=require('node:path');
const config=getDefaultConfig(__dirname);
// React는 모바일 프로젝트의 버전을 사용하고 순수 JSON 디자인 토큰만 공유합니다.
config.watchFolders=[path.resolve(__dirname,'../../packages')];
config.resolver.nodeModulesPaths=[path.resolve(__dirname,'node_modules')];
// Expo 모듈의 자체 하위 의존성 탐색은 유지합니다. 공유 폴더에는 JSON만 둡니다.
module.exports=config;
