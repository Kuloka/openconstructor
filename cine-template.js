// Cinematic 3D site, assembled from the hand-made sections in presets-cine.js. Free models can't reliably
// write this level of CSS from scratch, so the AI only writes the content (texts, accent hue, art prompts)
// as JSON and the page is put together here — the polish is guaranteed every time.
import { cinematic } from './presets-cine.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const code = name => cinematic.find(p => p.name === name).code;
const str = (v, d, max = 160) => (typeof v === 'string' && v.trim() ? v.trim() : d).slice(0, max);
const list = (v, n, d) => Array.from({ length: n }, (_, i) => (Array.isArray(v) && v[i] != null ? v[i] : d[i]));
// replace an exact piece of the template; a missing piece is a bug in this file, not in the AI answer
const put = (html, from, to) => { if (!html.includes(from)) throw Error('cine template: missing ' + from.slice(0, 40)); return html.split(from).join(to); };

// what the AI is asked to fill (also the defaults)
export const CINE_SCHEMA = {
  brand: 'Lumen', nav: ['Work', 'Studio', 'Services', 'Contact'], hue: 220,
  label: 'Immersive studio · Since 2011', titleA: 'Immersive experiences.', titleB: 'Lasting impressions.',
  lead: 'We design and build light, motion and LED installations that turn spaces into stories people remember.', cta: 'Start a project',
  heroArt: 'glowing blue neon square floating above dark rocky terrain, cinematic 3d render, dark background, volumetric light',
  statementLabel: 'Vision + Experience', statement: "We don't make screens. We make places people want to stand in — where light, motion and story meet architecture.",
  productsLabel: 'Products', productsTitle: 'Every pixel, engineered for wonder.', productsText: 'Indoor and outdoor LED, large-format LCD and custom shapes — calibrated to the millimetre and built to run for years.',
  products: [['Indoor LED', '0.9 – 2.5 mm'], ['Outdoor LED', 'IP65'], ['Large format LCD', 'up to 110″'], ['Speciality', 'any shape']],
  servicesLabel: 'Services', servicesTitle: 'From first sketch to opening night.', servicesText: 'One team for the whole journey, so the idea you fell in love with is the one that gets built.',
  services: [['Design', 'Concepts, 3D previews and content strategy shaped around your space.'], ['Build', 'Engineering, fabrication and installation by our own crews.'], ['Create', 'Films, generative visuals and interactive moments made in-house.'], ['Support', '24/7 monitoring, content updates and on-site service for years.']],
  featureLabel: 'Case study · Pagani', featureTitle: 'A showroom that breathes.', featureArt: 'luxury car showroom lit by huge glowing led walls, cinematic 3d render, dark, volumetric light',
  casesLabel: 'Vision + Reality', casesTitle: 'Selected work', cases: [['Hospitality · Nashville', 'Gaylord Opryland'], ['Art · Folkestone', 'Triennial light walk'], ['Luxury · Milan', 'Pagani atelier'], ['Real estate · New York', '26th & 2nd lobby']],
  logosLabel: 'Trusted by the brands that shape cities', logos: ['Marriott', 'Hines', 'Pagani', 'Brookfield', 'Hyatt', 'Tishman', 'Aman', 'Related'],
  reply: 'Done — your cinematic 3D site is ready.',
  ctaTitle: "Let's build something unforgettable.", ctaText: "Tell us about your space. We'll come back with an idea within a week.", ctaButton: 'Book a discovery call', email: 'hello@lumen.studio',
};

// rotate every coloured (blue-ish) hex in the CSS to the chosen accent hue; greys stay grey
function hueShift(html, hue){
  const turn = ((hue - 220) % 360 + 360) % 360;
  if (!turn) return html;
  return html.replace(/#([0-9a-f]{6})([0-9a-f]{2})?\b/gi, (all, h, alpha = '') => {
    let [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (d < .08) return all; // grey
    const s = d / (1 - Math.abs(2 * l - 1));
    let H = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; H *= 60;
    if (H < 0) H += 360;
    if (H < 180 || H > 265) return all; // only the blue family of the template
    H = (H + turn) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((H / 60) % 2 - 1)), m = l - c / 2;
    [r, g, b] = H < 60 ? [c, x, 0] : H < 120 ? [x, c, 0] : H < 180 ? [0, c, x] : H < 240 ? [0, x, c] : H < 300 ? [x, 0, c] : [c, 0, x];
    return "#" + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("") + alpha;
  });
}

