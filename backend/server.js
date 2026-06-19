const express = require('express');
const { spawn, exec } = require('child_process');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const cors = require('cors');
const rateLimit = require('express-rate-limit'); 
require('dotenv').config();

const app = express();

app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'system_log.txt');
const MAX_LOG_SIZE_MB = 2; 

const logAction = (message) => {
    try {
        const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const logEntry = `[${timestamp}] [NODE] ${message}\n`;
        
        if (fs.existsSync(logPath)) {
            const stats = fs.statSync(logPath);
            const fileSizeInMegabytes = stats.size / (1024 * 1024);
            
            if (fileSizeInMegabytes > MAX_LOG_SIZE_MB) {
                const data = fs.readFileSync(logPath, 'utf8');
                const lines = data.split('\n');
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

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10, 
    statusCode: 429,
    message: {
        success: false,
        error: "Bạn đã gửi quá nhiều yêu cầu lên hệ thống. Vui lòng thử lại sau 15 phút."
    },
    standardHeaders: true, 
    legacyHeaders: false, 
});

const apiLogsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 50, 
    statusCode: 429,
    message: {
        success: false,
        error: "Bạn đã gửi quá nhiều yêu cầu lên hệ thống. Vui lòng thử lại sau 15 phút."
    },
    standardHeaders: true, 
    legacyHeaders: false, 
});

app.get('/', (req, res) => {
    logAction("⚠️ Phát hiện một truy cập trái phép cố tình vào gốc định tuyến / của Render.");
    return res.status(403).json({
        success: false,
        error: "Access Denied: Máy chủ này chỉ phục vụ các tác vụ API MLOps nội bộ."
    });
});

app.get('/api/system-log', (req, res) => {
    if (fs.existsSync(logPath)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.sendFile(logPath);
    }
    res.status(404).send("Chưa có dữ liệu nhật ký hệ thống.");
});

app.use('/api/', apiLimiter);

const verifySecretKey = (req, res, next) => {

    const secretKey =
        req.headers['x-secret-key'] ||
        req.query.secret;

    const systemSecret =
        process.env.MLOPS_SECRET_KEY?.trim();

    if (!systemSecret) {

        logAction(
            "⚠️ MLOPS_SECRET_KEY chưa được cấu hình"
        );

        return res.status(500).json({
            success: false,
            error: "Server chưa cấu hình secret"
        });
    }

    if (!secretKey || secretKey !== systemSecret) {

        logAction(
            `⚠️ Truy cập trái phép từ IP ${req.ip}`
        );

        return res.status(403).json({
            success: false,
            error: "Sai mã bảo mật"
        });
    }

    next();
};

const initPythonEnvironment = () => {
    return new Promise((resolve) => {
        logAction("🛠️ [MÔI TRƯỜNG] Đang kiểm tra và đồng bộ nhanh các thư viện AI qua PIP...");
        const checkEnvCmd = `python3 -m pip install -q --no-cache-dir --prefer-binary -r requirements.txt --break-system-packages > /dev/null 2>&1`;
        exec(checkEnvCmd, (error) => {
            if (error) logAction(`⚠️ Cảnh báo môi trường: ${error.message}`);
            else logAction("✅ [MÔI TRƯỜNG] Các thư viện Python đã được nạp sẵn sàng vào hệ thống!");
            resolve();
        });
    });
};

// Hàm chạy script Python chuẩn hóa sử dụng python3
const runPythonScript = (scriptName, args = []) => {
    return new Promise((resolve, reject) => {
        logAction(`🛠️ Robot đang kích hoạt chạy tiến trình AI: [${scriptName}]...`);
        const pythonProcess = spawn('python3', [scriptName, ...args]);
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
        //const filesToAdd = `../frontend/js/dashboard_data.js ../frontend/js/history_predictions.json xsmn_tong_hop_20_nam.csv model_xsmn_predict.pkl system_log.txt`;
        const filesToAdd = `../frontend/js/dashboard_data.js ../frontend/js/history_predictions.json xsmn_tong_hop_20_nam.csv system_log.txt`;
        const pushCmd = `rm -f .git/index.lock && git add ${filesToAdd} --ignore-errors && git commit -m "Robot: Cập nhật dữ liệu MLOps - $(date '+%Y-%m-%d %H:%M:%S')" && git pull ${repoUrl} main --rebase --autostash && git push ${repoUrl} HEAD:main`;
        exec(`${configCmd} && ${pushCmd}`, (error, stdout) => {
            if (error) { logAction(`❌ Lỗi tự động push GitHub: ${error}`); return reject(error); }
            logAction(`✅ [GITHUB] Đã đẩy thành công toàn bộ dữ liệu mới lên GitHub!`);
            resolve(stdout);
        });
    });
};

