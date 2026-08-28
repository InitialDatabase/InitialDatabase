// 複数ページ（頭文字D情報／お気に入り）で使用する共通関数

// ページ遷移時のヒーロー画像チラつき対策（保険処理）
// head内のインラインscriptがsessionStorageに復元対象のスクロール値がある場合のみ
// <html>に"scrollRestorePending"クラスを付与し、本文を一時的に非表示にしている。
// 復元処理自体はこのファイル内の別の場所（restoreNavScrollPosition）で行うが、
// 万一その手前の処理（setupNavToggleなど）でエラーが起きて到達できなかった場合に
// 備え、ここで独立して「読み込み完了時」「一定時間経過後」の両方で必ずクラスを
// 外すようにし、本文が非表示のまま固まらないようにする。
if(typeof document !== "undefined" && typeof window !== "undefined"){
    const revealBodyFailSafe = () => {
        document.documentElement.classList.remove("scrollRestorePending");
    };

    window.addEventListener("load", revealBodyFailSafe);
    window.setTimeout(revealBodyFailSafe, 1500);
}

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
// あいまい検索（表記ゆれ吸収・タイプミス許容）
// ==========================
// ひらがな/カタカナ・全角半角の表記ゆれを吸収し、多少のタイプミスも
// 許容したうえで一致判定を行うための補助関数群。
// 「Java」⇔「ジャバ」のような英単語⇔カタカナの変換には対応していない
// （対応表が必要なため対象外）。

function normalizeForSearch(value){
    if(!value){
        return "";
    }

    // NFKCで全角/半角（英数字・記号）の表記ゆれを吸収したうえで小文字化
    const normalized = String(value).normalize("NFKC").toLowerCase();

    // カタカナをひらがなに統一（ひらがな/カタカナの表記ゆれを吸収）
    return normalized.replace(/[\u30a1-\u30f6]/g, char =>
        String.fromCharCode(char.charCodeAt(0) - 0x60)
    );
}

function levenshteinDistanceWithinLimit(a, b, maxDistance){
    const lengthA = a.length;
    const lengthB = b.length;

    if(Math.abs(lengthA - lengthB) > maxDistance){
        return maxDistance + 1;
    }

    let previousRow = Array.from({ length: lengthB + 1 }, (_, index) => index);

    for(let i = 1; i <= lengthA; i++){
        const currentRow = [i];
        let rowMin = currentRow[0];

        for(let j = 1; j <= lengthB; j++){
            const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;

            const value = Math.min(
                previousRow[j] + 1,
                currentRow[j - 1] + 1,
                previousRow[j - 1] + substitutionCost
            );

            currentRow.push(value);

            if(value < rowMin){
                rowMin = value;
            }
        }

        if(rowMin > maxDistance){
            return maxDistance + 1;
        }

        previousRow = currentRow;
    }

    return previousRow[lengthB];
}

function fuzzyIncludes(normalizedHaystack, normalizedNeedle){
    if(!normalizedNeedle){
        return true;
    }

    if(normalizedHaystack.includes(normalizedNeedle)){
        return true;
    }

    // 短い語句はタイプミス許容の対象外（誤ヒットを防ぐため）
    // 例：「涼介」（2文字）で許容編集距離1にすると、「介」や「涼」の1文字だけが
    // どこかに含まれる（例：「紹介」）だけで一致してしまう。
    // また「高橋涼介」（4文字）でも、1文字違いの「高橋啓介」（涼→啓）が
    // 編集距離1以内として一致してしまう。日本語の人名・固有名詞は
    // 1文字違うだけで別人・別物を指すことが多く、タイプミスとして
    // 許容すべきケースではないため、4文字以下は完全な部分一致
    // （上のincludesチェック）のみで判定する。
    if(normalizedNeedle.length <= 4){
        return false;
    }

    const maxDistance = normalizedNeedle.length <= 5 ? 1 : 2;
    const minWindow = Math.max(1, normalizedNeedle.length - maxDistance);
    const maxWindow = normalizedNeedle.length + maxDistance;

    for(let size = minWindow; size <= maxWindow; size++){
        for(let start = 0; start + size <= normalizedHaystack.length; start++){
            const segment = normalizedHaystack.substr(start, size);

            if(levenshteinDistanceWithinLimit(segment, normalizedNeedle, maxDistance) <= maxDistance){
                return true;
            }
        }
    }

    return false;
}

// mode省略時・"partial"時は部分一致（表記ゆれ・タイプミス許容）で判定する。
// mode="exact"の場合は、タイトル・タグなど項目のいずれかが検索語と完全に
// 一致した場合のみヒットとする（表記ゆれの吸収のみ行い、タイプミスは許容しない）。
function matchesSearchKeyword(fieldValues, keyword, mode){
    const normalizedKeyword = normalizeForSearch(keyword);

    if(!normalizedKeyword){
        return true;
    }

    const normalizedFields = fieldValues.filter(Boolean).map(normalizeForSearch);

    if(mode === "exact"){
        return normalizedFields.some(value => value === normalizedKeyword);
    }

    return fuzzyIncludes(normalizedFields.join(" "), normalizedKeyword);
}

// ==========================
// 検索モード（部分一致／完全一致）の切り替えUI
// ==========================
// キーワード検索ボックスのそばに「部分一致／完全一致」の切り替えボタンを描画する。
// 選択状態はサイト内共通でlocalStorageに保存し、どのページでも直前の選択を引き継ぐ。

const searchModeStorageKey = "initialDDatabaseSearchMode";

function getStoredSearchMode(){
    const storage = getFavoriteStorage();

    if(!storage){
        return "partial";
    }

    try{
        return storage.getItem(searchModeStorageKey) === "exact" ? "exact" : "partial";
    }catch(error){
        return "partial";
    }
}

function setStoredSearchMode(mode){
    const storage = getFavoriteStorage();

    if(!storage){
        return;
    }

    try{
        storage.setItem(searchModeStorageKey, mode);
    }catch(error){
        // 保存できない場合は無視（切り替え自体は継続）
    }
}

// containerId要素の中に切り替えボタンを描画し、初期モードを返す。
// onChangeにはボタン操作で選択されたモード（"partial" | "exact"）が渡される。
function setupSearchModeToggle(containerId, onChange){
    const initialMode = getStoredSearchMode();
    const container = document.getElementById(containerId);

    if(!container){
        return initialMode;
    }

    container.innerHTML = `
        <span class="infoFilterLabel">検索方法：</span>
        <button type="button" class="infoFilterButton${initialMode === "partial" ? " is-active" : ""}" data-searchmode="partial">部分一致</button>
        <button type="button" class="infoFilterButton${initialMode === "exact" ? " is-active" : ""}" data-searchmode="exact">完全一致</button>
    `;

    container.querySelectorAll("[data-searchmode]").forEach(button => {
        button.addEventListener("click", () => {
            const mode = button.dataset.searchmode;

            if(button.classList.contains("is-active")){
                return;
            }

            container.querySelectorAll("[data-searchmode]").forEach(b =>
                b.classList.toggle("is-active", b === button)
            );

            setStoredSearchMode(mode);
            onChange(mode);
        });
    });

    return initialMode;
}

// ==========================
// 表示密度（カード表示／コンパクトリスト表示）の切り替えUI
// ==========================
// 最新情報一覧の表示形式を切り替えるボタンを描画する。117件を超える情報を
// 大きなカードで流し読みすると縦に長くなりすぎるため、タイトル・日付・バッジだけの
// 1行リスト表示に切り替えられるようにしたもの。選択状態はサイト内共通でlocalStorageに
// 保存し、次回訪問時も直前の選択を引き継ぐ（検索方法の切り替えと同じ仕組み）。

