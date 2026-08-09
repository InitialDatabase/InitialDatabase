// お気に入り一覧ページの表示・並び替え・エクスポート/インポート

(function(){

    const favoriteList = document.getElementById("favoriteList");
    const favoriteCount = document.getElementById("favoriteCount");
    const toolbar = document.getElementById("favoriteToolbar");
    const exportButton = document.getElementById("favoriteExportButton");
    const importInput = document.getElementById("favoriteImportInput");

    const state = {
        sort: "added"
    };

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

    function renderFavorites(){
        const resolvedFavorites = getFavorites().map(favorite => {
            const item = getFavoriteItem(favorite);

            return item ? { favorite, item } : null;
        }).filter(Boolean);

        favoriteCount.textContent = `お気に入り：${resolvedFavorites.length}件`;

        if(resolvedFavorites.length === 0){
            favoriteList.innerHTML = `<p class="emptyMessage">お気に入りはありません</p>`;
            return;
        }

        const sortedFavorites = getSortedFavorites(resolvedFavorites);

        favoriteList.innerHTML = sortedFavorites.map(({ favorite, item }) =>
            buildInfoCard(item, createRemoveFavoriteButton(favorite), "favoriteCard", "", favorite.category)
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
