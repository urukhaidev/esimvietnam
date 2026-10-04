import assert from 'node:assert/strict';
import {readFile,stat,readdir} from 'node:fs/promises';
const html=await readFile('dist/index.html','utf8');
const config=JSON.parse(await readFile('site.config.json','utf8'));
assert.equal((html.match(/<h1[ >]/g)||[]).length,1,'Один H1');
assert.ok(html.includes('<html lang="ru">'));
assert.ok(html.includes(`<link rel="canonical" href="${config.url}/">`));
assert.ok(!/\{\{[A-Z_]+\}\}|undefined|NaN/.test(html),'Нет незаполненных значений');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(ids.length,new Set(ids).size,'Уникальные id');
for(const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(match[1]),`Якорь ${match[1]} существует`);
for(const match of html.matchAll(/(?:src|href)="(\/assets\/[^"#]+)"/g)) await stat('dist'+match[1]);
for(const match of html.matchAll(/<a [^>]*href="(https:\/\/t\.me\/[^" ]+)"/g)) assert.equal(match[1],config.telegramUrl);
const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
assert.equal(schema['@graph'].find(x=>x['@type']==='FAQPage').mainEntity.length,10);
assert.equal(schema['@graph'].find(x=>x['@type']==='WebPage').name,html.match(/<title>(.*?)<\/title>/)[1]);
for(const [days,cost] of [[7,1743],[14,3486],[30,7470]]) assert.ok(html.includes(`data-unlimited-days="${days}" data-total-rub="${cost}"`),'Верная полная цена дневного тарифа');
for(const [days,cost] of [[7,349],[14,749],[30,1690]]) assert.ok(html.includes(`data-trip-days="${days}" data-package-days="30" data-total-rub="${cost}"`),'Пакет покрывает срок поездки');
assert.ok(html.includes('249 ₽ / день'),'Цена за день обозначена');
const snapshot=JSON.parse(await readFile('data/tariffs.json','utf8'));
const plans=snapshot.items.filter(p=>p.countryCode==='VN');
for(const p of plans){assert.ok(p.coverage.codes.includes('VN'));assert.ok(Number(p.retailRub)>0);assert.ok(html.includes(p.id.slice(0,8)),`Пакет ${p.id} виден`);}
assert.ok((await readFile('dist/robots.txt','utf8')).includes(`Sitemap: ${config.url}/sitemap.xml`));
for(const name of ['llms.txt','llm.txt','llms-full.txt','sitemap.xml','404.html']) assert.ok((await stat('dist/'+name)).size>0);
async function inspect(dir){for(const name of await readdir(dir)){const path=dir+'/'+name;const info=await stat(path);if(info.isDirectory()) await inspect(path);else if(/\.(html|txt|xml|css|js|json)$/.test(name)){const text=await readFile(path,'utf8');assert.ok(!/ett_[\w-]+\.|price_partner|Authorization: Bearer/.test(text),`Нет секретов в ${path}`);}}}
await inspect('dist');
const allFiles=await readdir('dist/assets');
const size=(await stat('dist/index.html')).size+(await Promise.all(allFiles.map(f=>stat('dist/assets/'+f)))).reduce((n,s)=>n+s.size,0);
console.log(`OK: метаданные, 10 FAQ, стоимость поездок и дневного тарифа, ${plans.length} тарифов, ссылки, изображения, robots/sitemap/llms, отсутствие секретов. HTML + все ассеты: ${Math.round(size/1024)} КБ.`);
