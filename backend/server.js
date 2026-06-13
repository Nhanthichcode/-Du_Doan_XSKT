const express = require('express');
const { spawn, exec } = require('child_process');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const cors = require('cors');
const rateLimit = require('express-rate-limit'); // Thư viện chống DOS/DDOS chuyên dụng
require('dotenv').config();

const app = express();

app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'system_log.txt');
const MAX_LOG_SIZE_MB = 2; // Giới hạn file log tối đa 2MB để bảo vệ ổ đĩa Render

// HÀM GHI LOG THÔNG MINH - TỰ ĐỘNG CẮT TỈA CHỐNG PHÌNH TO FILE
const logAction = (message) => {
    try {
        const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const logEntry = `[${timestamp}] [NODE] ${message}\n`;
        
        // 1. Kiểm tra dung lượng file log hiện tại trước khi ghi tiếp
        if (fs.existsSync(logPath)) {
            const stats = fs.statSync(logPath);
            const fileSizeInMegabytes = stats.size / (1024 * 1024);
            
            // Nếu vượt quá giới hạn, tiến hành cắt bớt dữ liệu cũ
            if (fileSizeInMegabytes > MAX_LOG_SIZE_MB) {
                const data = fs.readFileSync(logPath, 'utf8');
                const lines = data.split('\n');
                // Chỉ giữ lại 500 dòng log gần nhất để giải phóng không gian đĩa cứng
                const trimmedData = lines.slice(-500).join('\n');
                fs.writeFileSync(logPath, "[HỆ THỐNG] Đã tự động dọn dẹp cắt tỉa log cũ để bảo vệ tài nguyên...\n" + trimmedData, 'utf8');
            }
        }
        
        fs.appendFileSync(logPath, logEntry, 'utf8');
        console.log(logEntry.trim());
    } catch (err) {
        console.error("❌ Không thể ghi vào file log:", err);
    }
};

// -------------------------------------------------------------------
// CẤU HÌNH BỘ LỌC CHỐNG TẤN CÔNG DOS/DDOS (RATE LIMITER)
// -------------------------------------------------------------------
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Khung thời gian: 15 phút
    max: 10, // Tối đa 10 lần gọi/IP trong 15 phút đối với các API công khai
    statusCode: 429,
    message: {
        success: false,
        error: "Bạn đã gửi quá nhiều yêu cầu lên hệ thống. Vui lòng thử lại sau 15 phút."
    },
    standardHeaders: true, // Trả về thông tin giới hạn trong header chuẩn
    legacyHeaders: false, 
});

// Áp dụng bộ giới hạn tần suất lên toàn bộ các router của ứng dụng
app.use('/api/', apiLimiter);

// -------------------------------------------------------------------
// MIDDLEWARE BẢO MẬT: CHỈ CHO PHÉP GITHUB ACTIONS HOẶC QUYỀN ADMIN KÍCH HOẠT
// -------------------------------------------------------------------
const verifySecretKey = (req, res, next) => {
    const secretKey = req.headers['x-secret-key'] || req.query.secret;
    const systemSecret = process.env.MLOPS_SECRET_KEY || "ChucNangBaoMatMLOps2026";

    if (!secretKey || secretKey !== systemSecret) {
        logAction(`⚠️ Cảnh báo bảo mật: Một IP lạ đang cố tình tấn công/gọi vào API kích hoạt luồng.`);
        return res.status(403).json({ 
            success: false, 
            error: "Truy cập bị từ chối. Bạn không có mã bảo mật kích hoạt hệ thống." 
        });
    }
    next(); // Hợp lệ thì cho đi tiếp
};

// -------------------------------------------------------------------
// [MÃ NGUỒN CÁC TIẾN TRÌNH PYTHON GIỮ NGUYÊN]
// -------------------------------------------------------------------
const initPythonEnvironment = () => {
    return new Promise((resolve) => {
        logAction("🛠️ [MÔI TRƯỜNG] Đang kiểm tra và đồng bộ nhanh các thư viện AI qua PIP...");
        const checkEnvCmd = `python -m pip install -q --no-cache-dir --prefer-binary -r requirements.txt --break-system-packages > /dev/null 2>&1`;
        exec(checkEnvCmd, (error) => {
            if (error) logAction(`⚠️ Cảnh báo môi trường: ${error.message}`);
            else logAction("✅ [MÔI TRƯỜNG] Các thư viện Python đã được nạp sẵn sàng vào hệ thống!");
            resolve();
        });
    });
};

