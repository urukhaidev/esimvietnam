import { readFile, writeFile } from 'node:fs/promises';
const target = new URL('../data/tariffs.json', import.meta.url);
const previous = JSON.parse(await readFile(target, 'utf8'));
if (previous.fetchedAt) throw new Error('Каталог уже загружен. Повторный запрос отключён.');
const token = process.env.ESIM_PARTNER_TOKEN;
if (!token) throw new Error('Укажите ESIM_PARTNER_TOKEN в локальном .env');
const endpoint = 'https://partner.esimtotrip.com/api/v1/products?countries=VN&page=1&per_page=100&sort_by=price&sort_order=asc';
const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(40000) });
if (!response.ok) throw new Error(`Каталог недоступен: HTTP ${response.status}`);
const payload = await response.json();
if (!Array.isArray(payload.data)) throw new Error('Неожиданный формат ответа каталога');
// Сохраняем только поля каталога. Партнёрские цены и ключ не попадают в данные сайта.
const items = payload.data.filter(p => p.available).map(p => ({
  id: p.id, name: p.nameRus || p.name, countryCode: p.country_code,
  data: p.data, validityDays: p.validity_days, duration: p.duration,
  speed: p.speed, tetheringAllowed: p.tethering_allowed, fairUse: p.fair_use,
  coverage: p.coverage, activation: p.activation, topup: p.topup,
  retailRub: p.price?.price_retail_rub, billingUnit: p.price?.billing_unit,
  additionalInfo: p.additional_info
}));
await writeFile(target, JSON.stringify({ status: 'loaded', fetchedAt: new Date().toISOString(), source: endpoint, total: payload.total, page: payload.current_page, lastPage: payload.last_page, items }, null, 2) + '\n');
console.log(`Сохранено доступных тарифов: ${items.length}; всего в каталоге: ${payload.total}; страниц: ${payload.last_page}. Повторных запросов нет.`);
