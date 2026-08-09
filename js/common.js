// 複数ページ（頭文字D情報／お気に入り）で使用する共通関数

function escapeHTML(value){
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getItemTitle(item){
    return item.name || item.title || "";
}

function escapeRegExp(value){
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedText(text, keyword){
    const escaped = escapeHTML(text);

    if(!keyword){
        return escaped;
    }

    const pattern = new RegExp(escapeRegExp(keyword), "gi");

    return escaped.replace(pattern, matched => `<mark>${matched}</mark>`);
}

// ==========================
// Xポスト埋め込み
// ==========================

function isTweetUrl(url){
    if(!url){
        return false;
    }

    try{
        const parsed = new URL(url);
        const isXHost = /^(www\.)?(x\.com|twitter\.com)$/.test(parsed.hostname);

        return isXHost && /\/status\/\d+/.test(parsed.pathname);
    }catch(error){
        return false;
    }
}

function createTweetEmbed(url){
    return `
        <blockquote class="twitter-tweet" data-dnt="true">
            <a href="${escapeHTML(url)}"></a>
        </blockquote>
    `;
}

function loadTweetEmbeds(container){
    if(typeof window === "undefined" || !window.twttr || !window.twttr.ready){
        return;
    }

    window.twttr.ready(twttr => {
        twttr.widgets.load(container);
    });
}

// ==========================
// タグ・日付・出典（情報カード共通表示）
// ==========================

function getPrimaryTag(item){
    return Array.isArray(item.tags) && item.tags.length > 0 ? item.tags[0] : "";
}

function parseDateOnly(dateStr){
    if(!dateStr){
        return null;
    }

    const parts = String(dateStr).split("-").map(Number);

    if(parts.length !== 3 || parts.some(part => Number.isNaN(part))){
        return null;
    }

    const [year, month, day] = parts;
    const parsed = new Date(year, month - 1, day);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTodayDateOnly(){
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    return today;
}

function isNewItem(dateStr, thresholdDays){
    const itemDate = parseDateOnly(dateStr);

    if(!itemDate){
        return false;
    }

    const diffDays = Math.floor((getTodayDateOnly() - itemDate) / (1000 * 60 * 60 * 24));

    return diffDays >= 0 && diffDays <= (thresholdDays ?? 3);
}

function isWithinCurrentWeek(dateStr){
    const itemDate = parseDateOnly(dateStr);

    if(!itemDate){
        return false;
    }

    const today = getTodayDateOnly();
    const weekStart = new Date(today);

    weekStart.setDate(today.getDate() - today.getDay());

    const weekEnd = new Date(weekStart);

    weekEnd.setDate(weekStart.getDate() + 6);

    return itemDate >= weekStart && itemDate <= weekEnd;
}

function isWithinCurrentMonth(dateStr){
    const itemDate = parseDateOnly(dateStr);

    if(!itemDate){
        return false;
    }

    const today = new Date();

    return itemDate.getFullYear() === today.getFullYear()
        && itemDate.getMonth() === today.getMonth();
}

function isOngoingEvent(item){
    const start = parseDateOnly(item.eventStart);
    const end = parseDateOnly(item.eventEnd || item.eventStart);

    if(!start || !end){
        return false;
    }

    const today = getTodayDateOnly();

    return today >= start && today <= end;
}

function getDaysUntilEventEnd(item){
    const end = parseDateOnly(item.eventEnd || item.eventStart);

    if(!end){
        return null;
    }

    const diffDays = Math.floor((end - getTodayDateOnly()) / (1000 * 60 * 60 * 24));

    return diffDays;
}

function getEventPeriodLabel(item){
    if(!item.eventStart){
        return "";
    }

    if(item.eventEnd && item.eventEnd !== item.eventStart){
        return `開催期間：${item.eventStart} 〜 ${item.eventEnd}`;
    }

    return `開催期間：${item.eventStart}〜`;
}

function createShareButtons(item){
    if(!item.articleUrl){
        return "";
    }

    const shareUrl = encodeURIComponent(item.articleUrl);
    const shareText = encodeURIComponent(getItemTitle(item) || "頭文字Database");

    return `
        <a class="infoCardLink secondary shareButton" href="https://x.com/intent/tweet?url=${shareUrl}&text=${shareText}" target="_blank" rel="noopener noreferrer">
            🔁 Xでシェア
        </a>
        <a class="infoCardLink secondary shareButton" href="https://social-plugins.line.me/lineit/share?url=${shareUrl}" target="_blank" rel="noopener noreferrer">
            💬 LINEでシェア
        </a>
    `;
}

// ==========================
// カレンダー追加（Googleカレンダー／iCal）
// ==========================

function pad2(value){
    return String(value).padStart(2, "0");
}

function toIcsDateValue(dateStr){
    const date = parseDateOnly(dateStr);

    return date ? `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}` : "";
}

// iCal/Googleカレンダーの終日イベントは終了日が「翌日0時」の排他的表現のため、+1日する
function toExclusiveEndDateValue(dateStr){
    const date = parseDateOnly(dateStr);

    if(!date){
        return "";
    }

    const nextDay = new Date(date);

    nextDay.setDate(nextDay.getDate() + 1);

    return `${nextDay.getFullYear()}${pad2(nextDay.getMonth() + 1)}${pad2(nextDay.getDate())}`;
}

function escapeIcsText(value){
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\n/g, "\\n");
}

function buildGoogleCalendarUrl(item){
    if(!item.eventStart){
        return "";
    }

    const start = toIcsDateValue(item.eventStart);
    const end = toExclusiveEndDateValue(item.eventEnd || item.eventStart);
    const detailsParts = [item.description || "", item.articleUrl || ""].filter(Boolean);
    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: getItemTitle(item),
        dates: `${start}/${end}`,
        details: detailsParts.join("\n")
    });

    return `https://www.google.com/calendar/render?${params.toString()}`;
}

