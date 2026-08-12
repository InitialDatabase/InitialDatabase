// アーカイブ・統計ページ（月別アーカイブ検索／タグ・月・出典・ステータス別件数）

(function(){

    const items = Array.isArray(database.infos) ? database.infos : [];
    const summaryElement = document.getElementById("archiveSummary");
    const monthListElement = document.getElementById("archiveMonthList");
    const archiveSearchInput = document.getElementById("archiveSearchInput");
    const tagStatsElement = document.getElementById("tagStatsList");
    const monthStatsElement = document.getElementById("monthStatsList");
    const monthStatsToggle = document.getElementById("monthStatsToggle");
    const sourceStatsElement = document.getElementById("sourceStatsList");
    const statusStatsElement = document.getElementById("statusStatsList");
    const visitorBadgeElement = document.getElementById("siteVisitorBadge");

    // 月別件数グラフ：デフォルトは直近12ヶ月のみ表示し、ボタンで全期間表示に切り替える
    const MONTH_STATS_DEFAULT_COUNT = 12;
    let showAllMonthStats = false;
    let searchKeyword = "";
    let searchMode = "partial"; // "partial"（部分一致）または "exact"（完全一致）

    // ==========================
    // サイト累計訪問者数バッジ
    // ==========================

    if(visitorBadgeElement){
        visitorBadgeElement.src = getSiteVisitorBadgeUrl("Total Visits");
    }

    if(!monthListElement){
        return;
    }

    if(items.length === 0){
        if(summaryElement){
            summaryElement.textContent = "全 0 件";
        }
        monthListElement.innerHTML = `<p class="emptyMessage">情報がありません</p>`;
        return;
    }

    function getMonthKey(dateStr){
        const date = parseDateOnly(dateStr);

        return date ? `${date.getFullYear()}-${pad2(date.getMonth() + 1)}` : null;
    }

    function getMonthLabel(monthKey){
        const [year, month] = monthKey.split("-");

        return `${year}年${Number(month)}月`;
    }

    function getMonthKeyFromHash(){
        const hash = window.location.hash.replace("#", "");

        return /^\d{4}-\d{2}$/.test(hash) ? hash : null;
    }

    function itemMatchesArchiveSearch(item, keyword){
        if(!keyword){
            return true;
        }

        return matchesSearchKeyword([
            getItemTitle(item),
            item.description || "",
            item.source || "",
            ...(Array.isArray(item.tags) ? item.tags : [])
        ], keyword, searchMode);
    }

    // ==========================
    // 月別アーカイブ（グループ化）
    // ==========================

    const monthGroups = new Map();

    items.forEach(item => {
        const key = getMonthKey(item.date);

        if(!key){
            return;
        }

        if(!monthGroups.has(key)){
            monthGroups.set(key, []);
        }

        monthGroups.get(key).push(item);
    });

    const monthKeysNewFirst = Array.from(monthGroups.keys()).sort((a, b) => b.localeCompare(a));
    const targetMonthFromHash = getMonthKeyFromHash();

    // ==========================
    // サマリー表示（検索時は該当件数を表示）
    // ==========================

    function updateSummary(){
        if(!summaryElement){
            return;
        }

        const normalizedKeyword = searchKeyword.trim();

        if(!normalizedKeyword){
            summaryElement.textContent = `全 ${items.length} 件／${monthKeysNewFirst.length} ヶ月分`;
            return;
        }

        const matchedCount = items.filter(item => itemMatchesArchiveSearch(item, normalizedKeyword)).length;

        summaryElement.textContent = `検索結果：${matchedCount} 件（全 ${items.length} 件中）`;
    }

    // ==========================
    // 月別アーカイブ一覧の描画
    // ==========================

    function renderMonthList(){
        const normalizedKeyword = searchKeyword.trim();

        const groupsHtml = monthKeysNewFirst.map((key, index) => {
            const monthItems = [...monthGroups.get(key)]
                .filter(item => itemMatchesArchiveSearch(item, normalizedKeyword))
                .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

            if(monthItems.length === 0){
                return "";
            }

            const itemsHtml = monthItems.map(item => `
                <li class="archiveMonthItem">
                    <span class="archiveMonthItemDate">${escapeHTML(item.date || "")}</span>
                    <a href="${escapeHTML(item.articleUrl || "#")}" target="_blank" rel="noopener noreferrer">
                        ${escapeHTML(getItemTitle(item))}
                    </a>
                </li>
            `).join("");

            // 検索中や特定月へのリンクで開いた場合はその月を開いておく
            const shouldOpen = Boolean(normalizedKeyword) || index === 0 || key === targetMonthFromHash;

            return `
                <details class="archiveMonthGroup" id="archiveMonth-${key}"${shouldOpen ? " open" : ""}>
                    <summary>${escapeHTML(getMonthLabel(key))}（${monthItems.length}件）</summary>
                    <ul class="archiveMonthItems">
                        ${itemsHtml}
                    </ul>
                </details>
            `;
        }).join("");

        monthListElement.innerHTML = groupsHtml
            || `<p class="emptyMessage">条件に一致する情報がありませんでした。</p>`;

        updateSummary();
    }

    if(archiveSearchInput){
        archiveSearchInput.addEventListener("input", () => {
            searchKeyword = archiveSearchInput.value;
            renderMonthList();
        });
    }

    searchMode = setupSearchModeToggle("archiveSearchModeToggle", mode => {
        searchMode = mode;
        renderMonthList();
    });

    renderMonthList();

    // 特定の月へのリンク（例：archive.html#2026-08）で開いた場合はその月までスクロール
    if(targetMonthFromHash){
        const targetElement = document.getElementById(`archiveMonth-${targetMonthFromHash}`);

        if(targetElement){
            targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    // ==========================
    // タグ別件数（クリックで一覧ページの該当タグ絞り込みへ）
    // ==========================

    if(tagStatsElement){
        const tagCounts = new Map();

        items.forEach(item => {
            (Array.isArray(item.tags) ? item.tags : []).forEach(tag => {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            });
        });

        const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
        const maxTagCount = sortedTags.length > 0 ? sortedTags[0][1] : 0;

        tagStatsElement.innerHTML = sortedTags.length === 0
            ? `<p class="emptyMessage">タグ情報がありません</p>`
            : sortedTags.map(([tag, count]) => `
                <li>
                    <a class="statsBarRow statsBarLink" href="../index.html?tag=${encodeURIComponent(tag)}">
                        <span class="statsBarLabel">${escapeHTML(tag)}</span>
                        <span class="statsBarTrack">
                            <span class="statsBarFill" style="width:${maxTagCount ? Math.max(4, Math.round(count / maxTagCount * 100)) : 0}%"></span>
                        </span>
                        <span class="statsBarValue">${count}</span>
                    </a>
                </li>
            `).join("");
    }

    // ==========================
    // 月別件数（クリックで一覧ページの該当月絞り込みへ／直近12ヶ月表示の切り替え）
    // ==========================

    function renderMonthStats(){
        if(!monthStatsElement){
            return;
        }

        const monthKeysOldFirst = [...monthKeysNewFirst].sort((a, b) => a.localeCompare(b));
        const hasMoreThanDefault = monthKeysOldFirst.length > MONTH_STATS_DEFAULT_COUNT;
        const visibleMonthKeys = showAllMonthStats
            ? monthKeysOldFirst
            : monthKeysOldFirst.slice(-MONTH_STATS_DEFAULT_COUNT);

        const maxMonthCount = visibleMonthKeys.reduce((max, key) =>
            Math.max(max, monthGroups.get(key).length), 0);

        monthStatsElement.innerHTML = visibleMonthKeys.map(key => {
            const count = monthGroups.get(key).length;

            return `
                <li>
                    <a class="statsBarRow statsBarLink" href="../index.html?month=${encodeURIComponent(key)}">
                        <span class="statsBarLabel">${escapeHTML(getMonthLabel(key))}</span>
                        <span class="statsBarTrack">
                            <span class="statsBarFill" style="width:${maxMonthCount ? Math.max(4, Math.round(count / maxMonthCount * 100)) : 0}%"></span>
                        </span>
                        <span class="statsBarValue">${count}</span>
                    </a>
                </li>
            `;
        }).join("");

        if(monthStatsToggle){
            monthStatsToggle.hidden = !hasMoreThanDefault;
            monthStatsToggle.textContent = showAllMonthStats ? "直近12ヶ月のみ表示" : "全期間を見る";
        }
    }

    if(monthStatsToggle){
        monthStatsToggle.addEventListener("click", () => {
            showAllMonthStats = !showAllMonthStats;
            renderMonthStats();
        });
    }

    renderMonthStats();

    // ==========================
    // 出典（発信元アカウント）別件数
    // ==========================

    if(sourceStatsElement){
        const sourceCounts = new Map();

        items.forEach(item => {
            if(!item.source){
                return;
            }

            sourceCounts.set(item.source, (sourceCounts.get(item.source) || 0) + 1);
        });

        const sortedSources = Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1]);
        const maxSourceCount = sortedSources.length > 0 ? sortedSources[0][1] : 0;

        sourceStatsElement.innerHTML = sortedSources.length === 0
            ? `<p class="emptyMessage">出典情報がありません</p>`
            : sortedSources.map(([source, count]) => `
                <li>
                    <a class="statsBarRow statsBarLink" href="../index.html?source=${encodeURIComponent(source)}">
                        <span class="statsBarLabel">${escapeHTML(source)}</span>
                        <span class="statsBarTrack">
                            <span class="statsBarFill" style="width:${maxSourceCount ? Math.max(4, Math.round(count / maxSourceCount * 100)) : 0}%"></span>
                        </span>
                        <span class="statsBarValue">${count}</span>
                    </a>
                </li>
            `).join("");
    }

    // ==========================
    // ステータス（発売前／予約開始／開催中／終了済み）別件数
    // ==========================

    if(statusStatsElement){
        const statusOrder = ["before", "reservation", "ongoing", "ended"];
        const statusCounts = new Map();

        items.forEach(item => {
            const status = getItemEventStatus(item);

            if(!status){
                return;
            }

            statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
        });

        const sortedStatuses = statusOrder
            .filter(status => statusCounts.has(status))
            .map(status => [status, statusCounts.get(status)]);

        const maxStatusCount = sortedStatuses.reduce((max, [, count]) => Math.max(max, count), 0);

        statusStatsElement.innerHTML = sortedStatuses.length === 0
            ? `<p class="emptyMessage">開催・発売時期の情報がありません</p>`
            : sortedStatuses.map(([status, count]) => `
                <li>
                    <a class="statsBarRow statsBarLink" href="../index.html?status=${encodeURIComponent(status)}">
                        <span class="statsBarLabel">${escapeHTML(getEventStatusLabel(status))}</span>
                        <span class="statsBarTrack">
                            <span class="statsBarFill" style="width:${maxStatusCount ? Math.max(4, Math.round(count / maxStatusCount * 100)) : 0}%"></span>
                        </span>
                        <span class="statsBarValue">${count}</span>
                    </a>
                </li>
            `).join("");
    }

})();
