// const paletteColors = [
//             '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'
//         ];

//         let historyChart = null;
//         let currentTimelineX = []; // Lưu trữ trục X hiện hành để phục vụ thanh kéo

//         function initPermanentDashboard() {
//             if (typeof xoso_data === 'undefined') {
//                 console.error("❌ Không tìm thấy biến dữ liệu xoso_data tĩnh!");
//                 return;
//             }

//             const data = xoso_data;
//             document.getElementById('lbl-time').innerText = data.build_time;

//             // --- 1. HIỂN THỊ BÁO CÁO ĐỐI CHIẾU KẾT QUẢ VĨNH VIỄN ---
//             const backtestDiv = document.getElementById('backtest-list');
//             let backtestHtml = "";
//             if (data.backtest_history.length === 0) {
//                 backtestHtml = `<p style="color: var(--text-muted); padding: 10px; font-size: 13px;">Dữ liệu lưu vết sẽ xuất hiện sau vòng quay ngày kế tiếp.</p>`;
//             } else {
//                 data.backtest_history.forEach(item => {
//                     backtestHtml += `
//                         <div class="card">
//                             <div class="card-label">Đài: ${item.dai}</div>
//                             <div class="card-subtext">${item.date}</div>
//                             <div style="margin-top: 6px;">Giải 8 về: <span style="color: var(--accent-red); font-weight: 700;">${String(item.real_number).padStart(2, '0')}</span></div>
//                             <div class="card-subtext">AI đoán: [${item.ai_numbers.map(n => String(n).padStart(2, '0')).join(', ')}]</div>
//                             <div style="margin-top: 6px; font-size: 12px;">
//                                 ${item.success ? `<span style="color: var(--accent-green); font-weight: 600;">🎯 Trúng mục tiêu</span>` : `<span style="color: var(--text-muted);">Chưa trúng</span>`}
//                             </div>
//                         </div>
//                     `;
//                 });
//             }
//             backtestDiv.innerHTML = backtestHtml;

//             // --- 2. HIỂN THỊ TOP 3 HÔM NAY ---
//             const predictDiv = document.getElementById('prediction-list');
//             let predictHtml = "";
//             data.top_3_today.forEach(item => {
//                 predictHtml += `
//                     <div class="card" style="background-color: var(--bg-card); border-color: var(--border-color);">
//                         <div class="card-label" style="color: var(--accent-green); margin-bottom: 8px; border-bottom: 1px dashed var(--border-color); padding-bottom: 4px;">Đài: ${item.dai}</div>
//                         <div style="display:flex; flex-direction:column; gap:6px;">
//                             <div style="display:flex; justify-content:space-between; align-items:center;">
//                                 <span>1st: <span class="badge" style="background-color: var(--accent-red);">${String(item.predictions[0].so).padStart(2, '0')}</span></span>
//                                 <span style="font-size: 12px; color: var(--text-muted);">${item.predictions[0].xac_suat}%</span>
//                             </div>
//                             <div style="display:flex; justify-content:space-between; align-items:center;">
//                                 <span>2nd: <span class="badge" style="background-color: var(--accent-orange);">${String(item.predictions[1].so).padStart(2, '0')}</span></span>
//                                 <span style="font-size: 12px; color: var(--text-muted);">${item.predictions[1].xac_suat}%</span>
//                             </div>
//                             <div style="display:flex; justify-content:space-between; align-items:center;">
//                                 <span>3rd: <span class="badge" style="background-color: var(--primary);">${String(item.predictions[2].so).padStart(2, '0')}</span></span>
//                                 <span style="font-size: 12px; color: var(--text-muted);">${item.predictions[2].xac_suat}%</span>
//                             </div>
//                         </div>
//                     </div>
//                 `;
//             });
//             predictDiv.innerHTML = predictHtml;

//             // --- 3. KHỞI TẠO BIỂU ĐỒ HOẠT ĐỘNG (MẶC ĐỊNH LÀ 30 KỲ GẦN NHẤT) ---
//             renderAdvanceChart('recent', data);

