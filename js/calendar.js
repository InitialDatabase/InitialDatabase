// 開催中・開催予定イベント／予約開始情報のミニカレンダー
// （item.eventStart または item.reservationStart を持つ情報がある場合のみ表示）
//
// 日付ごとの「対象期間かどうか」の判定は共通関数 isDateWithinEventRange()（common.js）に
// 一本化してある。calendar.js側で同等のロジックを再実装しないことで、
// 頭文字D情報ページ（common.js）とカレンダーページの表示がズレないようにする。

(function(){

    const items = Array.isArray(database.infos) ? database.infos : [];
    const eventItems = items.filter(item => item.eventStart || item.reservationStart);

    const section = document.getElementById("eventCalendarSection");
    const grid = document.getElementById("eventCalendarGrid");
    const monthLabel = document.getElementById("calendarMonthLabel");
    const listElement = document.getElementById("eventCalendarList");
    const monthListElement = document.getElementById("eventCalendarMonthList");
    const monthListHeading = document.getElementById("calendarMonthListHeading");
    const monthIcsExportButton = document.getElementById("calendarMonthIcsExport");
    const prevButton = document.getElementById("calendarPrevMonth");
    const nextButton = document.getElementById("calendarNextMonth");
    const todayButton = document.getElementById("calendarTodayButton");
    const yearSelect = document.getElementById("calendarYearSelect");
    const monthSelect = document.getElementById("calendarMonthSelect");
    const keywordInput = document.getElementById("calendarKeywordInput");
    const tagFilterContainer = document.getElementById("calendarTagFilters");
    const clearFiltersButton = document.getElementById("calendarFilterClear");

    if(!section || !grid || !monthLabel || !listElement || eventItems.length === 0){
        return;
    }

    section.hidden = false;

    const today = getTodayDateOnly();

    const allTags = Array.from(new Set(
        eventItems.flatMap(item => Array.isArray(item.tags) ? item.tags : [])
    ));

    const state = {
        year: today.getFullYear(),
        month: today.getMonth(),
        selectedDate: null,
        keyword: "",
        searchMode: "partial", // "partial"（部分一致）または "exact"（完全一致）
        activeTags: new Set()
    };

    function formatDateKey(date){
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    // ==========================
    // 絞り込み（キーワード・タグ）
    // ==========================

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

    function hasActiveFilters(){
        return Boolean(state.keyword) || state.activeTags.size > 0;
    }

    // renderGrid()は月内の日ごと（前後日との連結判定を含めると実質1日あたり最大3回）に
    // getEventsOnDate() 経由でこの関数を呼び出す。キーワード検索はあいまい検索
    // （表記ゆれ吸収・タイプミス許容のLevenshtein距離計算）を含み全件に対して行うと重いため、
    // 絞り込み条件（キーワード・検索モード・タグ）が変わらない間は結果をキャッシュし、
    // 1回の描画で何十回も同じ絞り込みを再計算しないようにする。
    let filteredEventItemsCacheKey = null;
    let filteredEventItemsCache = [];

    function getFilteredEventItems(){
        const cacheKey = `${state.keyword}\u0001${state.searchMode}\u0001${Array.from(state.activeTags).sort().join(",")}`;

        if(cacheKey !== filteredEventItemsCacheKey){
            filteredEventItemsCacheKey = cacheKey;
            filteredEventItemsCache = eventItems.filter(item => matchesKeyword(item) && matchesTags(item));
        }

        return filteredEventItemsCache;
    }

    function updateClearButtonVisibility(){
        if(clearFiltersButton){
            clearFiltersButton.hidden = !hasActiveFilters();
        }
    }

    // ==========================
    // 日付・月ごとのイベント抽出
    // ==========================

    function getEventsOnDate(date){
        return getFilteredEventItems().filter(item => isDateWithinEventRange(item, date));
    }

    function getDayType(eventsOnDay){
        if(eventsOnDay.length === 0){
            return "";
        }

        // eventStartを持つ情報が1件でもあれば「開催中」表示を優先し、
        // それ以外（reservationStartのみ）の場合は「予約中」表示にする
        return eventsOnDay.some(item => Boolean(item.eventStart)) ? "event" : "reservation";
    }

    function isItemInMonth(item, year, month){
        const start = getEventCalendarRangeStart(item);

        if(!start){
            return false;
        }

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        if(start > lastDay){
            return false;
        }

        const end = parseDateOnly(item.eventEnd);

        if(end && end < firstDay){
            return false;
        }

        return true;
    }

    function getMonthEvents(){
        return getFilteredEventItems()
            .filter(item => isItemInMonth(item, state.year, state.month))
            .sort((a, b) => getEventCalendarRangeStart(a) - getEventCalendarRangeStart(b));
    }

    function buildDayAriaLabel(date, eventsOnDay){
        const dateLabel = `${date.getMonth() + 1}月${date.getDate()}日`;

        if(eventsOnDay.length === 0){
            return dateLabel;
        }

        const ongoingCount = eventsOnDay.filter(item => Boolean(item.eventStart)).length;
        const reservationCount = eventsOnDay.length - ongoingCount;
        const parts = [];

        if(ongoingCount > 0){
            parts.push(`開催中のイベント${ongoingCount}件`);
        }

        if(reservationCount > 0){
            parts.push(`予約中の情報${reservationCount}件`);
        }

        return `${dateLabel}、${parts.join("、")}`;
    }

    // ==========================
    // 一覧表示（選択日／月全体で共通のマークアップ）
    // ==========================

    function buildEventListEmptyHtml(message){
        return `<li class="eventCalendarEmpty">${escapeHTML(message)}</li>`;
    }

    function buildEventListItemsHtml(events){
        return events.map(item => `
            <li>
                <a href="${escapeHTML(item.articleUrl || "#")}" target="_blank" rel="noopener noreferrer">
                    ${escapeHTML(getItemTitle(item))}
                </a>
                <span class="eventCalendarPeriod">${escapeHTML(getEventPeriodLabel(item))}</span>
                <span class="eventCalendarActions">${createCalendarActionsHtml(item)}</span>
            </li>
        `).join("");
    }

    function renderEventList(events){
        if(events.length === 0){
            listElement.innerHTML = buildEventListEmptyHtml(
                hasActiveFilters()
                    ? "条件に一致するイベントはありません"
                    : "この日に開催中・予約中のイベントはありません"
            );
            return;
        }

        listElement.innerHTML = buildEventListItemsHtml(events);
    }

    function clearEventList(){
        listElement.innerHTML = buildEventListEmptyHtml("日付を選択してください");
    }

    function getMonthOngoingEvents(events){
        // 「開催中」イベントのみが対象（eventStartを持たない予約中のみの情報は除く）
        return events.filter(item => Boolean(item.eventStart));
    }

    function renderMonthList(){
        if(!monthListElement){
            return;
        }

        if(monthListHeading){
            monthListHeading.textContent = `${state.year}年${state.month + 1}月のイベント一覧`;
        }

        const events = getMonthEvents();

        if(monthIcsExportButton){
            const ongoingEvents = getMonthOngoingEvents(events);

            monthIcsExportButton.hidden = ongoingEvents.length === 0;
            monthIcsExportButton.dataset.ongoingCount = String(ongoingEvents.length);
        }

        if(events.length === 0){
            monthListElement.innerHTML = buildEventListEmptyHtml(
                hasActiveFilters()
                    ? "条件に一致するイベントはありません"
                    : "この月に該当するイベントはありません"
            );
            return;
        }

        monthListElement.innerHTML = buildEventListItemsHtml(events);
    }

    // ==========================
    // カレンダー本体
    // ==========================

    function selectDate(date){
        state.selectedDate = date;
        refreshAll();
    }

    function renderGrid(){
        const firstDay = new Date(state.year, state.month, 1);
        const lastDay = new Date(state.year, state.month + 1, 0);
        const startWeekday = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        const selectedKey = state.selectedDate ? formatDateKey(state.selectedDate) : "";

        monthLabel.textContent = `${state.year}年${state.month + 1}月`;

        const cells = [];

        for(let i = 0; i < startWeekday; i++){
            cells.push(`<span class="eventCalendarDay eventCalendarDay--empty"></span>`);
        }

        for(let day = 1; day <= daysInMonth; day++){
            const date = new Date(state.year, state.month, day);
            const dateKey = formatDateKey(date);
            const eventsOnDay = getEventsOnDate(date);
            const dayType = getDayType(eventsOnDay);
            const isToday = date.getTime() === today.getTime();
            const isSelected = dateKey === selectedKey;

            const prevDate = new Date(state.year, state.month, day - 1);
            const nextDate = new Date(state.year, state.month, day + 1);
            const connectsToPrev = Boolean(dayType) && dayType === getDayType(getEventsOnDate(prevDate));
            const connectsToNext = Boolean(dayType) && dayType === getDayType(getEventsOnDate(nextDate));

            const classNames = [
                "eventCalendarDay",
                dayType ? `eventCalendarDay--${dayType}` : "",
                isToday ? "eventCalendarDay--today" : "",
                isSelected ? "eventCalendarDay--selected" : "",
                connectsToPrev ? "eventCalendarDay--connectLeft" : "",
                connectsToNext ? "eventCalendarDay--connectRight" : ""
            ].filter(Boolean).join(" ");

            const badge = eventsOnDay.length > 1
                ? `<span class="eventCalendarDayBadge">${eventsOnDay.length}</span>`
                : "";

            const ariaLabel = buildDayAriaLabel(date, eventsOnDay);

            cells.push(`
                <button type="button" class="${classNames}" data-date="${dateKey}" aria-label="${escapeHTML(ariaLabel)}" aria-pressed="${isSelected}"${isToday ? ' aria-current="date"' : ""}>
                    ${day}${badge}
                </button>
            `);
        }

        const totalCells = startWeekday + daysInMonth;
        const trailingEmpty = (7 - (totalCells % 7)) % 7;

        for(let i = 0; i < trailingEmpty; i++){
            cells.push(`<span class="eventCalendarDay eventCalendarDay--empty"></span>`);
        }

        grid.innerHTML = `
            <div class="eventCalendarWeekdays">
                ${["日", "月", "火", "水", "木", "金", "土"].map((weekday, index) => {
                    const modifier = index === 0 ? " eventCalendarWeekday--sun" : (index === 6 ? " eventCalendarWeekday--sat" : "");
                    return `<span class="eventCalendarWeekday${modifier}">${weekday}</span>`;
                }).join("")}
            </div>
            <div class="eventCalendarDays">
                ${cells.join("")}
            </div>
        `;

        grid.querySelectorAll("[data-date]").forEach(button => {
            button.addEventListener("click", () => {
                selectDate(parseDateOnly(button.dataset.date));
            });
        });
    }

    function refreshAll(){
        renderGrid();
        renderMonthList();

        if(state.selectedDate){
            renderEventList(getEventsOnDate(state.selectedDate));
        }else{
            clearEventList();
        }
    }

    function goToMonth(year, month){
        state.year = year;
        state.month = month;
        state.selectedDate = null;

        refreshAll();
        syncJumpSelects();
    }

    function goToPrevMonth(){
        let month = state.month - 1;
        let year = state.year;

        if(month < 0){
            month = 11;
            year -= 1;
        }

        goToMonth(year, month);
    }

    function goToNextMonth(){
        let month = state.month + 1;
        let year = state.year;

        if(month > 11){
            month = 0;
            year += 1;
        }

        goToMonth(year, month);
    }

    function goToToday(){
        state.year = today.getFullYear();
        state.month = today.getMonth();
        state.selectedDate = today;

        refreshAll();
        syncJumpSelects();
    }

    function render(){
        state.selectedDate = today;
        refreshAll();
    }

    // ==========================
    // 年月ジャンプ（プルダウン）
    // ==========================

    function populateJumpSelects(){
        if(!yearSelect || !monthSelect){
            return;
        }

        const years = eventItems.flatMap(item => {
            const start = getEventCalendarRangeStart(item);
            const end = parseDateOnly(item.eventEnd);
            return [start, end].filter(Boolean).map(date => date.getFullYear());
        });

        years.push(today.getFullYear());

        const minYear = Math.min(...years);
        // 少し先の月へも予定を組めるよう、データ上の最大年＋1年までは選べるようにする
        const maxYear = Math.max(...years, today.getFullYear() + 1);

        const yearOptions = [];

        for(let year = minYear; year <= maxYear; year++){
            yearOptions.push(`<option value="${year}">${year}年</option>`);
        }

        yearSelect.innerHTML = yearOptions.join("");

        const monthOptions = [];

        for(let month = 1; month <= 12; month++){
            monthOptions.push(`<option value="${month}">${month}月</option>`);
        }

        monthSelect.innerHTML = monthOptions.join("");

        syncJumpSelects();
    }

    function syncJumpSelects(){
        if(yearSelect){
            yearSelect.value = String(state.year);
        }

        if(monthSelect){
            monthSelect.value = String(state.month + 1);
        }
    }

    // ==========================
    // タグ絞り込みUI
    // ==========================

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

                refreshAll();
                updateClearButtonVisibility();
            });
        });
    }

    // ==========================
    // イベントリスナー設定
    // ==========================

    if(prevButton){
        prevButton.addEventListener("click", goToPrevMonth);
    }

    if(nextButton){
        nextButton.addEventListener("click", goToNextMonth);
    }

    if(todayButton){
        todayButton.addEventListener("click", goToToday);
    }

    if(yearSelect){
        yearSelect.addEventListener("change", () => {
            goToMonth(Number(yearSelect.value), state.month);
        });
    }

    if(monthSelect){
        monthSelect.addEventListener("change", () => {
            goToMonth(state.year, Number(monthSelect.value) - 1);
        });
    }

    if(keywordInput){
        keywordInput.addEventListener("input", () => {
            state.keyword = keywordInput.value.trim();
            refreshAll();
            updateClearButtonVisibility();
        });
    }

    state.searchMode = setupSearchModeToggle("calendarSearchModeToggle", mode => {
        state.searchMode = mode;
        refreshAll();
        updateClearButtonVisibility();
    });

    if(clearFiltersButton){
        clearFiltersButton.addEventListener("click", () => {
            state.keyword = "";
            state.activeTags.clear();

            if(keywordInput){
                keywordInput.value = "";
            }

            if(tagFilterContainer){
                tagFilterContainer.querySelectorAll("[data-tag]").forEach(button => {
                    button.classList.remove("is-active");
                });
            }

            refreshAll();
            updateClearButtonVisibility();
        });
    }

    if(monthIcsExportButton){
        monthIcsExportButton.addEventListener("click", () => {
            const ongoingEvents = getMonthOngoingEvents(getMonthEvents());

            if(ongoingEvents.length === 0){
                return;
            }

            const filename = `initialdatabase-events-${state.year}${pad2(state.month + 1)}.ics`;

            downloadIcsForItems(ongoingEvents, filename);
        });
    }

    section.addEventListener("keydown", event => {
        if(event.key === "ArrowLeft"){
            event.preventDefault();
            goToPrevMonth();
        } else if(event.key === "ArrowRight"){
            event.preventDefault();
            goToNextMonth();
        }
    });

    renderTagFilters();
    populateJumpSelects();
    render();

})();
