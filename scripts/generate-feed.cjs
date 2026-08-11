// data.js の内容から feed.xml（RSS 2.0）を生成するスクリプト
//
// 使い方：
//   1. js/data.js に情報を追加・編集する
//   2. プロジェクトのルート（idb/）で以下を実行する
//        node scripts/generate-feed.cjs
//   3. ルート直下の feed.xml が更新される
//
// data.js を編集したときは、このスクリプトを再実行しないと
// feed.xml の内容が古いままになるので注意。

const fs = require("fs");
const path = require("path");

const database = require("../js/data.js");

const siteUrl = "https://initialdatabase.github.io/InitialDatabase/";
const feedTitle = "頭文字Database 新着情報";
const feedDescription = "頭文字Dのグッズ・コラボ・イベントなどの最新情報";

function escapeXml(value){
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function toRfc822(dateStr){
    const date = new Date(dateStr);

    return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
}

const items = Array.isArray(database.infos) ? database.infos : [];

const sortedItems = [...items].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || ""))
);

const rssItems = sortedItems.map(item => `
    <item>
        <title>${escapeXml(item.title)}</title>
        <link>${escapeXml(item.articleUrl || siteUrl)}</link>
        <guid isPermaLink="false">initialdatabase-info-${item.id}</guid>
        <pubDate>${toRfc822(item.date)}</pubDate>
        <description>${escapeXml(item.description || "")}</description>
    </item>
`).join("");

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
    <title>${escapeXml(feedTitle)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(feedDescription)}</description>
    <language>ja</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems}
</channel>
</rss>
`;

const outputPath = path.join(__dirname, "..", "feed.xml");

fs.writeFileSync(outputPath, rss, "utf8");

console.log(`feed.xml を生成しました（${items.length} 件）: ${outputPath}`);