//             // Sự kiện bộ lọc năm
//             document.getElementById('cbo-year').addEventListener('change', (e) => {
//                 renderAdvanceChart(e.target.value, data);
//             });

//             // --- LOGIC SỬA LỖI ĐỒNG BỘ: SỬ DỤNG HÀM HIDE/SHOW CHUẨN CỦA CHART.JS ---
            
//             // Sự kiện nút Bỏ chọn tất cả các tỉnh
//             document.getElementById('btn-deselect-all').addEventListener('click', () => {
//                 if (!historyChart) return;
//                 historyChart.data.datasets.forEach((dataset, index) => {
//                     historyChart.hide(index); // Sử dụng hàm ẩn chuẩn của ChartJS API
//                 });
//                 historyChart.update();
//                 initScrollbarControls(); // Cập nhật lại thanh kéo slider
//             });

//             // Sự kiện nút Chọn lại tất cả các tỉnh
//             document.getElementById('btn-select-all').addEventListener('click', () => {
//                 if (!historyChart) return;
//                 historyChart.data.datasets.forEach((dataset, index) => {
//                     historyChart.show(index); // Sử dụng hàm hiện chuẩn của ChartJS API
//                 });
//                 historyChart.update();
//                 initScrollbarControls(); // Cập nhật lại thanh kéo slider
//             });
//         }

//         function renderAdvanceChart(filterType, data) {
//             let filteredLabels = [];
//             let startIndex = 0;
//             let endIndex = data.timeline_x.length;

//             if (filterType === 'recent') {
//                 startIndex = Math.max(0, data.timeline_x.length - 30);
//                 filteredLabels = data.timeline_x.slice(startIndex, endIndex);
//             } else {
//                 data.timeline_x.forEach((dateStr, idx) => {
//                     if (dateStr.endsWith('/' + filterType) || dateStr.endsWith('-' + filterType)) {
//                         if (filteredLabels.length === 0) startIndex = idx;
//                         filteredLabels.push(dateStr);
//                         endIndex = idx + 1;
//                     }
//                 });
//             }

//             currentTimelineX = filteredLabels; 

//             const datasets = [];
//             let colorIdx = 0;

//             for (const [channelName, points] of Object.entries(data.lines_y)) {
//                 const slicedPoints = points.slice(startIndex, endIndex);
//                 if (!slicedPoints.some(p => p !== null && p !== undefined)) continue;

//                 datasets.push({
//                     label: channelName,
//                     data: slicedPoints,
//                     borderColor: paletteColors[colorIdx % paletteColors.length],
//                     backgroundColor: paletteColors[colorIdx % paletteColors.length],
//                     borderWidth: 2.5,
//                     pointRadius: filterType === 'recent' ? 5 : 2,
//                     tension: 0.15,
//                     spanGaps: true
//                 });
//                 colorIdx++;
//             }

//             if (historyChart) historyChart.destroy();

//             const ctx = document.getElementById('historyLineChart').getContext('2d');
            
//             historyChart = new Chart(ctx, {
//                 type: 'line',
//                 data: { labels: filteredLabels, datasets: datasets },
//                 options: {
//                     responsive: true,
//                     maintainAspectRatio: false,
//                     scales: {
//                         x: { min: 0, max: filteredLabels.length - 1 },
//                         y: { min: 0, max: 99, ticks: { callback: v => String(v).padStart(2, '0') } }
//                     },
//                     plugins: {
//                         zoom: {
//                             pan: { enabled: true, mode: 'x', onPan: syncSliderWithChart },
//                             zoom: {
//                                 wheel: { enabled: true },
//                                 pinch: { enabled: true },
//                                 mode: 'x',
//                                 speed: 0.04,
//                                 onZoom: syncSliderWithChart
//                             }
//                         }
//                     }
//                 },
//                 plugins: [{
//                     id: 'inlineZoomLabels',
//                     afterDatasetsDraw(chart) {
//                         try {
//                             const { ctx, scales: { x } } = chart;
//                             const totalPoints = currentTimelineX.length;
//                             const visiblePoints = x.max - x.min;
                            
