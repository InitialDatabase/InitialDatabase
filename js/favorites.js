// お気に入り一覧ページの表示・並び替え・エクスポート/インポート

(function(){

    const favoriteList = document.getElementById("favoriteList");
    const favoriteCount = document.getElementById("favoriteCount");
    const toolbar = document.getElementById("favoriteToolbar");
    const exportButton = document.getElementById("favoriteExportButton");
    const importInput = document.getElementById("favoriteImportInput");
    const clearAllButton = document.getElementById("favoriteClearAllButton");
    const searchInput = document.getElementById("favoriteSearchInput");
    const suggestionsElement = document.getElementById("favoriteSearchSuggestions");
    const tagFilterContainer = document.getElementById("favoriteTagFilters");
    const clearFiltersButton = document.getElementById("favoriteFilterClear");
    const toastElement = document.getElementById("favoriteToast");

    const state = {
        sort: "added",
        keyword: "",
        searchMode: "partial", // "partial"（部分一致）または "exact"（完全一致）
        activeTags: new Set(),
        page: 1
    };

    // 1ページ目・2ページ目以降ともに10件ずつ表示する
    const FIRST_PAGE_SIZE = 10;
    const OTHER_PAGE_SIZE = 10;

    let activeSuggestionIndex = -1;
    let currentSuggestions = [];

    state.searchMode = setupSearchModeToggle("favoriteSearchModeToggle", mode => {
        state.searchMode = mode;
        state.page = 1;
        renderFavorites();
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

    function createRemoveFavoriteButton(favorite){
        return `
            <button
                type="button"
                class="favoriteButton is-favorite"
                data-remove-favorite
                data-category="${escapeHTML(favorite.category)}"
                data-id="${favorite.id}"
            >
                ★ お気に入り解除
            </button>
        `;
    }

    function getSortedFavorites(resolvedFavorites){
        if(state.sort === "added"){
            return resolvedFavorites;
        }

        // info.jsと同じ理由（安定ソート後のreverse()による同日項目の順序反転）で
        // 「新しい順」を直接ソートし、「古い順」はそれを丸ごと反転して作る。
        const sortedNewFirst = [...resolvedFavorites].sort((a, b) =>
            String(b.item.date || "").localeCompare(String(a.item.date || ""))
        );

        return state.sort === "old" ? sortedNewFirst.reverse() : sortedNewFirst;
    }

    function renderTagFilters(resolvedFavorites){
        if(!tagFilterContainer){
            return;
        }

        const allTags = Array.from(new Set(
            resolvedFavorites.flatMap(({ item }) => Array.isArray(item.tags) ? item.tags : [])
        ));

        if(allTags.length === 0){
            tagFilterContainer.innerHTML = "";
            return;
        }

        tagFilterContainer.innerHTML = allTags.map(tag => `
            <button type="button" class="infoTagButton${state.activeTags.has(tag) ? " is-active" : ""}" data-favtag="${escapeHTML(tag)}">
                ${escapeHTML(tag)}
            </button>
        `).join("");

        tagFilterContainer.querySelectorAll("[data-favtag]").forEach(button => {
            button.addEventListener("click", () => {
                const tag = button.dataset.favtag;

                if(state.activeTags.has(tag)){
                    state.activeTags.delete(tag);
                }else{
                    state.activeTags.add(tag);
                }

                state.page = 1;
                renderFavorites();
            });
        });
    }

    // 「あと○日で終了」のお気に入りをまとめて知らせる「🔥 まもなく終了」セクション。
    // トップページの同名セクション（info.js側のrenderEndingSoon）と同じロジック・見た目を、
    // 対象を「サイト全体の情報」から「お気に入りに入れた情報」に絞って流用したもの。
    // 現在の検索・タグ絞り込みの影響は受けず、常にお気に入り全体から判定する。
    function renderFavoriteEndingSoon(resolvedFavorites){
        const section = document.getElementById("endingSoonSection");
        const container = document.getElementById("endingSoonList");
        const toggleButton = document.getElementById("endingSoonToggle");

        if(!section || !container){
            return;
        }

        // 同じ出来事を複数お気に入りに入れている場合にカードが重複しないよう、
        // 先に代表のお気に入りへまとめてから判定する
        const favoritedItems = resolvedFavorites.map(({ item }) => item);
        const representativeItems = dedupeByEventGroup(favoritedItems).map(entry => entry.item);

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

        // 表示/非表示の設定はトップページの「🔥 まもなく終了」と共通（サイト全体で1つの好みとして扱う）
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
                    data-fav-ending-id="${item.id}">
                    ${dateLabel ? `<span class="endingSoonDate">${escapeHTML(dateLabel)}</span>` : ""}
                    <span class="endingSoonCardTitle">${escapeHTML(getItemTitle(item))}</span>
                    <span class="endingSoonBadge">${escapeHTML(daysLabel)}</span>
                </button>
            `;
        }).join("");

        container.querySelectorAll("[data-fav-ending-id]").forEach(button => {
            button.addEventListener("click", () => {
                const id = Number(button.dataset.favEndingId);
                const target = favoritedItems.find(candidate => candidate.id === id);

                if(!target){
                    return;
                }

                // クリックした情報だけをキーワード検索で絞り込み、詳細（ツイート埋め込み）まで表示する
                state.keyword = getItemTitle(target);
                state.activeTags.clear();
                state.page = 1;

                if(searchInput){
                    searchInput.value = state.keyword;
                }

                closeSuggestions();
                renderFavorites();
                favoriteList.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        });
    }

    // ==========================
    // お気に入り解除の「元に戻す」トースト
    // ==========================

    let toastTimeoutId = null;

    function hideFavoriteToast(){
        if(!toastElement){
            return;
        }

        if(toastTimeoutId){
            clearTimeout(toastTimeoutId);
            toastTimeoutId = null;
        }

        toastElement.classList.remove("is-visible");
        toastElement.hidden = true;
        toastElement.innerHTML = "";
    }

    function showFavoriteToast(message, onUndo){
        if(!toastElement){
            return;
        }

        // 連続で解除された場合は前のトーストを打ち切り、直近の1件だけ「元に戻す」を出す
        hideFavoriteToast();

        toastElement.innerHTML = `
            <span class="favoriteToastMessage">${escapeHTML(message)}</span>
            <button type="button" class="favoriteToastButton" id="favoriteToastUndoButton">元に戻す</button>
        `;

        toastElement.hidden = false;

        // hidden解除直後にクラスを付けるとトランジションが効かないため、次フレームで付与する
        requestAnimationFrame(() => {
            toastElement.classList.add("is-visible");
        });

        const undoButton = document.getElementById("favoriteToastUndoButton");

        if(undoButton){
            undoButton.addEventListener("click", () => {
                hideFavoriteToast();
                onUndo();
            });
        }

        toastTimeoutId = setTimeout(hideFavoriteToast, 6000);
    }

    function removeFavoriteWithUndo(category, id){
        const favorites = getFavorites();
        const index = favorites.findIndex(favorite => favorite.category === category && favorite.id === id);

        if(index === -1){
            return;
        }

        const removedFavorite = favorites[index];
        const removedItem = getFavoriteItem(removedFavorite);
        const removedTitle = removedItem ? getItemTitle(removedItem) : "お気に入り";

        saveFavorites(favorites.filter((favorite, favoriteIndex) => favoriteIndex !== index));
        renderFavorites();

        showFavoriteToast(`「${removedTitle}」をお気に入りから解除しました`, () => {
            const currentFavorites = getFavorites();

            // 取り消しを押すまでの間に同じ項目が別操作で再登録されていた場合は、二重に追加しない
            const alreadyExists = currentFavorites.some(favorite =>
                favorite.category === removedFavorite.category && favorite.id === removedFavorite.id
            );

            if(alreadyExists){
                return;
            }

            const restored = currentFavorites.slice();
            restored.splice(Math.min(index, restored.length), 0, removedFavorite);

            saveFavorites(restored);
            renderFavorites();
        });
    }

    function getResolvedFavorites(){
        return getFavorites().map(favorite => {
            const item = getFavoriteItem(favorite);

            return item ? { favorite, item } : null;
        }).filter(Boolean);
    }

    function renderFavorites(){
        const resolvedFavorites = getResolvedFavorites();

        renderFavoriteEndingSoon(resolvedFavorites);
        renderTagFilters(resolvedFavorites);

        const filteredFavorites = resolvedFavorites.filter(({ item }) =>
            matchesKeyword(item) && matchesTags(item)
        );

        const isFiltered = Boolean(state.keyword) || state.activeTags.size > 0 || state.sort !== "added";

        if(clearFiltersButton){
            clearFiltersButton.hidden = !isFiltered;
        }

        favoriteCount.textContent = isFiltered
            ? `お気に入り：${filteredFavorites.length}件（全${resolvedFavorites.length}件中）`
            : `お気に入り：${resolvedFavorites.length}件`;

        if(resolvedFavorites.length === 0){
            favoriteList.innerHTML = `<p class="emptyMessage">お気に入りはありません</p>`;
            renderPaginationControls("favoritePagination", 1, 1, () => {});
            return;
        }

        if(filteredFavorites.length === 0){
            favoriteList.innerHTML = `<p class="emptyMessage">条件に一致するお気に入りがありません</p>`;
            renderPaginationControls("favoritePagination", 1, 1, () => {});
            return;
        }

        const sortedFavorites = getSortedFavorites(filteredFavorites);

        const totalPages = getPaginationPageCount(sortedFavorites.length, FIRST_PAGE_SIZE, OTHER_PAGE_SIZE);

        if(state.page > totalPages){
            state.page = totalPages;
        }

        if(state.page < 1){
            state.page = 1;
        }

        const [start, end] = getPaginationRange(state.page, FIRST_PAGE_SIZE, OTHER_PAGE_SIZE);
        const pageFavorites = sortedFavorites.slice(start, end);

        favoriteList.innerHTML = pageFavorites.map(({ favorite, item }) =>
            buildInfoCard(item, createRemoveFavoriteButton(favorite), "favoriteCard", state.keyword, favorite.category)
        ).join("");

        favoriteList.querySelectorAll("[data-remove-favorite]").forEach(button => {
            button.addEventListener("click", () => {
                removeFavoriteWithUndo(button.dataset.category, Number(button.dataset.id));
            });
        });

        setupReadTrackingByView(favoriteList);
        loadTweetEmbeds(favoriteList);

        renderPaginationControls("favoritePagination", state.page, totalPages, targetPage => {
            state.page = targetPage;
            renderFavorites();
            favoriteList.scrollIntoView({ behavior: "smooth", block: "start" });
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

        return getResolvedFavorites()
            .map(({ item }) => {
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
        renderFavorites();
        favoriteList.scrollIntoView({ behavior: "smooth", block: "start" });
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
                id="favoriteSearchSuggestion-${index}"
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
            renderFavorites();
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

    const filterToggle = document.getElementById("favoriteFilterToggle");
    const filterPanel = document.getElementById("favoriteFilterPanel");

    if(filterToggle && filterPanel){
        filterToggle.addEventListener("click", () => {
            const isOpen = filterPanel.classList.toggle("is-open");
            filterToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        });
    }

    if(clearFiltersButton){
        clearFiltersButton.addEventListener("click", () => {
            state.keyword = "";
            state.activeTags.clear();
            state.sort = "added";
            state.page = 1;

            if(searchInput){
                searchInput.value = "";
            }

            if(toolbar){
                toolbar.querySelectorAll("[data-favsort]").forEach(b =>
                    b.classList.toggle("is-active", b.dataset.favsort === "added")
                );
            }

            closeSuggestions();
            renderFavorites();
        });
    }

    if(toolbar){
        toolbar.querySelectorAll("[data-favsort]").forEach(button => {
            button.addEventListener("click", () => {
                state.sort = button.dataset.favsort;
                state.page = 1;

                toolbar.querySelectorAll("[data-favsort]").forEach(b =>
                    b.classList.toggle("is-active", b === button)
                );

                renderFavorites();
            });
        });
    }

    if(exportButton){
        exportButton.addEventListener("click", () => {
            const favorites = getFavorites();
            const blob = new Blob([JSON.stringify(favorites, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = "initial-d-database-favorites.json";
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        });
    }

    if(clearAllButton){
        clearAllButton.addEventListener("click", () => {
            if(getFavorites().length === 0){
                alert("お気に入りはまだ登録されていません。");
                return;
            }

            const confirmed = confirm(
                "お気に入りを全件削除します。この操作は取り消せません。\nよろしいですか？"
            );

            if(!confirmed){
                return;
            }

            saveFavorites([]);

            state.keyword = "";
            state.activeTags.clear();
            state.sort = "added";
            state.page = 1;

            if(searchInput){
                searchInput.value = "";
            }

            if(toolbar){
                toolbar.querySelectorAll("[data-favsort]").forEach(b =>
                    b.classList.toggle("is-active", b.dataset.favsort === "added")
                );
            }

            closeSuggestions();
            renderFavorites();
            alert("お気に入りを全件削除しました。");
        });
    }

    if(importInput){
        importInput.addEventListener("change", () => {
            const file = importInput.files && importInput.files[0];

            if(!file){
                return;
            }

            const reader = new FileReader();

            reader.onload = () => {
                try{
                    const imported = JSON.parse(String(reader.result));

                    if(!Array.isArray(imported)){
                        throw new Error("invalid format");
                    }

                    saveFavorites(getFavorites().concat(imported));
                    renderFavorites();
                    alert("お気に入りをインポートしました。");
                }catch(error){
                    alert("インポートに失敗しました。エクスポートしたJSONファイルを選択してください。");
                }finally{
                    importInput.value = "";
                }
            };

            reader.readAsText(file);
        });
    }

    renderFavorites();

})();
