// 更新情報ページ（サイト自体の機能追加・修正・変更履歴を月別に表示／種類で絞り込み）

(function(){

    const items = Array.isArray(window.siteUpdates) ? window.siteUpdates : [];
    const summaryElement = document.getElementById("updateSummary");
    const groupListElement = document.getElementById("updateGroupList");
    const filterGroupElement = document.getElementById("updateTypeFilter");

    const TYPE_LABELS = {
        added:"追加",
        fixed:"修正",
        changed:"変更",
        removed:"削除"
    };

    const TYPE_ORDER = ["added", "fixed", "changed", "removed"];

    let activeType = "all";

    function getTypeLabel(type){
        return TYPE_LABELS[type] || "更新";
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
    // 種類（追加／修正／変更／削除）フィルターの描画
    // ==========================

    if(filterGroupElement){
        const typeCounts = new Map();

        items.forEach(item => {
            typeCounts.set(item.type, (typeCounts.get(item.type) || 0) + 1);
        });

        const buttonsHtml = [
            `<button type="button" class="infoFilterButton is-active" data-updatetype="all">すべて（${items.length}）</button>`
        ].concat(
            TYPE_ORDER
                .filter(type => typeCounts.has(type))
                .map(type => `
                    <button type="button" class="infoFilterButton" data-updatetype="${type}">
                        ${getTypeLabel(type)}（${typeCounts.get(type)}）
                    </button>
                `)
        ).join("");

        filterGroupElement.innerHTML = buttonsHtml;

        filterGroupElement.querySelectorAll("button").forEach(button => {
            button.addEventListener("click", () => {
                activeType = button.dataset.updatetype;

                filterGroupElement.querySelectorAll("button").forEach(b =>
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

            const itemsHtml = monthItems.map(item => `
                <li class="updateItem">
                    <span class="updateItemDate">${escapeHTML(item.date || "")}</span>
                    <span class="updateItemBadge updateItemBadge--${getTypeClass(item.type)}">${getTypeLabel(item.type)}</span>
                    <div class="updateItemBody">
                        <div class="updateItemTitle">${escapeHTML(item.title || "")}</div>
                        ${item.description ? `<div class="updateItemDesc">${escapeHTML(item.description)}</div>` : ""}
                    </div>
                </li>
            `).join("");

            return `
                <details class="updateGroup"${index === 0 ? " open" : ""}>
                    <summary>${escapeHTML(getMonthLabel(key))}（${monthItems.length}件）</summary>
                    <ul class="updateList">
                        ${itemsHtml}
                    </ul>
                </details>
            `;
        }).join("");

        groupListElement.innerHTML = groupsHtml
            || `<p class="emptyMessage">該当する更新情報がありませんでした。</p>`;

        updateSummary(visibleCount);
    }

    renderGroups();

})();
