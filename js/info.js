// 頭文字D情報ページ（グッズ・コラボなどの最新情報）の一覧表示・検索・絞り込み

(function(){

    const items = Array.isArray(database.infos) ? database.infos : [];
    const listElement = document.getElementById("infoList");
    const countElement = document.getElementById("infoCount");
    const controlsElement = document.getElementById("infoControls");
    const searchInput = document.getElementById("infoSearchInput");
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
        unreadOnly: false
    };

    function matchesKeyword(item){
        if(!state.keyword){
            return true;
        }

        const haystack = [
            getItemTitle(item),
            item.description || "",
            item.source || "",
            ...(Array.isArray(item.tags) ? item.tags : [])
        ].join(" ").toLowerCase();

        return haystack.includes(state.keyword.toLowerCase());
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

        return true;
    }

    function matchesUnread(item){
        return state.unreadOnly ? !isItemRead("infos", item.id) : true;
    }

    function getFilteredItems(){
        return items.filter(item =>
            matchesKeyword(item) && matchesTags(item) && matchesPeriod(item) && matchesUnread(item)
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

    function render(){
        const filteredItems = getFilteredItems();
        const sortedItems = getSortedItems(filteredItems);

        renderCount(filteredItems);

        if(sortedItems.length === 0){
            listElement.innerHTML = `<p class="emptyMessage">条件に一致する情報がありません</p>`;
            return;
        }

        listElement.innerHTML = sortedItems.map(item =>
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

                render();
            });
        });
    }

    if(searchInput){
        searchInput.addEventListener("input", () => {
            state.keyword = searchInput.value.trim();
            render();
        });
    }

    if(controlsElement){
        controlsElement.querySelectorAll("[data-sort]").forEach(button => {
            button.addEventListener("click", () => {
                state.sort = button.dataset.sort;

                controlsElement.querySelectorAll("[data-sort]").forEach(b =>
                    b.classList.toggle("is-active", b === button)
                );

                render();
            });
        });

        controlsElement.querySelectorAll("[data-period]").forEach(button => {
            button.addEventListener("click", () => {
                state.period = button.dataset.period;

                controlsElement.querySelectorAll("[data-period]").forEach(b =>
                    b.classList.toggle("is-active", b === button)
                );

                render();
            });
        });

        controlsElement.querySelectorAll("[data-readfilter]").forEach(button => {
            button.addEventListener("click", () => {
                state.unreadOnly = button.dataset.readfilter === "unread";

                controlsElement.querySelectorAll("[data-readfilter]").forEach(b =>
                    b.classList.toggle("is-active", b === button)
                );

                render();
            });
        });
    }

    renderTagFilters();
    renderLastUpdatedLabel(items, "lastUpdated");
    render();
    injectListStructuredData(items, "infoStructuredData");

})();