const runPythonScript = (scriptName, args = []) => {
    return new Promise((resolve, reject) => {
        logAction(`🛠️ Robot đang kích hoạt chạy tiến trình AI: [${scriptName}]...`);
        const pythonProcess = spawn('python', [scriptName, ...args]);
        let output = ''; let error = '';
        pythonProcess.stdout.on('data', (data) => { output += data.toString(); });
        pythonProcess.stderr.on('data', (data) => { error += data.toString(); });
        pythonProcess.on('close', (code) => {
            if (code === 0) { resolve(output.trim()); } 
            else { logAction(`❌ [THẤT BẠI] ${scriptName}: ${error}`); reject(error); }
        });
    });
};

const autoPushToGitHub = () => {
    return new Promise((resolve, reject) => {
        logAction(`🚀 [GITHUB] Đang chuẩn bị đồng bộ toàn bộ dữ liệu lên GitHub...`);
        const token = process.env.GITHUB_TOKEN; const user = process.env.GITHUB_USER; const repo = process.env.GITHUB_REPO;
        if (!token || !user || !repo) return resolve("Bỏ qua Git Push");
        const configCmd = `git config --global user.email "bot-mlops@render.com" && git config --global user.name "MLOps Robot"`;
        const repoUrl = `https://${token}@github.com/${user}/${repo}.git`;
        const filesToAdd = `../frontend/js/dashboard_data.js ../frontend/js/history_predictions.json xsmn_tong_hop_20_nam.csv model_xsmn_predict.pkl system_log.txt`;
        const pushCmd = `rm -f .git/index.lock && git add ${filesToAdd} --ignore-errors && git commit -m "Robot: Cập nhật dữ liệu MLOps - $(date '+%Y-%m-%d %H:%M:%S')" && git pull ${repoUrl} main --rebase --autostash && git push ${repoUrl} HEAD:main`;
        exec(`${configCmd} && ${pushCmd}`, (error, stdout) => {
            if (error) { logAction(`❌ Lỗi tự động push GitHub: ${error}`); return reject(error); }
            logAction(`✅ [GITHUB] Đã đẩy thành công toàn bộ dữ liệu mới lên GitHub!`);
            resolve(stdout);
        });
    });
};

const runDailyMLOpsPipeline = async () => {
    const startTime = Date.now();
    logAction("\n======================================================================");
    logAction(`⚡ [START WORKFLOW] KÍCH HOẠT CHUỖI QUY TRÌNH MLOPS TỰ ĐỘNG`);
    logAction("======================================================================");
    try {
        await runPythonScript('cao_du_lieu_tu_dong.py');
        await runPythonScript('chuyen_thanh_du_lieu_huan_luyen.py');
        await runPythonScript('master_ai.py');        
        await runPythonScript('du_doan.py'); 
        await runPythonScript('build_js_data.py');
        try { await autoPushToGitHub(); } catch (gitErr) { logAction("⚠️ Git push thất bại."); }
        logAction(`🎉 [HOÀN THÀNH XUẤT SẮC] Tiến trình chạy ngầm mất ${Math.round((Date.now() - startTime) / 1000)} giây!\n`);
    } catch (err) {
        logAction(`💥 [SỰ CỐ NGHIÊM TRỌNG] Chuỗi quy trình tự động bị đứt gãy: ${err}\n`);
    }
};

// -------------------------------------------------------------------
// 5. CÁC ĐIỂM KẾT NỐI API ĐÃ ĐƯỢC BẢO MẬT CHỐNG SPAM / DDOS
// -------------------------------------------------------------------

cron.schedule('0 9 * * *', () => {
    logAction("⏰ [ĐỒNG HỒ NỘI BỘ] Điểm mốc 9h00 sáng, kích hoạt chuỗi tự động...");
    runDailyMLOpsPipeline();
}, { scheduled: true, timezone: "Asia/Ho_Chi_Minh" });

// BẢO MẬT API PING: Chỉ cho phép GitHub gọi lên kèm theo mã khóa Secret Key bí mật
app.get('/ping', apiLimiter, verifySecretKey, (req, res) => {
    logAction(` NHẬN LỆNH KÍCH HOẠT TỪ WATCHDOG AN TOÀN!`);
    res.json({ success: true, status: "Hệ thống xác thực thành công. Pipeline đang khởi chạy ngầm..." });
    runDailyMLOpsPipeline();
});

