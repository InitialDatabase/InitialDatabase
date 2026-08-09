// アーカイブ・統計ページ（月別アーカイブ／タグ別・月別件数）

(function(){

    const items = Array.isArray(database.infos) ? database.infos : [];
    const summaryElement = document.getElementById("archiveSummary");
    const monthListElement = document.getElementById("archiveMonthList");
    const tagStatsElement = document.getElementById("tagStatsList");
    const monthStatsElement = document.getElementById("monthStatsList");

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

    // ==========================
    // 月別アーカイブ
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

    monthListElement.innerHTML = monthKeysNewFirst.map((key, index) => {
        const monthItems = [...monthGroups.get(key)].sort((a, b) =>
            String(b.date || "").localeCompare(String(a.date || ""))
        );

        const itemsHtml = monthItems.map(item => `
            <li class="archiveMonthItem">
                <span class="archiveMonthItemDate">${escapeHTML(item.date || "")}</span>
                <a href="${escapeHTML(item.articleUrl || "#")}" target="_blank" rel="noopener noreferrer">
                    ${escapeHTML(getItemTitle(item))}
                </a>
            </li>
        `).join("");

        return `
            <details class="archiveMonthGroup"${index === 0 ? " open" : ""}>
                <summary>${escapeHTML(getMonthLabel(key))}（${monthItems.length}件）</summary>
                <ul class="archiveMonthItems">
                    ${itemsHtml}
                </ul>
            </details>
        `;
    }).join("");

    if(summaryElement){
        summaryElement.textContent = `全 ${items.length} 件／${monthKeysNewFirst.length} ヶ月分`;
    }

    // ==========================
    // タグ別件数
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
                <li class="statsBarRow">
                    <span class="statsBarLabel">${escapeHTML(tag)}</span>
                    <span class="statsBarTrack">
                        <span class="statsBarFill" style="width:${maxTagCount ? Math.max(4, Math.round(count / maxTagCount * 100)) : 0}%"></span>
                    </span>
                    <span class="statsBarValue">${count}</span>
                </li>
            `).join("");
    }

    // ==========================
    // 月別件数
    // ==========================

    if(monthStatsElement){
        const monthKeysOldFirst = [...monthKeysNewFirst].sort((a, b) => a.localeCompare(b));
        const maxMonthCount = monthKeysOldFirst.reduce((max, key) =>
            Math.max(max, monthGroups.get(key).length), 0);

        monthStatsElement.innerHTML = monthKeysOldFirst.map(key => {
            const count = monthGroups.get(key).length;

            return `
                <li class="statsBarRow">
                    <span class="statsBarLabel">${escapeHTML(getMonthLabel(key))}</span>
                    <span class="statsBarTrack">
                        <span class="statsBarFill" style="width:${maxMonthCount ? Math.max(4, Math.round(count / maxMonthCount * 100)) : 0}%"></span>
                    </span>
                    <span class="statsBarValue">${count}</span>
                </li>
            `;
        }).join("");
    }

})();
