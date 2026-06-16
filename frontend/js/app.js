const paletteColors = [
    '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'
];

let historyChart = null;
let currentTimelineX = []; 

let originalXosoData = null; // Lưu trữ dữ liệu gốc để phục vụ bộ lọc biểu đồ
let allHistoricalRecords = []; // Dữ liệu gốc cho bảng
let filteredTableData = []; // Dữ liệu bảng sau khi lọc
let tableCurrentPage = 1;
const tablePageSize = 10;

let allBacktestRecords = []; // Dữ liệu gốc cho lịch sử dự đoán (Đối chiếu)

function initPermanentDashboard() {
    if (typeof xoso_data === 'undefined') return;

    const data = xoso_data;
    originalXosoData = data;
    document.getElementById('lbl-time').innerText = data.build_time || "Đang chạy...";

    // 1. Phân tích dữ liệu gốc thành mảng Object cho Bảng tra cứu
    allHistoricalRecords = [];
    data.timeline_x.forEach((dateStr, dateIdx) => {
        for (const [stationName, points] of Object.entries(data.lines_y)) {
            const val = points[dateIdx];
            if (val !== null && val !== undefined) {
                const parts = dateStr.split('/');
                const year = parseInt(parts[2]);
                const month = parseInt(parts[1]);
                const parsedDate = new Date(year, month - 1, parseInt(parts[0]));
                allHistoricalRecords.push({
                    date: parsedDate,
                    dateStr: dateStr,
                    year: year,
                    month: month,
                    dai: stationName,
                    g8: val
                });
            }
        }
    });

    allHistoricalRecords.sort((a, b) => b.date - a.date);
    filteredTableData = [...allHistoricalRecords];

    // Nạp tên đài vào các dropdown
    populateDaiDropdowns(data);

    // 2. Tải và xử lý dữ liệu Số Vàng AI (Đối chiếu)
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

            // -- Hiển thị dự báo mới nhất --
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

            // -- Xử lý lịch sử Đối chiếu kỳ trước --
            allBacktestRecords = [];
            dates.forEach(date => {
                if (historyJson[date] && Array.isArray(historyJson[date])) {
                    historyJson[date].forEach(pred => {
                        if (!pred.predictions) return;
                        if (pred.actual_g8 !== undefined && pred.actual_g8 !== null && pred.actual_g8 !== "") {
                            const parts = date.replace(/-/g, '/').split('/');
                            allBacktestRecords.push({
                                dateStr: date,
                                year: parseInt(parts[2]),
                                month: parseInt(parts[1]),
                                dai: pred.dai,
                                actual_g8: pred.actual_g8,
                                is_hit: pred.is_hit === true || pred.is_hit === "true"
                            });
                        }
                    });
                }
            });
            renderBacktestList(); // Render lần đầu với dữ liệu đầy đủ
        })
        .catch(err => console.error("Lỗi nạp dữ liệu Số Vàng:", err));

    // Render khởi tạo đồ thị và bảng
    renderAdvanceChart();
    renderHistoricalTable();

    // Gắn tất cả các Event Listeners cho bộ lọc và nút bấm
    attachEventListeners();
}

// ==========================================
// CÁC HÀM XỬ LÝ BỘ LỌC (E-COMMERCE STYLE)
// ==========================================

function populateDaiDropdowns(data) {
    const daiList = Object.keys(data.lines_y);
    const dropdowns = ['filter-bt-dai', 'filter-chart-dai', 'filter-tbl-dai'];
    
    dropdowns.forEach(id => {
        const el = document.getElementById(id);
        if(!el) return;
        daiList.forEach(dai => {
            const opt = document.createElement('option');
            opt.value = dai; opt.textContent = dai;
            el.appendChild(opt);
        });
    });
}

// Lọc Đối Chiếu Kỳ Trước (Backtest)
function applyBacktestFilters() {
    renderBacktestList();
}