const displayDensityStorageKey = "initialDDatabaseDisplayDensity";

function getStoredDisplayDensity(){
    const storage = getFavoriteStorage();

    if(!storage){
        return "card";
    }

    try{
        return storage.getItem(displayDensityStorageKey) === "compact" ? "compact" : "card";
    }catch(error){
        return "card";
    }
}

function setStoredDisplayDensity(density){
    const storage = getFavoriteStorage();

    if(!storage){
        return;
    }

    try{
        storage.setItem(displayDensityStorageKey, density);
    }catch(error){
        // 保存できない場合は無視（切り替え自体は継続）
    }
}

// containerId要素の中に切り替えボタンを描画し、初期の表示形式（"card" | "compact"）を返す。
// onChangeにはボタン操作で選択された表示形式が渡される。
function setupDisplayDensityToggle(containerId, onChange){
    const initialDensity = getStoredDisplayDensity();
    const container = document.getElementById(containerId);

    if(!container){
        return initialDensity;
    }

    container.innerHTML = `
        <span class="infoFilterLabel">表示：</span>
        <button
            type="button"
            class="infoFilterButton${initialDensity === "card" ? " is-active" : ""}"
            data-density="card"
            aria-pressed="${initialDensity === "card"}">
            🗂️ カード
        </button>
        <button
            type="button"
            class="infoFilterButton${initialDensity === "compact" ? " is-active" : ""}"
            data-density="compact"
            aria-pressed="${initialDensity === "compact"}">
            📋 リスト
        </button>
    `;

    container.querySelectorAll("[data-density]").forEach(button => {
        button.addEventListener("click", () => {
            const density = button.dataset.density;

            if(button.classList.contains("is-active")){
                return;
            }

            container.querySelectorAll("[data-density]").forEach(b => {
                b.classList.toggle("is-active", b === button);
                b.setAttribute("aria-pressed", String(b === button));
            });

            setStoredDisplayDensity(density);
            onChange(density);
        });
    });

    return initialDensity;
}

// ==========================
// 「🔥 まもなく終了」セクションの表示/非表示切り替え
// ==========================
// ユーザーが手動で閉じた状態をサイト内共通でlocalStorageに保存し、
// 次回訪問時も非表示のままにする。

const endingSoonHiddenStorageKey = "initialDDatabaseEndingSoonHidden";

function getStoredEndingSoonHidden(){
    const storage = getFavoriteStorage();

    if(!storage){
        return true;
    }

    try{
        const saved = storage.getItem(endingSoonHiddenStorageKey);

        // 未設定（初回訪問など）の場合はデフォルトで非表示にしておく
        if(saved === null){
            return true;
        }

        return saved === "1";
    }catch(error){
        return true;
    }
}