function buildIcsFileContent(item){
    const start = toIcsDateValue(item.eventStart);
    const end = toExclusiveEndDateValue(item.eventEnd || item.eventStart);
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}`
        + `T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
    const descriptionParts = [item.description || "", item.articleUrl || ""].filter(Boolean);

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//InitialDatabase//EventCalendar//JA",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        `UID:initialdatabase-info-${item.id}@initialdatabase.github.io`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${escapeIcsText(getItemTitle(item))}`,
        descriptionParts.length > 0 ? `DESCRIPTION:${escapeIcsText(descriptionParts.join("\n"))}` : "",
        item.articleUrl ? `URL:${escapeIcsText(item.articleUrl)}` : "",
        "END:VEVENT",
        "END:VCALENDAR"
    ].filter(Boolean);

    return lines.join("\r\n");
}

function createCalendarActionsHtml(item){
    if(!item.eventStart){
        return "";
    }

    const googleUrl = buildGoogleCalendarUrl(item);

    return `
        <a class="infoCardLink secondary calendarAddButton" href="${escapeHTML(googleUrl)}" target="_blank" rel="noopener noreferrer">
            📅 Googleカレンダーに追加
        </a>
        <button type="button" class="infoCardLink secondary calendarAddButton" data-ics-download data-ics-item-id="${item.id}">
            🗓️ iCalに追加
        </button>
    `;
}

function findInfoItemById(id){
    if(typeof database === "undefined" || !Array.isArray(database.infos)){
        return null;
    }

    return database.infos.find(entry => entry.id === id) || null;
}

