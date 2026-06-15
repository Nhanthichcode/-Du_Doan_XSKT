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
    if (typeof xoso_data === 'undefined') {
        console.error("❌ Không tìm thấy biến dữ liệu xoso_data tĩnh!");
        return;
    }

    const data = xoso_data;
    document.getElementById('lbl-time').innerText = data.build_time || "Đang cập nhật...";

    // Khởi tạo mảng Records cho Table Tra cứu
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

    // PHÂN TÁCH SỐ VÀNG & LỊCH SỬ ĐỐI CHIẾU HOÀN TOÀN TỪ FILE JSON
    const noCacheUrl = 'js/history_predictions.json?t=' + new Date().getTime();

    fetch(noCacheUrl)
        .then(response => response.json())
        .then(historyJson => {
            const dates = Object.keys(historyJson);
            if (dates.length === 0) return;

            // Sắp xếp JSON keys (ngày tháng) từ mới nhất đến cũ nhất
            const convertToDateObject = (dateStr) => {
                const parts = dateStr.replace(/-/g, '/').split('/');
                return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            };
            dates.sort((a, b) => convertToDateObject(b) - convertToDateObject(a));

            // --- 1. SỐ VÀNG TIẾP THEO (Chỉ lấy ngày đầu tiên) ---
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
                            <div class="gold-header">
                                <span class="gold-dai">${item.dai.toUpperCase()}</span>
                            </div>
                            <div class="pred-group">
                                ${item.predictions.map((p, i) => `
                                    <div class="pred-row ${i === 0 ? 'primary-pred' : ''}">
                                        <span class="badge-priority">Ưu Tiên ${i + 1}</span>
                                        <span class="${i === 0 ? 'gold-num' : 'gold-num-sm'}">${String(p.so).padStart(2, '0')}</span>
                                        <span class="${i === 0 ? 'gold-percent' : 'gold-percent-sm'}">${p.xac_suat}%</span>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="gold-details">
                                <span>• Mô hình AI: Random Forest Live</span>
                            </div>
                        </div>
                    `;
                });
            }
            if (predictDiv) predictDiv.innerHTML = predictHtml || `<p>Chưa có dự báo.</p>`;

            // --- 2. ĐỐI CHIẾU LỊCH SỬ KỲ TRƯỚC (Quét các ngày đã có actual_g8) ---
            const backtestDiv = document.getElementById('backtest-list');
            let backtestHtml = "";

            dates.forEach(date => {
                if (historyJson[date] && Array.isArray(historyJson[date])) {
                    historyJson[date].forEach(pred => {
                        if (!pred.predictions) return;

                        // CHỈ IN RA MÀN HÌNH NẾU NGÀY ĐÓ ĐÃ CÓ KẾT QUẢ THỰC TẾ (actual_g8) TỪ PYTHON
                        if (pred.actual_g8 !== undefined && pred.actual_g8 !== null && pred.actual_g8 !== "") {
                            const actualG8Str = String(pred.actual_g8).padStart(2, '0');
                            const isWin = pred.is_hit === true || pred.is_hit === "true";

                            backtestHtml += `
                                <div class="history-item" style="margin-bottom: 10px;">
                                    ${isWin ? `
                                    <div class="match-celebration-banner">
                                        <span>🎯 TRÚNG LÔ GIẢI 8 [${actualG8Str}]</span>
                                    </div>` : ''}
                                    <div class="history-meta">
                                        <span>${pred.dai}</span>
                                        <span style="font-size:11px;">${date}</span>
                                    </div>
                                    <div class="history-data">
                                        <span class="history-dai-name">Giải 8 Thực Tế Về:</span>
                                        <span class="history-result">${actualG8Str}</span>
                                    </div>
                                    <div class="predictions-comparison">
                                        <span>AI từng dự báo: [${pred.predictions.map(p => String(p.so).padStart(2, '0')).join(', ')}]</span>
                                        <div style="text-align:right; margin-top: 4px; font-weight:600; font-size:11px;">
                                            ${isWin ? `<span style="color:#10b981;">Thắng</span>` : `<span style="color:var(--text-muted);">Trượt</span>`}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }
                    });
                }
            });

            if (backtestDiv) {
                backtestDiv.innerHTML = backtestHtml || `<div class="chart-tip">Dữ liệu đối chiếu chưa sẵn sàng...</div>`;
            }
        })
        .catch(err => console.error("Lỗi JSON:", err));

    // KÍCH HOẠT VẼ BIỂU ĐỒ BẢN ĐỒ VÀ BẢNG
    renderAdvanceChart('recent', data);
    renderHistoricalTable();

    // SỰ KIỆN TÌM KIẾM
    const searchInput = document.getElementById("table-search-input");
    const filterYearSelect = document.getElementById("table-filter-year");
    const updateTableFilters = () => {
        const searchVal = searchInput.value.toLowerCase().trim();
        const yearVal = filterYearSelect.value;
        filteredTableData = allHistoricalRecords.filter(item => {
            const matchSearch = item.dai.toLowerCase().includes(searchVal) || String(item.g8).includes(searchVal) || item.dateStr.includes(searchVal);
            const matchYear = yearVal === "all" || item.year === parseInt(yearVal);
            return matchSearch && matchYear;
        });
        tableCurrentPage = 1;
        renderHistoricalTable();
    };
    if (searchInput && filterYearSelect) {
        searchInput.addEventListener("input", updateTableFilters);
        filterYearSelect.addEventListener("change", updateTableFilters);
    }

    // SỰ KIỆN PHÂN TRANG
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

    // SỰ KIỆN BIỂU ĐỒ
    const cboTimeframe = document.getElementById("cbo-timeframe");
    if (cboTimeframe) {
        cboTimeframe.addEventListener("change", (e) => { renderAdvanceChart(e.target.value, data); });
    }

    // HOẠT ẢNH MƯỢT MÀ KHI ẨN/HIỆN ĐƯỜNG VẼ
    const btnDeselect = document.getElementById('btn-deselect-all');
    if (btnDeselect) {
        btnDeselect.addEventListener('click', () => {
            if (!historyChart) return;
            historyChart.data.datasets.forEach((dataset, index) => {
                historyChart.setDatasetVisibility(index, false); 
            });
            historyChart.update('none'); 
        });
    }

    const btnSelect = document.getElementById('btn-select-all');
    if (btnSelect) {
        btnSelect.addEventListener('click', () => {
            if (!historyChart) return;
            historyChart.data.datasets.forEach((dataset, index) => {
                historyChart.setDatasetVisibility(index, true); 
            });
            historyChart.update('none'); 
        });
    }

    // SỰ KIỆN ZOOM/PAN
    document.getElementById("btn-zoom-in").addEventListener("click", () => { if (historyChart) historyChart.zoom(1.2); });
    document.getElementById("btn-zoom-out").addEventListener("click", () => { if (historyChart) historyChart.zoom(0.8); });
    document.getElementById("btn-zoom-reset").addEventListener("click", () => { if (historyChart) historyChart.resetZoom(); });
    document.getElementById("btn-pan-left").addEventListener("click", () => {
        if (historyChart) {
            const xAxis = historyChart.scales.x;
            const diff = (xAxis.max - xAxis.min) * 0.2;
            xAxis.options.min = xAxis.min - diff;
            xAxis.options.max = xAxis.max - diff;
            historyChart.update();
        }
    });
    document.getElementById("btn-pan-right").addEventListener("click", () => {
        if (historyChart) {
            const xAxis = historyChart.scales.x;
            const diff = (xAxis.max - xAxis.min) * 0.2;
            xAxis.options.min = xAxis.min + diff;
            xAxis.options.max = xAxis.max + diff;
            historyChart.update();
        }
    });
}

function renderAdvanceChart(filterType, data) {
    let filteredLabels = [];
    let startIndex = 0;
    let endIndex = data.timeline_x.length;

    const isSpecificYear = !["recent", "2years", "5years", "all"].includes(filterType);

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
    } else if (filterType === '5years') {
        const currentYear = new Date().getFullYear();
        data.timeline_x.forEach((dateStr, idx) => {
            const year = parseInt(dateStr.split('/')[2]);
            if (year >= currentYear - 4) {
                if (filteredLabels.length === 0) startIndex = idx;
                filteredLabels.push(dateStr);
                endIndex = idx + 1;
            }
        });
    } else if (filterType === 'all') {
        filteredLabels = data.timeline_x;
    } else if (isSpecificYear) {
        const selectedYear = parseInt(filterType);
        data.timeline_x.forEach((dateStr, idx) => {
            const year = parseInt(dateStr.split('/')[2]);
            if (year === selectedYear) {
                if (filteredLabels.length === 0) startIndex = idx;
                filteredLabels.push(dateStr);
                endIndex = idx + 1;
            }
        });
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
            backgroundColor: paletteColors[colorIdx % paletteColors.length] + '20',
            borderWidth: 2.5,
            pointRadius: filterType === 'recent' ? 5 : 1,
            tension: 0.15,
            spanGaps: true,
            hidden: colorIdx >= 4 
        });
        colorIdx++;
    }

    if (historyChart) historyChart.destroy();

    const ctx = document.getElementById('historyLineChart').getContext('2d');
    if (!ctx) return;

    historyChart = new Chart(ctx, {
        type: 'line',
        data: { labels: filteredLabels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { 
                    grid: { color: '#1e293b' },
                    ticks: { color: '#94a3b8', maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }
                },
                y: { 
                    min: 0, 
                    max: 99, 
                    grid: { color: '#1e293b' },
                    ticks: { color: '#94a3b8', stepSize: 10, callback: v => String(v).padStart(2, '0') } 
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, boxWidth: 12 }
                },
                zoom: {
                    pan: { enabled: true, mode: 'x', threshold: 10 },
                    zoom: {
                        wheel: { enabled: true, speed: 0.08 },
                        pinch: { enabled: true },
                        mode: 'x',
                    },
                    limits: {
                        y: { min: 0, max: 99, minRange: 99, maxRange: 99 }
                    }
                }
            }
        },
        plugins: [{
            id: 'inlineZoomLabels',
            afterDatasetsDraw(chart) {
                try {
                    const { ctx, scales: { x } } = chart;
                    const totalPoints = currentTimelineX.length;
                    const visiblePoints = x.max - x.min;
                    
                    const zoomRatio = (totalPoints - visiblePoints) / totalPoints;

                    if (zoomRatio >= 0.10) { 
                        ctx.save();
                        ctx.font = 'bold 11px Inter, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';

                        chart.data.datasets.forEach((dataset, dIdx) => {
                            if (chart.isDatasetVisible(dIdx)) {
                                const meta = chart.getDatasetMeta(dIdx);
                                meta.data.forEach((element, pIdx) => {
                                    if (pIdx >= x.min && pIdx <= x.max) {
                                        const value = dataset.data[pIdx];
                                        if (value !== null && value !== undefined) {
                                            ctx.fillStyle = '#ffffff';
                                            ctx.beginPath();
                                            ctx.arc(element.x, element.y, 9, 0, 2 * Math.PI);
                                            ctx.fill();

                                            ctx.strokeStyle = dataset.borderColor;
                                            ctx.lineWidth = 1;
                                            ctx.stroke();
                                            
                                            ctx.fillStyle = dataset.borderColor;
                                            ctx.fillText(String(value).padStart(2, '0'), element.x, element.y);
                                        }
                                    }
                                });
                            }
                        });
                        ctx.restore();
                    }
                } catch (err) {}
            }
        }]
    });
}

function renderHistoricalTable() {
    const tableBody = document.getElementById("historical-table-rows");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (filteredTableData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Không tìm thấy dữ liệu.</td></tr>`;
        document.getElementById("table-entries-info").textContent = "Không tìm thấy dữ liệu.";
        return;
    }

    const startIndex = (tableCurrentPage - 1) * tablePageSize;
    const endIndex = Math.min(startIndex + tablePageSize, filteredTableData.length);
    const pageData = filteredTableData.slice(startIndex, endIndex);

    pageData.forEach(item => {
        const tr = document.createElement("tr");
        const numericVal = item.g8;
        const chanLeStr = numericVal % 2 === 0 ? "Chẵn" : "Lẻ";
        const dauStr = Math.floor(numericVal / 10);
        const duoiStr = numericVal % 10;
        const trendBadge = numericVal > 50 
            ? `<span style="color: #60a5fa; font-weight: 600;">Xu hướng Tài</span>` 
            : `<span style="color: #f472b6; font-weight: 600;">Xu hướng Xỉu</span>`;

        tr.innerHTML = `
            <td style="font-weight: 600;">${item.dateStr}</td>
            <td style="color: var(--primary); font-weight: 700;">${item.dai}</td>
            <td><span style="font-family: 'Fira Code', monospace; font-size: 1.05rem; font-weight: 700; color: var(--warning); background-color: rgba(245,158,11,0.1); padding: 0.15rem 0.5rem; border-radius: 0.25rem;">${String(item.g8).padStart(2, '0')}</span></td>
            <td>Đầu ${dauStr}, Đuôi ${duoiStr} (${chanLeStr})</td>
            <td>${trendBadge}</td>
        `;
        tableBody.appendChild(tr);
    });

    document.getElementById("table-entries-info").textContent = `Đang hiển thị bản ghi từ ${startIndex + 1} đến ${endIndex} trong số ${filteredTableData.length} bản ghi`;
    document.getElementById("btn-table-prev").disabled = tableCurrentPage === 1;
    document.getElementById("btn-table-next").disabled = endIndex >= filteredTableData.length;
}

const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
        const sidebar = document.getElementById('app-sidebar');
        if (!sidebar) return;
        
        document.body.classList.add('sidebar-toggling');
        sidebar.classList.toggle('collapsed');
        sidebar.classList.toggle('active'); 
        
        setTimeout(() => {
            if (historyChart) {
                try {
                    historyChart.resize();
                } catch (e) {}
            }
            document.body.classList.remove('sidebar-toggling');
        }, 320);
    });
}

window.addEventListener('DOMContentLoaded', () => {
    try {
        initPermanentDashboard();
    } catch (err) {
        console.warn("Lỗi khởi chạy: ", err);
    }
});