//                             const zoomRatio = (totalPoints - visiblePoints) / totalPoints;

//                             // Khi phóng to vượt ngưỡng 10%
//                             if (zoomRatio >= 0.10) { 
//                                 ctx.save();
//                                 ctx.font = 'bold 11px Inter, sans-serif';
//                                 ctx.textAlign = 'center';
//                                 ctx.textBaseline = 'middle';

//                                 chart.data.datasets.forEach((dataset, dIdx) => {
//                                     // Kiểm tra xem đài này có đang hiển thị thực tế trên bản đồ không
//                                     if (chart.isDatasetVisible(dIdx)) {
//                                         const meta = chart.getDatasetMeta(dIdx);
//                                         meta.data.forEach((element, pIdx) => {
//                                             // Chỉ vẽ những điểm nằm trong vùng hiển thị của mắt nhìn (Viewport)
//                                             if (pIdx >= x.min && pIdx <= x.max) {
//                                                 const value = dataset.data[pIdx];
//                                                 if (value !== null && value !== undefined) {
//                                                     // Vẽ một ô tròn trắng đệm bên dưới chữ
//                                                     ctx.fillStyle = '#ffffff';
//                                                     ctx.beginPath();
//                                                     ctx.arc(element.x, element.y, 9, 0, 2 * Math.PI);
//                                                     ctx.fill();

//                                                     // Vẽ đường viền mỏng quanh ô tròn
//                                                     ctx.strokeStyle = dataset.borderColor;
//                                                     ctx.lineWidth = 1;
//                                                     ctx.stroke();
                                                    
//                                                     // Ghi chữ con số kết quả đè lên ô tròn trắng
//                                                     ctx.fillStyle = dataset.borderColor;
//                                                     ctx.fillText(String(value).padStart(2, '0'), element.x, element.y);
//                                                 }
//                                             }
//                                         });
//                                     }
//                                 });
//                                 ctx.restore();
//                             }
//                         } catch (err) {
//                             // Bỏ qua lỗi vẽ đè nếu kích thước khung chưa kịp khởi tạo ổn định
//                         }
//                     }
//                 }]
//             });

//             initScrollbarControls();
//         }

//         // HÀM KHỞI TẠO VÀ ĐỒNG BỘ THANH KÉO (SLIDER SCROLLBAR)
//         function initScrollbarControls() {
//             const wrapper = document.getElementById('scrollbar-wrapper');
//             const slider = document.getElementById('chart-scrollbar');
            
//             if (!historyChart) return;
//             const { min, max } = historyChart.scales.x;
//             const total = currentTimelineX.length;
//             const visibleRange = max - min;

//             if (visibleRange >= total - 1) {
//                 wrapper.style.display = 'none'; 
//             } else {
//                 wrapper.style.display = 'block'; 
//                 slider.max = total - 1 - visibleRange;
//                 slider.value = min;
//             }
//         }

//         // Khi kéo slider input -> Biểu đồ dịch chuyển theo trục X
//         document.getElementById('chart-scrollbar').addEventListener('input', (e) => {
//             if (!historyChart) return;
//             const sliderVal = parseInt(e.target.value);
//             const { min, max } = historyChart.scales.x;
//             const visibleRange = max - min;

//             historyChart.options.scales.x.min = sliderVal;
//             historyChart.options.scales.x.max = sliderVal + visibleRange;
//             historyChart.update('none'); 
//         });

//         function syncSliderWithChart({ chart }) {
//             const slider = document.getElementById('chart-scrollbar');
//             const wrapper = document.getElementById('scrollbar-wrapper');
//             const { min, max } = chart.scales.x;
//             const total = currentTimelineX.length;
//             const visibleRange = max - min;

//             if (visibleRange >= total - 1) {
//                 wrapper.style.display = 'none';
//             } else {
//                 wrapper.style.display = 'block';
//                 slider.max = total - 1 - visibleRange;
//                 slider.value = Math.round(min);
//             }
//         }

