/**
 * build-seo.js — Генератор SEO-страниц по городам
 *
 * Запуск: node build-seo.js
 *
 * Читает index.html как шаблон, создаёт /{slug}/index.html
 * для каждого города из cities.json с:
 *   - уникальными title / description / og:tags
 *   - canonical URL (относительный)
 *   - Schema.org JSON-LD (WebPage + FAQPage)
 *   - boot-override: применяет координаты города вместо геолокации
 *   - футер: <a> ссылки между городами
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://время-намаза.рф'; // ← ЗАМЕНИТЕ НА СВОЙ ДОМЕН
const METHOD = 14; // Umm al-Qura (по умолчанию в приложении)

const cities = JSON.parse(fs.readFileSync(path.join(__dirname, 'cities.json'), 'utf8'));
const indexHTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

/* ── Slug ↔ name маппинг для ссылок ── */
const slugMap = {};
cities.forEach(c => { slugMap[c.name] = c.slug; });

/* ── Футер с <a> ссылками ── */
function cityFooterHTML(currentSlug) {
    const labels = {
        'Москва': 'Москва',
        'Санкт-Петербург': 'СПб',
        'Казань': 'Казань',
        'Грозный': 'Грозный',
        'Махачкала': 'Махачкала',
        'Уфа': 'Уфа'
    };
    const cityNames = ['Москва', 'Санкт-Петербург', 'Казань', 'Грозный', 'Махачкала', 'Уфа'];
    const lines = cityNames.map(name => {
        const slug = slugMap[name];
        const href = slug === currentSlug ? './' : `../${slug}/`;
        const label = `Время намаза ${labels[name]}`;
        // Если текущая страница — кликабельно и ведёт на этот же город (refresh с корня)
        return `                <a class="ft-link" href="${href}">${label}</a>`;
    });
    return lines.join('\n');
}

/* ── Schema.org JSON-LD ── */
function schemaJSONLD(city) {
    return `    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "${city.title}",
        "description": "${city.description}",
        "url": "${BASE_URL}/${city.slug}/",
        "inLanguage": "ru",
        "isPartOf": {
            "@type": "WebSite",
            "name": "Время намаза",
            "url": "${BASE_URL}"
        },
        "mainEntity": {
            "@type": "FAQPage",
            "mainEntity": [{
                "@type": "Question",
                "name": "Какое время намаза в ${city.genitive} сегодня?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Актуальное время намаза в ${city.genitive}: Фаджр, Шурук, Зухр, Аср, Магриб, Иша. Расписание обновляется автоматически по данным Aladhan API."
                }
            }]
        }
    }
    </script>`;
}

/* ── Boot override скрипт (вставляется ПЕРЕД основным <script>) ── */
function bootOverride(city) {
    return `    <script>
    /* SEO city override — ${city.name}: предзаполняем store до init() */
    try {
        localStorage.setItem('saved_lat', '${city.lat}');
        localStorage.setItem('saved_lon', '${city.lon}');
        localStorage.setItem('saved_city', '${city.name}');
    } catch(e) {}
    </script>`;
}

/* ── Вспомогательная: замена первой строки-шаблона (без regex, работает с \r\n) ── */
function replaceFirst(text, search, replace) {
    const idx = text.indexOf(search);
    if (idx === -1) return text;
    return text.substring(0, idx) + replace + text.substring(idx + search.length);
}

/* ── Генерация одной страницы ── */
function generateCityPage(city) {
    let html = indexHTML;

    // 1. Заменить <title>
    html = replaceFirst(html,
        '<title>Время намаза — расписание молитв онлайн</title>',
        `<title>${city.title}</title>`
    );

    // 2. Заменить meta description
    html = replaceFirst(html,
        'content="Точное время намаза для вашего города. Фаджр, Зухр, Аср, Магриб, Иша. Хадис и аят дня."',
        `content="${city.description}"`
    );

    // 3. Заменить og:title
    html = replaceFirst(html,
        '<meta property="og:title" content="Время намаза — расписание молитв онлайн" />',
        `<meta property="og:title" content="${city.title}" />`
    );

    // 4. Заменить og:description
    html = replaceFirst(html,
        '<meta property="og:description"\n        content="Точное время намаза для вашего города. Фаджр, Зухр, Аср, Магриб, Иша. Хадис и аят дня." />',
        `<meta property="og:description"\n        content="${city.description}" />`
    );

    // 5. Добавить canonical + og:url перед <style>
    const canonicalTag = `    <link rel="canonical" href="${BASE_URL}/${city.slug}/" />\n    <meta property="og:url" content="${BASE_URL}/${city.slug}/" />`;
    html = replaceFirst(html, '    <style>', canonicalTag + '\n    <style>');

    // 6. Добавить Schema.org JSON-LD перед </head>
    html = replaceFirst(html, '</head>', schemaJSONLD(city) + '\n</head>');

    // 7. Добавить boot override ПЕРЕД основным <script> (после toast div)
    const scriptMarker = '    <script>\r\n        /* ══ DATA';
    const scriptMarkerFallback = '    <script>\n        /* ══ DATA';
    if (html.indexOf(scriptMarker) !== -1) {
        html = replaceFirst(html, scriptMarker, bootOverride(city) + scriptMarker);
    } else if (html.indexOf(scriptMarkerFallback) !== -1) {
        html = replaceFirst(html, scriptMarkerFallback, bootOverride(city) + scriptMarkerFallback);
    }

    // 8. Исправить пути в <head>: manifest.json → ../manifest.json, иконки → ../
    html = replaceFirst(html, 'href="manifest.json"', 'href="../manifest.json"');
    html = replaceFirst(html, 'href="icon-192.png"', 'href="../icon-192.png"');
    html = replaceFirst(html, 'href="apple-touch-icon.png"', 'href="../apple-touch-icon.png"');
    html = replaceFirst(html, 'content="icon-512.png"', 'content="../icon-512.png"');

    // 9. Заменить футер: блок городов на <a> ссылки
    // Найдём блок от «Города» до следующего <div class="ft-head">
    const cityBlockStart = '<div class="ft-head">Города</div>';
    const cityBlockEnd = '<div class="ft-head">Информация</div>';
    const ciStart = html.indexOf(cityBlockStart);
    const ciEnd = html.indexOf(cityBlockEnd);
    if (ciStart !== -1 && ciEnd !== -1) {
        const cityBlockLines = cityFooterHTML(city.slug);
        html = html.substring(0, ciStart) + cityBlockStart + '\n' + cityBlockLines + '\n            ' + html.substring(ciEnd);
    }

    // 10. Ссылка «Время намаза» в навигации футера → на главную
    html = replaceFirst(html,
        '<button class="ft-link">Время намаза</button>',
        `<a class="ft-link" href="../">Время намаза</a>`
    );

    return html;
}

/* ── Главная функция ── */
function main() {
    console.log(`Генерация SEO-страниц для ${cities.length} городов...`);

    for (const city of cities) {
        const pageHTML = generateCityPage(city);
        const dir = path.join(__dirname, city.slug);

        // Создать директорию
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const outPath = path.join(dir, 'index.html');
        fs.writeFileSync(outPath, pageHTML, 'utf8');
        console.log(`  ✓ ${city.slug}/index.html — ${city.name}`);
    }

    console.log('\nГотово! Запустите сайт и проверьте /moskva/, /kazan/ и т.д.');
}

main();
