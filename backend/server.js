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

// CHUẨN HÓA HÀM GHI LOG VỚI NHÃN LEVEL RÕ RÀNG
const logAction = (message) => {
    try {
        const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const logEntry = `[${timestamp}] ${message}\n`;
        
        if (fs.existsSync(logPath)) {
            const stats = fs.statSync(logPath);
            const fileSizeInMegabytes = stats.size / (1024 * 1024);
            
            if (fileSizeInMegabytes > MAX_LOG_SIZE_MB) {
                const data = fs.readFileSync(logPath, 'utf8');
                const lines = data.split('\n');
                const trimmedData = lines.slice(-500).join('\n');
                fs.writeFileSync(logPath, "[WARN] [SYSTEM] Da tu dong don dep cat tia log cu de bao ve tai nguyen...\n" + trimmedData, 'utf8');
            }
        }
        
        fs.appendFileSync(logPath, logEntry, 'utf8');
        console.log(logEntry.trim());
    } catch (err) {
        console.error("[ERROR] [SYSTEM] Khong the ghi vao file log:", err);
    }
};

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10, 
    statusCode: 429,
    message: {
        success: false,
        error: "Ban da gui qua nhieu yeu cau len he thong. Vui long thu lai sau 15 phut."
    },
    standardHeaders: true, 
    legacyHeaders: false, 
});

// Quản lý trạng thái vòng đời chu trình: 'idle', 'running', 'success_done'
let pipelineStatus = 'idle';

app.get('/', (req, res) => {
    logAction("[WARN] [SECURITY] Phat hien mot truy cap trai phep co tinh vao goc dinh tuyen / cua Render.");
    return res.status(403).json({
        success: false,
        error: "Access Denied: May chu nay chi phuc vu cac tac vu API MLOps noi bo."
    });
});

app.get('/api/system-log', (req, res) => {
    if (fs.existsSync(logPath)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.sendFile(logPath);
    }
    res.status(404).send("Chua co du lieu nhat ky he thong.");
});

app.use('/api/', apiLimiter);

const verifySecretKey = (req, res, next) => {
    const secretKey = req.headers['x-secret-key'] || req.query.secret;
    const systemSecret = process.env.MLOPS_SECRET_KEY?.trim();

    if (!systemSecret) {
        logAction("[ERROR] [SECURITY] MLOPS_SECRET_KEY chua duoc cau hinh");
        return res.status(500).json({ success: false, error: "Server chua cau hinh secret" });
    }

    if (!secretKey || secretKey !== systemSecret) {
        logAction(`[WARN] [SECURITY] Truy cap trai phep tu IP ${req.ip}`);
        return res.status(403).json({ success: false, error: "Sai ma bao mat" });
    }
    next();
};

const initPythonEnvironment = () => {
    return new Promise((resolve) => {
        logAction("[INFO] [ENVIRONMENT] Dang kiem tra va dong bo nhanh cac thu vien AI qua PIP...");
        const checkEnvCmd = `python3 -m pip install -q --no-cache-dir --prefer-binary -r requirements.txt --break-system-packages > /dev/null 2>&1`;
        exec(checkEnvCmd, (error) => {
            if (error) logAction(`[WARN] [ENVIRONMENT] Canh bao moi truong: ${error.message}`);
            else logAction("[SUCCESS] [ENVIRONMENT] Cac thu vien Python da duoc nap san sang vao he thong!");
            resolve();
        });
    });
};

const runPythonScript = (scriptName, args = []) => {
    return new Promise((resolve, reject) => {
        logAction(`[INFO] [PROCESS] Robot dang kich hoat chay tien trinh AI: [${scriptName}]...`);
        const pythonProcess = spawn('python3', [scriptName, ...args]);
        let output = ''; let error = '';
        pythonProcess.stdout.on('data', (data) => { output += data.toString(); });
        pythonProcess.stderr.on('data', (data) => { error += data.toString(); });
        pythonProcess.on('close', (code) => {
            if (code === 0) { resolve(output.trim()); } 
            else { logAction(`[ERROR] [PROCESS] ${scriptName} that bai: ${error}`); reject(error); }
        });
    });
};

