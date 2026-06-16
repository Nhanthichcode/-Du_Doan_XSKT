const paletteColors = [
    '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'
];

let historyChart = null;
let currentTimelineX = []; 

let allHistoricalRecords = [];
let tableCurrentPage = 1;
const tablePageSize = 10;
let filteredTableData = [];

function initPermanentDashboard() {
    if (typeof xoso_data === 'undefined') return;

    const data = xoso_data;
    document.getElementById('lbl-time').innerText = data.build_time || "Đang chạy...";

    allHistoricalRecords = [];
    data.timeline_x.forEach((dateStr, dateIdx) => {
        for (const [stationName, points] of Object.entries(data.lines_y)) {
            const val = points[dateIdx];
            if (val !== null && val !== undefined) {
                const parts = dateStr.split('/');
                const year = parseInt(parts[2]);
                const parsedDate = new Date(year, parseInt(parts[1]) - 1, parseInt(parts[0]));
                allHistoricalRecords.push({
                    date: parsedDate,
                    dateStr: dateStr,
                    year: year,
                    dai: stationName,
                    g8: val
                });
            }
        }
    });

    allHistoricalRecords.sort((a, b) => b.date - a.date);
    filteredTableData = [...allHistoricalRecords];

    // GỌT SẠCH: Gọi file tĩnh trơn không nhãn thời gian ngẫu nhiên gây cache lỗi
    fetch('js/history_predictions.json')
        .then(response => response.json())
        .then(historyJson => {
            const dates = Object.keys(historyJson);
            if (dates.length === 0) return;

            const convertToDateObject = (dateStr) => {
                const parts = dateStr.replace(/-/g, '/').split('/');
                return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            };
            dates.sort((a, b) => convertToDateObject(b) - convertToDateObject(a));

            const latestDate = dates[0];
            const predictDiv = document.getElementById('prediction-list');
            const lblPredDate = document.getElementById('lbl-pred-date');
            
            if (lblPredDate) lblPredDate.textContent = latestDate;

            let predictHtml = "";
            if (historyJson[latestDate] && Array.isArray(historyJson[latestDate])) {
                historyJson[latestDate].forEach(item => {
                    if (!item.predictions) return;

                    predictHtml += `
                        <div class="gold-card" style="margin-bottom: 10px;">
                            <div class="gold-header"><span class="gold-dai">${item.dai.toUpperCase()}</span></div>
                            <div class="pred-group">
                                ${item.predictions.map((p, i) => `
                                    <div class="pred-row ${i === 0 ? 'primary-pred' : ''}">
                                        <span class="badge-priority">Ưu Tiên ${i + 1}</span>
                                        <span class="${i === 0 ? 'gold-num' : 'gold-num-sm'}">${String(p.so).padStart(2, '0')}</span>
                                        <span class="${i === 0 ? 'gold-percent' : 'gold-percent-sm'}">${p.xac_suat}%</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                });
            }
            if (predictDiv) predictDiv.innerHTML = predictHtml || `<p>Chưa có dự báo.</p>`;

            const backtestDiv = document.getElementById('backtest-list');
            let backtestHtml = "";

            dates.forEach(date => {
                if (historyJson[date] && Array.isArray(historyJson[date])) {
                    historyJson[date].forEach(pred => {
                        if (!pred.predictions) return;
                        if (pred.actual_g8 !== undefined && pred.actual_g8 !== null && pred.actual_g8 !== "") {
                            const actualG8Str = String(pred.actual_g8).padStart(2, '0');
                            const isWin = pred.is_hit === true || pred.is_hit === "true";

                            backtestHtml += `
                                <div class="history-item" style="margin-bottom: 10px;">
                                    ${isWin ? `<div class="match-celebration-banner">🎯 TRÚNG GIẢI 8 [${actualG8Str}]</div>` : ''}
                                    <div class="history-meta"><span>${pred.dai}</span><span>${date}</span></div>
                                    <div class="history-data"><span class="history-dai-name">Kết quả về:</span><span class="history-result">${actualG8Str}</span></div>
                               </div>
                            `;
                        }
                    });
                }
            });
            if (backtestDiv) backtestDiv.innerHTML = backtestHtml || `<div class="chart-tip">Đang đồng bộ...</div>`;
        })
        .catch(err => console.error(err));

    renderAdvanceChart('recent', data);
    renderHistoricalTable();
}