//         // LOGIC TOGGLE SIDEBAR (ĐÓNG MỞ THANH BÊN) MƯỢT MÀ KHÔNG TRỄ LẮC
//         document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
//             const sidebar = document.getElementById('app-sidebar');
//             const main = document.querySelector('.app-main');
            
//             // Thêm class đánh dấu đang bắt đầu hoạt ảnh đóng/mở
//             document.body.classList.add('sidebar-toggling');
            
//             sidebar.classList.toggle('collapsed');
//             sidebar.classList.toggle('active'); // Sử dụng cho phiên bản di động
            
//             // Trì hoãn việc gọi hàm resize của ChartJS cho tới khi hoạt ảnh CSS hoàn tất (300ms)
//             // Việc này loại bỏ hoàn toàn việc ChartJS phải render liên tục 60 lần/giây gây lag 2s
//             setTimeout(() => {
//                 if (historyChart) {
//                     try {
//                         historyChart.resize();
//                     } catch (e) {
//                         // Tránh ném lỗi nếu chart chưa render xong
//                     }
//                 }
//                 // Loại bỏ class đánh dấu hoạt ảnh
//                 document.body.classList.remove('sidebar-toggling');
//             }, 320); // 320ms nhỉnh hơn tốc độ transition 300ms một chút để tối ưu
//         });

//         window.addEventListener('DOMContentLoaded', toggleFixLoad);
//         function toggleFixLoad() {
//             try {
//                 initPermanentDashboard();
//             } catch (err) {
//                 console.warn("Lỗi khởi chạy bảo mật môi trường cục bộ: ", err);
//             }
//         }

const paletteColors = [
    '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'
];

const BACKEND_URL = 'https://du-doan-xskt.onrender.com';

let historyChart = null;
let currentTimelineX = []; // Trục X hiện tại phục vụ zoom/pan

let allHistoricalRecords = [];
let tableCurrentPage = 1;
const tablePageSize = 10;
let filteredTableData = [];

