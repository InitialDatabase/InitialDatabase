// 開催中・開催予定イベントのミニカレンダー（eventStart/eventEndを持つ情報がある場合のみ表示）

(function(){

    const items = Array.isArray(database.infos) ? database.infos : [];
    const eventItems = items.filter(item => item.eventStart);

    const section = document.getElementById("eventCalendarSection");
    const grid = document.getElementById("eventCalendarGrid");
    const monthLabel = document.getElementById("calendarMonthLabel");
    const listElement = document.getElementById("eventCalendarList");
    const prevButton = document.getElementById("calendarPrevMonth");
    const nextButton = document.getElementById("calendarNextMonth");
    const todayButton = document.getElementById("calendarTodayButton");

    if(!section || !grid || !monthLabel || !listElement || eventItems.length === 0){
        return;
    }

    section.hidden = false;

    const today = getTodayDateOnly();

    const state = {
        year: today.getFullYear(),
        month: today.getMonth()
    };

    function getEventsOnDate(date){
        return eventItems.filter(item => {
            const start = parseDateOnly(item.eventStart);
            const end = parseDateOnly(item.eventEnd || item.eventStart);

            return start && end && date >= start && date <= end;
        });
    }

    function renderEventList(events){
        if(events.length === 0){
            listElement.innerHTML = `<li class="eventCalendarEmpty">この日に開催中のイベントはありません</li>`;
            return;
        }

        listElement.innerHTML = events.map(item => `
            <li>
                <a href="${escapeHTML(item.articleUrl || "#")}" target="_blank" rel="noopener noreferrer">
                    ${escapeHTML(getItemTitle(item))}
                </a>
                <span class="eventCalendarPeriod">${escapeHTML(getEventPeriodLabel(item))}</span>
                <span class="eventCalendarActions">${createCalendarActionsHtml(item)}</span>
            </li>
        `).join("");
    }

    function clearEventList(){
        listElement.innerHTML = `<li class="eventCalendarEmpty">日付を選択してください</li>`;
    }

    function selectDate(date){
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

        grid.querySelectorAll("[data-date]").forEach(button => {
            button.classList.toggle("eventCalendarDay--selected", button.dataset.date === dateStr);
        });

        renderEventList(getEventsOnDate(date));
    }

    function updateTodayButtonState(){
        if(!todayButton){
            return;
        }

        const isCurrentMonth = state.year === today.getFullYear() && state.month === today.getMonth();

        todayButton.disabled = isCurrentMonth;
    }

    function renderGrid(){
        const firstDay = new Date(state.year, state.month, 1);
        const lastDay = new Date(state.year, state.month + 1, 0);
        const startWeekday = firstDay.getDay();
        const daysInMonth = lastDay.getDate();

        monthLabel.textContent = `${state.year}年${state.month + 1}月`;

        updateTodayButtonState();

        const cells = [];

        for(let i = 0; i < startWeekday; i++){
            cells.push(`<span class="eventCalendarDay eventCalendarDay--empty"></span>`);
        }

        for(let day = 1; day <= daysInMonth; day++){
            const date = new Date(state.year, state.month, day);
            const eventsOnDay = getEventsOnDate(date);
            const isToday = date.getTime() === today.getTime();

            const prevDate = new Date(state.year, state.month, day - 1);
            const nextDate = new Date(state.year, state.month, day + 1);
            const connectsToPrev = eventsOnDay.length > 0 && getEventsOnDate(prevDate).length > 0;
            const connectsToNext = eventsOnDay.length > 0 && getEventsOnDate(nextDate).length > 0;

            const classNames = [
                "eventCalendarDay",
                eventsOnDay.length > 0 ? "eventCalendarDay--event" : "",
                isToday ? "eventCalendarDay--today" : "",
                connectsToPrev ? "eventCalendarDay--connectLeft" : "",
                connectsToNext ? "eventCalendarDay--connectRight" : ""
            ].filter(Boolean).join(" ");

            const badge = eventsOnDay.length > 1
                ? `<span class="eventCalendarDayBadge">${eventsOnDay.length}</span>`
                : "";

            cells.push(`
                <button type="button" class="${classNames}" data-date="${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}">
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

    function goToMonth(year, month){
        state.year = year;
        state.month = month;

        renderGrid();
        clearEventList();
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
        goToMonth(today.getFullYear(), today.getMonth());
        selectDate(today);
    }

    function render(){
        renderGrid();
        selectDate(today);
    }

    if(prevButton){
        prevButton.addEventListener("click", goToPrevMonth);
    }

    if(nextButton){
        nextButton.addEventListener("click", goToNextMonth);
    }

    if(todayButton){
        todayButton.addEventListener("click", goToToday);
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

    render();

})();