function renderAdvanceChart(filterType, data) {
    let filteredLabels = [];
    let startIndex = 0;
    let endIndex = data.timeline_x.length;

    if (filterType === 'recent') {
        startIndex = Math.max(0, data.timeline_x.length - 30);
        filteredLabels = data.timeline_x.slice(startIndex, endIndex);
    } else if (filterType === '2years') {
        const currentYear = new Date().getFullYear();
        data.timeline_x.forEach((dateStr, idx) => {
            const year = parseInt(dateStr.split('/')[2]);
            if (year >= currentYear - 1) {
                if (filteredLabels.length === 0) startIndex = idx;
                filteredLabels.push(dateStr);
                endIndex = idx + 1;
            }
        });
    } else if (filterType === 'all') {
        filteredLabels = data.timeline_x;
    }

    currentTimelineX = filteredLabels; 
    const datasets = [];
    let colorIdx = 0;

    for (const [channelName, points] of Object.entries(data.lines_y)) {
        const slicedPoints = points.slice(startIndex, endIndex);
        if (!slicedPoints.some(p => p !== null && p !== undefined)) continue;

        datasets.push({
            label: channelName,
            data: slicedPoints,
            borderColor: paletteColors[colorIdx % paletteColors.length],
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: filterType === 'recent' ? 4 : 0,
            tension: 0.2, 
            spanGaps: true,
            hidden: colorIdx >= 3
        });
        colorIdx++;
    }

    if (historyChart) historyChart.destroy();

    const ctx = document.getElementById('historyLineChart').getContext('2d');
    historyChart = new Chart(ctx, {
        type: 'line',
        data: { labels: filteredLabels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // KHÓA HOÀN TOÀN HOVER RIÊNG LẺ: Giữ nguyên trạng thái nhấp nháy phát sáng nhẹ nhàng của CSS
            hover: { mode: null }, 
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: { wheel: { enabled: true, speed: 0.05 }, pinch: { enabled: true }, mode: 'x' }
                }
            },
            scales: {
                x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                y: { min: 0, max: 99, grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', stepSize: 10 } }
            }
        }
    });
}

function renderHistoricalTable() {
    const tableBody = document.getElementById("historical-table-rows");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    const startIndex = (tableCurrentPage - 1) * tablePageSize;
    const endIndex = Math.min(startIndex + tablePageSize, filteredTableData.length);
    const pageData = filteredTableData.slice(startIndex, endIndex);

    pageData.forEach(item => {
        const tr = document.createElement("tr");
        const numericVal = parseInt(item.g8);
        const chanLeStr = numericVal % 2 === 0 ? "Chẵn" : "Lẻ";
        const trendBadge = numericVal > 50 ? "Tài" : "Xỉu";

        tr.innerHTML = `
            <td>${item.dateStr}</td>
            <td style="color: var(--primary); font-weight:700;">${item.dai}</td>
            <td style="color: var(--warning); font-weight:700;">${String(numericVal).padStart(2, '0')}</td>
            <td>Đầu ${Math.floor(numericVal / 10)}, Đuôi ${numericVal % 10}</td>
            <td>${trendBadge} (${chanLeStr})</td>
        `;
        tableBody.appendChild(tr);
    });

    document.getElementById("table-entries-info").textContent = `${startIndex + 1}-${endIndex} của ${filteredTableData.length}`;
    document.getElementById("btn-table-prev").disabled = tableCurrentPage === 1;
    document.getElementById("btn-table-next").disabled = endIndex >= filteredTableData.length;
}

const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
        const container = document.getElementById('app-container');
        if (container) container.classList.toggle('sidebar-collapsed');
    });
}

window.addEventListener('DOMContentLoaded', initPermanentDashboard);
