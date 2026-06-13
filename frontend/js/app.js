const BACKEND_URL = 'https://du-doan-xskt.onrender.com';

let allHistoricalRecords = [];
let predictionsData = [];
let backtestData = [];

const DAIS_MIENNAM = ["Tiền Giang", "Kiên Giang", "Đà Lạt", "TP.HCM", "Tây Ninh", "An Giang", "Cần Thơ", "Vũng Tàu", "Bến Tre", "Đồng Nai", "Bạc Liêu", "Cà Mau", "Đồng Tháp", "Sóc Trăng", "Bình Dương", "Trà Vinh", "Vĩnh Long", "Bình Phước", "Hậu Giang", "Long An"];

let chartInstance = null;
let tableCurrentPage = 1;
const tablePageSize = 10;
let filteredTableData = [];

// [THAY ĐỔI QUAN TRỌNG NHẤT]: Đưa toàn bộ logic khởi tạo vào hàm startApp()
function startApp() {
    initApp();
    loadRealData();

    const btnToggle = document.getElementById("btn-toggle-sidebar");
    const appContainer = document.getElementById("app-container");
    if (btnToggle && appContainer) {
        btnToggle.addEventListener("click", () => {
            appContainer.classList.toggle("sidebar-collapsed");
            setTimeout(() => { if (chartInstance) chartInstance.resize(); }, 300);
        });
    }

    document.getElementById("cbo-timeframe").addEventListener("change", (e) => renderChart(e.target.value));
    
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
    
    searchInput.addEventListener("input", updateTableFilters);
    filterYearSelect.addEventListener("change", updateTableFilters);

    document.getElementById("btn-table-prev").addEventListener("click", () => {
        if (tableCurrentPage > 1) { tableCurrentPage--; renderHistoricalTable(); }
    });
    document.getElementById("btn-table-next").addEventListener("click", () => {
        if (tableCurrentPage < Math.ceil(filteredTableData.length / tablePageSize)) { tableCurrentPage++; renderHistoricalTable(); }
    });

    document.getElementById("btn-select-all").addEventListener("click", () => toggleChartVisibility(true));
    document.getElementById("btn-deselect-all").addEventListener("click", () => toggleChartVisibility(false));
    document.getElementById("btn-zoom-in").addEventListener("click", () => { if (chartInstance) chartInstance.zoom(1.2); });
    document.getElementById("btn-zoom-out").addEventListener("click", () => { if (chartInstance) chartInstance.zoom(0.8); });
    document.getElementById("btn-zoom-reset").addEventListener("click", () => { if (chartInstance) chartInstance.resetZoom(); });
    document.getElementById("btn-pan-left").addEventListener("click", () => panChart(-0.2));
    document.getElementById("btn-pan-right").addEventListener("click", () => panChart(0.2));

    const btnTrigger = document.getElementById("btn-trigger-pipeline");
    btnTrigger.addEventListener("click", async () => {
        btnTrigger.disabled = true;
        btnTrigger.innerHTML = `Đang chạy quy trình AI...`;
        appendTerminalLog("[SYSTEM] Kích hoạt tiến trình phân tích tự động từ giao diện...", "log-warn");
        
        try {
            // [THAY ĐỔI]: Gọi API /ping không cần truyền Bearer Token nữa
            const res = await fetch(`${BACKEND_URL}/ping`);
            if (res.ok) {
                const data = await res.json();
                appendTerminalLog(`[SUCCESS] ${data.message || 'Lệnh kích hoạt thành công.'}`, "log-success");
            } else {
                appendTerminalLog("[WARNING] Máy chủ phản hồi trạng thái không hợp lệ.", "log-warn");
            }
        } catch (e) {
            appendTerminalLog("[ERROR] Không thể kết nối tới API.", "log-danger");
        }

        setTimeout(() => {
            btnTrigger.disabled = false;
            btnTrigger.innerHTML = `Khởi Chạy Pipeline`;
        }, 3000);
    });

    fetchSystemLog();
    setInterval(fetchSystemLog, 15000);
}

