const express = require('express');
const { spawn, exec } = require('child_process');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // Thư viện mã hóa tiêu chuẩn bảo mật của Node.js
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Lưu trữ các token đang hoạt động trực tiếp trong RAM (In-memory Session Store)
const activeTokens = new Set();

const logPath = path.join(__dirname, 'system_log.txt');

const logAction = (message) => {
    try {
        const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const logEntry = `[${timestamp}] ${message}\n`;
        fs.appendFileSync(logPath, logEntry, 'utf8');
        console.log(logEntry.trim());
    } catch (err) {
        console.error("❌ Không thể ghi vào file log:", err);
    }
};

// -------------------------------------------------------------------
// MIDDLEWARE BẢO VỆ CÁC TỆP TIN VÀ DỮ LIỆU NHẠY CẢM
// -------------------------------------------------------------------
app.use((req, res, next) => {
    // Danh sách các tài nguyên cần bảo vệ nghiêm ngặt
    const protectedPaths = [
        '/js/dashboard_data.js', 
        '/system_log.txt', 
        '/frontend/js/dashboard_data.js',
        '/api/predictions'
    ];
    
    const isProtected = protectedPaths.some(p => req.path.endsWith(p));
    
    if (isProtected) {
        // Hỗ trợ kiểm tra token qua query parameter (cho thẻ script) hoặc Authorization Header (cho fetch/ajax)
        let token = req.query.token;
        if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }
        
        if (!token || !activeTokens.has(token)) {
            logAction(`⚠️ [CẢNH BÁO] Phát hiện yêu cầu truy cập trái phép vào tài nguyên nhạy cảm: ${req.path}`);
            return res.status(403).send('Forbidden: Bạn không có quyền truy cập tài nguyên này.');
        }
    }
    next();
});

// Phục vụ các file tĩnh trong thư mục frontend sau khi đã qua lớp lọc của middleware
app.use(express.static(path.join(__dirname, 'frontend')));

// -------------------------------------------------------------------
// API XÁC THỰC BẰNG PHƯƠNG PHÁP BĂM MẬT KHẨU SHA-256
// -------------------------------------------------------------------
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ success: false, message: "Vui lòng cung cấp mật khẩu." });
    }

    // Tiến hành băm mật khẩu đầu vào bằng thuật toán mã hóa SHA-256
    const inputHash = crypto.createHash('sha256').update(password).digest('hex');
    
    // Lấy khóa băm cấu hình an toàn trong Render Environment Variables / GitHub Secrets
    const secureHash = process.env.APP_PASSWORD_HASH;

    if (!secureHash) {
        logAction("⚠️ [CẢNH BÁO] Hệ thống chưa thiết lập cấu hình APP_PASSWORD_HASH trong biến môi trường!");
        return res.status(500).json({ success: false, message: "Hệ thống chưa được cấu hình bảo mật trên Render!" });
    }

    if (inputHash === secureHash) {
        // Sinh Token phiên làm việc ngẫu nhiên và an toàn
        const token = crypto.randomBytes(32).toString('hex');
        activeTokens.add(token);
        logAction("✅ [XÁC THỰC] Người dùng đăng nhập thành công vào hệ thống.");
        return res.json({ success: true, token });
    } else {
        logAction("⚠️ [XÁC THỰC] Phát hiện lần nhập mật khẩu không chính xác.");
        return res.status(401).json({ success: false, message: "Mật khẩu quản trị không chính xác!" });
    }
});

// API xác thực phục hồi phiên làm việc (Session Recovery) khi tải lại trang
app.post('/api/validate-token', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: "Không tìm thấy token." });
    }
    const token = authHeader.split(' ')[1];
    if (activeTokens.has(token)) {
        return res.json({ success: true });
    } else {
        return res.status(401).json({ success: false, message: "Token đã hết hạn hoặc không hợp lệ." });
    }
});

// -------------------------------------------------------------------
// 1. HÀM CHẠY TIẾN TRÌNH PYTHON ĐỒNG BỘ
// -------------------------------------------------------------------
const runPythonScript = (scriptName, args = []) => {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().toLocaleString();
        console.log(`[${timestamp}] 🛠️ MLOps Robot đang tự động đồng bộ môi trường thư viện cho [${scriptName}]...`);
        
        const checkEnvCmd = `python -m pip install -q -r requirements.txt --break-system-packages > /dev/null 2>&1 && python ${scriptName} ${args.join(' ')}`;
        const pythonProcess = spawn('sh', ['-c', checkEnvCmd]);
        let output = '';
        let error = '';

        pythonProcess.stdout.on('data', (data) => { output += data.toString(); });
        pythonProcess.stderr.on('data', (data) => { error += data.toString(); });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                logAction(`✅ [THÀNH CÔNG] ${scriptName}`);
                resolve(output.trim());
            } else {
                logAction(`❌ [THẤT BẠI] ${scriptName}: ${error}`);
                reject(error);
            }
        });
    });
};

