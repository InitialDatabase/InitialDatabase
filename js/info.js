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
    const markAllReadButton = document.getElementById("infoMarkAllReadButton");

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
        activeSource: "", // 出典（発信元アカウント）での絞り込み。カード内の出典リンクやアーカイブページの統計から設定される
        sort: "new",
        period: "all",
        status: "all",
        unreadOnly: false,
        page: 1,
        customMonth: "", // アーカイブページの月別件数からの絞り込み（YYYY-MM）
        displayDensity: "card" // "card"（カード表示）または "compact"（コンパクトリスト表示）
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

    // 表示形式（カード／コンパクトリスト）はページ番号や絞り込み結果には影響しないため、
    // 切り替え時はpageをリセットせずそのまま再描画する
    state.displayDensity = setupDisplayDensityToggle("infoDisplayDensityToggle", density => {
        state.displayDensity = density;
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

    function matchesSource(item){
        if(!state.activeSource){
            return true;
        }

        return item.source === state.activeSource;
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
            || Boolean(state.activeSource)
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

    // 「すべて既読にする」ボタン用に、未読フィルター自体は適用しない絞り込み結果を返す。
    // 「表示：すべて」「表示：未読のみ」のどちらを見ていても、他の絞り込み条件
    // （タグ・キーワード・作品など）に一致する未読件数を数えられるようにするため
    function getFilteredItemsIgnoringReadState(){
        return items.filter(item =>
            matchesKeyword(item)
            && matchesTags(item)
            && matchesGoodsCategory(item)
            && matchesLocation(item)
            && matchesSeries(item)
            && matchesSource(item)
            && matchesPeriod(item)
            && matchesStatus(item)
        );
    }

    function getFilteredItems(){
        return getFilteredItemsIgnoringReadState().filter(matchesUnread);
    }

    // 現在の絞り込み条件（表示：すべて／未読のみ、自体は除く）に一致する未読件数を数え、
    // 「すべて既読にする」ボタンの表示・件数・対象idを更新する。
    // 未読が0件になってもdisplay:noneでボタンを取り除くのではなく、is-invisibleクラスで
    // 見た目だけ消す。「表示：」フィルターグループの幅が変わって隣接するボタン群の
    // 折り返し位置がガクッと動いてしまう（ボタンが移動して見える）不具合があったため
    function updateMarkAllReadButton(filteredItemsIgnoringReadState){
        if(!markAllReadButton){
            return;
        }

        const unreadItems = filteredItemsIgnoringReadState.filter(item => !isItemRead("infos", item.id));

        markAllReadButton.hidden = false;
        markAllReadButton.classList.toggle("is-invisible", unreadItems.length === 0);

        if(unreadItems.length === 0){
            markAllReadButton.dataset.unreadIds = "";
            return;
        }

        markAllReadButton.textContent = `✓ すべて既読にする（${unreadItems.length}件）`;
        markAllReadButton.dataset.unreadIds = unreadItems.map(item => item.id).join(",");
    }

    // フィルター後の項目を「新着順」または「古い順」に並べたうえで、同じeventGroupId
    // （同一の出来事についての一連の投稿）を1件の代表投稿にまとめる。返り値は
    // {item:代表投稿, related:過去の関連情報の配列} の配列（1件ずつ画面に表示するカード単位）。
    //
    // 日付が同じ項目が複数ある場合、Array.sortは安定ソートのため、昇順に並べてから
    // reverse()すると同日内の順序まで反転してしまい、「新しい順」で同日の項目の
    // 前後関係が意図と逆になる不具合があった。そのため常に「新しい順」を直接ソートし、
    // 「古い順」はそれを丸ごと反転して作る。
    //
    // dedupeByEventGroup（js/common.js）は「渡された配列の中でグループが最初に
    // 出現した位置」に代表投稿を挿入する仕様のため、必ず「新着順」に並べた配列を
    // 渡してからグループ化し（＝各グループの代表＝最新の投稿がそのグループの中で
    // 最初に出現するため、挿入位置と代表の位置が一致する）、「古い順」表示の場合は
    // グループ化した後の結果をまとめて反転する。
    function getGroupedSortedItems(filteredItems){
        const sortedNewFirst = [...filteredItems].sort((a, b) =>
            String(b.date || "").localeCompare(String(a.date || ""))
        );

        const groupedNewFirst = dedupeByEventGroup(sortedNewFirst);

        return state.sort === "old" ? groupedNewFirst.reverse() : groupedNewFirst;
    }

    // displayItemsには、グループ化後の代表投稿のみを渡す（過去の関連情報としてまとめられた
    // ものは重複カウントしない）。表示されているカードの件数・タグ内訳と一致させるため
    function renderCount(displayItems){
        if(!countElement){
            return;
        }

        const tagCounts = new Map();

        displayItems.forEach(item => {
            const primaryTag = getPrimaryTag(item);

            if(!primaryTag){
                return;
            }

            tagCounts.set(primaryTag, (tagCounts.get(primaryTag) || 0) + 1);
        });

        const breakdown = Array.from(tagCounts.entries())
            .map(([tag, count]) => `${tag} ${count}`)
            .join("／");

        const sourceNote = state.activeSource
            ? `｜出典「${state.activeSource}」で絞り込み中`
            : "";

        countElement.textContent = (breakdown
            ? `全 ${displayItems.length} 件（${breakdown}）`
            : `全 ${displayItems.length} 件`) + sourceNote;
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

    // アーカイブページの統計バー（タグ／月／出典／ステータス）や各カードの出典リンクからの
    // 遷移を反映し、検索キーワード・ページ番号も含めてURLと状態を双方向に同期する
    // 例：index.html?tag=グッズ　index.html?month=2026-08　index.html?status=ongoing
    //     index.html?source=GRANUP（X）　index.html?keyword=フィギュア&page=2
    // ※sourceは出典名の完全一致による絞り込み（activeSource）。あいまい検索であるkeywordとは別物
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

        state.activeSource = sourceParam || "";

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

        state.keyword = keywordParam || "";

        if(searchInput){
            searchInput.value = state.keyword;
        }

        const parsedPage = Number(pageParam);
        state.page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

        syncControlButtons();

        const hasActiveFilter = state.activeTags.size > 0
            || state.activeLocations.size > 0
            || state.activeSeries !== "all"
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

        if(state.activeSource){
            params.set("source", state.activeSource);
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

    // ページ内の項目を並べる際、直前の項目と日付が変わったタイミングで
    // 「8月15日」のような日付見出しを挟み込む。ページをまたいで同じ日付の項目が
    // 分かれる場合、両方のページの先頭にその日付の見出しが表示される（ページ単位で
    // 完結させ、前のページの内容を覚えておく必要がないようにするため）
    function buildPageItemsHtml(pageEntries, isCompact){
        let previousDate = null;

        return pageEntries.map(({ item, related }) => {
            const itemHtml = isCompact
                ? buildInfoCompactRow(item, state.keyword, "infos", related)
                : buildInfoCard(item, createFavoriteButton("infos", item.id), "", state.keyword, "infos", related);

            const currentDate = item.date || "";
            const shouldShowHeading = currentDate && currentDate !== previousDate;
            const headingHtml = shouldShowHeading
                ? `<h2 class="infoDateHeading">${escapeHTML(formatDateHeadingLabel(currentDate))}</h2>`
                : "";

            if(currentDate){
                previousDate = currentDate;
            }

            return headingHtml + itemHtml;
        }).join("");
    }

    function render(pushHistory){
        const filteredItems = getFilteredItems();
        const groupedEntries = getGroupedSortedItems(filteredItems);

        // 件数・タグ内訳は、グループ化後の代表投稿の件数で表示する
        // （実際に表示されるカードの件数と一致させるため）
        renderCount(groupedEntries.map(entry => entry.item));
        updateClearButtonVisibility();
        updateMarkAllReadButton(getFilteredItemsIgnoringReadState());

        if(groupedEntries.length === 0){
            // 「注目のコンテンツ」フォールバックは件数が少なくコンパクト表示の恩恵が薄いため、
            // 表示形式に関わらず常にカード表示にする
            listElement.classList.remove("infoList--compact");
            renderNoResults();
            renderPaginationControls("infoPagination", 1, 1, () => {});
            updateUrlParams(Boolean(pushHistory));
            return;
        }

        const totalPages = getPaginationPageCount(groupedEntries.length, FIRST_PAGE_SIZE, OTHER_PAGE_SIZE);

        if(state.page > totalPages){
            state.page = totalPages;
        }

        if(state.page < 1){
            state.page = 1;
        }

        const [start, end] = getPaginationRange(state.page, FIRST_PAGE_SIZE, OTHER_PAGE_SIZE);
        const pageEntries = groupedEntries.slice(start, end);
        const isCompact = state.displayDensity === "compact";

        listElement.classList.toggle("infoList--compact", isCompact);

        listElement.innerHTML = buildPageItemsHtml(pageEntries, isCompact);

        listElement.querySelectorAll("[data-favorite-toggle]").forEach(button => {
            button.addEventListener("click", () => {
                const category = button.dataset.category;
                const id = Number(button.dataset.id);

                toggleFavorite(category, id);
                updateFavoriteButton(button, category, id);
                updateFavoriteBadgeInCard(button, category, id);
            });
        });

        // カード内の「出典」表示をクリックしたら、その場で同じ出典の情報だけに絞り込む
        // （通常のリンク遷移はpreventDefaultで止め、状態更新のみ行う）
        listElement.querySelectorAll("[data-source-filter]").forEach(link => {
            link.addEventListener("click", event => {
                event.preventDefault();

                const source = link.dataset.sourceFilter;

                if(!source || state.activeSource === source){
                    return;
                }

                state.activeSource = source;
                state.page = 1;
                render(true);
                listElement.scrollIntoView({ behavior: "smooth", block: "start" });
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

        // 同じeventGroupIdの投稿が複数「まもなく終了」に該当してしまうと
        // 同じイベントのカードが重複して並んでしまうため、先に代表投稿へまとめてから判定する
        const representativeItems = dedupeByEventGroup(items).map(entry => entry.item);

        const endingItems = representativeItems
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
    // インクリメンタルサーチ・サジェストのドロップダウン（タイトル候補／検索履歴）
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

    // currentSuggestionsの1件を確定させる。
    // type:"item"（タイトル候補）／"history"（検索履歴）の場合はそのキーワードで検索を実行し、
    // type:"clear"（履歴クリア行）の場合は履歴を全消去してドロップダウンを閉じるだけにする
    function applySuggestionEntry(entry){
        if(!entry){
            return;
        }

        if(entry.type === "clear"){
            clearSearchHistory();
            closeSuggestions();

            if(searchInput){
                searchInput.focus();
            }

            return;
        }

        const keyword = entry.type === "history" ? entry.keyword : getItemTitle(entry.item);

        state.keyword = keyword;
        state.page = 1;

        if(searchInput){
            searchInput.value = keyword;
        }

        addSearchHistory(keyword);
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

    function attachSuggestionClickHandlers(){
        suggestionsElement.querySelectorAll(".infoSearchSuggestionItem").forEach(element => {
            element.addEventListener("mousedown", event => {
                // blurより先にクリックを処理するためmousedownで拾う
                event.preventDefault();
                const index = Number(element.dataset.index);
                applySuggestionEntry(currentSuggestions[index]);
            });
        });
    }

    function showSuggestionsDropdown(){
        suggestionsElement.hidden = false;

        if(searchInput){
            searchInput.setAttribute("aria-expanded", "true");
        }

        attachSuggestionClickHandlers();
    }

    // 入力欄が空の状態でフォーカスされた時に表示する「最近の検索」履歴
    function renderHistorySuggestions(){
        if(!suggestionsElement){
            return;
        }

        const history = getSearchHistory();
        activeSuggestionIndex = -1;

        if(history.length === 0){
            closeSuggestions();
            return;
        }

        currentSuggestions = history
            .map(keyword => ({ type: "history", keyword }))
            .concat([{ type: "clear" }]);

        suggestionsElement.innerHTML = currentSuggestions.map((entry, index) => {
            if(entry.type === "clear"){
                return `
                    <li
                        class="infoSearchSuggestionItem infoSearchHistoryClearItem"
                        role="option"
                        id="infoSearchSuggestion-${index}"
                        data-index="${index}">
                        🗑️ 検索履歴をすべて削除
                    </li>
                `;
            }

            return `
                <li
                    class="infoSearchSuggestionItem infoSearchHistoryItem"
                    role="option"
                    id="infoSearchSuggestion-${index}"
                    data-index="${index}">
                    <span class="infoSearchHistoryIcon" aria-hidden="true">🕒</span>${escapeHTML(entry.keyword)}
                </li>
            `;
        }).join("");

        showSuggestionsDropdown();
    }

    // 入力中に表示するタイトル候補（従来のサジェスト）
    function renderTitleSuggestions(keyword){
        if(!suggestionsElement){
            return;
        }

        const matchedItems = getSearchSuggestions(keyword, 5);
        activeSuggestionIndex = -1;
        currentSuggestions = matchedItems.map(item => ({ type: "item", item }));

        if(currentSuggestions.length === 0){
            closeSuggestions();
            return;
        }

        suggestionsElement.innerHTML = currentSuggestions.map((entry, index) => `
            <li
                class="infoSearchSuggestionItem"
                role="option"
                id="infoSearchSuggestion-${index}"
                data-index="${index}">
                ${renderHighlightedText(getItemTitle(entry.item), keyword)}
                ${entry.item.date ? `<span class="infoSearchSuggestionMeta">${escapeHTML(entry.item.date)}</span>` : ""}
            </li>
        `).join("");

        showSuggestionsDropdown();
    }

    // 入力欄が空ならこれまで検索した履歴を、文字が入っていればタイトル候補を出し分ける
    function renderSuggestions(keyword){
        if(!suggestionsElement){
            return;
        }

        if(!keyword){
            renderHistorySuggestions();
            return;
        }

        renderTitleSuggestions(keyword);
    }

    if(searchInput){
        searchInput.addEventListener("input", () => {
            state.keyword = searchInput.value.trim();
            state.page = 1;
            render();
            renderSuggestions(state.keyword);
        });

        // 入力欄が空の状態でフォーカスされたら、最近の検索履歴を候補として表示する
        // （文字が入っている状態のフォーカスでは、従来通りinputイベント側の挙動に任せる）
        searchInput.addEventListener("focus", () => {
            if(!searchInput.value.trim()){
                renderHistorySuggestions();
            }
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
                    applySuggestionEntry(currentSuggestions[activeSuggestionIndex]);
                }else{
                    if(state.keyword){
                        addSearchHistory(state.keyword);
                    }

                    closeSuggestions();
                }
            }else if(event.key === "Escape"){
                closeSuggestions();
            }
        });

        searchInput.addEventListener("blur", () => {
            // 候補を選ばずに入力欄から離れた場合も、その時点のキーワードを履歴に残す
            if(state.keyword){
                addSearchHistory(state.keyword);
            }

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

    if(markAllReadButton){
        markAllReadButton.addEventListener("click", () => {
            const ids = (markAllReadButton.dataset.unreadIds || "")
                .split(",")
                .filter(Boolean)
                .map(Number);

            if(ids.length === 0){
                return;
            }

            const confirmed = window.confirm(`現在の絞り込み条件に一致する${ids.length}件を既読にします。よろしいですか？`);

            if(!confirmed){
                return;
            }

            markItemsRead("infos", ids);
            render();
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
            state.activeSource = "";
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

    // カード内「🔗 過去の関連情報N件」ボタンの開閉（一覧はrenderのたびに作り直されるため、
    // listElement自体に一度だけイベント委任を設定しておく）
    setupRelatedToggleDelegation(listElement, ".infoCardGroupToggle");

    // ブラウザの戻る/進むボタンで検索キーワード・ページ番号などの状態を復元する
    window.addEventListener("popstate", () => {
        applyStateFromUrlParams();
        render();
        listElement.scrollIntoView({ behavior: "smooth", block: "start" });
    });

})();
