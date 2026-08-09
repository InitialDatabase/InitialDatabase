// お気に入り一覧ページの表示・並び替え・エクスポート/インポート

(function(){

    const favoriteList = document.getElementById("favoriteList");
    const favoriteCount = document.getElementById("favoriteCount");
    const toolbar = document.getElementById("favoriteToolbar");
    const exportButton = document.getElementById("favoriteExportButton");
    const importInput = document.getElementById("favoriteImportInput");
    const searchInput = document.getElementById("favoriteSearchInput");
    const tagFilterContainer = document.getElementById("favoriteTagFilters");

    const state = {
        sort: "added",
        keyword: "",
        activeTags: new Set()
    };

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

        const sorted = [...resolvedFavorites].sort((a, b) =>
            String(a.item.date || "").localeCompare(String(b.item.date || ""))
        );

        return state.sort === "old" ? sorted : sorted.reverse();
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

                renderFavorites();
            });
        });
    }

    function renderFavorites(){
        const resolvedFavorites = getFavorites().map(favorite => {
            const item = getFavoriteItem(favorite);

            return item ? { favorite, item } : null;
        }).filter(Boolean);

        renderTagFilters(resolvedFavorites);

        const filteredFavorites = resolvedFavorites.filter(({ item }) =>
            matchesKeyword(item) && matchesTags(item)
        );

        const isFiltered = Boolean(state.keyword) || state.activeTags.size > 0;

        favoriteCount.textContent = isFiltered
            ? `お気に入り：${filteredFavorites.length}件（全${resolvedFavorites.length}件中）`
            : `お気に入り：${resolvedFavorites.length}件`;

        if(resolvedFavorites.length === 0){
            favoriteList.innerHTML = `<p class="emptyMessage">お気に入りはありません</p>`;
            return;
        }

        if(filteredFavorites.length === 0){
            favoriteList.innerHTML = `<p class="emptyMessage">条件に一致するお気に入りがありません</p>`;
            return;
        }

        const sortedFavorites = getSortedFavorites(filteredFavorites);

        favoriteList.innerHTML = sortedFavorites.map(({ favorite, item }) =>
            buildInfoCard(item, createRemoveFavoriteButton(favorite), "favoriteCard", state.keyword, favorite.category)
        ).join("");

        favoriteList.querySelectorAll("[data-remove-favorite]").forEach(button => {
            button.addEventListener("click", () => {
                removeFavorite(button.dataset.category, button.dataset.id);
                renderFavorites();
            });
        });

        setupReadTrackingByView(favoriteList);
        loadTweetEmbeds(favoriteList);
    }

    if(searchInput){
        searchInput.addEventListener("input", () => {
            state.keyword = searchInput.value.trim();
            renderFavorites();
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

    if(toolbar){
        toolbar.querySelectorAll("[data-favsort]").forEach(button => {
            button.addEventListener("click", () => {
                state.sort = button.dataset.favsort;

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