function setStoredEndingSoonHidden(hidden){
    const storage = getFavoriteStorage();

    if(!storage){
        return;
    }

    try{
        storage.setItem(endingSoonHiddenStorageKey, hidden ? "1" : "0");
    }catch(error){
        // 保存できない場合は無視（切り替え自体は継続）
    }
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
        <blockquote class="twitter-tweet" data-dnt="true" data-conversation="none">
            <a href="${escapeHTML(url)}"></a>
        </blockquote>
    `;
}

// 画面内（またはその手前）に入ったツイートだけを順次埋め込む。
// 一覧に並ぶ全ツイートを一度に読み込むと、初期表示が大きく遅くなるため。
function loadTweetEmbeds(container){
    if(typeof window === "undefined" || !container){
        return;
    }

    const blockquotes = container.querySelectorAll(".twitter-tweet:not([data-embed-requested])");

    if(blockquotes.length === 0){
        return;
    }

    const requestEmbed = element => {
        if(element.dataset.embedRequested){
            return;
        }

        element.dataset.embedRequested = "true";

        if(!window.twttr || !window.twttr.ready){
            return;
        }

        window.twttr.ready(twttr => {
            twttr.widgets.load(element);
        });
    };

    if(typeof IntersectionObserver === "undefined"){
        // 未対応ブラウザ向けフォールバック：まとめて読み込む
        blockquotes.forEach(requestEmbed);
        return;
    }

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if(!entry.isIntersecting){
                return;
            }

            requestEmbed(entry.target);
            observer.unobserve(entry.target);
        });
    }, {
        // 画面に入る少し手前から読み込みを開始し、スクロール時の待ち時間を減らす
        rootMargin: "600px 0px"
    });

    blockquotes.forEach(blockquote => observer.observe(blockquote));
}

// ==========================
// 開催地（都道府県・地方）
// ==========================
//
// 47都道府県すべてを個別にタグ付けできるようにしつつ、フィルターUIが
// かさばらないよう「地方」単位の少ないボタン数をデフォルト表示にし、
// 都道府県まで指定したい場合だけ展開できるようにするための対応表。
// itemには prefecture:["群馬県"] のように都道府県名（配列）だけを持たせれば、
// 地方（例：関東）は下記のマップから自動的に導き出される。

const PREFECTURES_BY_REGION = {
    "北海道":["北海道"],
    "東北":["青森県","岩手県","宮城県","秋田県","山形県","福島県"],
    "関東":["茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県"],
    "甲信越":["新潟県","山梨県","長野県"],
    "北陸":["富山県","石川県","福井県"],
    "東海":["岐阜県","静岡県","愛知県","三重県"],
    "関西":["滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県"],
    "中国":["鳥取県","島根県","岡山県","広島県","山口県"],
    "四国":["徳島県","香川県","愛媛県","高知県"],
    "九州・沖縄":["福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"]
};

const REGION_LIST = Object.keys(PREFECTURES_BY_REGION);

const PREFECTURE_TO_REGION = Object.entries(PREFECTURES_BY_REGION).reduce((map, [region, prefs]) => {
    prefs.forEach(pref => { map[pref] = region; });
    return map;
}, {});

// itemが該当する都道府県一覧
function getItemPrefectures(item){
    return Array.isArray(item.prefecture) ? item.prefecture : [];
}

// itemが該当する地方一覧（都道府県から自動導出、重複除去）
function getItemRegions(item){
    const regions = getItemPrefectures(item)
        .map(pref => PREFECTURE_TO_REGION[pref])
        .filter(Boolean);

    return Array.from(new Set(regions));
}

// ==========================
// グッズのサブカテゴリ
// ==========================
//
// tags:["グッズ"] が付いた情報のうち、さらに細かい種類がわかっているものには
// goodsCategory:"ミニカー" のように1つだけ値を持たせる（該当なしはフィールド自体を省略）。
// 「グッズ」タグを選んだ時だけ、このサブカテゴリで絞り込めるボタン群を表示する。

const GOODS_CATEGORY_LIST = ["フィギュア","ミニカー","アパレル","時計","書籍","食品","雑貨"];

// itemのグッズサブカテゴリ（未設定ならnull）
function getItemGoodsCategory(item){
    return typeof item.goodsCategory === "string" && GOODS_CATEGORY_LIST.includes(item.goodsCategory)
        ? item.goodsCategory
        : null;
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

    if(!start){
        return false;
    }

    const today = getTodayDateOnly();

    if(today < start){
        return false;
    }

    // 終了日が未入力の場合は「終了時期未定でまだ開催中」として扱う
    const end = parseDateOnly(item.eventEnd);

    if(end && today > end){
        return false;
    }

    return true;
}

// ==========================
// カレンダー用：開催期間／予約期間の対象日判定
// ==========================
// item.eventStart（開催開始日・発売日）があればそれを起点とした開催期間、
// なければitem.reservationStart（予約開始日）を起点とした予約期間として扱う。
// 終了日（item.eventEnd）が未入力の場合は、isOngoingEvent()と同じルールで
// 「終了日が判明するまで対象期間が続く」ものとみなす。
// カレンダー機能（calendar.js）はこの関数を必ず経由して判定を行うことで、
// 頭文字D情報ページ側の「終了日未定＝開催中」ルールと表示がズレないようにする。

function getEventCalendarRangeStart(item){
    return parseDateOnly(item.eventStart || item.reservationStart);
}

function isDateWithinEventRange(item, date){
    const start = getEventCalendarRangeStart(item);

    if(!start || date < start){
        return false;
    }

    const end = parseDateOnly(item.eventEnd);

    return !end || date <= end;
}

// ==========================
// ステータス絞り込み（発売前／予約開始／開催中／終了済み）
// ==========================
// item.reservationStart（予約開始日）／item.eventStart（発売日・開催開始日）／
// item.eventEnd（終了日）の3つの任意フィールドから、4区分のステータスを判定する。
// いずれのフィールドも持たない情報（通常のグッズ紹介など）は対象外としてnullを返す。

function getItemEventStatus(item){
    const reservationStart = parseDateOnly(item.reservationStart);
    const eventStart = parseDateOnly(item.eventStart);
    // 終了日が未入力の場合は「終了済み」と判定しない（終了時期未定として開催中扱い）
    const eventEnd = parseDateOnly(item.eventEnd);

    if(!reservationStart && !eventStart){
        return null;
    }

    const today = getTodayDateOnly();

    if(eventEnd && today > eventEnd){
        return "ended";
    }

    if(eventStart && today >= eventStart){
        return "ongoing";
    }

    if(reservationStart && today >= reservationStart){
        return "reservation";
    }

    return "before";
}

function getEventStatusLabel(status){
    switch(status){
        case "before":
            return "発売前";
        case "reservation":
            return "予約開始";
        case "ongoing":
            return "開催中";
        case "ended":
            return "終了済み";
        default:
            return "";
    }
}

function getDaysUntilEventEnd(item){
    // 終了日が未入力の場合は残り日数を計算しない（未定のため）
    const end = parseDateOnly(item.eventEnd);

    if(!end){
        return null;
    }

    const diffDays = Math.floor((end - getTodayDateOnly()) / (1000 * 60 * 60 * 24));

    return diffDays;
}

// "2026-08-23" のような日付文字列を「8/23」の短い表記に変換する（年は省略）
function formatShortDate(dateStr){
    const parsed = parseDateOnly(dateStr);

    if(!parsed){
        return "";
    }

    return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
}

// "2026-08-23" のような日付文字列を、一覧の日付区切り見出し用に「8月23日」の表記へ変換する。
// 今日と年が異なる場合（年をまたいだ古い情報を見返す場合など）は「2025年8月23日」のように
// 年も付ける。不正な形式の場合は空文字を返す
function formatDateHeadingLabel(dateStr){
    const parsed = parseDateOnly(dateStr);

    if(!parsed){
        return "";
    }

    const yearLabel = parsed.getFullYear() !== getTodayDateOnly().getFullYear()
        ? `${parsed.getFullYear()}年`
        : "";

    return `${yearLabel}${parsed.getMonth() + 1}月${parsed.getDate()}日`;
}

// ==========================
// 過去の関連情報グループ化（eventGroupId）
// ==========================
// 同じeventGroupIdを持つ投稿（同一の出来事についての一連の投稿）を1件の代表投稿にまとめる。
// 代表は投稿日(date)が最も新しいものとし、それ以外は過去の関連情報として日付の新しい順に格納する。
// eventGroupIdを持たない投稿はそのまま{item, related:[]}として扱う。
// 渡された配列の並び順はなるべく保たれる（各グループは、そのグループの投稿が
// 配列中で最初に出現した位置にまとめて挿入される）。呼び出し側で新着順・古い順の
// 並び替えと組み合わせたい場合は、必ず「新着順」に並べた配列を渡してから、
// 結果の配列をまとめて反転させること（新着順の並びであれば、各グループの代表＝
// 最新の投稿が必ずそのグループの中で最初に出現するため、挿入位置と代表の位置が一致する）。
// イベントカレンダー（calendar.js）と頭文字D情報の最新情報一覧（info.js）で共用する。
function dedupeByEventGroup(items){
    const membersByGroup = new Map();

    items.forEach(item => {
        if(!item.eventGroupId){
            return;
        }

        if(!membersByGroup.has(item.eventGroupId)){
            membersByGroup.set(item.eventGroupId, []);
        }

        membersByGroup.get(item.eventGroupId).push(item);
    });

    const renderedGroups = new Set();
    const entries = [];

    items.forEach(item => {
        if(!item.eventGroupId){
            entries.push({ item, related: [] });
            return;
        }

        if(renderedGroups.has(item.eventGroupId)){
            return;
        }

        renderedGroups.add(item.eventGroupId);

        const members = [...membersByGroup.get(item.eventGroupId)]
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

        const representative = members[0];
        const related = members.slice(1);

        entries.push({ item: representative, related });
    });

    return entries;
}

// 「🔗 過去の関連情報N件」のような開閉ボタンのクリックを親要素で一括処理する。
// 一覧は再描画のたびに作り直されるため、ボタン1つ1つにリスナーを付けるのではなく、
// 親要素へのイベント委任にしている。toggleSelectorには対象ボタンのクラス名を指定する
// （例：".eventCalendarRelatedToggle"、".infoCardGroupToggle"）
function setupRelatedToggleDelegation(container, toggleSelector){
    if(!container){
        return;
    }

    container.addEventListener("click", event => {
        const toggle = event.target.closest(toggleSelector);

        if(!toggle){
            return;
        }

        const relatedList = toggle.nextElementSibling;

        if(!relatedList){
            return;
        }

        const willShow = relatedList.hidden;
        relatedList.hidden = !willShow;
        toggle.setAttribute("aria-expanded", String(willShow));
    });
}

// buildInfoCard（カード表示）専用：同じeventGroupIdの過去の関連情報一覧を開閉ボタン付きで組み立てる。
// buildInfoCompactRow（コンパクトリスト表示）は行全体がリンクになっており、
// ボタンを入れ子にできないため使用しない（件数はバッジ表示のみに留める）
function buildEventGroupListHtml(relatedItems){
    if(!Array.isArray(relatedItems) || relatedItems.length === 0){
        return "";
    }

    return `
        <button type="button" class="infoCardGroupToggle" aria-expanded="false">🔗 過去の関連情報${relatedItems.length}件</button>
        <ul class="infoCardGroupList" hidden>
            ${relatedItems.map(relatedItem => `
                <li>
                    <span class="infoCardGroupDot" aria-hidden="true"></span>
                    <div class="infoCardGroupContent">
                        <a href="${escapeHTML(relatedItem.articleUrl || "#")}" target="_blank" rel="noopener noreferrer">
                            ${escapeHTML(getItemTitle(relatedItem))}
                        </a>
                        <span class="infoCardGroupDate">${escapeHTML(relatedItem.date || "")}</span>
                    </div>
                </li>
            `).join("")}
        </ul>
    `;
}

// item.expectedDate（"2026-12"のような年月文字列）を「2026年12月ごろ」の表記に変換する。
// 形式が不正な場合は空文字を返す
function formatExpectedDateLabel(expectedDate){
    const match = /^(\d{4})-(\d{2})$/.exec(expectedDate || "");

    if(!match){
        return "";
    }

    return `${match[1]}年${Number(match[2])}月ごろ`;
}

function getEventPeriodLabel(item){
    if(item.eventStart){
        if(item.eventEnd && item.eventEnd !== item.eventStart){
            return `開催期間：${item.eventStart} 〜 ${item.eventEnd}`;
        }

        if(item.eventEnd){
            return `開催期間：${item.eventStart}`;
        }

        // 終了日が未入力の場合は、いつまで続くか分からない状態であることを明示する
        return `開催期間：${item.eventStart}〜（終了日未定）`;
    }

    if(item.reservationStart){
        const base = `予約開始：${item.reservationStart}〜`;

        // dateTBD:true（正確な発売日は未定）の場合、expectedDateがあれば
        // 「発売時期の目安」としておおよその時期を併記する
        if(item.dateTBD && item.expectedDate){
            const expectedLabel = formatExpectedDateLabel(item.expectedDate);
            return expectedLabel ? `${base}（発売時期の目安：${expectedLabel}）` : base;
        }

        return base;
    }

    return "";
}

function createShareButtons(item){
    if(!item.articleUrl){
        return "";
    }

    const shareUrl = encodeURIComponent(item.articleUrl);
    const shareTitle = getItemTitle(item) || "頭文字Database";
    const shareText = encodeURIComponent(shareTitle);

    // スマホなどWeb Share API対応環境では、タップで端末標準の共有シートを直接呼び出す
    // 単独の「共有」ボタン1つにまとめる。createShareButtons自体がブラウザ上（クライアント側）
    // でのみ実行されるため、呼び出し時点でnavigator.shareの有無を判定できる
    const canUseWebShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

    if(canUseWebShare){
        return `
            <button type="button" class="infoCardLink secondary shareButton" data-web-share data-share-url="${escapeHTML(item.articleUrl)}" data-share-title="${escapeHTML(shareTitle)}" aria-label="共有">
                <span class="shareButtonIcon" aria-hidden="true">📤</span> <span class="shareButtonLabel">共有</span><span class="shareButtonLabelShort" aria-hidden="true">共有</span>
            </button>
        `;
    }

    // Web Share API非対応環境（主にPC）向け：単独の「共有」ボタンを押すと、
    // その場でX／LINE／リンクコピーの選択肢を小さなメニューで表示する
    return `
        <div class="shareMenu" data-share-menu>
            <button type="button" class="infoCardLink secondary shareButton" data-share-menu-toggle aria-haspopup="true" aria-expanded="false" aria-label="共有">
                <span class="shareButtonIcon" aria-hidden="true">📤</span> <span class="shareButtonLabel">共有</span><span class="shareButtonLabelShort" aria-hidden="true">共有</span>
            </button>
            <div class="shareMenuPanel" role="menu" hidden>
                <a class="shareMenuItem" role="menuitem" href="https://x.com/intent/tweet?url=${shareUrl}&text=${shareText}" target="_blank" rel="noopener noreferrer">
                    <span class="shareMenuItemIcon" aria-hidden="true">🔁</span>Xでシェア
                </a>
                <a class="shareMenuItem" role="menuitem" href="https://social-plugins.line.me/lineit/share?url=${shareUrl}" target="_blank" rel="noopener noreferrer">
                    <span class="shareMenuItemIcon" aria-hidden="true">💬</span>LINEでシェア
                </a>
                <button type="button" class="shareMenuItem" role="menuitem" data-copy-link data-share-url="${escapeHTML(item.articleUrl)}">
                    <span class="shareMenuItemIcon" aria-hidden="true">🔗</span>リンクをコピー
                </button>
            </div>
        </div>
    `;
}

// ==========================
// 共有ボタン（Web Share API／リンクコピー）のイベント処理
// ==========================

function copyTextToClipboard(text){
    if(navigator.clipboard && typeof navigator.clipboard.writeText === "function"){
        return navigator.clipboard.writeText(text);
    }

    // Clipboard APIが使えない環境（非HTTPS等）向けのフォールバック
    return new Promise((resolve, reject) => {
        const textarea = document.createElement("textarea");

        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        try{
            document.execCommand("copy");
            resolve();
        }catch(error){
            reject(error);
        }finally{
            textarea.remove();
        }
    });
}

function showShareButtonFeedback(button, icon, label){
    if(button.dataset.feedbackActive){
        return;
    }

    const originalHtml = button.innerHTML;
    // 共有メニュー（X／LINE／リンクコピーのポップアップ）内のボタンかどうかで、
    // フィードバック表示に使うアイコン／ラベルの構造を合わせる
    const isMenuItem = button.classList.contains("shareMenuItem");

    button.dataset.feedbackActive = "true";
    button.classList.add("isCopied");
    button.innerHTML = isMenuItem
        ? `<span class="shareMenuItemIcon" aria-hidden="true">${icon}</span>${label}`
        // アイコン／ラベルの構造を保つことで、スマホのアイコンのみ表示中でも
        // フィードバックのアイコンだけはきちんと表示される
        : `<span class="shareButtonIcon" aria-hidden="true">${icon}</span> <span class="shareButtonLabel">${label}</span>`;

    setTimeout(() => {
        button.innerHTML = originalHtml;
        button.classList.remove("isCopied");
        delete button.dataset.feedbackActive;

        // 共有メニュー内のリンクコピーの場合は、フィードバック表示後にメニューも閉じる
        if(isMenuItem){
            closeAllShareMenus();
        }
    }, 2000);
}

function setupShareDelegation(){
    if(typeof document === "undefined" || document.body.dataset.shareDelegationBound){
        return;
    }

    document.body.dataset.shareDelegationBound = "true";

    document.addEventListener("click", event => {
        const menuToggle = event.target.closest("[data-share-menu-toggle]");

        if(menuToggle){
            const panel = menuToggle.nextElementSibling;
            const isOpen = panel && !panel.hidden;

            closeAllShareMenus();

            if(panel && !isOpen){
                panel.hidden = false;
                menuToggle.setAttribute("aria-expanded", "true");
            }

            return;
        }

        // メニューの外側をクリックしたら、開いている共有メニューを閉じる
        if(!event.target.closest("[data-share-menu]")){
            closeAllShareMenus();
        }

        const webShareButton = event.target.closest("[data-web-share]");

        if(webShareButton){
            const url = webShareButton.dataset.shareUrl;
            const title = webShareButton.dataset.shareTitle || "頭文字Database";

            if(url && navigator.share){
                // ユーザーによる共有キャンセル等のエラーは無視する
                navigator.share({ title, url }).catch(() => {});
            }

            return;
        }

        const copyButton = event.target.closest("[data-copy-link]");

        if(!copyButton){
            return;
        }

        const url = copyButton.dataset.shareUrl;

        if(!url){
            return;
        }

        copyTextToClipboard(url)
            .then(() => showShareButtonFeedback(copyButton, "✅", "コピーしました"))
            .catch(() => showShareButtonFeedback(copyButton, "⚠️", "コピーに失敗しました"));
    });

    // Escキーでも開いている共有メニューを閉じられるようにする
    document.addEventListener("keydown", event => {
        if(event.key === "Escape"){
            closeAllShareMenus();
        }
    });
}

// 開いている共有メニュー（X／LINE／リンクコピーのポップアップ）をすべて閉じる
function closeAllShareMenus(){
    if(typeof document === "undefined"){
        return;
    }

    document.querySelectorAll("[data-share-menu-toggle]").forEach(toggle => {
        const panel = toggle.nextElementSibling;

        if(panel && !panel.hidden){
            panel.hidden = true;
            toggle.setAttribute("aria-expanded", "false");
        }
    });
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

function buildIcsEventLines(item){
    const start = toIcsDateValue(item.eventStart);
    const end = toExclusiveEndDateValue(item.eventEnd || item.eventStart);
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}`
        + `T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
    const descriptionParts = [item.description || "", item.articleUrl || ""].filter(Boolean);

    return [
        "BEGIN:VEVENT",
        `UID:initialdatabase-info-${item.id}@initialdatabase.github.io`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${escapeIcsText(getItemTitle(item))}`,
        descriptionParts.length > 0 ? `DESCRIPTION:${escapeIcsText(descriptionParts.join("\n"))}` : "",
        item.articleUrl ? `URL:${escapeIcsText(item.articleUrl)}` : "",
        "END:VEVENT"
    ].filter(Boolean);
}