function renderBacktestList() {
    const backtestDiv = document.getElementById('backtest-list');
    if(!backtestDiv) return;

    const sDai = document.getElementById('filter-bt-dai')?.value || 'all';
    const sMonth = document.getElementById('filter-bt-month')?.value || 'all';
    const sYear = document.getElementById('filter-bt-year')?.value || 'all';
    const sStatus = document.getElementById('filter-bt-status')?.value || 'all';

    let filtered = allBacktestRecords.filter(item => {
        const matchDai = sDai === 'all' || item.dai === sDai;
        const matchYear = sYear === 'all' || item.year == sYear;
        const matchMonth = sMonth === 'all' || item.month == sMonth;
        let matchStatus = true;
        if(sStatus === 'win') matchStatus = item.is_hit;
        if(sStatus === 'loss') matchStatus = !item.is_hit;
        return matchDai && matchYear && matchMonth && matchStatus;
    });

    let backtestHtml = "";
    filtered.forEach(pred => {
        const actualG8Str = String(pred.actual_g8).padStart(2, '0');
        const isWin = pred.is_hit;
        backtestHtml += `
            <div class="history-item" style="margin-bottom: 10px;">
                ${isWin ? `<div class="match-celebration-banner">🎯 TRÚNG GIẢI 8 [${actualG8Str}]</div>` : ''}
                <div class="history-meta"><span>${pred.dai}</span><span>${pred.dateStr}</span></div>
                <div class="history-data"><span class="history-dai-name">Kết quả về:</span><span class="history-result">${actualG8Str}</span></div>
            </div>
        `;
    });
    backtestDiv.innerHTML = backtestHtml || `<div class="chart-tip" style="padding: 10px; text-align: center;">Không tìm thấy lịch sử phù hợp.</div>`;
}

// Lọc Bảng Thống Kê (Table)
function applyTableFilters() {
    const sDai = document.getElementById('filter-tbl-dai')?.value || 'all';
    const sMonth = document.getElementById('filter-tbl-month')?.value || 'all';
    const sYear = document.getElementById('filter-tbl-year')?.value || 'all';
    const sText = document.getElementById('table-search-input')?.value.toLowerCase() || '';

    filteredTableData = allHistoricalRecords.filter(item => {
        const matchDai = sDai === 'all' || item.dai === sDai;
        const matchYear = sYear === 'all' || item.year == sYear;
        const matchMonth = sMonth === 'all' || item.month == sMonth;
        const matchText = sText === '' || item.g8.toString().includes(sText) || item.dai.toLowerCase().includes(sText);
        return matchDai && matchYear && matchMonth && matchText;
    });

    tableCurrentPage = 1; 
    renderHistoricalTable();
}

function renderHistoricalTable() {
    const tableBody = document.getElementById("historical-table-rows");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    const startIndex = (tableCurrentPage - 1) * tablePageSize;
    const endIndex = Math.min(startIndex + tablePageSize, filteredTableData.length);
    const pageData = filteredTableData.slice(startIndex, endIndex);

    if (pageData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 1rem;">Không có dữ liệu phù hợp</td></tr>`;
    } else {
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
    }

    document.getElementById("table-entries-info").textContent = `${filteredTableData.length > 0 ? startIndex + 1 : 0}-${endIndex} của ${filteredTableData.length}`;
    document.getElementById("btn-table-prev").disabled = tableCurrentPage === 1;
    document.getElementById("btn-table-next").disabled = endIndex >= filteredTableData.length || filteredTableData.length === 0;
}

// Lọc Biểu Đồ (Chart)
function applyChartFilters() {
    renderAdvanceChart();
}

