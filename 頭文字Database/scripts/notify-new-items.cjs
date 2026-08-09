// data.js に追加された新着情報をDiscordに通知するスクリプト
//
// 仕組み：
//   .github/notified-ids.json に「これまでに通知済みのID」を記録しておき、
//   js/data.js の infos に含まれるIDと比較して、まだ通知していないものだけを
//   Discordのincoming webhookに送信する。送信後はnotified-ids.jsonを更新する。
//
// 必要な設定：
//   GitHubリポジトリの Settings → Secrets and variables → Actions で
//   DISCORD_WEBHOOK_URL という名前のSecretに、Discordのincoming webhook URLを設定する
//   （サーバーのチャンネル設定 → 連携サービス → ウェブフックから発行できる）。
//   未設定の場合、通知はスキップされるが notified-ids.json の更新は行われる。

const fs = require("fs");
const path = require("path");
const https = require("https");

const database = require("../js/data.js");

const stateFilePath = path.join(__dirname, "..", ".github", "notified-ids.json");
const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
const siteUrl = "https://initialdatabase.github.io/InitialDatabase/";

function loadNotifiedIds(){
    try{
        const raw = fs.readFileSync(stateFilePath, "utf8");
        const parsed = JSON.parse(raw);

        return Array.isArray(parsed) ? new Set(parsed) : new Set();
    }catch(error){
        return new Set();
    }
}

function saveNotifiedIds(ids){
    fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
    fs.writeFileSync(
        stateFilePath,
        `${JSON.stringify(Array.from(ids).sort((a, b) => a - b), null, 2)}\n`,
        "utf8"
    );
}

function postToDiscord(content){
    return new Promise((resolve, reject) => {
        const url = new URL(webhookUrl);
        const body = JSON.stringify({ content });

        const request = https.request({
            hostname: url.hostname,
            path: `${url.pathname}${url.search}`,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body)
            }
        }, response => {
            response.on("data", () => {});
            response.on("end", () => {
                if(response.statusCode && response.statusCode >= 400){
                    reject(new Error(`Discordへの送信に失敗しました（status: ${response.statusCode}）`));
                    return;
                }

                resolve();
            });
        });

        request.on("error", reject);
        request.write(body);
        request.end();
    });
}

function buildMessage(item){
    const lines = [
        "📢 頭文字Databaseに新着情報が追加されました",
        `**${item.title}**`,
        item.description || "",
        item.articleUrl || "",
        siteUrl
    ].filter(Boolean);

    return lines.join("\n");
}

async function main(){
    const items = Array.isArray(database.infos) ? database.infos : [];
    const notifiedIds = loadNotifiedIds();
    const newItems = items.filter(item => !notifiedIds.has(item.id));

    if(newItems.length === 0){
        console.log("新着情報はありません。通知をスキップします。");
        return;
    }

    if(!webhookUrl){
        console.log(
            `DISCORD_WEBHOOK_URL が未設定のため通知は送信されません（新着 ${newItems.length} 件）。`
            + "リポジトリのSecretsに DISCORD_WEBHOOK_URL を設定してください。"
        );
    }else{
        for(const item of newItems){
            await postToDiscord(buildMessage(item));
            console.log(`通知を送信しました: #${item.id} ${item.title}`);
        }
    }

    newItems.forEach(item => notifiedIds.add(item.id));
    saveNotifiedIds(notifiedIds);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
