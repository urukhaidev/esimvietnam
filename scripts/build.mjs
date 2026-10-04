import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
const config = JSON.parse(await readFile('site.config.json', 'utf8'));
const snapshot = JSON.parse(await readFile('data/tariffs.json', 'utf8'));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const strip = v => v.replace(/<[^>]*>/g, '').trim();
const rawUrl = process.env.SITE_URL || config.url || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
const url = rawUrl ? new URL(rawUrl).origin : '';
if (url && !url.startsWith('https://')) throw new Error('SITE_URL должен начинаться с https://');
const telegram = process.env.TELEGRAM_URL || config.telegramUrl;
if (telegram && (new URL(telegram).hostname !== 't.me' || !telegram.startsWith('https://'))) throw new Error('Нужна HTTPS-ссылка t.me');
const preview = process.env.VERCEL_ENV === 'preview';
const indexable = Boolean(url) && !preview;
const day = new Intl.DateTimeFormat('ru-RU', {timeZone:'Europe/Moscow', day:'numeric',month:'long',year:'numeric'});
const fetched = snapshot.fetchedAt ? day.format(new Date(snapshot.fetchedAt)).replace(/ г\.$/,'') : '';
const money = n => new Intl.NumberFormat('ru-RU', {maximumFractionDigits:2}).format(Number(n));
const plans = snapshot.items.filter(p => p.countryCode === 'VN' && p.coverage?.codes?.includes('VN')).sort((a,b) => Number(a.retailRub) - Number(b.retailRub));
const price = p => `${money(p.retailRub)} ₽${p.billingUnit === 'day' ? ' / день' : ''}`;
const period = p => p.duration?.configurable ? `${p.duration.minimum_days}–${p.duration.maximum_days} дней` : `${p.validityDays} дней`;
const volume = p => p.data.type === 'unlimited' ? 'Безлимит' : (p.data.label || `${Number(p.data.megabytes)/1024} ГБ`).replace(/GB/gi,' ГБ').replace(/MB/gi,' МБ');
const networks = p => [...new Set((p.coverage?.networks || []).filter(n => !n.country_code || n.country_code === 'VN').map(n => n.operator))].join(', ') || 'Уточняется';
const activation = p => ({'First Network Connection':'При первом подключении к сети','First Installation':'При первой установке','Installation':'При установке','First Use':'При первом использовании'}[p.activation?.billing_starts] || p.activation?.billing_starts || 'По инструкции тарифа');
const limits = p => p.fairUse?.high_speed_data_gb_per_day ? `${money(p.fairUse.high_speed_data_gb_per_day)} ГБ/день на полной скорости${p.fairUse.reduced_speed_mbps ? `, затем до ${money(p.fairUse.reduced_speed_mbps)} Мбит/с` : ''}` : p.data.type === 'unlimited' ? 'Ограничения уточняйте при оформлении' : 'Объём на весь срок';
const link = (label, css = 'button') => telegram ? `<a class="${css}" href="${esc(telegram)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '<button class="button" disabled aria-disabled="true">Оформление скоро откроется</button>';
let html = await readFile('site/index.html', 'utf8');
const featured = [plans.find(p => p.data.type === 'fixed' && Number(p.data.megabytes) === 3072 && p.validityDays >= 7),plans.find(p => p.data.type === 'fixed' && Number(p.data.megabytes) === 10240 && p.validityDays >= 14),plans.find(p => p.data.type === 'fixed' && Number(p.data.megabytes) === 20480 && p.validityDays >= 30)].filter(Boolean);
const perGb = p => p.data.type === 'fixed' && p.billingUnit === 'plan' && Number(p.data.megabytes)>0 ? `${money(Number(p.retailRub)/(Number(p.data.megabytes)/1024))} ₽/ГБ` : '';
const reasons = [
  'Для карт и сообщений при небольшом расходе. Общий объём 3 ГБ не рассчитан на постоянный просмотр видео.',
  'Для отпуска с фото, навигацией и звонками в приложениях. При частых видеозвонках сначала оцените свой расход.',
  'Для более долгой поездки с умеренным расходом. 20 ГБ на месяц не означают безлимит для ноутбука.'
];
const cardTitles = ['На несколько дней','Для отпуска','Для долгой поездки'];
const cards = featured.map((p,i) => `<article class="plan${i===1?' featured':''}"><span class="tag">${cardTitles[i]}</span><h3>${esc(period(p))}</h3><p class="volume">${esc(volume(p))}</p><p class="card-price">${esc(price(p))}<span class="price-note">${esc(perGb(p))} · рекомендуемая цена</span></p><p class="plan-reason">${reasons[i]}</p><ul><li>${esc(networks(p))}</li><li>${esc(p.speed || 'Скорость уточняется')}</li><li>Раздача ${p.tetheringAllowed?'разрешена':'не разрешена'}</li></ul><p class="micro">${esc(activation(p))}</p>${link('Оформить eSIM',i===1?'button':'button secondary')}<p class="plan-code">Код пакета: ${esc(p.id.slice(0,8))}</p></article>`).join('');
const row = p => `<tr><th scope="row">${esc(volume(p))}<span class="price-note">${esc(p.id.slice(0,8))}</span></th><td>${esc(period(p))}</td><td>${esc(networks(p))}<span class="price-note">${esc(p.speed)}</span></td><td>${esc(limits(p))}<span class="price-note">Раздача: ${p.tetheringAllowed?'да':'нет'}. ${esc(activation(p))}.</span></td><td><span class="price">${esc(price(p))}</span><span class="price-note">${p.billingUnit==='day'?'За выбранные дни: цена × срок':`За пакет · ${esc(perGb(p))}`}</span></td><td>${link('Оформить','button small secondary')}</td></tr>`;
const table = items => `<div class="table-wrap" tabindex="0" role="region" aria-label="Таблица тарифов eSIM для Вьетнама"><table><caption>Пакет, срок, сеть и ограничения</caption><thead><tr><th scope="col">Интернет</th><th scope="col">Срок</th><th scope="col">Сеть</th><th scope="col">Условия</th><th scope="col">Цена</th><th scope="col">Оформление</th></tr></thead><tbody>${items.map(row).join('')}</tbody></table></div>`;
const selected = [1024,3072,5120,10240,20480].map(mb => plans.find(p=>p.data.type==='fixed' && Number(p.data.megabytes)===mb && p.validityDays>=7)).filter(Boolean);
const unlimited = plans.find(p=>p.data.type==='unlimited');
if (unlimited) selected.push(unlimited);
const tariffBlock = plans.length ? `<div class="plan-grid">${cards}</div><p class="data-legend">Рекомендуемые розничные цены eSIMtoTrip на ${esc(fetched)}. Доступность и итоговую стоимость подтвердите в Telegram. Код пакета поможет указать выбранный вариант.</p>${table(selected)}<details class="all-plans"><summary>Все ${plans.length} тарифов Вьетнама в сохранённой подборке</summary>${table(plans)}</details><p class="data-legend">Сохранена первая страница каталога: ${snapshot.items.length} предложений из ${snapshot.total}, включая региональные. Здесь показаны только ${plans.length} пакетов с направлением «Вьетнам». Это разовая подборка, без автоматического обновления.</p>` : '<div class="empty-tariffs"><h3>Тариф подберём в Telegram</h3><p>Уточните доступные пакеты и стоимость перед оформлением.</p></div>';
html = html.replace('{{TARIFFS}}',tariffBlock);
const tripScenarios = [
  {days:7,gb:3,label:'Неделя: карты и переписка'},
  {days:14,gb:10,label:'Две недели: фото и общение'},
  {days:30,gb:20,label:'Месяц: умеренный расход'}
];
const tripRows = tripScenarios.map(s=>{
  const p=plans.find(p=>p.billingUnit==='plan' && p.data.type==='fixed' && Number(p.data.megabytes)===s.gb*1024 && p.validityDays>=s.days);
  if(!p) return `<tr><th scope="row">${s.label}</th><td colspan="4">Нет подходящего пакета в сохранённой подборке</td></tr>`;
  return `<tr data-trip-days="${s.days}" data-package-days="${p.validityDays}" data-total-rub="${Number(p.retailRub)}"><th scope="row">${s.label}</th><td>${esc(volume(p))} на весь срок<span class="price-note">Пакет действует ${esc(period(p))}</span></td><td class="price">${esc(price(p))}</td><td>${esc(perGb(p))}</td><td><a href="#tariffs">Код ${esc(p.id.slice(0,8))}</a></td></tr>`;
}).join('');
const tripTable=`<div class="table-wrap" tabindex="0" role="region" aria-label="Стоимость интернета на 7, 14 и 30 дней"><table><caption>Примеры бюджета по сохранённым розничным ценам</caption><thead><tr><th scope="col">Поездка и сценарий</th><th scope="col">Выбранный пакет</th><th scope="col">За весь пакет</th><th scope="col">Цена 1 ГБ</th><th scope="col">Вариант</th></tr></thead><tbody>${tripRows}</tbody></table></div>`;
const durationRows=[10,15,30].map(days=>{
  const p=plans.find(p=>p.billingUnit==='plan' && p.data.type==='fixed' && Number(p.data.megabytes)===5120 && p.validityDays===days);
  return p?`<tr><th scope="row">5 ГБ · ${days} дней</th><td>${esc(price(p))}</td><td>${esc(perGb(p))}</td><td>${esc(networks(p))}</td><td>${esc(p.id.slice(0,8))}</td></tr>`:'';
}).join('');
const durationTable=`<div class="table-wrap" tabindex="0" role="region" aria-label="Сравнение пакетов 5 ГБ"><table><caption>5 ГБ на 10, 15 и 30 дней</caption><thead><tr><th scope="col">Объём и срок</th><th scope="col">Цена пакета</th><th scope="col">Цена 1 ГБ</th><th scope="col">Сети</th><th scope="col">Код</th></tr></thead><tbody>${durationRows}</tbody></table></div>`;
const unlimitedAnalysis=unlimited?.billingUnit==='day' ? `<p class="section-intro">В сохранённой подборке дневной пакет стоит <strong>${esc(price(unlimited))}</strong>. Его условие: ${esc(limits(unlimited))}. Обозначение «безлимит» относится к доступу к данным, а не к постоянной максимальной скорости.</p><div class="cost-grid">${[7,14,30].filter(days=>days>=unlimited.duration.minimum_days&&days<=unlimited.duration.maximum_days).map(days=>`<article class="cost-card" data-unlimited-days="${days}" data-total-rub="${Number(unlimited.retailRub)*days}"><h3>${days} дней</h3><p class="cost-value">${money(Number(unlimited.retailRub)*days)} ₽</p><p>${days} × ${money(unlimited.retailRub)} ₽ за день</p></article>`).join('')}</div><p class="data-legend">Расчёт по рекомендуемой цене на ${esc(fetched)}. Это один дневной тариф (${esc(unlimited.id.slice(0,8))}), а не три отдельных предложения. Дневные лимиты нельзя считать общим объёмом с переносом остатка без подтверждения условий.</p>` : '<p>Дневной безлимитный пакет в сохранённой подборке отсутствует. Уточните условия при оформлении.</p>';
html=html.replace('{{TRIP_COST}}',tripTable).replace('{{DURATION_COMPARISON}}',durationTable).replace('{{UNLIMITED_ANALYSIS}}',unlimitedAnalysis);
const faq = [...html.matchAll(/<details><summary>(.*?)<\/summary><p>(.*?)<\/p><\/details>/gs)].map(m=>({'@type':'Question',name:strip(m[1]),acceptedAnswer:{'@type':'Answer',text:strip(m[2])}}));
const schema = {'@context':'https://schema.org','@graph':[
  {'@type':'WebSite',name:config.name,inLanguage:'ru-RU',...(url?{url:`${url}/`}:{})},
  {'@type':'WebPage',name:strip(html.match(/<title>(.*?)<\/title>/)[1]),description:'Сравнение стоимости eSIM для Вьетнама на 7, 14 и 30 дней и инструкции подключения.',inLanguage:'ru-RU',dateModified:config.updated,...(url?{url:`${url}/`}:{})},
  {'@type':'FAQPage',mainEntity:faq}
]};
const replacements = {
  ROBOTS:indexable?'index, follow, max-image-preview:large':'noindex, nofollow',
  CANONICAL:url?`<link rel="canonical" href="${esc(url)}/">`:'',
  OG_URL:url?`<meta property="og:url" content="${esc(url)}/">`:'',
  SCHEMA:`<script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script>`,
  TELEGRAM_BUTTON:link('Оформить в Telegram'),
  PHOTO_CREDITS:'<p>Фотографии: <a href="https://unsplash.com/photos/boats-on-turquoise-ha-long-bay-kG7pOXbBfNs" target="_blank" rel="noopener noreferrer">Marina Lobato — Халонг</a>, <a href="https://unsplash.com/photos/aerial-view-of-beach-dLkyhhC-e6Y" target="_blank" rel="noopener noreferrer">Huy — Нячанг</a>. Используются по <a href="https://unsplash.com/license" target="_blank" rel="noopener noreferrer">Unsplash License</a>.</p>'
};
for (const [key,value] of Object.entries(replacements)) html=html.replaceAll(`{{${key}}}`,value);
if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error('В HTML остались незаполненные поля');
await mkdir('dist/assets',{recursive:true});
await cp('site/assets','dist/assets',{recursive:true});
await writeFile('dist/index.html',html);
await writeFile('dist/robots.txt',`User-agent: *\n${indexable?'Allow: /':'Disallow: /'}\n${indexable?`\nSitemap: ${url}/sitemap.xml\n`:''}`);
await writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${url?`<url><loc>${esc(url)}/</loc><lastmod>${config.updated}</lastmod></url>`:''}</urlset>\n`);
const base=url||'http://localhost:4173';
const llms=`# eSIM Vietnam\n\n> Русскоязычный гид по мобильному интернету во Вьетнаме. Выбор eSIM, сравнение способов связи и подключение.\n\n## Основные разделы\n- [Тарифы](${base}/#tariffs): сохранённая подборка eSIMtoTrip.\n- [eSIM, SIM и роуминг](${base}/#comparison): преимущества и ограничения.\n- [Расход интернета](${base}/#data): ориентиры для поездки.\n- [Совместимость](${base}/#compatibility): проверка телефона до оплаты.\n- [Подключение](${base}/#how-to): установка и выбор линии данных.\n- [Маршрут](${base}/#coverage): связь в городах и на курортах.\n- [Вопросы](${base}/#faq): срок действия, раздача, номер, ошибки.\n- [Полный текст](${base}/llms-full.txt): текстовое представление гида и тарифов.\n\n## Оформление\n${telegram?`Оформление через [Telegram](${telegram}).`:'Оформление пока не подключено.'} Сайт не принимает оплату и не выдаёт eSIM. Итоговые условия подтверждаются при оформлении.\n\n## Данные и ограничения\nМатериал обновлён: ${config.updated}. ${plans.length?`Каталог загружен ${fetched}: первая страница (${snapshot.items.length} из ${snapshot.total}), показаны ${plans.length} пакетов страны VN. Цены — price_retail_rub, рекомендуемые розничные, в рублях.`:'Подтверждённых тарифов нет.'}\nАвтоматического обновления нет. Цена за день не равна цене за весь пакет. Сеть и ограничения относятся к конкретному пакету. Примеры расхода трафика не являются тарифами. Не приписывайте сайту гарантии покрытия, скорости, возврата или поддержки, которых в тексте нет.\n`;
const analysisLinks=`\n## Сравнение и оформление\n- [Стоимость поездки](${base}/#trip-cost): пакеты для 7, 14 и 30 дней, цена гигабайта и сравнение 5 ГБ.\n- [Безлимит](${base}/#unlimited): полная стоимость дневного тарифа и ограничение скорости.\n- [Как купить](${base}/#purchase): порядок выбора и согласования условий в Telegram.\n\nРасчёты основаны на сохранённом каталоге. Полевых тестов связи нет; сведения о продавце, способах оплаты, сроках выдачи и возврате не подтверждены. Не выдавайте эти условия за гарантированные.\n`;
await writeFile('dist/llms.txt',llms+analysisLinks);
await writeFile('dist/llm.txt',llms+analysisLinks);
const plain = html.replace(/<head>[\s\S]*?<\/head>/,'').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<\/(?:h[1-6]|p|li|tr|summary|caption|section|article|div)>/g,'\n').replace(/<\/(?:td|th)>/g,' | ').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n\n').trim();
await writeFile('dist/llms-full.txt',llms+analysisLinks+'\n## Содержание страницы\n\n'+plain+'\n');
await writeFile('dist/404.html',`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Страница не найдена — eSIM Vietnam</title><link rel="stylesheet" href="/assets/style.css"><main class="wrap hero"><p class="eyebrow">Ошибка 404</p><h1>Кажется, мы свернули<br>не туда.</h1><p>Этой страницы нет, но гид по Вьетнаму на месте.</p><a class="button" href="/">На главную</a></main></html>`);
console.log(`Сборка готова: dist; тарифов VN: ${plans.length}; индексация: ${indexable}; домен: ${url||'не задан'}.`);
