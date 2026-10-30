// SVG 원본을 보존하고 동일한 원본에서 배포용 이미지를 생성합니다.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const dir=new URL('../apps/web/public/brand/',import.meta.url);await fs.mkdir(dir,{recursive:true});
const glyph=`<path d="M42 15A23 23 0 1 0 42 49" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><path d="M30 44V29M30 34C18 34 19 22 19 22C30 21 32 28 30 34ZM30 30C30 18 43 18 43 18C44 29 36 32 30 30Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M39 33H49L54 27M49 33L54 39" fill="none" stroke="#39a995" stroke-width="3"/><circle cx="55" cy="25" r="4" fill="#39a995"/><circle cx="55" cy="41" r="4" fill="#39a995"/>`;
const svg=(w,h,body,color='#137548')=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" color="${color}" role="img" aria-label="CT-Farm">${body}</svg>`;
const variants={
 'symbol':svg(64,64,glyph),
 'logo-light':svg(300,64,glyph+'<text x="76" y="44" font-family="Segoe UI,Arial,sans-serif" font-size="39" font-weight="700" letter-spacing="-1.2" fill="#103f30">CT-Farm</text>'),
 'logo-dark':svg(300,64,glyph+'<text x="76" y="44" font-family="Segoe UI,Arial,sans-serif" font-size="39" font-weight="700" letter-spacing="-1.2" fill="#f2fff7">CT-Farm</text>','#b4e791'),
 'app-icon':svg(512,512,'<rect width="512" height="512" rx="112" fill="#103f30"/><g transform="translate(48 48) scale(6.5)">'+glyph+'</g>','#b4e791'),
 'favicon':svg(64,64,'<rect width="64" height="64" rx="14" fill="#103f30"/><g transform="translate(6 6) scale(.81)">'+glyph+'</g>','#b4e791')
};
for(const [name,source] of Object.entries(variants)){
 await fs.writeFile(new URL(name+'.svg',dir),source);await sharp(Buffer.from(source)).png().toFile(new URL(name+'.png',dir).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
}
for(const size of [192,512])await sharp(Buffer.from(variants['app-icon'])).resize(size,size).png().toFile(new URL(`app-icon-${size}.png`,dir).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const png=await sharp(Buffer.from(variants.favicon)).resize(32,32).png().toBuffer();const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=32;ico[7]=32;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);await fs.writeFile(new URL('../apps/web/public/favicon.ico',import.meta.url),Buffer.concat([ico,png]));
const preview=svg(720,300,'<rect width="720" height="150" fill="#fff"/><rect y="150" width="720" height="150" fill="#103f30"/><g transform="translate(30 40)">'+variants['logo-light'].replace(/<\/?svg[^>]*>/g,'')+'</g><g transform="translate(30 190)" color="#b4e791">'+variants['logo-dark'].replace(/<\/?svg[^>]*>/g,'')+'</g><g transform="translate(570 43)">'+glyph+'</g>');
await sharp(Buffer.from(preview)).png().toFile(new URL('preview.png',dir).pathname.replace(/^\/([A-Za-z]:)/,'$1'));console.log('CT-Farm SVG·PNG·ICO 생성 완료');