// -------------------------------------------------------------------
// 2. HÀM TỰ ĐỘNG ĐẨY FILE LÊN GITHUB BẰNG TOKEN BẢO MẬT
// -------------------------------------------------------------------
const autoPushToGitHub = () => {
    return new Promise((resolve, reject) => {
        console.log(`[${new Date().toLocaleString()}] 🚀 [GITHUB] Đang chuẩn bị đồng bộ toàn bộ dữ liệu lên GitHub...`);
        
        const token = process.env.GITHUB_TOKEN;
        const user = process.env.GITHUB_USER;
        const repo = process.env.GITHUB_REPO;

        if (!token || !user || !repo) {
            console.log("⚠️ Thiếu cấu hình GITHUB. Bỏ qua bước đẩy code lên GitHub.");
            return resolve("Bỏ qua Git Push");
        }

        const configCmd = `git config --global user.email "bot-mlops@render.com" && git config --global user.name "MLOps Robot"`;
        const repoUrl = `https://${token}@github.com/${user}/${repo}.git`;
        
        const filesToAdd = `../frontend/js/dashboard_data.js xsmn_tong_hop_20_nam.csv model_xsmn_predict.pkl system_log.txt`;
        const pushCmd = `
            git add ${filesToAdd} && 
            git commit -m "Robot: Cập nhật dữ liệu MLOps - $(date '+%Y-%m-%d %H:%M:%S')" && 
            git pull ${repoUrl} main --rebase --autostash && 
            git push ${repoUrl} HEAD:main
        `;

        exec(`${configCmd} && ${pushCmd}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`[${new Date().toLocaleString()}] ❌ Lỗi tự động push GitHub:`, stderr || error);
                return reject(error);
            }
            console.log(`[${new Date().toLocaleString()}] ✅ [GITHUB] Đã đẩy thành công toàn bộ dữ liệu mới lên GitHub!`);
            resolve(stdout);
        });
    });
};

// -------------------------------------------------------------------
// 3. CHUỒI PIPELINE MLOPS CHẠY TỰ ĐỘNG NGẦM
// -------------------------------------------------------------------
const runDailyMLOpsPipeline = async () => {
    const startTime = Date.now();
    console.log("\n======================================================================");
    console.log(`⚡ [START WORKFLOW] KÍCH HOẠT CHUỖI QUY TRÌNH MLOPS TỰ ĐỘNG`);
    console.log("======================================================================");
    
    try {
        console.log("\n👉 [BƯỚC 1/6] Tiến hành cào dữ liệu xổ số mới từ internet...");
        await runPythonScript('cao_du_lieu_tu_dong.py');
        console.log("✅ Hoàn thành Bước 1.");

        console.log("\n👉 [BƯỚC 2/6] Trích xuất đặc trưng đặc biệt (data_training_ai.csv)...");
        await runPythonScript('chuyen_thanh_du_lieu_huan_luyen.py');
        console.log("✅ Hoàn thành Bước 2.");

        console.log("\n👉 [BƯỚC 3/6] Tái huấn luyện mô hình học máy Random Forest...");
        await runPythonScript('master_ai.py');        
        console.log("✅ Hoàn thành Bước 3.");

        console.log("\n👉 [BƯỚC 4/6] Chạy thuật toán dự đoán xác suất ra số vàng hôm nay...");
        await runPythonScript('du_doan.py'); 
        console.log("✅ Hoàn thành Bước 4.");

        console.log("\n👉 [BƯỚC 5/6] Đóng gói nén dữ liệu 20 năm phục vụ chế độ Offline mượt mà...");
        await runPythonScript('build_js_data.py');
        console.log("✅ Hoàn thành Bước 5.");

        console.log("\n👉 [BƯỚC 6/6] Đồng bộ hóa file dashboard_data.js lên đám mây GitHub...");
        try {
            await autoPushToGitHub();
        } catch (gitErr) {
            console.log("⚠️ Git push thất bại.");
        }
        console.log("✅ Hoàn thành Bước 6.");
        
        const durationSec = Math.round((Date.now() - startTime) / 1000);
        console.log("\n======================================================================");
        console.log(`🎉 [HOÀN THÀNH XUẤT SẮC] Toàn bộ hệ thống chạy ngầm mất ${durationSec} giây!`);
        console.log("======================================================================\n");

    } catch (err) {
        console.error("\n💥 [SỰ CỐ NGHIÊM TRỌNG] Chuỗi quy trình tự động bị đứt gãy giữa chừng:");
        console.error(err);
        console.log("======================================================================\n");
    }
};

// Lịch chạy Cron Job lúc 9:00 hàng ngày
cron.schedule('0 9 * * *', () => {
    logAction("⏰ [ĐỒNG HỒ NỘI BỘ] Điểm mốc 9h00 sáng, kích hoạt chuỗi tự động...");
    runDailyMLOpsPipeline();
}, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
});

// API Kích hoạt từ GitHub Actions
app.get('/ping', (req, res) => {
    logAction("🔔 -> NHẬN LỆNH KÍCH HOẠT TỪ WATCHDOG (GITHUB ACTIONS)!");
    res.json({ 
        success: true, 
        status: "Đã nhận lệnh đánh thức thành công!", 
        message: "Hệ thống MLOps Pipeline đang tự động khởi chạy ngầm trên Render."
    });
    runDailyMLOpsPipeline();
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log("======================================================================");
    console.log(`🚀 [ONLINE] Node MLOps Backend đang kích hoạt tại Port ${PORT}`);
    console.log("======================================================================");
});