function buildIcsFileContent(item){
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//InitialDatabase//EventCalendar//JA",
        "CALSCALE:GREGORIAN",
        ...buildIcsEventLines(item),
        "END:VCALENDAR"
    ];

    return lines.join("\r\n");
}

// 複数イベントをまとめて1つの.icsファイルにする（カレンダーページの一括エクスポート用）。
// eventStartを持たない情報（予約中のみの情報など）は対象外にする
function buildIcsFileContentForItems(items){
    const targetItems = items.filter(item => Boolean(item.eventStart));

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//InitialDatabase//EventCalendar//JA",
        "CALSCALE:GREGORIAN",
        ...targetItems.flatMap(buildIcsEventLines),
        "END:VCALENDAR"
    ];

    return lines.join("\r\n");
}

function createCalendarActionsHtml(item){
    if(!item.eventStart){
        return "";
    }

    const googleUrl = buildGoogleCalendarUrl(item);

    // アイコン・正式ラベル・短縮ラベルを別要素にしておくことで、スマホ幅では
    // 共有ボタン群と同様に正式ラベルを隠し、代わりにアイコン＋短縮ラベル
    // （「Google」「iCal」）を縦に並べたコンパクトなボタンに切り替えられるようにする
    // （CSS側で制御。カレンダーページの一覧（.eventCalendarActions）ではこの正式
    // ラベルは引き続き表示されるので、そちらの見た目には影響しない）
    return `
        <a class="infoCardLink secondary calendarAddButton" href="${escapeHTML(googleUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Googleカレンダーに追加">
            <span class="shareButtonIcon" aria-hidden="true">📅</span> <span class="shareButtonLabel">Googleカレンダーに追加</span><span class="shareButtonLabelShort" aria-hidden="true">Google</span>
        </a>
        <button type="button" class="infoCardLink secondary calendarAddButton" data-ics-download data-ics-item-id="${item.id}" aria-label="iCalに追加">
            <span class="shareButtonIcon" aria-hidden="true">🗓️</span> <span class="shareButtonLabel">iCalに追加</span><span class="shareButtonLabelShort" aria-hidden="true">iCal</span>
        </button>
    `;
}

