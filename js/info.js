// 頭文字D情報ページ（グッズ・コラボなどの最新情報）の一覧表示・検索・絞り込み

(function(){

    const items = Array.isArray(database.infos) ? database.infos : [];
    const listElement = document.getElementById("infoList");
    const countElement = document.getElementById("infoCount");
    const controlsElement = document.getElementById("infoControls");
    const searchInput = document.getElementById("infoSearchInput");
    const suggestionsElement = document.getElementById("infoSearchSuggestions");
    const tagFilterContainer = document.getElementById("infoTagFilters");
    const clearFiltersButton = document.getElementById("infoFilterClear");
    const seriesFilterContainer = document.getElementById("seriesFilterBar");
    const regionFilterContainer = document.getElementById("infoRegionFilters");
    const prefectureFilterContainer = document.getElementById("infoPrefectureFilters");
    const prefectureToggle = document.getElementById("infoPrefectureToggle");
    const goodsCategoryFilterContainer = document.getElementById("infoGoodsCategoryFilters");

    // 作品（シリーズ）で絞り込むタブ。「すべて」を含め固定の並び順で表示する
    const SERIES_LIST = ["頭文字D", "MFゴースト", "昴と彗星", "頭文字DAC", "その他コラボ"];

    // 開催地フィルターで指定できる値（地方名＋都道府県名）。URLパラメータの検証にも使う
    const ALL_LOCATION_VALUES = [
        ...REGION_LIST,
        ...Object.values(PREFECTURES_BY_REGION).flat()
    ];

    if(!listElement){
        return;
    }

    if(items.length === 0){
        if(countElement){
            countElement.textContent = "全 0 件";
        }
        listElement.innerHTML = `<p class="emptyMessage">情報がありません</p>`;
        if(controlsElement){
            controlsElement.hidden = true;
        }
        return;
    }

    const allTags = Array.from(new Set(
        items.flatMap(item => Array.isArray(item.tags) ? item.tags : [])
    ));

    const state = {
        keyword: "",
        searchMode: "partial", // "partial"（部分一致）または "exact"（完全一致）
        activeTags: new Set(),
        activeGoodsCategories: new Set(), // 「グッズ」タグ選択時のみ表示されるサブカテゴリ絞り込み（複数選択・OR条件）
        activeLocations: new Set(), // 「📍開催地」フィルター（地方名・都道府県名の両方を格納。複数選択・OR条件）
        activeSeries: "all", // "all"または頭文字D／MFゴースト／昴と彗星／頭文字DAC／その他コラボ
        sort: "new",
        period: "all",
        status: "all",
        unreadOnly: false,
        page: 1,
        customMonth: "" // アーカイブページの月別件数からの絞り込み（YYYY-MM）
    };

    // 1ページ目・2ページ目以降ともに10件ずつ表示する
    const FIRST_PAGE_SIZE = 10;
    const OTHER_PAGE_SIZE = 10;

    let activeSuggestionIndex = -1;
    let currentSuggestions = [];

    state.searchMode = setupSearchModeToggle("infoSearchModeToggle", mode => {
        state.searchMode = mode;
        state.page = 1;
        render();
    });

    function matchesKeyword(item){
        if(!state.keyword){
            return true;
        }

        return matchesSearchKeyword([
            getItemTitle(item),
            item.description || "",
            item.source || "",
            ...(Array.isArray(item.tags) ? item.tags : [])
        ], state.keyword, state.searchMode);
    }

    function matchesTags(item){
        if(state.activeTags.size === 0){
            return true;
        }

        const itemTags = Array.isArray(item.tags) ? item.tags : [];

        return Array.from(state.activeTags).every(tag => itemTags.includes(tag));
    }

    function matchesGoodsCategory(item){
        if(state.activeGoodsCategories.size === 0){
            return true;
        }

        const category = getItemGoodsCategory(item);

        return category ? state.activeGoodsCategories.has(category) : false;
    }

    function matchesLocation(item){
        if(state.activeLocations.size === 0){
            return true;
        }

        // 都道府県レベルでも地方レベルでも、どちらの絞り込み値にも一致すればOKとする
        const itemRegions = getItemRegions(item);
        const itemPrefectures = getItemPrefectures(item);

        return Array.from(state.activeLocations).some(location =>
            itemRegions.includes(location) || itemPrefectures.includes(location)
        );
    }

    function matchesSeries(item){
        if(state.activeSeries === "all"){
            return true;
        }

        const itemSeries = Array.isArray(item.series) ? item.series : [];

        return itemSeries.includes(state.activeSeries);
    }

    function matchesPeriod(item){
        if(state.period === "week"){
            return isWithinCurrentWeek(item.date);
        }

        if(state.period === "month"){
            return isWithinCurrentMonth(item.date);
        }

        if(state.period === "ongoing"){
            return isOngoingEvent(item);
        }

        if(state.period === "custom-month"){
            return typeof item.date === "string" && item.date.startsWith(state.customMonth);
        }

        return true;
    }

    function matchesStatus(item){
        if(state.status === "all"){
            return true;
        }

        return getItemEventStatus(item) === state.status;
    }

    function matchesUnread(item){
        return state.unreadOnly ? !isItemRead("infos", item.id) : true;
    }

    function hasActiveFilters(){
        return Boolean(state.keyword)
            || state.activeTags.size > 0
            || state.activeGoodsCategories.size > 0
            || state.activeLocations.size > 0
            || state.activeSeries !== "all"
            || state.period !== "all"
            || state.status !== "all"
            || state.unreadOnly
            || state.sort !== "new";
    }

    function updateClearButtonVisibility(){
        if(clearFiltersButton){
            clearFiltersButton.hidden = !hasActiveFilters();
        }
    }

    function getFilteredItems(){
        return items.filter(item =>
            matchesKeyword(item)
            && matchesTags(item)
            && matchesGoodsCategory(item)
            && matchesLocation(item)
            && matchesSeries(item)
            && matchesPeriod(item)
            && matchesStatus(item)
            && matchesUnread(item)
        );
    }

    function getSortedItems(filteredItems){
        // 日付が同じ項目が複数ある場合、Array.sortは安定ソートのため、
        // 昇順に並べてからreverse()すると同日内の順序まで反転してしまい、
        // 「新しい順」で同日の項目の前後関係が意図と逆になる不具合があった。
        // そのため常に「新しい順」を直接ソートし、「古い順」はそれを丸ごと反転して作る。
        const sortedNewFirst = [...filteredItems].sort((a, b) =>
            String(b.date || "").localeCompare(String(a.date || ""))
        );

        return state.sort === "old" ? sortedNewFirst.reverse() : sortedNewFirst;
    }

    function renderCount(filteredItems){
        if(!countElement){
            return;
        }

        const tagCounts = new Map();

        filteredItems.forEach(item => {
            const primaryTag = getPrimaryTag(item);

            if(!primaryTag){
                return;
            }

            tagCounts.set(primaryTag, (tagCounts.get(primaryTag) || 0) + 1);
        });

        const breakdown = Array.from(tagCounts.entries())
            .map(([tag, count]) => `${tag} ${count}`)
            .join("／");

        countElement.textContent = breakdown
            ? `全 ${filteredItems.length} 件（${breakdown}）`
            : `全 ${filteredItems.length} 件`;
    }

    // ==========================
    // 検索結果ゼロ件時のフォールバック表示
    // ==========================

    function getFeaturedItems(limit){
        return [...items]
            .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
            .slice(0, limit);
    }

    function getSuggestedTags(limit){
        const tagCounts = new Map();

        items.forEach(item => {
            (Array.isArray(item.tags) ? item.tags : []).forEach(tag => {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            });
        });

        return Array.from(tagCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([tag]) => tag);
    }

    function renderNoResults(){
        const suggestedTags = getSuggestedTags(6);
        const featuredItems = getFeaturedItems(3);

        const tagsHtml = suggestedTags.length > 0 ? `
            <div class="infoNoResultsBlock">
                <h4>おすすめのキーワード</h4>
                <div class="infoNoResultsTags">
                    ${suggestedTags.map(tag => `
                        <button type="button" class="infoTagButton" data-suggested-tag="${escapeHTML(tag)}">
                            ${escapeHTML(tag)}
                        </button>
                    `).join("")}
                </div>
            </div>
        ` : "";

        const featuredHtml = featuredItems.length > 0 ? `
            <div class="infoNoResultsBlock">
                <h4>注目のコンテンツ</h4>
                <div class="infoNoResultsFeatured">
                    ${featuredItems.map(item =>
                        buildInfoCard(item, createFavoriteButton("infos", item.id), "", "", "infos")
                    ).join("")}
                </div>
            </div>
        ` : "";

        listElement.innerHTML = `
            <div class="infoNoResults">
                <p class="infoNoResultsMessage">条件に一致する情報がありませんでした。条件を変えて探してみてください。</p>
                ${tagsHtml}
                ${featuredHtml}
            </div>
        `;

        listElement.querySelectorAll("[data-suggested-tag]").forEach(button => {
            button.addEventListener("click", () => {
                const tag = button.dataset.suggestedTag;

                state.keyword = "";
                state.status = "all";
                state.period = "all";
                state.activeTags = new Set([tag]);
                state.page = 1;

                if(searchInput){
                    searchInput.value = "";
                }

                syncControlButtons();
                render();
            });
        });

        listElement.querySelectorAll("[data-favorite-toggle]").forEach(button => {
            button.addEventListener("click", () => {
                const category = button.dataset.category;
                const id = Number(button.dataset.id);

                toggleFavorite(category, id);
                updateFavoriteButton(button, category, id);
                updateFavoriteBadgeInCard(button, category, id);
            });
        });

        setupReadTrackingByView(listElement);
        loadTweetEmbeds(listElement);
    }

    function syncControlButtons(){
        if(!controlsElement){
            return;
        }

        controlsElement.querySelectorAll("[data-sort]").forEach(b =>
            b.classList.toggle("is-active", b.dataset.sort === state.sort)
        );

        controlsElement.querySelectorAll("[data-period]").forEach(b =>
            b.classList.toggle("is-active", b.dataset.period === state.period)
        );

        controlsElement.querySelectorAll("[data-status]").forEach(b =>
            b.classList.toggle("is-active", b.dataset.status === state.status)
        );

        controlsElement.querySelectorAll("[data-readfilter]").forEach(b =>
            b.classList.toggle("is-active", (b.dataset.readfilter === "unread") === state.unreadOnly)
        );

        if(tagFilterContainer){
            tagFilterContainer.querySelectorAll("[data-tag]").forEach(b =>
                b.classList.toggle("is-active", state.activeTags.has(b.dataset.tag))
            );
        }

        controlsElement.querySelectorAll("[data-region]").forEach(b =>
            b.classList.toggle("is-active", state.activeLocations.has(b.dataset.region))
        );

        controlsElement.querySelectorAll("[data-prefecture]").forEach(b =>
            b.classList.toggle("is-active", state.activeLocations.has(b.dataset.prefecture))
        );

        if(seriesFilterContainer){
            seriesFilterContainer.querySelectorAll("[data-series]").forEach(b =>
                b.classList.toggle("is-active", b.dataset.series === state.activeSeries)
            );
        }

        if(goodsCategoryFilterContainer){
            goodsCategoryFilterContainer.querySelectorAll("[data-goods-category]").forEach(b =>
                b.classList.toggle("is-active", state.activeGoodsCategories.has(b.dataset.goodsCategory))
            );
        }

        updateGoodsCategoryPanelVisibility();
    }

    // 「グッズ」タグが選択されている時だけ、サブカテゴリの絞り込みボタン群を表示する。
    // タグを解除した場合はパネルを閉じ、選択済みのサブカテゴリもクリアする
    function updateGoodsCategoryPanelVisibility(){
        if(!goodsCategoryFilterContainer){
            return;
        }

        const isGoodsActive = state.activeTags.has("グッズ");

        if(!isGoodsActive && state.activeGoodsCategories.size > 0){
            state.activeGoodsCategories.clear();
        }

        goodsCategoryFilterContainer.hidden = !isGoodsActive;
    }

    // アーカイブページの統計バー（タグ／月／出典／ステータス）からのリンクを反映し、
    // 検索キーワード・ページ番号も含めてURLと状態を双方向に同期する
    // 例：index.html?tag=グッズ　index.html?month=2026-08　index.html?status=ongoing
    //     index.html?source=GRANUP（X）　index.html?keyword=フィギュア&page=2
    function applyStateFromUrlParams(){
        const params = new URLSearchParams(window.location.search);
        const tagParam = params.get("tag");
        const goodsCategoryParam = params.get("goods");
        const regionParam = params.get("location");
        const seriesParam = params.get("series");
        const monthParam = params.get("month");
        const statusParam = params.get("status");
        const sourceParam = params.get("source");
        const keywordParam = params.get("keyword");
        const pageParam = params.get("page");

        state.activeTags = new Set(
            tagParam
                ? tagParam.split(",").map(tag => tag.trim()).filter(tag => allTags.includes(tag))
                : []
        );

        state.activeGoodsCategories = new Set(
            goodsCategoryParam
                ? goodsCategoryParam.split(",").map(category => category.trim()).filter(category => GOODS_CATEGORY_LIST.includes(category))
                : []
        );

        // サブカテゴリが指定されている場合は「グッズ」タグも自動でONにし、パネルを表示する
        if(state.activeGoodsCategories.size > 0){
            state.activeTags.add("グッズ");
        }

        state.activeLocations = new Set(
            regionParam
                ? regionParam.split(",").map(location => location.trim()).filter(location => ALL_LOCATION_VALUES.includes(location))
                : []
        );

        state.activeSeries = (seriesParam && SERIES_LIST.includes(seriesParam))
            ? seriesParam
            : "all";

        if(monthParam && /^\d{4}-\d{2}$/.test(monthParam)){
            state.period = "custom-month";
            state.customMonth = monthParam;
        }else if(state.period === "custom-month"){
            state.period = "all";
            state.customMonth = "";
        }

        state.status = (statusParam && ["before", "reservation", "ongoing", "ended"].includes(statusParam))
            ? statusParam
            : "all";

        // keywordが優先。旧来のsourceリンク（?source=...）も引き続きキーワードとして解釈する
        state.keyword = keywordParam || sourceParam || "";

        if(searchInput){
            searchInput.value = state.keyword;
        }

        const parsedPage = Number(pageParam);
        state.page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

        syncControlButtons();

        const hasActiveFilter = state.activeTags.size > 0
            || state.activeLocations.size > 0
            || state.period === "custom-month"
            || state.status !== "all";

        if(filterPanel && filterToggle){
            filterPanel.classList.toggle("is-open", hasActiveFilter);
            filterToggle.setAttribute("aria-expanded", hasActiveFilter ? "true" : "false");
        }

        // 都道府県単位の絞り込みが復元された場合は、都道府県パネルも開いておく
        const hasActivePrefecture = Array.from(state.activeLocations).some(location => !REGION_LIST.includes(location));

        if(prefectureFilterContainer && prefectureToggle && hasActivePrefecture){
            prefectureFilterContainer.hidden = false;
            prefectureToggle.setAttribute("aria-expanded", "true");
        }
    }

    // 現在の絞り込み状態からURLクエリを組み立てる（タグ・月・ステータス・キーワード・ページ番号）
    function buildUrlParams(){
        const params = new URLSearchParams();

        if(state.activeTags.size > 0){
            params.set("tag", Array.from(state.activeTags).join(","));
        }

        if(state.activeGoodsCategories.size > 0){
            params.set("goods", Array.from(state.activeGoodsCategories).join(","));
        }

        if(state.activeLocations.size > 0){
            params.set("location", Array.from(state.activeLocations).join(","));
        }

        if(state.activeSeries !== "all"){
            params.set("series", state.activeSeries);
        }

        if(state.period === "custom-month" && state.customMonth){
            params.set("month", state.customMonth);
        }

        if(state.status !== "all"){
            params.set("status", state.status);
        }

        if(state.keyword){
            params.set("keyword", state.keyword);
        }

        if(state.page > 1){
            params.set("page", String(state.page));
        }

        return params;
    }

    // 状態をURLへ反映する。pushHistoryがtrueの場合のみ、戻る/進むで復元できる履歴エントリを追加する
    // （ページ送りなどの明確な操作のみpushし、入力中のキーワードなどは置き換えのみに留める）
    function updateUrlParams(pushHistory){
        const query = buildUrlParams().toString();
        const newUrl = window.location.pathname + (query ? `?${query}` : "") + window.location.hash;
        const currentUrl = window.location.pathname + window.location.search + window.location.hash;

        if(newUrl === currentUrl){
            return;
        }

        if(pushHistory){
            window.history.pushState(null, "", newUrl);
        }else{
            window.history.replaceState(null, "", newUrl);
        }
    }

    function render(pushHistory){
        const filteredItems = getFilteredItems();
        const sortedItems = getSortedItems(filteredItems);

        renderCount(filteredItems);
        updateClearButtonVisibility();

        if(sortedItems.length === 0){
            renderNoResults();
            renderPaginationControls("infoPagination", 1, 1, () => {});
            updateUrlParams(Boolean(pushHistory));
            return;
        }

        const totalPages = getPaginationPageCount(sortedItems.length, FIRST_PAGE_SIZE, OTHER_PAGE_SIZE);

        if(state.page > totalPages){
            state.page = totalPages;
        }

        if(state.page < 1){
            state.page = 1;
        }

        const [start, end] = getPaginationRange(state.page, FIRST_PAGE_SIZE, OTHER_PAGE_SIZE);
        const pageItems = sortedItems.slice(start, end);

        listElement.innerHTML = pageItems.map(item =>
            buildInfoCard(item, createFavoriteButton("infos", item.id), "", state.keyword, "infos")
        ).join("");

        listElement.querySelectorAll("[data-favorite-toggle]").forEach(button => {
            button.addEventListener("click", () => {
                const category = button.dataset.category;
                const id = Number(button.dataset.id);

                toggleFavorite(category, id);
                updateFavoriteButton(button, category, id);
                updateFavoriteBadgeInCard(button, category, id);
            });
        });

        setupReadTrackingByView(listElement);
        loadTweetEmbeds(listElement);

        renderPaginationControls("infoPagination", state.page, totalPages, targetPage => {
            state.page = targetPage;
            render(true);
            listElement.scrollIntoView({ behavior: "smooth", block: "start" });
        });

        updateUrlParams(Boolean(pushHistory));
    }

    // 作品（シリーズ）タブを描画する。件数を添えてワンタップで絞り込めるようにする
    function renderSeriesFilters(){
        if(!seriesFilterContainer){
            return;
        }

        const seriesCounts = new Map();

        items.forEach(item => {
            (Array.isArray(item.series) ? item.series : []).forEach(series => {
                seriesCounts.set(series, (seriesCounts.get(series) || 0) + 1);
            });
        });

        const buttonsHtml = [`
            <button type="button" class="seriesFilterButton is-active" data-series="all">
                すべて<span class="seriesFilterCount">${items.length}</span>
            </button>
        `].concat(
            SERIES_LIST
                .filter(series => seriesCounts.has(series))
                .map(series => `
                    <button type="button" class="seriesFilterButton" data-series="${escapeHTML(series)}">
                        ${escapeHTML(series)}<span class="seriesFilterCount">${seriesCounts.get(series)}</span>
                    </button>
                `)
        ).join("");

        seriesFilterContainer.innerHTML = buttonsHtml;

        seriesFilterContainer.querySelectorAll("[data-series]").forEach(button => {
            button.addEventListener("click", () => {
                if(button.classList.contains("is-active")){
                    return;
                }

                state.activeSeries = button.dataset.series;
                state.page = 1;

                seriesFilterContainer.querySelectorAll("[data-series]").forEach(b =>
                    b.classList.toggle("is-active", b === button)
                );

                render();
            });
        });
    }

    // 「あと○日で終了」の情報をトップページ最上部にまとめて表示し、
    // 「今日見に来る理由」を作る「🔥 まもなく終了」セクション
    function renderEndingSoon(){
        const section = document.getElementById("endingSoonSection");
        const container = document.getElementById("endingSoonList");
        const toggleButton = document.getElementById("endingSoonToggle");

        if(!section || !container){
            return;
        }

        const endingItems = items
            .map(item => ({ item, daysLeft: getDaysUntilEventEnd(item) }))
            .filter(({ item, daysLeft }) =>
                daysLeft !== null
                && daysLeft >= 0
                && daysLeft <= 7
                && isOngoingEvent(item)
            )
            .sort((a, b) => a.daysLeft - b.daysLeft)
            .slice(0, 8);

        if(endingItems.length === 0){
            section.hidden = true;
            container.innerHTML = "";
            return;
        }

        section.hidden = false;

        // ユーザーが「非表示にする」を選んでいる場合は、見出し＋切り替えボタンだけ
        // 残してリスト部分を畳んでおく（次回以降もlocalStorageの設定を引き継ぐ）
        const isCollapsed = getStoredEndingSoonHidden();
        container.hidden = isCollapsed;

        if(toggleButton){
            toggleButton.textContent = isCollapsed ? "表示する" : "非表示にする";
            toggleButton.setAttribute("aria-expanded", String(!isCollapsed));

            if(!toggleButton.dataset.bound){
                toggleButton.dataset.bound = "1";
                toggleButton.addEventListener("click", () => {
                    const nextCollapsed = !container.hidden;

                    container.hidden = nextCollapsed;
                    setStoredEndingSoonHidden(nextCollapsed);
                    toggleButton.textContent = nextCollapsed ? "表示する" : "非表示にする";
                    toggleButton.setAttribute("aria-expanded", String(!nextCollapsed));
                });
            }
        }

        container.innerHTML = endingItems.map(({ item, daysLeft }) => {
            const urgency = daysLeft === 0 ? "today" : daysLeft <= 1 ? "urgent" : daysLeft <= 3 ? "soon" : "later";
            const daysLabel = daysLeft === 0 ? "本日終了" : `あと${daysLeft}日`;
            const dateLabel = item.eventEnd ? `${formatShortDate(item.eventEnd)}まで` : "";

            return `
                <button
                    type="button"
                    class="endingSoonCard endingSoonCard--${urgency}"
                    data-ending-id="${item.id}">
                    ${dateLabel ? `<span class="endingSoonDate">${escapeHTML(dateLabel)}</span>` : ""}
                    <span class="endingSoonCardTitle">${escapeHTML(getItemTitle(item))}</span>
                    <span class="endingSoonBadge">${escapeHTML(daysLabel)}</span>
                </button>
            `;
        }).join("");

        container.querySelectorAll("[data-ending-id]").forEach(button => {
            button.addEventListener("click", () => {
                const id = Number(button.dataset.endingId);
                const target = items.find(candidate => candidate.id === id);

                if(!target){
                    return;
                }

                // クリックした情報だけをキーワード検索で絞り込み、詳細（ツイート埋め込み）まで表示する
                state.keyword = getItemTitle(target);
                state.activeSeries = "all";
                state.activeTags.clear();
                state.period = "all";
                state.status = "all";
                state.unreadOnly = false;
                state.page = 1;

                if(searchInput){
                    searchInput.value = state.keyword;
                }

                closeSuggestions();
                syncControlButtons();
                render();
                listElement.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        });
    }

    function toggleLocationValue(value, button){
        if(state.activeLocations.has(value)){
            state.activeLocations.delete(value);
            button.classList.remove("is-active");
        }else{
            state.activeLocations.add(value);
            button.classList.add("is-active");
        }

        state.page = 1;
        render();
    }

    function renderRegionFilters(){
        if(!regionFilterContainer){
            return;
        }

        const labelHtml = `<span class="infoFilterLabel">📍 開催地：</span>`;

        regionFilterContainer.innerHTML = labelHtml + REGION_LIST.map(region => `
            <button type="button" class="infoFilterButton" data-region="${escapeHTML(region)}">
                ${escapeHTML(region)}
            </button>
        `).join("");

        regionFilterContainer.querySelectorAll("[data-region]").forEach(button => {
            button.addEventListener("click", () => {
                toggleLocationValue(button.dataset.region, button);
            });
        });
    }

    // 都道府県ボタンは地方ごとに小見出し付きでまとめ、47個並んでいても
    // どの地方の都道府県かひと目で分かるようにする。パネル自体は既定で閉じておく
    function renderPrefectureFilters(){
        if(!prefectureFilterContainer){
            return;
        }

        prefectureFilterContainer.innerHTML = REGION_LIST.map(region => `
            <div class="infoPrefectureGroup">
                <span class="infoPrefectureGroupLabel">${escapeHTML(region)}</span>
                <div class="infoPrefectureButtons">
                    ${PREFECTURES_BY_REGION[region].map(pref => `
                        <button type="button" class="infoFilterButton infoFilterButton--small" data-prefecture="${escapeHTML(pref)}">
                            ${escapeHTML(pref)}
                        </button>
                    `).join("")}
                </div>
            </div>
        `).join("");

        prefectureFilterContainer.querySelectorAll("[data-prefecture]").forEach(button => {
            button.addEventListener("click", () => {
                toggleLocationValue(button.dataset.prefecture, button);
            });
        });
    }

    function renderTagFilters(){
        if(!tagFilterContainer || allTags.length === 0){
            return;
        }

        tagFilterContainer.innerHTML = allTags.map(tag => `
            <button type="button" class="infoTagButton" data-tag="${escapeHTML(tag)}">
                ${escapeHTML(tag)}
            </button>
        `).join("");

        tagFilterContainer.querySelectorAll("[data-tag]").forEach(button => {
            button.addEventListener("click", () => {
                const tag = button.dataset.tag;

                if(state.activeTags.has(tag)){
                    state.activeTags.delete(tag);
                    button.classList.remove("is-active");
                }else{
                    state.activeTags.add(tag);
                    button.classList.add("is-active");
                }

                state.page = 1;
                updateGoodsCategoryPanelVisibility();
                render();
            });
        });
    }

    // 「グッズ」タグを選んだ時だけ表示するサブカテゴリボタン群
    // （フィギュア／ミニカー／アパレル／時計／書籍／食品／雑貨）
    function renderGoodsCategoryFilters(){
        if(!goodsCategoryFilterContainer){
            return;
        }

        const labelHtml = `<span class="infoFilterLabel">グッズの種類：</span>`;

        goodsCategoryFilterContainer.innerHTML = labelHtml + GOODS_CATEGORY_LIST.map(category => `
            <button type="button" class="infoFilterButton infoFilterButton--small" data-goods-category="${escapeHTML(category)}">
                ${escapeHTML(category)}
            </button>
        `).join("");

        goodsCategoryFilterContainer.querySelectorAll("[data-goods-category]").forEach(button => {
            button.addEventListener("click", () => {
                const category = button.dataset.goodsCategory;

                if(state.activeGoodsCategories.has(category)){
                    state.activeGoodsCategories.delete(category);
                    button.classList.remove("is-active");
                }else{
                    state.activeGoodsCategories.add(category);
                    button.classList.add("is-active");
                }

                state.page = 1;
                render();
            });
        });
    }

    // ==========================
    // インクリメンタルサーチ・サジェストのドロップダウン
    // ==========================

    function getSearchSuggestions(keyword, limit){
        const normalizedKeyword = normalizeForSearch(keyword);

        if(!normalizedKeyword){
            return [];
        }

        return items
            .map(item => {
                const title = getItemTitle(item);
                const normalizedTitle = normalizeForSearch(title);
                let score = -1;

                if(normalizedTitle.startsWith(normalizedKeyword)){
                    score = 3;
                }else if(normalizedTitle.includes(normalizedKeyword)){
                    score = 2;
                }else if(fuzzyIncludes(normalizedTitle, normalizedKeyword)){
                    score = 1;
                }

                return { item, score };
            })
            .filter(entry => entry.score >= 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(entry => entry.item);
    }

    function closeSuggestions(){
        if(!suggestionsElement){
            return;
        }

        suggestionsElement.hidden = true;
        suggestionsElement.innerHTML = "";
        activeSuggestionIndex = -1;
        currentSuggestions = [];

        if(searchInput){
            searchInput.setAttribute("aria-expanded", "false");
        }
    }

    function applySuggestion(item){
        const title = getItemTitle(item);

        state.keyword = title;
        state.page = 1;

        if(searchInput){
            searchInput.value = title;
        }

        closeSuggestions();
        render();
        listElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function highlightActiveSuggestion(){
        if(!suggestionsElement){
            return;
        }

        suggestionsElement.querySelectorAll(".infoSearchSuggestionItem").forEach((element, index) => {
            element.classList.toggle("is-active", index === activeSuggestionIndex);
        });
    }

    function renderSuggestions(keyword){
        if(!suggestionsElement){
            return;
        }

        currentSuggestions = getSearchSuggestions(keyword, 5);
        activeSuggestionIndex = -1;

        if(currentSuggestions.length === 0){
            closeSuggestions();
            return;
        }

        suggestionsElement.innerHTML = currentSuggestions.map((item, index) => `
            <li
                class="infoSearchSuggestionItem"
                role="option"
                id="infoSearchSuggestion-${index}"
                data-index="${index}">
                ${renderHighlightedText(getItemTitle(item), keyword)}
                ${item.date ? `<span class="infoSearchSuggestionMeta">${escapeHTML(item.date)}</span>` : ""}
            </li>
        `).join("");

        suggestionsElement.hidden = false;

        if(searchInput){
            searchInput.setAttribute("aria-expanded", "true");
        }

        suggestionsElement.querySelectorAll(".infoSearchSuggestionItem").forEach(element => {
            element.addEventListener("mousedown", event => {
                // blurより先にクリックを処理するためmousedownで拾う
                event.preventDefault();
                const index = Number(element.dataset.index);
                applySuggestion(currentSuggestions[index]);
            });
        });
    }

    if(searchInput){
        searchInput.addEventListener("input", () => {
            state.keyword = searchInput.value.trim();
            state.page = 1;
            render();
            renderSuggestions(state.keyword);
        });

        searchInput.addEventListener("keydown", event => {
            if(!currentSuggestions.length || suggestionsElement.hidden){
                return;
            }

            if(event.key === "ArrowDown"){
                event.preventDefault();
                activeSuggestionIndex = (activeSuggestionIndex + 1) % currentSuggestions.length;
                highlightActiveSuggestion();
            }else if(event.key === "ArrowUp"){
                event.preventDefault();
                activeSuggestionIndex = (activeSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
                highlightActiveSuggestion();
            }else if(event.key === "Enter"){
                if(activeSuggestionIndex >= 0){
                    event.preventDefault();
                    applySuggestion(currentSuggestions[activeSuggestionIndex]);
                }else{
                    closeSuggestions();
                }
            }else if(event.key === "Escape"){
                closeSuggestions();
            }
        });

        searchInput.addEventListener("blur", () => {
            // クリック（mousedown）処理を先に走らせてから閉じる
            setTimeout(closeSuggestions, 100);
        });
    }

    if(controlsElement){
        controlsElement.querySelectorAll("[data-sort]").forEach(button => {
            button.addEventListener("click", () => {
                state.sort = button.dataset.sort;
                state.page = 1;

                controlsElement.querySelectorAll("[data-sort]").forEach(b =>
                    b.classList.toggle("is-active", b === button)
                );

                render();
            });
        });

        controlsElement.querySelectorAll("[data-period]").forEach(button => {
            button.addEventListener("click", () => {
                state.period = button.dataset.period;
                state.page = 1;

                controlsElement.querySelectorAll("[data-period]").forEach(b =>
                    b.classList.toggle("is-active", b === button)
                );

                render();
            });
        });

        controlsElement.querySelectorAll("[data-status]").forEach(button => {
            button.addEventListener("click", () => {
                state.status = button.dataset.status;
                state.page = 1;

                controlsElement.querySelectorAll("[data-status]").forEach(b =>
                    b.classList.toggle("is-active", b === button)
                );

                render();
            });
        });

        controlsElement.querySelectorAll("[data-readfilter]").forEach(button => {
            button.addEventListener("click", () => {
                state.unreadOnly = button.dataset.readfilter === "unread";
                state.page = 1;

                controlsElement.querySelectorAll("[data-readfilter]").forEach(b =>
                    b.classList.toggle("is-active", b === button)
                );

                render();
            });
        });
    }

    const filterToggle = document.getElementById("infoFilterToggle");
    const filterPanel = document.getElementById("infoFilterPanel");

    if(filterToggle && filterPanel){
        filterToggle.addEventListener("click", () => {
            const isOpen = filterPanel.classList.toggle("is-open");
            filterToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        });
    }

    if(prefectureToggle && prefectureFilterContainer){
        prefectureToggle.addEventListener("click", () => {
            const isOpen = prefectureFilterContainer.hidden;
            prefectureFilterContainer.hidden = !isOpen;
            prefectureToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        });
    }

    if(clearFiltersButton){
        clearFiltersButton.addEventListener("click", () => {
            state.keyword = "";
            state.activeTags.clear();
            state.activeGoodsCategories.clear();
            state.activeLocations.clear();
            state.activeSeries = "all";
            state.sort = "new";
            state.period = "all";
            state.status = "all";
            state.unreadOnly = false;
            state.customMonth = "";
            state.page = 1;

            if(searchInput){
                searchInput.value = "";
            }

            closeSuggestions();
            syncControlButtons();
            render();
        });
    }

    renderTagFilters();
    renderGoodsCategoryFilters();
    renderRegionFilters();
    renderPrefectureFilters();
    renderSeriesFilters();
    renderEndingSoon();
    applyStateFromUrlParams();
    renderLastUpdatedLabel(items, "lastUpdated");
    render();
    injectListStructuredData(items, "infoStructuredData");

    // ブラウザの戻る/進むボタンで検索キーワード・ページ番号などの状態を復元する
    window.addEventListener("popstate", () => {
        applyStateFromUrlParams();
        render();
        listElement.scrollIntoView({ behavior: "smooth", block: "start" });
    });

})();