function initApp() {
    const today = new Date();
    document.getElementById("lbl-time").textContent = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
}

async function loadRealData() {
    const rawData = window.dashboardData || window.xsmnData || [];
    
    allHistoricalRecords = rawData.map(item => {
        const dateStr = item['Ngày'] || item.date || item.Date || "";
        const dai = item['Đài'] || item.dai || item.Province || "Unknown";
        const g8Raw = item['G.8'] || item.g8 || item.G8 || "0";
        const g8 = parseInt(String(g8Raw).split('-')[0].trim(), 10) || 0;

        let year = new Date().getFullYear();
        let parsedDate = new Date();
        
        if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            if (parts[2] && parts[2].length === 4) {
                year = parseInt(parts[2]);
                parsedDate = new Date(year, parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
        }

        return { date: parsedDate, dateStr, year, dai, g8 };
    }).filter(item => item.dateStr !== "");

    filteredTableData = [...allHistoricalRecords];

    try {
        // [THAY ĐỔI]: Đọc file JSON trực tiếp từ thư mục cục bộ của GitHub Pages không cần Token
        const res = await fetch('js/history_predictions.json');
        if (res.ok) {
            const json = await res.json();
            predictionsData = json.results || json.predictions || [];
            backtestData = json.backtest || [];
            if (json.ngay_du_doan) {
                document.getElementById('lbl-pred-date').textContent = json.ngay_du_doan;
            }
        }
    } catch (e) {
        console.warn("Chưa tìm thấy tệp predictions.");
    }

    if (predictionsData.length === 0 && window.dashboardPredictions) {
        predictionsData = window.dashboardPredictions;
    }

    renderPredictionsUI();
    renderBacktestUI();
    renderChart("recent");
    renderHistoricalTable();
}

function renderPredictionsUI() {
    const list = document.getElementById("prediction-list");
    list.innerHTML = "";

    if (predictionsData.length === 0) {
        list.innerHTML = `<div class="chart-tip">Chưa có dữ liệu dự báo cho ngày hôm nay.</div>`;
        return;
    }

    predictionsData.forEach(daiResult => {
        let predsHtml = '';
        daiResult.predictions.forEach((p, i) => {
            const isPrimary = i === 0;
            const rowClass = isPrimary ? "pred-row primary-pred" : "pred-row";
            const numClass = isPrimary ? "gold-num" : "gold-num-sm";
            const pctClass = isPrimary ? "gold-percent" : "gold-percent-sm";
            
            predsHtml += `
                <div class="${rowClass}">
                    <span class="badge-priority">Ưu Tiên ${i + 1}</span>
                    <span class="${numClass}">${p.so}</span>
                    <span class="${pctClass}">${p.xac_suat}%</span>
                </div>
            `;
        });

        const cardHtml = `
            <div class="gold-card">
                <div class="gold-header">
                    <span class="gold-dai">${daiResult.dai.toUpperCase()}</span>
                </div>
                <div class="pred-group">
                    ${predsHtml}
                </div>
                <div class="gold-details">
                    <span>Cập nhật lịch sử gần nhất: ${daiResult.ngay_cap_nhat_cu}</span>
                </div>
            </div>
        `;
        list.insertAdjacentHTML('beforeend', cardHtml);
    });
}

function renderBacktestUI() {
    const list = document.getElementById("backtest-list");
    list.innerHTML = "";

    if (backtestData.length === 0) {
        list.innerHTML = `<div class="chart-tip">Dữ liệu đối chiếu kỳ trước chưa sẵn sàng.</div>`;
        return;
    }

    backtestData.forEach(bt => {
        let badgesHtml = '';
        bt.predicted_numbers.forEach(num => {
            const isHit = num.toString() === bt.actual_g8.toString();
            badgesHtml += `<span class="pred-badge ${isHit ? 'hit' : ''}">${num}</span>`;
        });

        const bannerHtml = bt.is_hit 
            ? `<div class="match-celebration-banner">TRÚNG LÔ GIẢI 8 [${bt.actual_g8}]</div>` 
            : '';
            
        const statusHtml = bt.is_hit 
            ? `<span class="log-success" style="font-weight: 600;">CHẮC ĂN TRÚNG</span>` 
            : `<span style="color: var(--text-muted)">Chưa khớp kỳ này</span>`;

        const cardHtml = `
            <div class="history-item">
                ${bannerHtml}
                <div class="history-meta">
                    <span>${bt.dai}</span>
                    ${statusHtml}
                </div>
                <div class="history-data">
                    <span class="history-dai-name">Giải 8 Thực Tế</span>
                    <span class="history-result">${bt.actual_g8}</span>
                </div>
                <div class="predictions-comparison">
                    <span>Bộ 3 số AI dự báo kỳ trước:</span>
                    <div class="pred-badge-group">
                        ${badgesHtml}
                    </div>
                </div>
            </div>
        `;
        list.insertAdjacentHTML('beforeend', cardHtml);
    });
}

async function fetchSystemLog() {
    try {
        // [THAY ĐỔI]: Kéo API log từ URL của Render không kèm Token
        const res = await fetch(`${BACKEND_URL}/api/system-log`);
        if (res.ok) {
            const text = await res.text();
            const logs = text.split('\n').filter(l => l.trim() !== '');
            const termLogs = document.getElementById("terminal-logs");
            termLogs.innerHTML = '';
            
            logs.slice(-50).forEach(log => {
                let typeClass = "log-info";
                if (log.includes("THANH CONG")) typeClass = "log-success";
                if (log.includes("THAT BAI") || log.includes("LOI")) typeClass = "log-danger";
                
                const cleanLog = log.replace(/[✅❌⚠️⏰🛠️🤖🚀🔮✉️✈️🎉]/g, '').trim();

                const div = document.createElement("div");
                div.className = `log-entry ${typeClass}`;
                div.textContent = cleanLog;
                termLogs.appendChild(div);
            });
            termLogs.scrollTop = termLogs.scrollHeight;
        }
    } catch(e) {}
}

function appendTerminalLog(msg, typeClass = "log-info") {
    const termLogs = document.getElementById("terminal-logs");
    const now = new Date();
    const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const div = document.createElement("div");
    div.className = `log-entry ${typeClass}`;
    div.textContent = `[${timeStr}] ${msg}`;
    termLogs.appendChild(div);
    termLogs.scrollTop = termLogs.scrollHeight;
}

function renderChart(timeframe) {
    if (allHistoricalRecords.length === 0) return;

    let filteredData = [];
    const labelsSet = new Set();
    
    const isSpecificYear = !["recent", "2years", "5years", "all"].includes(timeframe);

    if (timeframe === "recent") {
        const maxDate = new Date(Math.max(...allHistoricalRecords.map(e => e.date)));
        const thirtyDaysAgo = new Date(maxDate);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        filteredData = allHistoricalRecords.filter(r => r.date >= thirtyDaysAgo && r.date <= maxDate);
    } else if (timeframe === "2years") {
        const currentYear = new Date().getFullYear();
        filteredData = allHistoricalRecords.filter(r => r.year >= currentYear - 1);
    } else if (timeframe === "5years") {
        const currentYear = new Date().getFullYear();
        filteredData = allHistoricalRecords.filter(r => r.year >= currentYear - 4);
    } else if (timeframe === "all") {
        filteredData = allHistoricalRecords;
    } else if (isSpecificYear) {
        const selectedYear = parseInt(timeframe);
        filteredData = allHistoricalRecords.filter(r => r.year === selectedYear);
    }

    filteredData.sort((a, b) => a.date - b.date);
    filteredData.forEach(item => labelsSet.add(item.dateStr));
    const labels = Array.from(labelsSet);

    const datasetsMap = {};
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

    DAIS_MIENNAM.forEach((dai, index) => {
        datasetsMap[dai] = {
            label: dai,
            data: Array(labels.length).fill(null),
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length] + '20',
            borderWidth: 2,
            tension: 0.15,
            pointRadius: timeframe === "recent" ? 4 : 1,
            pointHoverRadius: 6,
            spanGaps: true,
            hidden: index >= 4
        };
    });

    filteredData.forEach(item => {
        const labelIndex = labels.indexOf(item.dateStr);
        if (labelIndex !== -1 && datasetsMap[item.dai]) {
            datasetsMap[item.dai].data[labelIndex] = item.g8;
        }
    });

    const datasets = Object.values(datasetsMap);

    if (chartInstance) chartInstance.destroy();

    const ctx = document.getElementById('historyLineChart').getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
                tooltip: { backgroundColor: '#1e293b', titleColor: '#f8fafc', bodyColor: '#cbd5e1', borderColor: '#334155', borderWidth: 1 }
            },
            zoom: {
                zoom: {
                    wheel: { enabled: true, speed: 0.08 },
                    pinch: { enabled: true },
                    mode: 'x',
                },
                pan: { enabled: true, mode: 'x', threshold: 10 },
                limits: { y: { min: 0, max: 99, minRange: 99, maxRange: 99 } }
            },
            scales: {
                x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', maxRotation: 45, autoSkip: true, maxTicksLimit: 12 } },
                y: { min: 0, max: 99, grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', stepSize: 10 } }
            }
        }
    });
}