export function cinePage(raw = {}){
  const D = CINE_SCHEMA, d = raw && typeof raw === 'object' ? raw : {};
  const t = (k, max) => esc(str(d[k], D[k], max));
  const pairs = (k, n) => list(d[k], n, D[k]).map((p, i) => [esc(str(p?.[0], D[k][i][0], 60)), esc(str(p?.[1], D[k][i][1], 160))]);
  const art = k => str(d[k], D[k], 220).replace(/["'()<>\n]/g, ' ');

  const header = `<style>.ci-top{position:absolute;left:0;right:0;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px max(24px,calc(50% - 600px));font:15px system-ui,-apple-system,"Segoe UI",sans-serif;color:#f1f5ff}.ci-top b{font-size:19px;letter-spacing:-.02em;display:flex;align-items:center;gap:10px}.ci-top b i{width:14px;height:14px;border:2px solid #9cc4ff;border-radius:3px;box-shadow:0 0 12px #4d8dff}.ci-top nav{display:flex;gap:28px}.ci-top nav a,.ci-top>a{color:#c3cde3;text-decoration:none}.ci-top nav a:hover{color:#fff}.ci-top>a{padding:9px 18px;border:1px solid #ffffff2e;border-radius:99px;color:#f1f5ff}@media(max-width:760px){.ci-top nav{display:none}}</style><header class="ci-top"><b><i></i>${t('brand', 40)}</b><nav>${list(d.nav, 4, D.nav).map((n, i) => `<a href="#">${esc(str(n, D.nav[i], 24))}</a>`).join('')}</nav><a href="#">${t('cta', 30)}</a></header>`;

  let hero = code('Neon square hero');
  hero = put(hero, '<section class="ci-hero">', `<section class="ci-hero"><img class="ci-art" src="art:${art('heroArt')}" alt="">`);
  hero = put(hero, '.ci-hero small{', '.ci-hero .ci-art{position:absolute;inset:0;z-index:-4;width:100%;height:100%;object-fit:cover;opacity:.55;-webkit-mask:linear-gradient(90deg,transparent,#000 45%);mask:linear-gradient(90deg,transparent,#000 45%)}.ci-hero small{');
  hero = put(hero, 'Immersive studio · Since 2011', t('label', 60));
  hero = put(hero, 'Immersive experiences. <span>Lasting impressions.</span>', `${t('titleA', 60)} <span>${t('titleB', 60)}</span>`);
  hero = put(hero, 'We design and build light, motion and LED installations that turn spaces into stories people remember.', t('lead', 220));
  hero = put(hero, 'Start a project →', `${t('cta', 30)} →`);

  // the statement lights up word group by word group while scrolling (5 groups)
  const words = str(d.statement, D.statement, 260).split(/\s+/), per = Math.ceil(words.length / 5);
  const groups = Array.from({ length: 5 }, (_, i) => words.slice(i * per, (i + 1) * per).join(' ')).filter(Boolean);
  let statement = code('Scroll lit statement');
  statement = put(statement, 'Vision + Experience', t('statementLabel', 60));
  statement = statement.replace(/<p>[\s\S]*<\/p>/, `<p>${groups.map(g => `<span>${esc(g)} </span>`).join('')}</p>`);

  let products = code('Particle cube section');
  products = put(products, '<small>Products</small>', `<small>${t('productsLabel', 40)}</small>`);
  products = put(products, 'Every pixel, engineered for wonder.', t('productsTitle', 80));
  products = put(products, 'Indoor and outdoor LED, large-format LCD and custom shapes — calibrated to the millimetre and built to run for years.', t('productsText', 240));
  products = products.replace(/<ul>[\s\S]*<\/ul>/, `<ul>${pairs('products', 4).map(([a, b]) => `<li>${a} <b>${b}</b></li>`).join('')}</ul>`);

  let services = code('Numbered services');
  services = put(services, '<small>Services</small>', `<small>${t('servicesLabel', 40)}</small>`);
  services = put(services, 'From first sketch<br>to opening night.', t('servicesTitle', 80));
  services = put(services, 'One team for the whole journey, so the idea you fell in love with is the one that gets built.', t('servicesText', 200));
  services = services.replace(/<div class="g">[\s\S]*<\/div><\/section>/, `<div class="g">${pairs('services', 4).map(([a, b], i) => `<div class="s"><span class="n">0${i + 1}</span><h3>${a}</h3><p>${b}</p></div>`).join('')}</div></section>`);

  let feature = code('Scroll zoom media');
  feature = put(feature, '<div class="m">', `<div class="m"><img class="ci-art2" src="art:${art('featureArt')}" alt="">`);
  feature = put(feature, '.ci-zm .m:before{', '.ci-zm .ci-art2{position:absolute;inset:0;z-index:0;width:100%;height:100%;object-fit:cover}.ci-zm .m:before,.ci-zm .m:after{z-index:1}.ci-zm .c{z-index:2!important}.ci-zm .m:before{');
  feature = put(feature, 'Case study · Pagani', t('featureLabel', 60));
  feature = put(feature, 'A showroom that breathes.', t('featureTitle', 80));

  let cases = code('Case study rail');
  cases = put(cases, 'Vision + Reality', t('casesLabel', 40));
  cases = put(cases, '<h2>Selected work</h2>', `<h2>${t('casesTitle', 60)}</h2>`);
  const cs = pairs('cases', 4);
  [['Hospitality · Nashville', 'Gaylord Opryland'], ['Art · Folkestone', 'Triennial light walk'], ['Luxury · Milan', 'Pagani atelier'], ['Real estate · New York', '26th &amp; 2nd lobby']]
    .forEach(([a, b], i) => { cases = put(cases, `<em>${a}</em><b>${b}</b>`, `<em>${cs[i][0]}</em><b>${cs[i][1]}</b>`); });
  cases = put(cases, 'Drag to explore →', '→');

  let logos = code('Logo wall marquee');
  logos = put(logos, 'Trusted by the brands that shape cities', t('logosLabel', 80));
  const names = list(d.logos, 8, D.logos).map((n, i) => esc(str(n, D.logos[i], 24)));
  const row = arr => [...arr, ...arr].map(n => `<b>${n}</b>`).join('');
  logos = logos.replace(/<div class="t">[\s\S]*?<\/div><div class="t">[\s\S]*?<\/div>/, `<div class="t">${row(names)}</div><div class="t">${row([...names].reverse())}</div>`);

  const F = 'font-family:system-ui,-apple-system,"Segoe UI",sans-serif';
  const finale = `<style>.ci-end{position:relative;padding:130px max(24px,calc(50% - 600px)) 40px;background:#03050a;color:#f1f5ff;${F};text-align:center;overflow:hidden;isolation:isolate}.ci-end:before{content:"";position:absolute;left:50%;top:40px;width:700px;height:400px;transform:translateX(-50%);z-index:-1;background:radial-gradient(closest-side,#2f6bff40,transparent);filter:blur(20px)}.ci-end .sq{width:70px;height:70px;margin:0 auto 34px;border:4px solid #9cc4ff;border-radius:4px;box-shadow:0 0 18px #4d8dff,0 0 60px #2f6bff;transform:rotate(12deg);animation:ci-endspin 9s ease-in-out infinite}@keyframes ci-endspin{50%{transform:rotate(-12deg) translateY(-8px)}}.ci-end h2{margin:0 auto 16px;max-width:820px;font-size:clamp(36px,6vw,84px);line-height:.98;letter-spacing:-.045em;font-weight:600}.ci-end p{margin:0 auto 32px;max-width:480px;color:#a9b4cc;line-height:1.65}.ci-end>a{display:inline-flex;padding:17px 30px;border-radius:99px;background:#f1f5ff;color:#03050a;font-weight:650;text-decoration:none;transition:box-shadow .3s}.ci-end>a:hover{box-shadow:0 0 0 6px #4d8dff33,0 0 40px #4d8dff88}.ci-end footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;margin-top:120px;padding-top:24px;border-top:1px solid #ffffff1c;color:#6b7a99;font-size:13px;text-align:left}.ci-end footer a{color:#a9b4cc;text-decoration:none}@media(prefers-reduced-motion:reduce){.ci-end .sq{animation:none}}</style><section class="ci-end"><div class="sq"></div><h2>${t('ctaTitle', 90)}</h2><p>${t('ctaText', 220)}</p><a href="mailto:${t('email', 60)}">${t('ctaButton', 40)}</a><footer><span>© ${new Date().getFullYear()} ${t('brand', 40)}</span><a href="mailto:${t('email', 60)}">${t('email', 60)}</a></footer></section>`;

  const hue = Number.isFinite(+d.hue) ? +d.hue : 220;
  return hueShift(`<div class="ci-page" style="position:relative;width:100%;background:#03050a">${header}${hero}${statement}${products}${services}${feature}${cases}${logos}${finale}</div>`, hue);
}

// the request for the AI: content only, as one JSON object
export const cinePrompt = () => `You write the CONTENT for a cinematic, award-style 3D website. The design is fixed; you only fill in texts and pictures. Reply with ONLY one JSON object (no markdown, no code fences) with exactly these keys:
${JSON.stringify(CINE_SCHEMA)}
Rules: write every text in the language of the user's request and about THEIR business (the example values are only a format sample — never reuse them). Short, confident, premium copy: titleA + titleB form one headline (titleB is the quieter second half), statement is one bold sentence of 15–25 words, products/services/cases each have exactly 4 [title, detail] pairs, logos are 8 plausible client or partner names. hue is the accent colour as a hue angle 0–359 that fits the business (220 blue, 265 violet, 190 cyan, 330 magenta, 30 amber, 150 green). heroArt and featureArt are ENGLISH descriptions of a dramatic 3D render for this business, ending with "cinematic 3d render, dark background, volumetric light". email is a plausible contact address. reply is one short sentence to the user, in their language, saying the site is ready.`;