function renderAdvanceChart() {
    if(!originalXosoData) return;
    const data = originalXosoData;

    const sDai = document.getElementById('filter-chart-dai')?.value || 'all';
    const sMonth = document.getElementById('filter-chart-month')?.value || 'all';
    const sYear = document.getElementById('filter-chart-year')?.value || 'all';

    let filteredLabels = [];
    let dataIndices = []; 

    data.timeline_x.forEach((dateStr, idx) => {
        const parts = dateStr.split('/');
        const year = parseInt(parts[2]);
        const month = parseInt(parts[1]);

        const matchYear = sYear === 'all' || year == sYear;
        const matchMonth = sMonth === 'all' || month == sMonth;

        if(matchYear && matchMonth) {
            filteredLabels.push(dateStr);
            dataIndices.push(idx);
        }
    });

    // Mặc định: Nếu chưa lọc gì, hiển thị 30 kỳ gần nhất cho gọn đẹp
    let isDefaultView = false;
    if (sYear === 'all' && sMonth === 'all') {
        const startIndex = Math.max(0, data.timeline_x.length - 30);
        filteredLabels = data.timeline_x.slice(startIndex);
        dataIndices = Array.from({length: data.timeline_x.length - startIndex}, (_, i) => i + startIndex);
        isDefaultView = true;
    }

    currentTimelineX = filteredLabels; 
    const datasets = [];
    let colorIdx = 0;

    for (const [channelName, points] of Object.entries(data.lines_y)) {
        // Áp dụng bộ lọc đài
        if (sDai !== 'all' && channelName !== sDai) continue;

        const slicedPoints = dataIndices.map(idx => points[idx]);
        if (!slicedPoints.some(p => p !== null && p !== undefined)) continue;

        datasets.push({
            label: channelName,
            data: slicedPoints,
            borderColor: paletteColors[colorIdx % paletteColors.length],
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: isDefaultView ? 4 : 2, // Làm to hạt điểm nếu ít dữ liệu
            tension: 0.2, 
            spanGaps: true,
            // Ẩn bớt các đường nếu không chọn Đài cụ thể để đỡ rối mắt
            hidden: (sDai === 'all' && colorIdx >= 3) 
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
            // CẤU HÌNH TOOLTIP: Cho phép chạm 1 điểm thấy kết quả mọi đường cùng thời gian
            interaction: {
                mode: 'index',
                intersect: false,
            },
            hover: { mode: 'index', intersect: false },
            plugins: {
                tooltip: {
                    usePointStyle: true,
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { size: 13 },
                    bodyFont: { size: 12 },
                    padding: 10
                },
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

// ==========================================
// KHỞI TẠO CÁC SỰ KIỆN (EVENTS)
// ==========================================
function attachEventListeners() {
    // 1. Sự kiện Bộ lọc Bảng (Table)
    ['filter-tbl-dai', 'filter-tbl-month', 'filter-tbl-year'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', applyTableFilters);
    });
    document.getElementById('table-search-input')?.addEventListener('input', applyTableFilters);

    const btnTablePrev = document.getElementById("btn-table-prev");
    const btnTableNext = document.getElementById("btn-table-next");
    if (btnTablePrev && btnTableNext) {
        btnTablePrev.addEventListener("click", () => {
            if (tableCurrentPage > 1) { tableCurrentPage--; renderHistoricalTable(); }
        });
        btnTableNext.addEventListener("click", () => {
            const maxPage = Math.ceil(filteredTableData.length / tablePageSize);
            if (tableCurrentPage < maxPage) { tableCurrentPage++; renderHistoricalTable(); }
        });
    }

    // 2. Sự kiện Bộ lọc Biểu đồ (Chart)
    ['filter-chart-dai', 'filter-chart-month', 'filter-chart-year'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', applyChartFilters);
    });

    const btnSelectAll = document.getElementById("btn-select-all");
    const btnDeselectAll = document.getElementById("btn-deselect-all");
    if (btnSelectAll && btnDeselectAll) {
        btnSelectAll.addEventListener("click", () => {
            if (!historyChart) return;
            historyChart.data.datasets.forEach((_, i) => historyChart.setDatasetVisibility(i, true));
            historyChart.update();
        });
        btnDeselectAll.addEventListener("click", () => {
            if (!historyChart) return;
            historyChart.data.datasets.forEach((_, i) => historyChart.setDatasetVisibility(i, false));
            historyChart.update();
        });
    }

    // -- Nút điều hướng đồ thị To, Rõ, Dễ bấm --
    document.getElementById("btn-zoom-in")?.addEventListener("click", () => { if (historyChart) historyChart.zoom(1.2); });
    document.getElementById("btn-zoom-out")?.addEventListener("click", () => { if (historyChart) historyChart.zoom(0.8); });
    document.getElementById("btn-zoom-reset")?.addEventListener("click", () => { if (historyChart) historyChart.resetZoom(); });
    document.getElementById("btn-pan-left")?.addEventListener("click", () => {
        if (historyChart) {
            const xAxis = historyChart.scales.x;
            const diff = (xAxis.max - xAxis.min) * 0.2;
            xAxis.options.min = xAxis.min - diff;
            xAxis.options.max = xAxis.max - diff;
            historyChart.update();
        }
    });
    document.getElementById("btn-pan-right")?.addEventListener("click", () => {
        if (historyChart) {
            const xAxis = historyChart.scales.x;
            const diff = (xAxis.max - xAxis.min) * 0.2;
            xAxis.options.min = xAxis.min + diff;
            xAxis.options.max = xAxis.max + diff;
            historyChart.update();
        }
    });

    // 3. Sự kiện Bộ lọc Sidebar Đối chiếu
    ['filter-bt-dai', 'filter-bt-month', 'filter-bt-year', 'filter-bt-status'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', applyBacktestFilters);
    });

    // 4. Toggle Sidebar Menu
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    if (btnToggleSidebar) {
        btnToggleSidebar.addEventListener('click', () => {
            const container = document.getElementById('app-container');
            if (container) container.classList.toggle('sidebar-collapsed');
        });
    }
}

// Khởi chạy App khi trang tải xong
window.addEventListener('DOMContentLoaded', initPermanentDashboard);