// GIAO DIỆN XEM LOG LIVE TỰ ĐỘNG REFRESH MƯỢT MÀ
app.get('/logs', (req, res) => {
    const logFilePath = path.join(__dirname, 'system_log.txt');
    if (req.query.raw === 'true') {
        if (fs.existsSync(logFilePath)) { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.sendFile(logFilePath); }
        return res.status(404).send("Chưa có log.");
    }
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Hệ Thống Giám Sát Log MLOps</title><style>body { background-color: #1e1e1e; color: #d4d4d4; font-family: monospace; padding: 20px; } pre { background: #252526; padding: 15px; border-radius: 5px; height: calc(100vh - 120px); overflow-y: auto; }</style></head>
        <body>
            <h2>Nhật Ký Hệ Thống MLOps Live (Chống Phình To Tự Động)</h2>
            <pre id="log-content">Đang nạp nhật ký hành động...</pre>
            <script>
                async function fetchNewLogs() {
                    try {
                        const r = await fetch('/logs?raw=true');
                        if (r.ok) { const t = await r.text(); const b = document.getElementById('log-content'); if(b.innerText !== t.trim()){ b.innerText = t.trim(); b.scrollTop = b.scrollHeight; } }
                    } catch (e) {}
                }
                setInterval(fetchNewLogs, 2000); fetchNewLogs();
            </script>
        </body>
        </html>
    `);
});

// API CHẠY DUY NHẤT TIẾN TRÌNH CÀO DỮ LIỆU ĐỂ KIỂM TRA LOG
app.get('/crawl', (req, res) => {
    logAction("⚡ Nhận lệnh kích hoạt RIÊNG TIẾN TRÌNH CÀO TỰ ĐỘNG thông qua đường dẫn /crawl");
    
    // Gọi riêng file cao_du_lieu_tu_dong.py, không chạy các bước AI phía sau
    const pythonProcess = spawn('python', [path.join(__dirname, 'cao_du_lieu_tu_dong.py')]);
    //await initPythonEnvironment();
    
    let output = '';
    let error = '';

    pythonProcess.stdout.on('data', (data) => { output += data.toString(); });
    pythonProcess.stderr.on('data', (data) => { error += data.toString(); });

    pythonProcess.on('close', (code) => {
        if (code === 0) {
            res.json({ 
                success: true, 
                message: "Tiến trình cào đã chạy xong ngầm. Bạn hãy vào kiểm tra file /logs để xem kết quả chi tiết." 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: "Tiến trình Python bị văng lỗi hệ thống.", 
                details: error 
            });
        }
    });
});

app.use(express.static(path.join(__dirname, '../frontend')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
   try {
        logAction("🔄 [AUTO-START] Hệ thống bắt đầu nạp cấu hình chạy thử nghiệm tự động...");
        
        // 1. Đồng bộ môi trường Python trước
        await initPythonEnvironment();
        
        logAction("⚡ [AUTO-START] Kích hoạt riêng tiến trình cào dữ liệu ngầm (Test Crawl)...");
        
        // 2. Gọi tiến trình python3 chạy file cào dữ liệu độc lập
        const autoCrawlProcess = spawn('python3', [path.join(__dirname, 'cao_du_lieu_tu_dong.py')]);
        
        let autoOutput = '';
        let autoError = '';

        autoCrawlProcess.stdout.on('data', (data) => { autoOutput += data.toString(); });
        autoCrawlProcess.stderr.on('data', (data) => { autoError += data.toString(); });

        autoCrawlProcess.on('close', (code) => {
            if (code === 0) {
                logAction("✅ [AUTO-START] Tiến trình cào tự động lúc khởi động đã hoàn tất thành công.");
                logAction("📝 Hãy truy cập đường dẫn /logs để xem kết quả bóc tách văn bản!");
            } else {
                logAction(`❌ [AUTO-START] Tiến trình cào tự động thất bại với mã thoát: ${code}`);
                logAction(`❌ Chi tiết lỗi Python: ${autoError}`);
            }
        });

    } catch (startErr) {
        logAction(`💥 [AUTO-START] Không thể khởi chạy tiến trình kiểm tra tự động: ${startErr.message}`);
    }
});