function toggleChartVisibility(isVisible) {
    if (chartInstance) {
        chartInstance.data.datasets.forEach((ds, i) => chartInstance.setDatasetVisibility(i, isVisible));
        chartInstance.update();
    }
}

function panChart(percentOffset) {
    if (chartInstance) {
        const xAxis = chartInstance.scales.x;
        const diff = (xAxis.max - xAxis.min) * percentOffset;
        xAxis.options.min = xAxis.min + diff;
        xAxis.options.max = xAxis.max + diff;
        chartInstance.update();
    }
}

function renderHistoricalTable() {
    const tableBody = document.getElementById("historical-table-rows");
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
        const trendBadge = numericVal > 50 ? `<span style="color: #60a5fa;">Tài</span>` : `<span style="color: #f472b6;">Xỉu</span>`;

        tr.innerHTML = `
            <td>${item.dateStr}</td>
            <td style="color: var(--primary);">${item.dai}</td>
            <td><span style="font-family: monospace; font-weight: 500; color: var(--warning); background-color: rgba(245,158,11,0.1); padding: 0.15rem 0.5rem; border-radius: 4px;">${String(item.g8).padStart(2, '0')}</span></td>
            <td>Đầu ${dauStr}, Đuôi ${duoiStr} (${chanLeStr})</td>
            <td>${trendBadge}</td>
        `;
        tableBody.appendChild(tr);
    });

    document.getElementById("table-entries-info").textContent = `Bản ghi từ ${startIndex + 1} đến ${endIndex} / Tổng ${filteredTableData.length}`;
    document.getElementById("btn-table-prev").disabled = tableCurrentPage === 1;
    document.getElementById("btn-table-next").disabled = endIndex >= filteredTableData.length;
}

// [THAY ĐỔI QUAN TRỌNG]: Logic Lazy-loading
// Thay vì chờ DOMContentLoaded (vốn dĩ đã chạy qua mất rồi do app.js được load chậm từ index.html)
// Chúng ta tự kiểm tra nếu trang đã load xong thì chạy luôn hàm startApp().
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startApp);
} else {
    startApp(); // Chạy khởi tạo ứng dụng ngay lập tức
}