const autoPushToGitHub = () => {
    return new Promise((resolve, reject) => {
        logAction("[INFO] [GITHUB] Dang chuan bi dong bo toan bo du lieu len GitHub...");
        const token = process.env.GITHUB_TOKEN; const user = process.env.GITHUB_USER; const repo = process.env.GITHUB_REPO;
        if (!token || !user || !repo) return resolve("Bo qua Git Push");
        const configCmd = `git config --global user.email "bot-mlops@render.com" && git config --global user.name "MLOps Robot"`;
        const repoUrl = `https://${token}@github.com/${user}/${repo}.git`;
        const filesToAdd = `../frontend/js/dashboard_data.js ../frontend/js/history_predictions.json xsmn_tong_hop_20_nam.csv system_log.txt`;
        const pushCmd = `rm -f .git/index.lock && git add ${filesToAdd} --ignore-errors && git commit -m "Robot: Cap nhat du lieu MLOps - $(date '+%Y-%m-%d %H:%M:%S')" && git pull ${repoUrl} main --rebase --autostash && git push ${repoUrl} HEAD:main`;
        exec(`${configCmd} && ${pushCmd}`, (error, stdout) => {
            if (error) { logAction(`[ERROR] [GITHUB] Loi tu dong push GitHub: ${error}`); return reject(error); }
            logAction("[SUCCESS] [GITHUB] Da day thanh cong toan bo du lieu moi len GitHub!");
            resolve(stdout);
        });
    });
};

const selfHealingGitRecovery = () => {
    return new Promise((resolve) => {
        logAction("[INFO] [RECOVERY] Phat hien loi logic. Tien hanh don dep cache va keo du lieu moi nhat...");
        const token = process.env.GITHUB_TOKEN; const user = process.env.GITHUB_USER; const repo = process.env.GITHUB_REPO;
        if (!token || !user || !repo) return resolve();
        
        const repoUrl = `https://${token}@github.com/${user}/${repo}.git`;
        const recoveryCmd = `rm -f .git/index.lock && git reset --hard HEAD && git clean -fd && git pull ${repoUrl} main`;
        
        exec(recoveryCmd, (error, stdout) => {
            if (error) logAction(`[ERROR] [RECOVERY] Loi tu dong khoi phuc du lieu tu Git: ${error.message}`);
            else logAction("[SUCCESS] [RECOVERY] Da dong bo trang thanh cong tai lieu sach tu GitHub Pages!");
            resolve();
        });
    });
};

const runDailyMLOpsPipeline = async () => {
    const startTime = Date.now();
    pipelineStatus = 'running';
    
    logAction("\n======================================================================");
    logAction("[INFO] [WORKFLOW] KICH HOAT CHUOI QUY TRINH MLOPS TU DONG");
    logAction("======================================================================");
    
    try {
        const crawlResultRaw = await runPythonScript('cao_du_lieu_tu_dong.py');
        let hasNewData = false;

        try {
            const jsonMatch = crawlResultRaw.match(/\{.*\}/s);
            if (jsonMatch) {
                const crawlJson = JSON.parse(jsonMatch[0]);
                hasNewData = crawlJson.has_new_data === true;
                logAction(`[INFO] [ANALYSIS] Ket qua phan tich: ${crawlJson.message}`);
            }
        } catch (jsonErr) {
            logAction("[WARN] [ANALYSIS] Khong the phan tich JSON tu script cao, ep buoc kiem tra thu cong.");
            hasNewData = true; 
        }

        if (!hasNewData) {
            logAction("[WARN] [WORKFLOW] HUY CHU KY: Khong phat hien dong du lieu moi trong file tong hop. Toan bo cac buoc huan luyen AI phia sau duoc tam dung de bao ve tai nguyen.");
            logAction(`[SUCCESS] [WORKFLOW] Quy trinh dong lai an toan sau ${Math.round((Date.now() - startTime) / 1000)} giay.\n`);
            pipelineStatus = 'success_done'; 
            return;
        }

        logAction("[INFO] [WORKFLOW] Phat hien du lieu moi! Kich hoat toan bo luong xu ly AI & Dong goi...");
        await runPythonScript('chuyen_thanh_du_lieu_huan_luyen.py');
        await runPythonScript('du_doan.py'); 
        await runPythonScript('build_js_data.py');
        
        try { 
            await autoPushToGitHub(); 
        } catch (gitErr) { 
            logAction("[WARN] [GITHUB] Git push that bai nhung du lieu local da duoc cap nhat."); 
        }
        
        logAction(`[SUCCESS] [WORKFLOW] Toan bo he thong AI da duoc tai cau truc thanh cong trong ${Math.round((Date.now() - startTime) / 1000)} giay!\n`);
        pipelineStatus = 'success_done'; 
    } catch (err) {
        logAction(`[FATAL] [WORKFLOW] Chuoi quy trinh tu dong bi dut gay: ${err}\n`);
        pipelineStatus = 'idle'; 
        
        await selfHealingGitRecovery();
        process.nextTick(async () => {
            logAction("[INFO] [RE-RUN] Kich hoat chay tai khoi dong lai Pipeline sau khoi phuc...");
            await runDailyMLOpsPipeline();
        });
    }
};

