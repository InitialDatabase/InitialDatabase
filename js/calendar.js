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
    const regionFilterContainer = document.getElementById("calendarRegionFilters");
    const prefectureFilterContainer = document.getElementById("calendarPrefectureFilters");
    const prefectureToggle = document.getElementById("calendarPrefectureToggle");
    const clearFiltersButton = document.getElementById("calendarFilterClear");
    const prevMatchButton = document.getElementById("calendarPrevMatchMonth");
    const nextMatchButton = document.getElementById("calendarNextMatchMonth");

    if(!section || !grid || !monthLabel || !listElement || eventItems.length === 0){
        return;
    }

    section.hidden = false;

    const today = getTodayDateOnly();

    const allTags = Array.from(new Set(
        eventItems.flatMap(item => Array.isArray(item.tags) ? item.tags : [])
    ));

    // 開催地フィルターで指定できる値（地方名＋都道府県名）。URLパラメータの検証にも使う
    // （トップページ・info.jsのALL_LOCATION_VALUESと同じ考え方）
    const ALL_LOCATION_VALUES = [
        ...REGION_LIST,
        ...Object.values(PREFECTURES_BY_REGION).flat()
    ];

    const state = {
        year: today.getFullYear(),
        month: today.getMonth(),
        selectedDate: null,
        keyword: "",
        searchMode: "partial", // "partial"（部分一致）または "exact"（完全一致）
        activeTags: new Set(),
        activeLocations: new Set() // 「📍開催地」フィルター（地方名・都道府県名の両方を格納。複数選択・OR条件）
    };

    // 年月プルダウン・‹/›ボタンでの月送りの範囲（populateJumpSelectsで設定）
    const monthRange = { minYear: today.getFullYear(), maxYear: today.getFullYear() };

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

    function matchesLocation(item){
        if(state.activeLocations.size === 0){
            return true;
        }

        // 都道府県レベルでも地方レベルでも、どちらの絞り込み値にも一致すればOKとする
        const itemRegions = getItemRegions(item);
        const itemPrefectures = getItemPrefectures(item);

        return Array.from(state.activeLocations).some(location =>
            itemRegions.includes(location) || itemPrefectures.includes(location)
        );
    }

    function hasActiveFilters(){
        return Boolean(state.keyword) || state.activeTags.size > 0 || state.activeLocations.size > 0;
    }

    // renderGrid()は月内の日ごと（前後日との連結判定を含めると実質1日あたり最大3回）に
    // getEventsOnDate() 経由でこの関数を呼び出す。キーワード検索はあいまい検索
    // （表記ゆれ吸収・タイプミス許容のLevenshtein距離計算）を含み全件に対して行うと重いため、
    // 絞り込み条件（キーワード・検索モード・タグ）が変わらない間は結果をキャッシュし、
    // 1回の描画で何十回も同じ絞り込みを再計算しないようにする。
    let filteredEventItemsCacheKey = null;
    let filteredEventItemsCache = [];

    function getFilteredEventItems(){
        const cacheKey = `${state.keyword}\u0001${state.searchMode}\u0001${Array.from(state.activeTags).sort().join(",")}\u0001${Array.from(state.activeLocations).sort().join(",")}`;

        if(cacheKey !== filteredEventItemsCacheKey){
            filteredEventItemsCacheKey = cacheKey;
            filteredEventItemsCache = eventItems.filter(item => matchesKeyword(item) && matchesTags(item) && matchesLocation(item));
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

    function getEventsInMonth(year, month){
        return getFilteredEventItems().filter(item => isItemInMonth(item, year, month));
    }

    function getMonthEvents(){
        return getEventsInMonth(state.year, state.month)
            .sort((a, b) => getEventCalendarRangeStart(a) - getEventCalendarRangeStart(b));
    }

    // 指定した年月に、現在の絞り込み条件に一致するイベントが1件でもあるか
    function monthHasMatch(year, month){
        return getEventsInMonth(year, month).length > 0;
    }

    // 現在の年月から前方向／後方向に、絞り込み条件に一致する最初の月を
    // 年月プルダウンの選択可能範囲（monthRange）内で探す。見つからなければnull
    function findNearestMatchingMonth(direction){
        let year = state.year;
        let month = state.month;

        for(let i = 0; i < 1200; i++){
            month += direction;

            if(month < 0){
                month = 11;
                year -= 1;
            }else if(month > 11){
                month = 0;
                year += 1;
            }

            if(year < monthRange.minYear || year > monthRange.maxYear){
                return null;
            }

            if(monthHasMatch(year, month)){
                return { year, month };
            }
        }

        return null;
    }

    function updateMatchNavButtons(){
        if(!prevMatchButton && !nextMatchButton){
            return;
        }

        const show = hasActiveFilters() && getMonthEvents().length === 0;

        if(prevMatchButton){
            const target = show ? findNearestMatchingMonth(-1) : null;
            prevMatchButton.hidden = !target;
            prevMatchButton.dataset.targetYear = target ? String(target.year) : "";
            prevMatchButton.dataset.targetMonth = target ? String(target.month) : "";
        }

        if(nextMatchButton){
            const target = show ? findNearestMatchingMonth(1) : null;
            nextMatchButton.hidden = !target;
            nextMatchButton.dataset.targetYear = target ? String(target.year) : "";
            nextMatchButton.dataset.targetMonth = target ? String(target.month) : "";
        }
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
                ${item.location ? `<span class="eventCalendarLocation">📍 ${escapeHTML(item.location)}</span>` : ""}
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
        updateUrlParams(true);
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
        updateMatchNavButtons();
        updateJumpSelectMarks();
        updateMonthNavButtonState();

        if(state.selectedDate){
            renderEventList(getEventsOnDate(state.selectedDate));
        }else{
            clearEventList();
        }
    }

    // 年月プルダウン・‹/›ボタンで選べる範囲（monthRange）内かどうか
    function isWithinMonthRange(year, month){
        if(year < monthRange.minYear || year > monthRange.maxYear){
            return false;
        }

        if(year === monthRange.minYear && month < 0){
            return false;
        }

        if(year === monthRange.maxYear && month > 11){
            return false;
        }

        return true;
    }

    function goToMonth(year, month, pushHistory){
        if(!isWithinMonthRange(year, month)){
            return;
        }

        state.year = year;
        state.month = month;
        state.selectedDate = null;

        refreshAll();
        syncJumpSelects();
        updateUrlParams(Boolean(pushHistory));
    }

    function goToPrevMonth(){
        let month = state.month - 1;
        let year = state.year;

        if(month < 0){
            month = 11;
            year -= 1;
        }

        goToMonth(year, month, true);
    }

    function goToNextMonth(){
        let month = state.month + 1;
        let year = state.year;

        if(month > 11){
            month = 0;
            year += 1;
        }

        goToMonth(year, month, true);
    }

    function goToToday(){
        state.year = today.getFullYear();
        state.month = today.getMonth();
        state.selectedDate = today;

        refreshAll();
        syncJumpSelects();
        updateUrlParams(true);
    }

    function render(){
        if(!applyStateFromUrlParams()){
            state.selectedDate = today;
        }

        refreshAll();
    }

    // ==========================
    // 年月ジャンプ（プルダウン）
    // ==========================

    function populateJumpSelects(){
        const years = eventItems.flatMap(item => {
            const start = getEventCalendarRangeStart(item);
            const end = parseDateOnly(item.eventEnd);
            return [start, end].filter(Boolean).map(date => date.getFullYear());
        });

        years.push(today.getFullYear());

        // ‹/›ボタン・年月プルダウンで移動できる範囲をここで確定させる。
        // データが1件もない何年も先・過去まで際限なく月送りできてしまわないよう、
        // 少し先の月へも予定を組める余地（＋1年）だけを残してデータ範囲に絞る
        monthRange.minYear = Math.min(...years);
        monthRange.maxYear = Math.max(...years, today.getFullYear() + 1);

        if(!yearSelect || !monthSelect){
            return;
        }

        const yearOptions = [];

        for(let year = monthRange.minYear; year <= monthRange.maxYear; year++){
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

    // 絞り込み中、年月プルダウンの選択肢に「その年／月に該当イベントがあるか」を
    // ●マークで示す。絞り込みなしの通常時はマークを付けず、選択肢の見た目を変えない
    function updateJumpSelectMarks(){
        if(!yearSelect || !monthSelect){
            return;
        }

        const showMarks = hasActiveFilters();

        Array.from(yearSelect.options).forEach(option => {
            const year = Number(option.value);
            const hasMatch = showMarks && [...Array(12).keys()].some(month => monthHasMatch(year, month));
            option.textContent = `${year}年${hasMatch ? " ●" : ""}`;
        });

        Array.from(monthSelect.options).forEach(option => {
            const month = Number(option.value) - 1;
            const hasMatch = showMarks && monthHasMatch(state.year, month);
            option.textContent = `${month + 1}月${hasMatch ? " ●" : ""}`;
        });
    }

    // ‹/›ボタンが、選択可能範囲（monthRange）の外へ出ようとする時は押せないようにする
    function updateMonthNavButtonState(){
        if(prevButton){
            let month = state.month - 1;
            let year = state.year;

            if(month < 0){
                month = 11;
                year -= 1;
            }

            prevButton.disabled = !isWithinMonthRange(year, month);
        }

        if(nextButton){
            let month = state.month + 1;
            let year = state.year;

            if(month > 11){
                month = 0;
                year += 1;
            }

            nextButton.disabled = !isWithinMonthRange(year, month);
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
                updateUrlParams(true);
            });
        });
    }

    // ==========================
    // 開催地（地方・都道府県）絞り込みUI
    // ==========================
    // トップページ（info.js）と同じREGION_LIST／PREFECTURES_BY_REGIONを使い、
    // 地方単位のボタンをデフォルト表示、都道府県単位は展開式にする点も揃えてある

    function toggleLocationValue(value, button){
        if(state.activeLocations.has(value)){
            state.activeLocations.delete(value);
            button.classList.remove("is-active");
        }else{
            state.activeLocations.add(value);
            button.classList.add("is-active");
        }

        refreshAll();
        updateClearButtonVisibility();
        updateUrlParams(true);
    }

    function renderRegionFilters(){
        if(!regionFilterContainer){
            return;
        }

        regionFilterContainer.innerHTML = REGION_LIST.map(region => `
            <button type="button" class="infoFilterButton" data-region="${escapeHTML(region)}">
                ${escapeHTML(region)}
            </button>
        `).join("");

        regionFilterContainer.querySelectorAll("[data-region]").forEach(button => {
            button.addEventListener("click", () => {
                toggleLocationValue(button.dataset.region, button);
            });
        });
    }

    function renderPrefectureFilters(){
        if(!prefectureFilterContainer){
            return;
        }

        prefectureFilterContainer.innerHTML = REGION_LIST.map(region => `
            <div class="infoPrefectureGroup">
                <span class="infoPrefectureGroupLabel">${escapeHTML(region)}</span>
                <div class="infoPrefectureButtons">
                    ${PREFECTURES_BY_REGION[region].map(pref => `
                        <button type="button" class="infoFilterButton infoFilterButton--small" data-prefecture="${escapeHTML(pref)}">
                            ${escapeHTML(pref)}
                        </button>
                    `).join("")}
                </div>
            </div>
        `).join("");

        prefectureFilterContainer.querySelectorAll("[data-prefecture]").forEach(button => {
            button.addEventListener("click", () => {
                toggleLocationValue(button.dataset.prefecture, button);
            });
        });
    }

    function syncLocationFilterButtons(){
        if(regionFilterContainer){
            regionFilterContainer.querySelectorAll("[data-region]").forEach(button =>
                button.classList.toggle("is-active", state.activeLocations.has(button.dataset.region))
            );
        }

        if(prefectureFilterContainer){
            prefectureFilterContainer.querySelectorAll("[data-prefecture]").forEach(button =>
                button.classList.toggle("is-active", state.activeLocations.has(button.dataset.prefecture))
            );
        }

        // 都道府県単位の絞り込みが復元された場合は、都道府県パネルも開いておく
        const hasActivePrefecture = Array.from(state.activeLocations).some(location => !REGION_LIST.includes(location));

        if(prefectureFilterContainer && prefectureToggle && hasActivePrefecture){
            prefectureFilterContainer.hidden = false;
            prefectureToggle.setAttribute("aria-expanded", "true");
        }
    }

    // ==========================
    // 表示状態のURL連携（共有・ブックマーク対応）
    // ==========================
    // トップページ（info.js）と同じくURLSearchParams＋history.pushState/replaceStateで
    // 「年月」「選択した日付」「キーワード／検索方法」「タグ」「開催地」をURLに反映する。
    // 前へ／次へボタンなど明確な操作の時だけpushして戻る/進むで復元できるようにし、
    // キーワード入力中は置き換え（replaceState）のみに留める
    // 例：calendar.html?y=2026&m=12&date=2026-12-24&tag=グッズ&location=関東

    function applyStateFromUrlParams(){
        const params = new URLSearchParams(window.location.search);
        const yearParam = Number(params.get("y"));
        const monthParam = Number(params.get("m"));
        const dateParam = params.get("date");
        const keywordParam = params.get("keyword");
        const tagParam = params.get("tag");
        const locationParam = params.get("location");

        // このページが認識するパラメータが1つもない場合（他ページからの流入で
        // utm_source等の無関係なクエリだけが付いている場合を含む）は復元しない
        const hasAnyParam = ["y", "m", "date", "keyword", "tag", "location"]
            .some(key => params.has(key));

        if(!hasAnyParam){
            return false;
        }

        if(Number.isInteger(yearParam) && Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12 && isWithinMonthRange(yearParam, monthParam - 1)){
            state.year = yearParam;
            state.month = monthParam - 1;
        }

        const parsedDate = dateParam ? parseDateOnly(dateParam) : null;
        state.selectedDate = parsedDate || null;

        state.keyword = keywordParam || "";

        if(keywordInput){
            keywordInput.value = state.keyword;
        }

        state.activeTags = new Set(
            tagParam
                ? tagParam.split(",").map(tag => tag.trim()).filter(tag => allTags.includes(tag))
                : []
        );

        state.activeLocations = new Set(
            locationParam
                ? locationParam.split(",").map(location => location.trim()).filter(location => ALL_LOCATION_VALUES.includes(location))
                : []
        );

        if(tagFilterContainer){
            tagFilterContainer.querySelectorAll("[data-tag]").forEach(button =>
                button.classList.toggle("is-active", state.activeTags.has(button.dataset.tag))
            );
        }

        syncLocationFilterButtons();
        updateClearButtonVisibility();

        return true;
    }

    function buildUrlParams(){
        const params = new URLSearchParams();

        params.set("y", String(state.year));
        params.set("m", String(state.month + 1));

        if(state.selectedDate){
            params.set("date", formatDateKey(state.selectedDate));
        }

        if(state.keyword){
            params.set("keyword", state.keyword);
        }

        if(state.activeTags.size > 0){
            params.set("tag", Array.from(state.activeTags).join(","));
        }

        if(state.activeLocations.size > 0){
            params.set("location", Array.from(state.activeLocations).join(","));
        }

        return params;
    }

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
            goToMonth(Number(yearSelect.value), state.month, true);
        });
    }

    if(monthSelect){
        monthSelect.addEventListener("change", () => {
            goToMonth(state.year, Number(monthSelect.value) - 1, true);
        });
    }

    if(keywordInput){
        keywordInput.addEventListener("input", () => {
            state.keyword = keywordInput.value.trim();
            refreshAll();
            updateClearButtonVisibility();
            // 入力中は履歴を積まず、URLの置き換えのみに留める
            updateUrlParams(false);
        });
    }

    state.searchMode = setupSearchModeToggle("calendarSearchModeToggle", mode => {
        state.searchMode = mode;
        refreshAll();
        updateClearButtonVisibility();
    });

    if(prefectureToggle && prefectureFilterContainer){
        prefectureToggle.addEventListener("click", () => {
            const isOpen = prefectureFilterContainer.hidden;
            prefectureFilterContainer.hidden = !isOpen;
            prefectureToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        });
    }

    if(clearFiltersButton){
        clearFiltersButton.addEventListener("click", () => {
            state.keyword = "";
            state.activeTags.clear();
            state.activeLocations.clear();

            if(keywordInput){
                keywordInput.value = "";
            }

            if(tagFilterContainer){
                tagFilterContainer.querySelectorAll("[data-tag]").forEach(button => {
                    button.classList.remove("is-active");
                });
            }

            [regionFilterContainer, prefectureFilterContainer].forEach(container => {
                if(container){
                    container.querySelectorAll("[data-region],[data-prefecture]").forEach(button => {
                        button.classList.remove("is-active");
                    });
                }
            });

            refreshAll();
            updateClearButtonVisibility();
            updateUrlParams(true);
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

    if(prevMatchButton){
        prevMatchButton.addEventListener("click", () => {
            const year = Number(prevMatchButton.dataset.targetYear);
            const month = Number(prevMatchButton.dataset.targetMonth);

            if(Number.isInteger(year) && Number.isInteger(month)){
                goToMonth(year, month, true);
            }
        });
    }

    if(nextMatchButton){
        nextMatchButton.addEventListener("click", () => {
            const year = Number(nextMatchButton.dataset.targetYear);
            const month = Number(nextMatchButton.dataset.targetMonth);

            if(Number.isInteger(year) && Number.isInteger(month)){
                goToMonth(year, month, true);
            }
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

    // ブラウザの戻る／進むボタンでもURLに保存された表示状態を復元する
    window.addEventListener("popstate", () => {
        if(!applyStateFromUrlParams()){
            state.year = today.getFullYear();
            state.month = today.getMonth();
            state.selectedDate = today;
            state.keyword = "";
            state.activeTags.clear();
            state.activeLocations.clear();

            if(keywordInput){
                keywordInput.value = "";
            }

            if(tagFilterContainer){
                tagFilterContainer.querySelectorAll("[data-tag]").forEach(button => {
                    button.classList.remove("is-active");
                });
            }

            syncLocationFilterButtons();
        }

        refreshAll();
        syncJumpSelects();
        updateClearButtonVisibility();
    });

    renderTagFilters();
    renderRegionFilters();
    renderPrefectureFilters();
    populateJumpSelects();
    render();
    syncJumpSelects();

})();