function initPermanentDashboard() {
    if (typeof xoso_data === 'undefined') {
        console.error("❌ Không tìm thấy biến dữ liệu xoso_data tĩnh!");
        const backtestDiv = document.getElementById('backtest-list');
        if (backtestDiv) {
            backtestDiv.innerHTML = `<p style="color: #ef4444; padding: 10px;">Lỗi: Thiếu dữ liệu dashboard_data.js.</p>`;
        }
        return;
    }

    const data = xoso_data;
    document.getElementById('lbl-time').innerText = data.build_time || "Đang cập nhật...";

    // 1. CHUYỂN ĐỔI TOÀN BỘ MẢNG LINES_Y SANG DẠNG RECORDS ĐỂ PHÂN TRANG VÀ TRA CỨU
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

    // Sắp xếp dữ liệu lịch sử từ ngày gần nhất tới xa nhất
    allHistoricalRecords.sort((a, b) => b.date - a.date);
    filteredTableData = [...allHistoricalRecords];

    // 2. LOAD VÀ HIỂN THỊ DỰ ĐOÁN & ĐỐI CHIẾU TỪ FILE JSON RIÊNG BIỆT
    fetch('js/history_predictions.json')
        .then(response => response.json())
        .then(historyJson => {
            const dates = Object.keys(historyJson);
            if (dates.length === 0) {
                document.getElementById('backtest-list').innerHTML = `<p style="color: var(--text-muted); padding: 10px; font-size: 13px;">File json dự đoán trống.</p>`;
                return;
            }

            // Ép chuỗi ngày DD/MM/YYYY về YYYY-MM-DD chuẩn ISO quốc tế để tránh lỗi Invalid Date
            const convertToDateObject = (dateStr) => {
                const parts = dateStr.replace(/-/g, '/').split('/');
                return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            };

            // Sắp xếp ngày từ mới nhất đến cũ nhất
            dates.sort((a, b) => convertToDateObject(b) - convertToDateObject(a));

            const latestDate = dates[0];
            const predictDiv = document.getElementById('prediction-list');
            const backtestDiv = document.getElementById('backtest-list');

            // Hiển thị ngày dự đoán của mốc thời gian tiếp theo
            const lblPredDate = document.getElementById('lbl-pred-date');
            if (lblPredDate) lblPredDate.textContent = latestDate;

            // --- HIỂN THỊ DỰ ĐOÁN MỚI NHẤT ---
            let predictHtml = "";
            if (historyJson[latestDate]) {
                historyJson[latestDate].forEach(item => {
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
                                <span>• Mô hình học máy Random Forest Live</span>
                                <span>• Trạng thái chu kỳ: Cập nhật tự động</span>
                            </div>
                        </div>
                    `;
                });
            }
            if (predictDiv) predictDiv.innerHTML = predictHtml;

            // --- HIỂN THỊ LỊCH SỬ ĐỐI CHIẾU TOÀN BỘ CÁC KỲ ---
            let backtestHtml = "";

            // Khớp nối tên đài, giải quyết triệt để xung đột chuỗi "Hồ Chí Minh" và "TP.HCM"
            const cleanStationName = (name) => {
                if (!name) return "";
                return name.toLowerCase()
                           .replace(/hồ chí minh/g, 'hcm')
                           .replace(/tp\.hcm/g, 'hcm')
                           .replace(/tp\. hồ chí minh/g, 'hcm')
                           .replace(/tp\./g, '')
                           .replace(/\s+/g, '')
                           .trim();
            };

            // Chuẩn hóa định dạng ngày đồng bộ dạng 2 chữ số (độ dài chuỗi cố định)
            const formatNormalDate = (dateStr) => {
                const parts = dateStr.replace(/-/g, '/').split('/');
                return `${String(parts[0]).padStart(2, '0')}/${String(parts[1]).padStart(2, '0')}/${parts[2]}`;
            };

            // Duyệt qua toàn bộ danh sách ngày quá khứ trong JSON dự đoán
            dates.forEach(date => {
                const searchDate = formatNormalDate(date);
                const targetIndex = data.timeline_x.indexOf(searchDate);

                if (historyJson[date]) {
                    historyJson[date].forEach(pred => {
                        let realResult = null;

                        // Kiểm tra nếu Python đã đối chiếu sẵn kết quả thực tế
                        if (pred.actual_g8 !== undefined && pred.actual_g8 !== null) {
                            realResult = pred.actual_g8;
                        } else {
                            // Dò tìm mảng kết quả của đài tương ứng trong xoso_data biểu đồ làm fallback
                            for (const [lineName, points] of Object.entries(data.lines_y)) {
                                if (cleanStationName(lineName) === cleanStationName(pred.dai)) {
                                    if (targetIndex !== -1 && points[targetIndex] !== null && points[targetIndex] !== undefined) {
                                        realResult = points[targetIndex];
                                    }
                                    break;
                                }
                            }
                        }

                        // Nếu kỳ quay trong quá khứ này đã diễn ra và bốc được kết quả thật từ file biểu đồ
                        if (realResult !== null) {
                            const actualG8Str = String(realResult).padStart(2, '0');
                            const isWin = pred.is_hit !== undefined ? pred.is_hit : pred.predictions.some(p => String(p.so).padStart(2, '0') === actualG8Str);

                            backtestHtml += `
                                <div class="history-item" style="margin-bottom: 10px;">
                                    ${isWin ? `
                                    <div class="match-celebration-banner">
                                        <span>TRÚNG LÔ GIẢI 8 [${actualG8Str}]</span>
                                    </div>` : ''}
                                    <div class="history-meta">
                                        <span>${pred.dai}</span>
                                        <span class="${isWin ? 'log-success' : 'log-info'}" style="font-weight: 600;">
                                            ${isWin ? 'CHẮC ĂN TRÚNG' : 'Chưa khớp kỳ này'}
                                        </span>
                                    </div>
                                    <div class="history-data">
                                        <span class="history-dai-name">Giải 8 Thực Tế (${searchDate})</span>
                                        <span class="history-result">${actualG8Str}</span>
                                    </div>
                                    <div class="predictions-comparison">
                                        <span>Bộ 3 số AI dự báo kỳ trước:</span>
                                        <div class="pred-badge-group">
                                            ${pred.predictions.map(p => {
                                                const isHit = String(p.so).padStart(2, '0') === actualG8Str;
                                                return `<span class="pred-badge ${isHit ? 'hit' : ''}">${String(p.so).padStart(2, '0')}</span>`;
                                            }).join('')}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }
                    });
                }
            });

            if (backtestDiv) {
                backtestDiv.innerHTML = backtestHtml || `<div class="chart-tip">Dữ liệu đối chiếu kỳ trước chưa sẵn sàng.</div>`;
            }
        })
        .catch(err => {
            console.error("❌ Không thể phân tích cấu trúc history_predictions.json:", err);
            const backtestDiv = document.getElementById('backtest-list');
            if (backtestDiv) {
                backtestDiv.innerHTML = `<p style="color: #ef4444; padding: 10px; font-size: 13px;">Lỗi kết nối tệp dữ liệu dự đoán lịch sử.</p>`;
            }
        });

    // 3. KHỞI TẠO BIỂU ĐỒ HOẠT ĐỘNG
    renderAdvanceChart('recent', data);
    renderHistoricalTable();

    // Lắng nghe tìm kiếm và bộ lọc ở bảng tra cứu lịch sử
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

    // Nút bấm phân trang bảng lịch sử
    const btnTablePrev = document.getElementById("btn-table-prev");
    const btnTableNext = document.getElementById("btn-table-next");

    if (btnTablePrev && btnTableNext) {
        btnTablePrev.addEventListener("click", () => {
            if (tableCurrentPage > 1) {
                tableCurrentPage--;
                renderHistoricalTable();
            }
        });

        btnTableNext.addEventListener("click", () => {
            const maxPage = Math.ceil(filteredTableData.length / tablePageSize);
            if (tableCurrentPage < maxPage) {
                tableCurrentPage++;
                renderHistoricalTable();
            }
        });
    }

    // Sự kiện bộ lọc thời gian biểu đồ
    const cboTimeframe = document.getElementById("cbo-timeframe");
    if (cboTimeframe) {
        cboTimeframe.addEventListener("change", (e) => {
            renderAdvanceChart(e.target.value, data);
        });
    }

    // Sự kiện nút Bỏ chọn/Chọn tất cả các tỉnh
    const btnDeselect = document.getElementById('btn-deselect-all');
    if (btnDeselect) {
        btnDeselect.addEventListener('click', () => {
            if (!historyChart) return;
            historyChart.data.datasets.forEach((dataset, index) => {
                historyChart.hide(index);
            });
            historyChart.update();
        });
    }

    const btnSelect = document.getElementById('btn-select-all');
    if (btnSelect) {
        btnSelect.addEventListener('click', () => {
            if (!historyChart) return;
            historyChart.data.datasets.forEach((dataset, index) => {
                historyChart.show(index);
            });
            historyChart.update();
        });
    }

    // Tác vụ nút zoom/pan biểu đồ bằng điều khiển thủ công
    document.getElementById("btn-zoom-in").addEventListener("click", () => {
        if (historyChart) historyChart.zoom(1.2);
    });

    document.getElementById("btn-zoom-out").addEventListener("click", () => {
        if (historyChart) historyChart.zoom(0.8);
    });

    document.getElementById("btn-zoom-reset").addEventListener("click", () => {
        if (historyChart) historyChart.resetZoom();
    });

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

    // Kích hoạt nạp log hệ thống ban đầu và đặt đồng hồ chu kỳ
    fetchSystemLog();
    setInterval(fetchSystemLog, 15000);

    // XỬ LÝ SỰ KIỆN KÍCH HOẠT QUY TRÌNH MLOPS PIPELINE (SỬ DỤNG MÃ KHÓA BẢO MẬT)
    const btnTrigger = document.getElementById("btn-trigger-pipeline");
    if (btnTrigger) {
        btnTrigger.addEventListener("click", async () => {
            // Lấy mã bảo mật từ cache trình duyệt
            let secretKey = localStorage.getItem('MLOPS_SECRET_KEY');
            
            if (!secretKey) {
                // Nhập mã bảo mật trực tiếp nếu chưa lưu để bảo vệ an toàn thông tin
                secretKey = prompt("Vui lòng nhập khóa bảo mật MLOPS_SECRET_KEY để kích hoạt hệ thống:");
                if (!secretKey) {
                    appendTerminalLog("[HỦY LỆNH] Không cung cấp mã bảo mật.", "log-warn");
                    return;
                }
                localStorage.setItem('MLOPS_SECRET_KEY', secretKey);
            }

            btnTrigger.disabled = true;
            btnTrigger.innerHTML = `Đang chạy quy trình AI...`;
            appendTerminalLog("[SYSTEM] Kích hoạt tiến trình phân tích tự động từ giao diện...", "log-warn");
            
            try {
                const res = await fetch(`${BACKEND_URL}/ping`, {
                    method: 'GET',
                    headers: {
                        'x-secret-key': secretKey // Truyền mã bí mật lên hệ thống backend
                    }
                });
                if (res.ok) {
                    const resJson = await res.json();
                    appendTerminalLog(`[SUCCESS] ${resJson.message || 'Lệnh kích hoạt thành công.'}`, "log-success");
                } else {
                    // Nếu sai khóa bảo mật, xóa cache để bắt buộc nhập lại ở lượt kích hoạt sau
                    localStorage.removeItem('MLOPS_SECRET_KEY');
                    appendTerminalLog("[WARNING] Máy chủ từ chối lệnh kích hoạt (Sai Secret Key). Đã xóa khóa tạm thời.", "log-warn");
                }
            } catch (e) {
                appendTerminalLog("[ERROR] Không thể kết nối tới API.", "log-danger");
            }

            setTimeout(() => {
                btnTrigger.disabled = false;
                btnTrigger.innerHTML = `Khởi Chạy MLOps Pipeline`;
            }, 3000);
        });
    }
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
            hidden: colorIdx >= 4 // Thu gọn mặc định tránh rối mắt
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

