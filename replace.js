const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'app', 'admin', 'components');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // Lọc lấy các pattern mầu base đặc thù của giao diện cũ
    const patterns = [
        /className="([^"]*)bg-white\/[0-9]+ dark:bg-(?:black|gray-[0-9]+)\/[0-9]+([^"]*)"/g,
        /className="([^"]*)shadow-md bg-white\/[0-9]+ dark:bg-(?:black|gray-[0-9]+)\/[0-9]+([^"]*)"/g
    ];

    patterns.forEach(regex => {
        content = content.replace(regex, 'className="$1neon-border-hover glass-panel text-slate-900 dark:text-slate-100$2"');
    });

    if (originalContent !== content) {
        fs.writeFileSync(filePath, content);
        console.log('Updated: ' + path.basename(filePath));
    }
}

fs.readdirSync(dir).forEach(file => {
    if (file.endsWith('.tsx')) {
        processFile(path.join(dir, file));
    }
});

console.log('Done replacement.');