// ===================================================================
// CHUẨN HÓA TOÀN BỘ WORKFLOW: CHỈ TÍNH TOÁN TIẾP NẾU CÓ CẬP NHẬT MỚI
// ===================================================================
const runDailyMLOpsPipeline = async () => {
    const startTime = Date.now();
    logAction("\n======================================================================");
    logAction(`⚡ [START WORKFLOW] KÍCH HOẠT CHUỖI QUY TRÌNH MLOPS TỰ ĐỘNG`);
    logAction("======================================================================");
    
    try {
        // Bước 1: Chạy file cào dữ liệu và hứng kết quả text từ stdout
        const crawlResultRaw = await runPythonScript('cao_du_lieu_tu_dong.py');
        let hasNewData = false;

        try {
            // Thử bóc tách chuỗi JSON trả về từ file Python
            const jsonMatch = crawlResultRaw.match(/\{.*\}/s);
            if (jsonMatch) {
                const crawlJson = JSON.parse(jsonMatch[0]);
                hasNewData = crawlJson.has_new_data === true;
                logAction(`📊 Kết quả phân tích: ${crawlJson.message}`);
            }
        } catch (jsonErr) {
            logAction("⚠️ Không thể phân tích JSON từ script cào, ép buộc kiểm tra thủ công.");
            hasNewData = true; // Phòng hờ lỗi kết cấu log thì vẫn cho chạy tiếp
        }

        // ĐIỀU KIỆN CHẶN THÔNG MINH
        if (!hasNewData) {
            logAction("🛑 [HỦY CHU KỲ] Không phát hiện dòng dữ liệu mới trong file tổng hợp. Toàn bộ các bước huấn luyện AI phía sau được tạm dừng để bảo vệ tài nguyên.");
            logAction(`🎉 Quy trình đóng lại an toàn sau ${Math.round((Date.now() - startTime) / 1000)} giây.\n`);
            return;
        }

        // NẾU CÓ DỮ LIỆU MỚI -> KÍCH HOẠT TOÀN BỘ LUỒNG TÍNH TOÁN
        logAction("🔥 Phát hiện dữ liệu mới! Kích hoạt toàn bộ luồng xử lý AI & Đóng gói...");
        await runPythonScript('chuyen_thanh_du_lieu_huan_luyen.py');
        //await runPythonScript('master_ai.py');        
        await runPythonScript('du_doan.py'); 
        await runPythonScript('build_js_data.py');
        
        try { 
            await autoPushToGitHub(); 
        } catch (gitErr) { 
            logAction("⚠️ Git push thất bại nhưng dữ liệu local đã được cập nhật."); 
        }
        
        logAction(`🎉 [HOÀN THÀNH XUẤT SẮC] Toàn bộ hệ thống AI đã được tái cấu trúc thành công trong ${Math.round((Date.now() - startTime) / 1000)} giây!\n`);
    } catch (err) {
        logAction(`💥 [SỰ CỐ NGHIÊM TRỌNG] Chuỗi quy trình tự động bị đứt gãy: ${err}\n`);
    }
};


let isPipelineRunning = false;

// 3. Sửa lại API /ping
app.get('/ping', apiLimiter, verifySecretKey, async (req, res) => {
    
    // Nếu tiến trình đang chạy rồi, chỉ trả lời để giữ Server thức, KHÔNG chạy lại luồng Python
    if (isPipelineRunning) {
        logAction(`💧 [KEEP-AWAKE] Nhận ping giữ thức. Tiến trình vẫn đang chạy ngầm...`);
        return res.json({ success: true, status: "Server đang thức. Pipeline hiện đang chạy rồi..." });
    }

    // Nếu chưa chạy thì bắt đầu chạy
    logAction(`🔔 NHẬN LỆNH KÍCH HOẠT TỪ WATCHDOG AN TOÀN!`);
    res.json({ success: true, status: "Pipeline bắt đầu kiểm tra dữ liệu ngầm..." });
    
    isPipelineRunning = true; // Khóa cờ lại

    // Tách luồng xử lý nặng ra sau
    process.nextTick(async () => {
        try {
            await initPythonEnvironment();
            await runDailyMLOpsPipeline();
        } catch (e) {
            logAction(`❌ Lỗi luồng ping ngầm: ${e.message}`);
        } finally {
            isPipelineRunning = false; // Mở khóa cờ lại dù thành công hay lỗi
        }
    });
});

const logLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // Khung thời gian: 1 phút
    max: 45, // Tối đa 45 lần gọi/IP trong 1 phút (2 giây/lần = 30 lần, dư 15 lần để mở tab mới)
    statusCode: 429,
    message: "Bạn đang tải lại nhật ký quá nhanh. Vui lòng đợi vài giây.",
    standardHeaders: true,
    legacyHeaders: false,
});

app.get('/logs', logLimiter, (req, res) => {
    const logFilePath = path.join(__dirname, 'system_log.txt');
    if (req.query.raw === 'true') {
        if (fs.existsSync(logFilePath)) { 
            res.setHeader('Content-Type', 'text/plain; charset=utf-8'); 
            return res.sendFile(logFilePath); 
        }
        return res.status(404).send("Chưa có log.");
    }
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Hệ Thống Giám Sát Log MLOps</title>
            <style>
                body { background-color: #1e1e1e; color: #d4d4d4; font-family: monospace; padding: 20px; margin: 0; } 
                h2 { margin-bottom: 10px; color: #569cd6; }
                pre { background: #252526; padding: 15px; border-radius: 5px; height: calc(100vh - 100px); overflow-y: auto; box-sizing: border-box; margin: 0; white-space: pre-wrap; word-wrap: break-word; }
            </style>
        </head>
        <body>
            <h2>Nhật Ký Hệ Thống MLOps Live</h2>
            <pre id="log-content">Đang nạp nhật ký hành động...</pre>
            <script>
                async function fetchNewLogs() {
                    try {
                        const r = await fetch('/logs?raw=true');
                        if (r.ok) { 
                            const t = await r.text(); 
                            const b = document.getElementById('log-content');                             
                            if (b.innerText !== t.trim()) {                                
                                const isAtBottom = (b.scrollHeight - b.scrollTop - b.clientHeight) < 50;                                
                                b.innerText = t.trim();                                                                 
                                if (isAtBottom) {
                                    b.scrollTop = b.scrollHeight; 
                                }
                            } 
                        }
                    } catch (e) {}
                }                
                setInterval(fetchNewLogs, 3000); 
                fetchNewLogs();
            </script>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    
});