async function fetchSystemLog() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/system-log`);
        if (res.ok) {
            const text = await res.text();
            const logs = text.split('\n').filter(l => l.trim() !== '');
            const termLogs = document.getElementById("terminal-logs");
            if (termLogs) {
                termLogs.innerHTML = '';
                logs.slice(-50).forEach(log => {
                    let typeClass = "log-info";
                    if (log.includes("THANH CONG") || log.includes("SUCCESS") || log.includes("THÀNH CÔNG")) typeClass = "log-success";
                    if (log.includes("THAT BAI") || log.includes("LOI") || log.includes("FAIL") || log.includes("THẤT BẠI")) typeClass = "log-danger";
                    if (log.includes("CẢNH BÁO") || log.includes("WARNING")) typeClass = "log-warn";
                    
                    const div = document.createElement("div");
                    div.className = `log-entry ${typeClass}`;
                    div.textContent = log;
                    termLogs.appendChild(div);
                });
                termLogs.scrollTop = termLogs.scrollHeight;
            }
        }
    } catch(e) {}
}

function appendTerminalLog(msg, typeClass = "log-info") {
    const termLogs = document.getElementById("terminal-logs");
    if (!termLogs) return;
    const now = new Date();
    const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const div = document.createElement("div");
    div.className = `log-entry ${typeClass}`;
    div.textContent = `[${timeStr}] ${msg}`;
    termLogs.appendChild(div);
    termLogs.scrollTop = termLogs.scrollHeight;
}

// Khởi tạo hoạt động sau khi tệp app.js đã nạp xong
window.addEventListener('DOMContentLoaded', () => {
    try {
        initPermanentDashboard();
    } catch (err) {
        console.warn("Lỗi khởi chạy bảo mật môi trường cục bộ: ", err);
    }
});