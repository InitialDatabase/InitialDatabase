// 更新情報ページ（サイト自体の機能追加・修正・変更履歴を月別・日別に表示／種類で絞り込み）

(function(){

    const items = Array.isArray(siteUpdates) ? siteUpdates : [];
    const summaryElement = document.getElementById("updateSummary");
    const groupListElement = document.getElementById("updateGroupList");
    const statsGridElement = document.getElementById("updateTypeFilter");
    const expandAllButton = document.getElementById("updateExpandAll");
    const collapseAllButton = document.getElementById("updateCollapseAll");

    const TYPE_LABELS = {
        added:"追加",
        fixed:"修正",
        changed:"変更",
        removed:"削除"
    };

    const TYPE_ICONS = {
        added:"➕",
        fixed:"🔧",
        changed:"🔁",
        removed:"🗑️"
    };

    const TYPE_ORDER = ["added", "fixed", "changed", "removed"];

    // 説明文がこの文字数を超える場合は省略し、「続きを読む」で展開できるようにする
    const DESC_TRUNCATE_LENGTH = 70;

    let activeType = "all";

    function getTypeLabel(type){
        return TYPE_LABELS[type] || "更新";
    }

    function getTypeIcon(type){
        return TYPE_ICONS[type] || "";
    }

    function getTypeClass(type){
        return TYPE_LABELS[type] ? type : "other";
    }

    if(!groupListElement){
        return;
    }

    if(items.length === 0){
        if(summaryElement){
            summaryElement.textContent = "全 0 件";
        }
        groupListElement.innerHTML = `<p class="emptyMessage">更新情報がありません</p>`;
        return;
    }

    // ==========================
    // 前回訪問からの新着件数
    // （getFavoriteStorageはお気に入り専用ではなく、サイト内共通の
    //   安全なlocalStorageアクセス関数。common.js側で定義されている）
    // ==========================

    const updatesSeenCountStorageKey = "initialDDatabaseUpdatesSeenCount";

    function getStoredUpdatesSeenCount(){
        const storage = getFavoriteStorage();

        if(!storage){
            return null;
        }

        try{
            const saved = storage.getItem(updatesSeenCountStorageKey);

            if(saved === null){
                return null;
            }

            const count = Number(saved);

            return Number.isInteger(count) && count >= 0 ? count : null;
        }catch(error){
            return null;
        }
    }

    function setStoredUpdatesSeenCount(count){
        const storage = getFavoriteStorage();

        if(!storage){
            return;
        }

        try{
            storage.setItem(updatesSeenCountStorageKey, String(count));
        }catch(error){
            // 保存できない場合は無視（新着件数表示ができないだけで、他の機能には影響しない）
        }
    }

    const newSinceVisitElement = document.getElementById("updateNewSinceVisit");

    if(newSinceVisitElement){
        const previousSeenCount = getStoredUpdatesSeenCount();

        // 初回訪問時（保存値がない場合）は「全件が新着」という誤解を招く表示になるため出さない
        if(previousSeenCount !== null && items.length > previousSeenCount){
            const newCount = items.length - previousSeenCount;

            newSinceVisitElement.textContent = `前回チェックから${newCount}件更新されました`;
            newSinceVisitElement.hidden = false;
        }

        setStoredUpdatesSeenCount(items.length);
    }

    // ==========================
    // 種類（追加／修正／変更／削除）別の統計カード（＝絞り込みボタンを兼ねる）
    // ==========================

    if(statsGridElement){
        const typeCounts = new Map();

        items.forEach(item => {
            typeCounts.set(item.type, (typeCounts.get(item.type) || 0) + 1);
        });

        const cardsHtml = [
            `<button type="button" class="updateStatCard is-active" data-updatetype="all">
                <span class="updateStatLabel">すべて</span>
                <span class="updateStatCount">${items.length}</span>
            </button>`
        ].concat(
            TYPE_ORDER
                .filter(type => typeCounts.has(type))
                .map(type => `
                    <button type="button" class="updateStatCard" data-updatetype="${type}">
                        <span class="updateStatLabel">${getTypeLabel(type)}</span>
                        <span class="updateStatCount">${typeCounts.get(type)}</span>
                    </button>
                `)
        ).join("");

        statsGridElement.innerHTML = cardsHtml;

        statsGridElement.querySelectorAll("button").forEach(button => {
            button.addEventListener("click", () => {
                activeType = button.dataset.updatetype;

                statsGridElement.querySelectorAll("button").forEach(b =>
                    b.classList.toggle("is-active", b === button)
                );

                renderGroups();
            });
        });
    }

    // ==========================
    // 月別グループ化（新しい月が上に来るよう並び替え）
    // ==========================

    function getMonthKey(dateStr){
        const date = parseDateOnly(dateStr);

        return date ? `${date.getFullYear()}-${pad2(date.getMonth() + 1)}` : null;
    }

    function getMonthLabel(monthKey){
        const [year, month] = monthKey.split("-");

        return `${year}年${Number(month)}月`;
    }

    function getDateLabel(dateStr){
        const date = parseDateOnly(dateStr);

        if(!date){
            return escapeHTML(dateStr || "");
        }

        const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];

        return `${date.getMonth() + 1}月${date.getDate()}日（${weekday}）`;
    }

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

    // ==========================
    // 1件分のアイテムHTML（説明文が長い場合は折りたたみ表示）
    // ==========================

    function renderItem(item){
        const description = item.description || "";
        const isLong = description.length > DESC_TRUNCATE_LENGTH;
        const shortText = isLong ? `${description.slice(0, DESC_TRUNCATE_LENGTH)}…` : description;
        const newBadge = isNewItem(item.date) ? `<span class="infoBadge infoBadge--new">NEW</span>` : "";

        const descHtml = description ? `
            <div class="updateItemDesc"${isLong ? ` data-full="${escapeHTML(description)}" data-short="${escapeHTML(shortText)}"` : ""}>
                <span class="updateItemDescText">${escapeHTML(shortText)}</span>
                ${isLong ? `<button type="button" class="updateDescToggleBtn" aria-expanded="false">続きを読む</button>` : ""}
            </div>
        ` : "";

        return `
            <li class="updateItem">
                <span class="updateItemBadge updateItemBadge--${getTypeClass(item.type)}">${getTypeIcon(item.type)} ${getTypeLabel(item.type)}</span>
                ${newBadge}
                <div class="updateItemBody">
                    <div class="updateItemTitle">${escapeHTML(item.title || "")}</div>
                    ${descHtml}
                </div>
            </li>
        `;
    }

    // ==========================
    // 描画
    // ==========================

    function updateSummary(visibleCount){
        if(!summaryElement){
            return;
        }

        summaryElement.textContent = activeType === "all"
            ? `全 ${items.length} 件`
            : `${getTypeLabel(activeType)}：${visibleCount} 件（全 ${items.length} 件中）`;
    }

    function renderGroups(){
        let visibleCount = 0;

        const groupsHtml = monthKeysNewFirst.map((key, index) => {
            const monthItems = [...monthGroups.get(key)]
                .filter(item => activeType === "all" || item.type === activeType)
                .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

            if(monthItems.length === 0){
                return "";
            }

            visibleCount += monthItems.length;

            // 月の中を日付ごとにさらにグループ化（同じ日付の項目をまとめて、日付の繰り返し表示を減らす）
            const dateGroups = new Map();

            monthItems.forEach(item => {
                const dateKey = item.date || "";

                if(!dateGroups.has(dateKey)){
                    dateGroups.set(dateKey, []);
                }

                dateGroups.get(dateKey).push(item);
            });

            const dateGroupsHtml = Array.from(dateGroups.entries()).map(([dateKey, dateItems]) => `
                <div class="updateTimelineDateGroup">
                    <div class="updateTimelineDateHeader">
                        <span class="updateTimelineDot" aria-hidden="true"></span>
                        <span class="updateTimelineDateText">${getDateLabel(dateKey)}</span>
                    </div>
                    <ul class="updateTimelineItems">
                        ${dateItems.map(renderItem).join("")}
                    </ul>
                </div>
            `).join("");

            return `
                <details class="updateGroup"${index === 0 ? " open" : ""}>
                    <summary>${escapeHTML(getMonthLabel(key))}（${monthItems.length}件）</summary>
                    <div class="updateTimeline">
                        ${dateGroupsHtml}
                    </div>
                </details>
            `;
        }).join("");

        groupListElement.innerHTML = groupsHtml
            || `<p class="emptyMessage">該当する更新情報がありませんでした。</p>`;

        updateSummary(visibleCount);
    }

    // ==========================
    // 説明文の「続きを読む／閉じる」トグル（イベント委譲）
    // ==========================

    groupListElement.addEventListener("click", event => {
        const toggleButton = event.target.closest(".updateDescToggleBtn");

        if(!toggleButton){
            return;
        }

        const descElement = toggleButton.closest(".updateItemDesc");
        const textElement = descElement ? descElement.querySelector(".updateItemDescText") : null;

        if(!descElement || !textElement){
            return;
        }

        const isExpanded = toggleButton.getAttribute("aria-expanded") === "true";

        textElement.textContent = isExpanded ? descElement.dataset.short : descElement.dataset.full;
        toggleButton.textContent = isExpanded ? "続きを読む" : "閉じる";
        toggleButton.setAttribute("aria-expanded", String(!isExpanded));
    });

    // ==========================
    // 「すべて開く／すべて閉じる」ボタン
    // ==========================

    if(expandAllButton){
        expandAllButton.addEventListener("click", () => {
            groupListElement.querySelectorAll("details.updateGroup").forEach(details => {
                details.open = true;
            });
        });
    }

    if(collapseAllButton){
        collapseAllButton.addEventListener("click", () => {
            groupListElement.querySelectorAll("details.updateGroup").forEach(details => {
                details.open = false;
            });
        });
    }

    renderGroups();

})();