function downloadIcsForItem(item){
    const icsContent = buildIcsFileContent(item);
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `initialdatabase-event-${item.id}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function setupCalendarDownloadDelegation(){
    if(typeof document === "undefined" || document.body.dataset.icsDelegationBound){
        return;
    }

    document.body.dataset.icsDelegationBound = "true";

    document.addEventListener("click", event => {
        const button = event.target.closest("[data-ics-download]");

        if(!button){
            return;
        }

        const item = findInfoItemById(Number(button.dataset.icsItemId));

        if(item){
            downloadIcsForItem(item);
        }
    });
}

function getSourceTypeLabel(url){
    if(isTweetUrl(url)){
        return "𝕏 X投稿";
    }

    if(!url){
        return "";
    }

    try{
        const hostname = new URL(url).hostname.replace(/^www\./, "");

        if(hostname.includes("prtimes.jp")){
            return "📰 プレスリリース";
        }

        return "🔗 外部サイト";
    }catch(error){
        return "🔗 外部サイト";
    }
}

function buildInfoCardBadges(item){
    const badges = [];
    const primaryTag = getPrimaryTag(item);

    if(primaryTag){
        badges.push(`<span class="infoBadge infoBadge--tag">${escapeHTML(primaryTag)}</span>`);
    }

    if(isNewItem(item.date)){
        badges.push(`<span class="infoBadge infoBadge--new">NEW</span>`);
    }

    if(isOngoingEvent(item)){
        const daysLeft = getDaysUntilEventEnd(item);

        if(daysLeft !== null && daysLeft >= 0 && daysLeft <= 7){
            badges.push(`
                <span class="infoBadge infoBadge--ending">
                    ${daysLeft === 0 ? "本日終了" : `あと${daysLeft}日で終了`}
                </span>
            `);
        }
    }

    const sourceTypeLabel = getSourceTypeLabel(item.articleUrl);

    if(sourceTypeLabel){
        badges.push(`<span class="infoBadge infoBadge--source">${escapeHTML(sourceTypeLabel)}</span>`);
    }

    return badges.length > 0 ? `<div class="infoBadges">${badges.join("")}</div>` : "";
}

// ==========================
// 関連情報
// ==========================

function getRelatedItems(item, limit){
    if(typeof database === "undefined" || !Array.isArray(database.infos)){
        return [];
    }

    const tags = Array.isArray(item.tags) ? item.tags : [];

    if(tags.length === 0){
        return [];
    }

    return database.infos
        .filter(other =>
            other.id !== item.id &&
            Array.isArray(other.tags) &&
            other.tags.some(tag => tags.includes(tag))
        )
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
        .slice(0, limit ?? 3);
}

function buildRelatedInfoHtml(item){
    const related = getRelatedItems(item, 3);

    if(related.length === 0){
        return "";
    }

    const linksHtml = related.map(relatedItem => `
        <li>
            <a href="${escapeHTML(relatedItem.articleUrl || "#")}" target="_blank" rel="noopener noreferrer">
                ${escapeHTML(getItemTitle(relatedItem))}
            </a>
        </li>
    `).join("");

    return `
        <div class="relatedInfoSection">
            <p class="relatedInfoLabel">🔗 関連情報</p>
            <ul class="relatedInfoList">
                ${linksHtml}
            </ul>
        </div>
    `;
}

// ==========================
// 情報カード生成（頭文字D情報／お気に入り共通）
// ==========================

function buildInfoCard(item, actionsHtml, extraClassName, highlightTerm, category){
    const cardCategory = category || "infos";
    const isTweet = isTweetUrl(item.articleUrl);
    const badgesHtml = buildInfoCardBadges(item);
    const eventPeriodLabel = getEventPeriodLabel(item);
    const shareButtonsHtml = createShareButtons(item);
    const calendarActionsHtml = createCalendarActionsHtml(item);
    const cardClassNames = ["infoCard", isTweet ? "tweetCard" : "", extraClassName || ""]
        .filter(Boolean)
        .join(" ");
    const readAttrsHtml = `data-read-category="${escapeHTML(cardCategory)}" data-read-id="${item.id}"`;
    const relatedInfoHtml = buildRelatedInfoHtml(item);

    if(isTweet){
        return `
            <article class="${cardClassNames}" ${readAttrsHtml}>

                ${badgesHtml}

                ${createTweetEmbed(item.articleUrl)}

                <div class="infoCardBody">

                    ${eventPeriodLabel ? `<p class="infoCardEventPeriod">${escapeHTML(eventPeriodLabel)}</p>` : ""}

                    ${item.description ? `<p>${renderHighlightedText(item.description, highlightTerm)}</p>` : ""}

                    <div class="infoCardLinks">
                        ${calendarActionsHtml}
                        ${shareButtonsHtml}
                        ${actionsHtml}
                    </div>

                    ${relatedInfoHtml}

                </div>

            </article>
        `;
    }

    const dateLabel = item.date || "";
    const sourceLabel = item.source ? `／ ${escapeHTML(item.source)}` : "";

    return `
        <article class="${cardClassNames}" ${readAttrsHtml}>

            ${item.image ? `
                <img
                    class="infoCardImage"
                    src="${escapeHTML(item.image)}"
                    alt="${escapeHTML(getItemTitle(item))}"
                    loading="lazy">
            ` : ""}

            <div class="infoCardBody">

                ${badgesHtml}

                ${dateLabel || item.source ? `
                    <p class="infoCardDate">${escapeHTML(dateLabel)}${sourceLabel}</p>
                ` : ""}

                <h3>${renderHighlightedText(getItemTitle(item), highlightTerm)}</h3>

                ${eventPeriodLabel ? `<p class="infoCardEventPeriod">${escapeHTML(eventPeriodLabel)}</p>` : ""}

                ${item.description ? `<p>${renderHighlightedText(item.description, highlightTerm)}</p>` : ""}

                <div class="infoCardLinks">
                    ${item.articleUrl ? `
                        <a class="infoCardLink" href="${escapeHTML(item.articleUrl)}" target="_blank" rel="noopener noreferrer">
                            元記事を見る
                        </a>
                    ` : ""}
                    ${calendarActionsHtml}
                    ${shareButtonsHtml}
                    ${actionsHtml}
                </div>

                ${relatedInfoHtml}

            </div>

        </article>
    `;
}

// ==========================
// お気に入り機能
// ==========================

const favoriteCategories = {
    infos: {
        label: "頭文字D情報",
        dataKey: "infos"
    }
};

const favoritesStorageKey = "initialDDatabaseFavorites";

function getFavoriteCategory(category){
    return favoriteCategories[category] || null;
}

function normalizeFavoriteEntry(entry){
    if(!entry || typeof entry !== "object" || !getFavoriteCategory(entry.category)){
        return null;
    }

    const id = Number(entry.id);

    if(!Number.isInteger(id) || id < 1){
        return null;
    }

    return {
        category: entry.category,
        id
    };
}

function getFavoriteStorage(){
    if(typeof window === "undefined"){
        return null;
    }

    try{
        return window.localStorage;
    }catch(error){
        return null;
    }
}

function getFavorites(){
    const storage = getFavoriteStorage();

    if(!storage){
        return [];
    }

    try{
        const saved = storage.getItem(favoritesStorageKey);
        const parsed = saved ? JSON.parse(saved) : [];

        if(!Array.isArray(parsed)){
            return [];
        }

        const keys = new Set();

        return parsed.reduce((favorites, entry) => {
            const normalized = normalizeFavoriteEntry(entry);

            if(!normalized){
                return favorites;
            }

            const key = `${normalized.category}:${normalized.id}`;

            if(!keys.has(key)){
                keys.add(key);
                favorites.push(normalized);
            }

            return favorites;
        }, []);
    }catch(error){
        return [];
    }
}

function saveFavorites(favorites){
    const storage = getFavoriteStorage();

    if(!storage){
        return false;
    }

    try{
        storage.setItem(favoritesStorageKey, JSON.stringify(favorites));
        return true;
    }catch(error){
        return false;
    }
}

function isFavorite(category, id){
    const normalized = normalizeFavoriteEntry({ category, id });

    return normalized
        ? getFavorites().some(favorite =>
            favorite.category === normalized.category && favorite.id === normalized.id
        )
        : false;
}

function toggleFavorite(category, id){
    const normalized = normalizeFavoriteEntry({ category, id });

    if(!normalized){
        return false;
    }

    const favorites = getFavorites();
    const index = favorites.findIndex(favorite =>
        favorite.category === normalized.category && favorite.id === normalized.id
    );
    const nextFavorites = index === -1
        ? favorites.concat(normalized)
        : favorites.filter((favorite, favoriteIndex) => favoriteIndex !== index);

    if(!saveFavorites(nextFavorites)){
        return index !== -1;
    }

    return index === -1;
}

function removeFavorite(category, id){
    const normalized = normalizeFavoriteEntry({ category, id });

    if(!normalized){
        return false;
    }

    return saveFavorites(getFavorites().filter(favorite =>
        favorite.category !== normalized.category || favorite.id !== normalized.id
    ));
}

function getFavoriteItem(favorite){
    const category = getFavoriteCategory(favorite.category);

    if(!category || typeof database === "undefined" || !Array.isArray(database[category.dataKey])){
        return null;
    }

    return database[category.dataKey].find(item => item.id === favorite.id) || null;
}

function createFavoriteButton(category, id){
    const active = isFavorite(category, id);

    return `
        <button
            type="button"
            class="favoriteButton${active ? " is-favorite" : ""}"
            data-favorite-toggle
            data-category="${escapeHTML(category)}"
            data-id="${id}"
            aria-pressed="${active}"
        >
            ${active ? "★ お気に入り解除" : "☆ お気に入りに登録"}
        </button>
    `;
}

function updateFavoriteButton(button, category, id){
    const active = isFavorite(category, id);

    button.textContent = active ? "★ お気に入り解除" : "☆ お気に入りに登録";
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("is-favorite", active);
}

// ==========================
// 既読/未読管理
// ==========================

const readItemsStorageKey = "initialDDatabaseReadItems";

function getReadItemKeySet(){
    const storage = getFavoriteStorage();

    if(!storage){
        return new Set();
    }

    try{
        const saved = storage.getItem(readItemsStorageKey);
        const parsed = saved ? JSON.parse(saved) : [];

        return new Set(Array.isArray(parsed) ? parsed : []);
    }catch(error){
        return new Set();
    }
}

function saveReadItemKeySet(keys){
    const storage = getFavoriteStorage();

    if(!storage){
        return false;
    }

    try{
        storage.setItem(readItemsStorageKey, JSON.stringify(Array.from(keys)));
        return true;
    }catch(error){
        return false;
    }
}

function isItemRead(category, id){
    const normalized = normalizeFavoriteEntry({ category, id });

    return normalized
        ? getReadItemKeySet().has(`${normalized.category}:${normalized.id}`)
        : false;
}

function markItemRead(category, id){
    const normalized = normalizeFavoriteEntry({ category, id });

    if(!normalized){
        return;
    }

    const key = `${normalized.category}:${normalized.id}`;
    const keys = getReadItemKeySet();

    if(keys.has(key)){
        return;
    }

    keys.add(key);
    saveReadItemKeySet(keys);
}

// カードが画面に一定時間（既定1秒）表示されたら既読にする。
// 素早くスクロールして通り過ぎただけでは既読にならないよう、表示が続いた場合のみ確定する。
// 未読のみ表示中でも、既読化した瞬間に一覧から消えてチラつかないよう、
// ここでは一覧の再描画は行わない（次にフィルタ操作をした際に反映される）。
function setupReadTrackingByView(container, dwellMs){
    if(!container){
        return;
    }

    if(typeof window === "undefined" || !("IntersectionObserver" in window)){
        applyReadStateToCards(container);
        return;
    }

    const pendingTimers = new Map();
    const delay = dwellMs ?? 1000;

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const card = entry.target;

            if(entry.isIntersecting){
                if(pendingTimers.has(card)){
                    return;
                }

                const timer = window.setTimeout(() => {
                    pendingTimers.delete(card);

                    const category = card.dataset.readCategory;
                    const id = Number(card.dataset.readId);

                    markItemRead(category, id);
                    card.classList.add("is-read");

                    const newBadge = card.querySelector(".infoBadge--new");

                    if(newBadge){
                        newBadge.remove();
                    }

                    observer.unobserve(card);
                }, delay);

                pendingTimers.set(card, timer);
            }else if(pendingTimers.has(card)){
                window.clearTimeout(pendingTimers.get(card));
                pendingTimers.delete(card);
            }
        });
    }, { threshold: 0.6 });

    container.querySelectorAll("[data-read-id]").forEach(card => {
        if(isItemRead(card.dataset.readCategory, Number(card.dataset.readId))){
            card.classList.add("is-read");
            return;
        }

        observer.observe(card);
    });
}

function applyReadStateToCards(container){
    if(!container){
        return;
    }

    container.querySelectorAll("[data-read-id]").forEach(card => {
        if(isItemRead(card.dataset.readCategory, Number(card.dataset.readId))){
            card.classList.add("is-read");
        }
    });
}

// ==========================
// PWA（Service Worker登録）
// ==========================

function getSiteRootUrl(){
    const script = document.querySelector('script[src$="js/common.js"]');

    if(!script){
        return null;
    }

    return script.src.replace(/js\/common\.js.*$/, "");
}

function registerServiceWorker(){
    if(typeof navigator === "undefined" || !("serviceWorker" in navigator)){
        return;
    }

    const root = getSiteRootUrl();

    if(!root){
        return;
    }

    window.addEventListener("load", () => {
        navigator.serviceWorker.register(`${root}sw.js`, { scope: root }).catch(() => {
            // Service Workerが使えない環境（file://での閲覧など）では何もしない
        });
    });
}

// ==========================
// 構造化データ（ItemList / Event）
// ==========================

function injectListStructuredData(items, elementId){
    if(typeof document === "undefined" || !Array.isArray(items) || items.length === 0){
        return;
    }

    if(document.getElementById(elementId)){
        return;
    }

    const siteUrl = getSiteRootUrl() || "";

    const itemListElements = items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: item.articleUrl || siteUrl,
        name: getItemTitle(item)
    }));

    const eventNodes = items
        .filter(item => item.eventStart)
        .map(item => ({
            "@type": "Event",
            name: getItemTitle(item),
            startDate: item.eventStart,
            endDate: item.eventEnd || item.eventStart,
            description: item.description || "",
            url: item.articleUrl || siteUrl,
            eventAttendanceMode: "https://schema.org/MixedEventAttendanceMode",
            eventStatus: "https://schema.org/EventScheduled"
        }));

    const graphNodes = [
        {
            "@type": "ItemList",
            name: "頭文字D情報",
            itemListElement: itemListElements
        },
        ...eventNodes
    ];

    const script = document.createElement("script");

    script.type = "application/ld+json";
    script.id = elementId;
    script.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": graphNodes });

    document.head.appendChild(script);
}

// ==========================
// ナビゲーション・共通UI
// ==========================

function getCurrentPageFileName(){
    const path = typeof window === "undefined" ? "" : window.location.pathname.replace(/\\/g, "/");
    const fileName = path.split("/").pop();

    return fileName || "index.html";
}

function getNavLinkFileName(link){
    const href = link.getAttribute("href") || "";

    return href.split("/").pop().split("?")[0].split("#")[0] || "index.html";
}

function highlightCurrentNav(){
    const navLinks = document.querySelectorAll("nav a");

    if(navLinks.length === 0){
        return;
    }

    const currentFile = getCurrentPageFileName();

    navLinks.forEach(link => {
        if(getNavLinkFileName(link) === currentFile){
            link.classList.add("is-current");
            link.setAttribute("aria-current", "page");
        }
    });
}

function setupBackToTopButton(){
    if(!document.body || document.getElementById("backToTopButton")){
        return;
    }

    const button = document.createElement("button");

    button.type = "button";
    button.id = "backToTopButton";
    button.className = "backToTopButton";
    button.textContent = "↑ 上部へ";
    button.setAttribute("aria-label", "ページ上部へ戻る");
    button.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const updateVisibility = () => {
        button.classList.toggle("is-visible", (window.scrollY || 0) > 300);
    };

    window.addEventListener("scroll", updateVisibility, { passive: true });
    updateVisibility();
    document.body.appendChild(button);
}

function initializeCommonUI(){
    highlightCurrentNav();
    setupBackToTopButton();
    setupThemeToggle();
    setupCalendarDownloadDelegation();
    registerServiceWorker();
}

function renderLastUpdatedLabel(items, elementId){
    const element = document.getElementById(elementId);

    if(!element || !Array.isArray(items)){
        return;
    }

    const latestDate = items.reduce((latest, item) =>
        item.date && (!latest || item.date > latest) ? item.date : latest
    , "");

    element.textContent = latestDate ? `最終更新：${latestDate}` : "";
}

// ==========================
// ダークモード
// ==========================

const themeStorageKey = "initialDDatabaseTheme";

function getStoredTheme(){
    const storage = getFavoriteStorage();

    if(!storage){
        return "light";
    }

    try{
        return storage.getItem(themeStorageKey) === "dark" ? "dark" : "light";
    }catch(error){
        return "light";
    }
}

function setStoredTheme(theme){
    const storage = getFavoriteStorage();

    if(!storage){
        return;
    }

    try{
        storage.setItem(themeStorageKey, theme);
    }catch(error){
        // 保存できない場合は無視（テーマ切り替え自体は継続）
    }
}

function applyTheme(theme){
    if(typeof document === "undefined" || !document.documentElement){
        return;
    }

    document.documentElement.classList.toggle("theme-dark", theme === "dark");
}

function setupThemeToggle(){
    if(!document.body || document.getElementById("themeToggleButton")){
        return;
    }

    const button = document.createElement("button");
    const currentTheme = getStoredTheme();

    button.type = "button";
    button.id = "themeToggleButton";
    button.className = "themeToggleButton";
    button.setAttribute("aria-label", "ダークモード切り替え");
    button.textContent = currentTheme === "dark" ? "☀️ ライト" : "🌙 ダーク";

    button.addEventListener("click", () => {
        const nextTheme = document.documentElement.classList.contains("theme-dark") ? "light" : "dark";

        applyTheme(nextTheme);
        setStoredTheme(nextTheme);
        button.textContent = nextTheme === "dark" ? "☀️ ライト" : "🌙 ダーク";
    });

    document.body.appendChild(button);
}

if(typeof document !== "undefined"){
    applyTheme(getStoredTheme());
}

if(typeof document !== "undefined" && typeof window !== "undefined"){
    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", initializeCommonUI);
    }else{
        initializeCommonUI();
    }
}
