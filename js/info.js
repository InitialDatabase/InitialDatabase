// 頭文字D情報ページ（グッズ・コラボなどの最新情報）の一覧表示・検索・絞り込み

(function(){

    const items = Array.isArray(database.infos) ? database.infos : [];
    const listElement = document.getElementById("infoList");
    const countElement = document.getElementById("infoCount");
    const controlsElement = document.getElementById("infoControls");
    const searchInput = document.getElementById("infoSearchInput");
    const suggestionsElement = document.getElementById("infoSearchSuggestions");
    const tagFilterContainer = document.getElementById("infoTagFilters");

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
        activeTags: new Set(),
        sort: "new",
        period: "all",
        status: "all",
        unreadOnly: false,
        page: 1,
        customMonth: "" // アーカイブページの月別件数からの絞り込み（YYYY-MM）
    };

    // 1ページ目は9件、2ページ目以降は10件ずつ表示する
    const FIRST_PAGE_SIZE = 9;
    const OTHER_PAGE_SIZE = 10;

    let activeSuggestionIndex = -1;
    let currentSuggestions = [];

    function matchesKeyword(item){
        if(!state.keyword){
            return true;
        }

        return matchesSearchKeyword([
            getItemTitle(item),
            item.description || "",
            item.source || "",
            ...(Array.isArray(item.tags) ? item.tags : [])
        ], state.keyword);
    }

    function matchesTags(item){
        if(state.activeTags.size === 0){
            return true;
        }

        const itemTags = Array.isArray(item.tags) ? item.tags : [];

        return Array.from(state.activeTags).every(tag => itemTags.includes(tag));
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

    function getFilteredItems(){
        return items.filter(item =>
            matchesKeyword(item)
            && matchesTags(item)
            && matchesPeriod(item)
            && matchesStatus(item)
            && matchesUnread(item)
        );
    }

    function getSortedItems(filteredItems){
        const sorted = [...filteredItems].sort((a, b) =>
            String(a.date || "").localeCompare(String(b.date || ""))
        );

        return state.sort === "old" ? sorted : sorted.reverse();
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
            });
        });

        setupReadTrackingByView(listElement);
        loadTweetEmbeds(listElement);
    }

    function syncControlButtons(){
        if(!controlsElement){
            return;
        }

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
    }

    // アーカイブページの統計バー（タグ／月／出典／ステータス）からのリンクを反映し、
    // 検索キーワード・ページ番号も含めてURLと状態を双方向に同期する
    // 例：index.html?tag=グッズ　index.html?month=2026-08　index.html?status=ongoing
    //     index.html?source=GRANUP（X）　index.html?keyword=フィギュア&page=2
    function applyStateFromUrlParams(){
        const params = new URLSearchParams(window.location.search);
        const tagParam = params.get("tag");
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
            || state.period === "custom-month"
            || state.status !== "all";

        if(filterPanel && filterToggle){
            filterPanel.classList.toggle("is-open", hasActiveFilter);
            filterToggle.setAttribute("aria-expanded", hasActiveFilter ? "true" : "false");
        }
    }

    // 現在の絞り込み状態からURLクエリを組み立てる（タグ・月・ステータス・キーワード・ページ番号）
    function buildUrlParams(){
        const params = new URLSearchParams();

        if(state.activeTags.size > 0){
            params.set("tag", Array.from(state.activeTags).join(","));
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

    renderTagFilters();
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