function findInfoItemById(id){
    if(typeof database === "undefined" || !Array.isArray(database.infos)){
        return null;
    }

    return database.infos.find(entry => entry.id === id) || null;
}

function downloadIcsBlob(icsContent, filename){
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function downloadIcsForItem(item){
    downloadIcsBlob(buildIcsFileContent(item), `initialdatabase-event-${item.id}.ics`);
}

// 「今表示されている開催中イベント」をまとめて1つの.icsファイルでダウンロードする
// （カレンダーページの一括エクスポートボタンから呼び出される）
function downloadIcsForItems(items, filename){
    downloadIcsBlob(buildIcsFileContentForItems(items), filename || "initialdatabase-events.ics");
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
        return "";
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

function buildInfoCardBadges(item, category, options){
    const opts = options || {};
    const badges = [];
    const primaryTag = getPrimaryTag(item);

    // お気に入り／未読は「カードを見た瞬間に情報の性質が分かる」ことを目的に、
    // 最も目につきやすい先頭に表示する。お気に入り一覧ページ（全件お気に入り済み）
    // では冗長なので、hideFavoriteBadgeで非表示にできる。
    if(!opts.hideFavoriteBadge && category && isFavorite(category, item.id)){
        badges.push(`<span class="infoBadge infoBadge--favorite" data-favorite-badge>⭐ お気に入り</span>`);
    }

    if(category && !isItemRead(category, item.id)){
        badges.push(`<span class="infoBadge infoBadge--unread">👀 未読</span>`);
    }

    if(primaryTag){
        badges.push(`<span class="infoBadge infoBadge--tag">${escapeHTML(primaryTag)}</span>`);
    }

    if(isNewItem(item.date)){
        badges.push(`<span class="infoBadge infoBadge--new">NEW</span>`);
    }

    // 発売前／予約開始／開催中／終了済みの4区分すべてに📅アイコン付きバッジを表示する
    // （従来は「開催中」だけバッジが出ず、イベント系情報であることが分かりにくかった）
    const eventStatus = getItemEventStatus(item);

    if(eventStatus){
        badges.push(`
            <span class="infoBadge infoBadge--status infoBadge--status-${eventStatus}">
                📅 ${escapeHTML(getEventStatusLabel(eventStatus))}
            </span>
        `);
    }

    if(isOngoingEvent(item)){
        const daysLeft = getDaysUntilEventEnd(item);

        if(daysLeft !== null && daysLeft >= 0 && daysLeft <= 7){
            // 残り3日以内は特に見逃してほしくないため、色とアニメーションで強調する
            const isUrgent = daysLeft <= 3;

            badges.push(`
                <span class="infoBadge infoBadge--ending${isUrgent ? " infoBadge--ending-urgent" : ""}">
                    ⏰ ${daysLeft === 0 ? "本日終了" : `あと${daysLeft}日で終了`}
                </span>
            `);
        }
    }

    const sourceTypeLabel = getSourceTypeLabel(item.articleUrl);

    if(sourceTypeLabel){
        badges.push(`<span class="infoBadge infoBadge--source">${escapeHTML(sourceTypeLabel)}</span>`);
    }

    // 同じeventGroupIdの過去の関連情報がある場合の件数バッジ。カード表示では開閉可能な
    // 一覧（buildEventGroupListHtml）も別途表示されるが、コンパクトリスト表示では
    // 行全体がリンクのため開閉ボタンを置けず、この件数バッジのみで存在を知らせる
    if(opts.relatedCount > 0){
        badges.push(`<span class="infoBadge infoBadge--group">🔗 過去の関連情報${opts.relatedCount}件</span>`);
    }

    return badges.length > 0 ? `<div class="infoBadges">${badges.join("")}</div>` : "";
}

// ==========================
// 情報カード生成（頭文字D情報／お気に入り共通）
// ==========================

// pages/配下のページ（archive.html等）とルートのindex.htmlとで相対パスの深さが
// 異なるため、現在地に応じてindex.htmlへのプレフィックスを組み立てる
function getSiteRootPrefix(){
    return (typeof window !== "undefined" && /\/pages\//.test(window.location.pathname))
        ? "../"
        : "";
}

// 出典（発信元アカウント）表示を、その出典だけに絞り込むリンクとして生成する。
// index.html上（js/info.js）ではJS側でクリックを横取りしその場で絞り込み、
// それ以外のページ（お気に入り等）ではindex.html?source=...への通常リンクとして機能する
function buildSourceLinkHtml(item){
    if(!item.source){
        return "";
    }

    const href = `${getSiteRootPrefix()}index.html?source=${encodeURIComponent(item.source)}`;

    return `<a class="infoCardSourceLink" href="${href}" data-source-filter="${escapeHTML(item.source)}" title="この出典の情報だけを表示">${escapeHTML(item.source)}</a>`;
}

function buildInfoCard(item, actionsHtml, extraClassName, highlightTerm, category, relatedItems){
    const cardCategory = category || "infos";
    const isTweet = isTweetUrl(item.articleUrl);
    const safeRelatedItems = Array.isArray(relatedItems) ? relatedItems : [];
    const badgesHtml = buildInfoCardBadges(item, cardCategory, {
        // お気に入り一覧ページ（extraClassName === "favoriteCard"）では
        // 全カードが必ずお気に入りなので、⭐バッジは表示しない
        hideFavoriteBadge: extraClassName === "favoriteCard",
        relatedCount: safeRelatedItems.length
    });
    const eventGroupListHtml = buildEventGroupListHtml(safeRelatedItems);
    const eventPeriodLabel = getEventPeriodLabel(item);
    const shareButtonsHtml = createShareButtons(item);
    const calendarActionsHtml = createCalendarActionsHtml(item);
    // カレンダー追加ボタンと共有ボタンをまとめて1つのグループにしておくことで、
    // スマホ幅ではこの2種類のボタンを縦に分かれた2段ではなく、
    // アイコンのみで横1列にまとめて表示できるようにする
    const quickActionsHtml = (calendarActionsHtml || shareButtonsHtml) ? `
        <div class="quickActionsGroup">
            ${calendarActionsHtml}
            ${shareButtonsHtml}
        </div>
    ` : "";
    const cardClassNames = ["infoCard", isTweet ? "tweetCard" : "", extraClassName || ""]
        .filter(Boolean)
        .join(" ");
    const readAttrsHtml = `data-read-category="${escapeHTML(cardCategory)}" data-read-id="${item.id}"`;

    if(isTweet){
        return `
            <article class="${cardClassNames}" ${readAttrsHtml}>

                ${badgesHtml}

                ${createTweetEmbed(item.articleUrl)}

                <div class="infoCardBody">

                    ${item.date || item.source ? `
                        <p class="infoCardDate">${escapeHTML(item.date || "")}${item.source ? `／ ${buildSourceLinkHtml(item)}` : ""}</p>
                    ` : ""}

                    ${eventPeriodLabel ? `<p class="infoCardEventPeriod">${escapeHTML(eventPeriodLabel)}</p>` : ""}

                    ${item.location ? `<p class="infoCardLocation">📍 ${escapeHTML(item.location)}</p>` : ""}

                    ${item.description ? `<p>${renderHighlightedText(item.description, highlightTerm)}</p>` : ""}

                    <div class="infoCardLinks">
                        ${quickActionsHtml}
                        ${actionsHtml}
                    </div>

                    ${eventGroupListHtml}

                </div>

            </article>
        `;
    }

    const dateLabel = item.date || "";
    const sourceLabel = item.source ? `／ ${buildSourceLinkHtml(item)}` : "";

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

                ${item.location ? `<p class="infoCardLocation">📍 ${escapeHTML(item.location)}</p>` : ""}

                ${item.description ? `<p>${renderHighlightedText(item.description, highlightTerm)}</p>` : ""}

                <div class="infoCardLinks">
                    ${item.articleUrl ? `
                        <a class="infoCardLink" href="${escapeHTML(item.articleUrl)}" target="_blank" rel="noopener noreferrer">
                            元記事を見る
                        </a>
                    ` : ""}
                    ${quickActionsHtml}
                    ${actionsHtml}
                </div>

                ${eventGroupListHtml}

            </div>

        </article>
    `;
}

// 表示密度「コンパクトリスト」用の1行表示（タイトル・日付・バッジのみ）。
// お気に入り登録やカレンダー追加・共有などの操作ボタン、画像、説明文はあえて省略し、
// 行全体を元記事へのリンクにすることで、大量の情報をすばやく見比べたい人向けの
// 表示にしている（それらの操作をしたい場合はカード表示に切り替える）。
// data-favorite-toggleなどcard表示の汎用ハンドラとは独立しているが、既読トラッキング
// （setupReadTrackingByView）はdata-read-category/data-read-id属性を見て動くため
// buildInfoCardと同じ属性を付与し、そのまま流用できるようにしている。
// 過去の関連情報（eventGroupId）がある場合も、行全体がリンクのため開閉ボタンは置かず、
// バッジ「🔗 過去の関連情報N件」のみで存在を知らせる（詳しく見たい場合はカード表示に切り替える）
function buildInfoCompactRow(item, highlightTerm, category, relatedItems){
    const cardCategory = category || "infos";
    const badgesHtml = buildInfoCardBadges(item, cardCategory, {
        relatedCount: Array.isArray(relatedItems) ? relatedItems.length : 0
    });
    const readAttrsHtml = `data-read-category="${escapeHTML(cardCategory)}" data-read-id="${item.id}"`;
    const title = getItemTitle(item);
    const dateLabel = item.date || "";

    const rowContentHtml = `
        ${dateLabel ? `<span class="infoCompactRowDate">${escapeHTML(dateLabel)}</span>` : ""}
        <span class="infoCompactRowTitle">${renderHighlightedText(title, highlightTerm)}</span>
        ${badgesHtml}
    `;

    if(item.articleUrl){
        return `
            <a
                class="infoCard infoCard--compact"
                ${readAttrsHtml}
                href="${escapeHTML(item.articleUrl)}"
                target="_blank"
                rel="noopener noreferrer"
                title="${escapeHTML(title)}">
                ${rowContentHtml}
            </a>
        `;
    }

    return `
        <div class="infoCard infoCard--compact" ${readAttrsHtml} title="${escapeHTML(title)}">
            ${rowContentHtml}
        </div>
    `;
}

// ==========================
// お気に入り機能
// ==========================

const favoriteCategories = {
    infos: {
        label: "最新情報",
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

let storageWarningShown = false;

function getFavoriteStorage(){
    if(typeof window === "undefined"){
        return null;
    }

    try{
        const storage = window.localStorage;

        // file:// で直接開いた場合など、ブラウザによってはlocalStorageへの
        // アクセスがここで例外にならずに失敗することがあるため、実際に
        // 書き込み・削除できるかを確認しておく（お気に入り・既読管理が
        // 一切保存されない不具合の切り分け用）。
        const testKey = "__initialDDatabaseStorageTest__";
        storage.setItem(testKey, "1");
        storage.removeItem(testKey);

        return storage;
    }catch(error){
        if(!storageWarningShown){
            storageWarningShown = true;
            console.warn(
                "[頭文字Database] localStorageが利用できないため、お気に入り・既読状態が保存されません。" +
                "index.htmlをfile://で直接開いている場合は、ローカルサーバー" +
                "（例: `npx serve` や VSCodeのLive Server）経由、またはGitHub Pages等の" +
                "http(s)環境で開くと解消することがあります。",
                error
            );
        }

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

// お気に入りボタンをクリックした際、カード上部の「⭐ お気に入り」バッジも
// その場で追加／削除する（再描画なしで即時反映するため）
function updateFavoriteBadgeInCard(button, category, id){
    const card = button.closest(".infoCard");

    if(!card){
        return;
    }

    const active = isFavorite(category, id);
    const existingBadge = card.querySelector("[data-favorite-badge]");

    if(!active){
        if(existingBadge){
            existingBadge.remove();
        }

        return;
    }

    if(existingBadge){
        return;
    }

    let badgesContainer = card.querySelector(".infoBadges");

    if(!badgesContainer){
        badgesContainer = document.createElement("div");
        badgesContainer.className = "infoBadges";

        const isTweet = card.classList.contains("tweetCard");
        const anchor = isTweet ? card : (card.querySelector(".infoCardBody") || card);

        anchor.prepend(badgesContainer);
    }

    const badge = document.createElement("span");

    badge.className = "infoBadge infoBadge--favorite";
    badge.setAttribute("data-favorite-badge", "");
    badge.textContent = "⭐ お気に入り";
    badgesContainer.prepend(badge);
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

// 複数件をまとめて既読にする（「すべて既読にする」ボタン用）。
// markItemReadを件数分呼ぶと読み込み・保存をその都度繰り返してしまうため、
// まとめて1回のlocalStorage読み書きで済むようにしている
function markItemsRead(category, ids){
    if(!Array.isArray(ids) || ids.length === 0){
        return;
    }

    const keys = getReadItemKeySet();
    let changed = false;

    ids.forEach(id => {
        const normalized = normalizeFavoriteEntry({ category, id });

        if(!normalized){
            return;
        }

        const key = `${normalized.category}:${normalized.id}`;

        if(!keys.has(key)){
            keys.add(key);
            changed = true;
        }
    });

    if(changed){
        saveReadItemKeySet(keys);
    }
}

// カードが画面に一瞬でも表示されたら既読にする（PC・スマホともに、
// スクロールで通り過ぎただけでも既読として記録される）。
// 未読のみ表示中でも、既読化した瞬間に一覧から消えてチラつかないよう、
// ここでは一覧の再描画は行わない（表示切り替えなど、次にフィルタ操作を
// したタイミングで反映される）。
function setupReadTrackingByView(container){
    if(!container){
        return;
    }

    if(typeof window === "undefined" || !("IntersectionObserver" in window)){
        applyReadStateToCards(container);
        return;
    }

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if(!entry.isIntersecting){
                return;
            }

            const card = entry.target;
            const category = card.dataset.readCategory;
            const id = Number(card.dataset.readId);

            markItemRead(category, id);
            card.classList.add("is-read");

            const newBadge = card.querySelector(".infoBadge--new");

            if(newBadge){
                newBadge.remove();
            }

            const unreadBadge = card.querySelector(".infoBadge--unread");

            if(unreadBadge){
                unreadBadge.remove();
            }

            const badgesContainer = card.querySelector(".infoBadges");

            if(badgesContainer && badgesContainer.children.length === 0){
                badgesContainer.remove();
            }

            observer.unobserve(card);
        });
    }, { threshold: 0 });

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
// 検索キーワード履歴（最新情報ページ）
// ==========================

const searchHistoryStorageKey = "initialDDatabaseSearchHistory";
const SEARCH_HISTORY_MAX = 8;

function getSearchHistory(){
    const storage = getFavoriteStorage();

    if(!storage){
        return [];
    }

    try{
        const saved = storage.getItem(searchHistoryStorageKey);
        const parsed = saved ? JSON.parse(saved) : [];

        return Array.isArray(parsed)
            ? parsed.filter(keyword => typeof keyword === "string" && keyword)
            : [];
    }catch(error){
        return [];
    }
}

function saveSearchHistory(history){
    const storage = getFavoriteStorage();

    if(!storage){
        return;
    }

    try{
        storage.setItem(searchHistoryStorageKey, JSON.stringify(history));
    }catch(error){
        // 保存できない場合は無視（履歴表示自体は行わないだけで、検索自体は継続）
    }
}

// キーワードを履歴の先頭に追加する。既に同じキーワードがあれば一旦取り除いてから
// 先頭に追加するため、重複せず「直近に使った順」を保てる。保存件数はSEARCH_HISTORY_MAX件まで
function addSearchHistory(keyword){
    const trimmed = typeof keyword === "string" ? keyword.trim() : "";

    if(!trimmed){
        return;
    }

    const history = getSearchHistory().filter(entry => entry !== trimmed);

    history.unshift(trimmed);
    saveSearchHistory(history.slice(0, SEARCH_HISTORY_MAX));
}

function clearSearchHistory(){
    saveSearchHistory([]);
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
            name: "最新情報",
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
    const navLinks = document.querySelectorAll("#navMenu a");

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

function setupNavToggle(){
    const toggle = document.getElementById("navToggle");
    const menu = document.getElementById("navMenu");

    if(!toggle || !menu){
        return;
    }

    toggle.addEventListener("click", () => {
        const isOpen = menu.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    menu.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            menu.classList.remove("is-open");
            toggle.setAttribute("aria-expanded", "false");
        });
    });
}

// ==========================
// ページ遷移時のスクロール位置維持
// ==========================
// ヘッダーメニュー（#navMenu）のリンクからページを移動する際、
// 遷移先ページの先頭に戻ってしまわないよう、移動前のスクロール位置を
// sessionStorageに保存し、遷移先ページの読み込み時に復元する。
// （直接URLを開いた場合やブラウザの戻る/進むボタンでは適用しない。
// 　戻る/進むはブラウザ自身のスクロール位置復元に任せる）

const navScrollStorageKey = "initialDDatabaseNavScrollY";

function getSessionStorageSafe(){
    if(typeof window === "undefined"){
        return null;
    }

    try{
        const storage = window.sessionStorage;
        const testKey = "__initialDDatabaseSessionTest__";

        storage.setItem(testKey, "1");
        storage.removeItem(testKey);

        return storage;
    }catch(error){
        return null;
    }
}

// ページ遷移直後のヒーロー画像チラつき対策
// head内の早い段階のインラインscriptが、復元対象のスクロール値がある場合のみ
// <html>に"scrollRestorePending"クラスを付与し、本文を非表示にしている。
// スクロール位置の復元が終わった（または復元の必要がなかった）タイミングで
// このクラスを外し、本文を表示する。
const scrollRestorePendingClass = "scrollRestorePending";

function revealBodyAfterScrollRestore(){
    document.documentElement.classList.remove(scrollRestorePendingClass);
}

function restoreNavScrollPosition(storage){
    if(!storage){
        revealBodyAfterScrollRestore();
        return;
    }

    let savedValue = null;

    try{
        savedValue = storage.getItem(navScrollStorageKey);
        storage.removeItem(navScrollStorageKey);
    }catch(error){
        revealBodyAfterScrollRestore();
        return;
    }

    if(savedValue === null){
        revealBodyAfterScrollRestore();
        return;
    }

    const targetY = Number(savedValue);

    if(!Number.isFinite(targetY) || targetY <= 0){
        revealBodyAfterScrollRestore();
        return;
    }

    const applyScroll = () => window.scrollTo(0, targetY);

    applyScroll();
    revealBodyAfterScrollRestore();

    // 画像などの読み込みで直後にレイアウトが変わることがあるため、次フレームでも再適用する
    window.requestAnimationFrame(applyScroll);
}

function setupNavScrollPersistence(){
    const storage = getSessionStorageSafe();
    const navLinks = document.querySelectorAll("#navMenu a");

    navLinks.forEach(link => {
        link.addEventListener("click", event => {
            // 新しいタブで開く操作（Ctrl/Cmd/Shift/中クリックなど）は対象外
            if(!storage || event.defaultPrevented || event.button !== 0
                || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey){
                return;
            }

            try{
                storage.setItem(navScrollStorageKey, String(window.scrollY || 0));
            }catch(error){
                // 保存できない場合は無視（通常通り先頭からの表示になる）
            }
        });
    });

    restoreNavScrollPosition(storage);
}

// ==========================
// 構造化データ（BreadcrumbList）
// ==========================

// ファイル名 → パンくずリストに表示するページ名（ナビメニューの表記に合わせている）
const BREADCRUMB_PAGE_LABELS = {
    "favorites.html": "お気に入り",
    "calendar.html": "イベントカレンダー",
    "archive.html": "アーカイブ・統計",
    "comments.html": "コメント・ご要望",
    "updates.html": "更新情報"
};

function injectBreadcrumbStructuredData(){
    if(typeof document === "undefined" || document.getElementById("breadcrumbStructuredData")){
        return;
    }

    const currentFile = getCurrentPageFileName();
    const pageLabel = BREADCRUMB_PAGE_LABELS[currentFile];

    // トップページ（index.html）自体はパンくずの起点なので対象外
    if(!pageLabel){
        return;
    }

    const siteUrl = getSiteRootUrl() || "https://initialdatabase.github.io/InitialDatabase/";
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    const currentUrl = canonicalLink ? canonicalLink.href : window.location.href.split("#")[0].split("?")[0];

    const breadcrumbList = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "トップ", item: siteUrl },
            { "@type": "ListItem", position: 2, name: pageLabel, item: currentUrl }
        ]
    };

    const script = document.createElement("script");

    script.type = "application/ld+json";
    script.id = "breadcrumbStructuredData";
    script.textContent = JSON.stringify(breadcrumbList);

    document.head.appendChild(script);
}

function initializeCommonUI(){
    highlightCurrentNav();
    setupNavToggle();
    setupBackToTopButton();
    setupThemeToggle();
    setupCalendarDownloadDelegation();
    setupShareDelegation();
    setupNavScrollPersistence();
    injectBreadcrumbStructuredData();
    registerServiceWorker();
    trackSiteVisit();
}

// ==========================
// サイト累計訪問者数（外部の無料カウンターサービスを利用）
// ==========================

// 全ページ共通のIDにすることで、どのページを開いても同じ合計カウントに加算される
const SITE_VISITOR_BADGE_PAGE_ID = "initialdatabase-github-io.idd-total-visits";

function getSiteVisitorBadgeUrl(leftText){
    // バッジ画像のフォントは日本語の文字幅計算に対応していないため、
    // ラベル部分（left_text）は必ず英数字にする（日本語ラベルはHTML側で別表示する）
    const params = new URLSearchParams({
        page_id: SITE_VISITOR_BADGE_PAGE_ID,
        left_text: leftText || "Total Visits",
        left_color: "#1a1a1a",
        right_color: "#e2001c"
    });

    return `https://visitor-badge.laobi.icu/badge?${params.toString()}`;
}

function trackSiteVisit(){
    if(typeof document === "undefined"){
        return;
    }

    // アーカイブ・統計ページでは可視バッジ自体の読み込みでカウントされるため、
    // 見えないカウント用の画像を二重に読み込まないようにする
    if(document.getElementById("siteVisitorBadge")){
        return;
    }

    const pixel = new Image();

    pixel.alt = "";
    pixel.width = 1;
    pixel.height = 1;
    pixel.style.position = "absolute";
    pixel.style.width = "1px";
    pixel.style.height = "1px";
    pixel.style.opacity = "0";
    pixel.style.pointerEvents = "none";
    pixel.src = getSiteVisitorBadgeUrl();

    document.body.appendChild(pixel);
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
// ページネーション（1ページ目のみ件数を変えられる汎用ページ送り）
// ==========================

// 例：firstPageSize=9, otherPageSize=10 の場合
// 1ページ目：1〜9件目 / 2ページ目：10〜19件目 / 3ページ目：20〜29件目 …
function getPaginationPageCount(totalCount, firstPageSize, otherPageSize){
    if(totalCount <= 0){
        return 1;
    }

    if(totalCount <= firstPageSize){
        return 1;
    }

    return 1 + Math.ceil((totalCount - firstPageSize) / otherPageSize);
}

function getPaginationRange(page, firstPageSize, otherPageSize){
    if(page <= 1){
        return [0, firstPageSize];
    }

    const start = firstPageSize + (page - 2) * otherPageSize;

    return [start, start + otherPageSize];
}

function renderPaginationControls(elementId, currentPage, totalPages, onPageChange){
    const element = document.getElementById(elementId);

    if(!element){
        return;
    }

    if(totalPages <= 1){
        element.innerHTML = "";
        element.hidden = true;
        return;
    }

    element.hidden = false;

    // ページ数が多くてもボタンが横に並びすぎないよう、番号ボタンの代わりに
    // 1つのセレクトボックスでページを選ぶ方式にする（スマホでは端末標準の
    // 選択画面が開くので、タップ操作もしやすい）
    //
    // 選択肢のラベルは「1ページ目」「17ページ目」のようにそのまま桁数分の
    // 文字列にする（以前はfigure space(\u2007)で桁を揃えていたが、iPadなど
    // 端末標準の選択リスト表示ではこの特殊スペースの幅が数字と一致せず、
    // 行ごとに見た目がズレて見える不具合があったため廃止した）。
    // 閉じた状態のボタン幅が桁数によってガタつかないようにする役割は、
    // CSS側の.infoPageSelectのmin-widthに持たせている
    const optionsHtml = Array.from({ length: totalPages }, (unused, index) => {
        const pageNumber = index + 1;

        return `<option value="${pageNumber}" ${pageNumber === currentPage ? "selected" : ""}>${pageNumber}ページ目</option>`;
    }).join("");

    element.innerHTML = `
        <nav class="infoPaginationNav" aria-label="ページ送り">
            <button type="button" class="infoPageButton infoPageNav" data-direction="prev" title="前のページ" ${currentPage <= 1 ? "disabled" : ""}>
                <span aria-hidden="true">‹</span>
                <span class="visually-hidden">前へ</span>
            </button>
            <span class="infoPageSelectWrap">
                <select class="infoPageSelect" aria-label="ページ選択">
                    ${optionsHtml}
                </select>
                <span class="infoPageTotal">/ 全${totalPages}ページ</span>
            </span>
            <button type="button" class="infoPageButton infoPageNav" data-direction="next" title="次のページ" ${currentPage >= totalPages ? "disabled" : ""}>
                <span aria-hidden="true">›</span>
                <span class="visually-hidden">次へ</span>
            </button>
        </nav>
    `;

    const selectElement = element.querySelector(".infoPageSelect");

    if(selectElement){
        selectElement.addEventListener("change", () => {
            const targetPage = Number(selectElement.value);

            if(!targetPage || targetPage === currentPage){
                return;
            }

            onPageChange(targetPage);
        });
    }

    element.querySelectorAll("[data-direction]").forEach(button => {
        button.addEventListener("click", () => {
            const targetPage = button.dataset.direction === "prev" ? currentPage - 1 : currentPage + 1;

            if(targetPage < 1 || targetPage > totalPages || targetPage === currentPage){
                return;
            }

            onPageChange(targetPage);
        });
    });
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
    const nav = document.querySelector("nav");

    if(!nav || document.getElementById("themeToggleButton")){
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

    nav.appendChild(button);
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
