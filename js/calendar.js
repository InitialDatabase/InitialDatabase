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

    function renderGrid(){
        const firstDay = new Date(state.year, state.month, 1);
        const lastDay = new Date(state.year, state.month + 1, 0);
        const startWeekday = firstDay.getDay();
        const daysInMonth = lastDay.getDate();

        monthLabel.textContent = `${state.year}年${state.month + 1}月`;

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
                grid.querySelectorAll("[data-date]").forEach(b => b.classList.remove("eventCalendarDay--selected"));
                button.classList.add("eventCalendarDay--selected");

                const date = parseDateOnly(button.dataset.date);

                renderEventList(getEventsOnDate(date));
            });
        });
    }

    function render(){
        renderGrid();
        renderEventList(getEventsOnDate(today));
    }

    if(prevButton){
        prevButton.addEventListener("click", () => {
            state.month -= 1;

            if(state.month < 0){
                state.month = 11;
                state.year -= 1;
            }

            renderGrid();
        });
    }

    if(nextButton){
        nextButton.addEventListener("click", () => {
            state.month += 1;

            if(state.month > 11){
                state.month = 0;
                state.year += 1;
            }

            renderGrid();
        });
    }

    render();

})();