app.get('/ping', apiLimiter, verifySecretKey, async (req, res) => {
    if (pipelineStatus === 'success_done') {
        logAction("[WARN] [PING] BLOCKED: Nhan tin hieu ping. He thong ngay hom nay da hoan thanh chu trinh tron tru. Tu choi kich hoat lai luong Python.");
        return res.json({ success: true, status: "Chu trinh hom nay da hoan thanh hoan hao. Khong can chay lai." });
    }

    if (pipelineStatus === 'running') {
        logAction("[INFO] [PING] KEEP-AWAKE: Nhan ping giu thuc. Tien trinh van dang chay ngam...");
        return res.json({ success: true, status: "Server dang thuc. Pipeline hien dang xu ly tinh toan roi..." });
    }

    logAction("[INFO] [PING] Nhan lenh kich hoat tu Watchdog an toan.");
    res.json({ success: true, status: "Pipeline bat dau kiem tra du lieu ngam..." });
    
    process.nextTick(async () => {
        try {
            await initPythonEnvironment();
            await runDailyMLOpsPipeline();
        } catch (e) {
            logAction(`[ERROR] [PING] Loi luong ping ngam: ${e.message}`);
            pipelineStatus = 'idle';
        }
    });
});

cron.schedule('40 23 * * *', () => {
    pipelineStatus = 'idle';
    logAction("[INFO] [CRON] Den moc 23h40 toi, kich hoat chuoi tu dong...");
    runDailyMLOpsPipeline();
}, { scheduled: true, timezone: "Asia/Ho_Chi_Minh" });

cron.schedule('0 0 * * *', () => {
    pipelineStatus = 'idle';
    logAction("[INFO] [RESET] Da buoc sang ngay moi. Mo khoa co trang thai MLOps Pipeline.");
}, { scheduled: true, timezone: "Asia/Ho_Chi_Minh" });

const logLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 45, 
    statusCode: 429,
    message: "Ban dang tai lai nhat ky qua nhanh. Vui long doi vai giay.",
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
        return res.status(404).send("Chua co log.");
    }
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>He Thong Giam Sat Log MLOps</title>
            <style>
                body { background-color: #1e1e1e; color: #d4d4d4; font-family: monospace; padding: 20px; margin: 0; } 
                h2 { margin-bottom: 10px; color: #569cd6; }
                pre { background: #252526; padding: 15px; border-radius: 5px; height: calc(100vh - 100px); overflow-y: auto; box-sizing: border-box; margin: 0; white-space: pre-wrap; word-wrap: break-word; }
            </style>
        </head>
        <body>
            <h2>Nhat Ky He Thong MLOps Live</h2>
            <pre id="log-content">Dang nap nhat ky hanh dong...</pre>
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
