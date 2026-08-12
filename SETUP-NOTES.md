# 今回追加した機能と、公開前に手動設定が必要な項目

## 今回（2026-08-12 追加実装）追加した機能

1. **更新情報ページ**（pages/updates.html / js/updates.js / js/updates-data.js）
   「頭文字Database」というサイト自体に加えた機能追加・修正・変更の履歴を、
   月別グループ（折りたたみ表示）と種類（追加／修正／変更／削除）別フィルターで
   確認できる新ページです。`js/data.js`（掲載しているグッズ・イベント情報）とは
   完全に別の`js/updates-data.js`でデータを管理しているため、既存の`data.js`の
   構造・内容には一切触れていません。
   ヘッダー下の共通`<nav>`に「更新情報」リンクを追加し、全ページから行き来できるように
   しました。Service Worker（`sw.js`）のキャッシュ対象にも追加済みです
   （キャッシュ名を`v6`に更新）。`sitemap.xml`にも追加しています。
   今後、サイトに機能追加・修正・変更を行うたびに`js/updates-data.js`に
   項目を追記していく運用にします。

## 前回（2026-08-09 追加実装）で追加した機能

1. **あいまい検索（表記ゆれ吸収・タイプミス許容）**（common.js / normalizeForSearch, fuzzyIncludes, matchesSearchKeyword）
   検索キーワードの「ひらがな／カタカナ」「全角／半角」の違いを自動的に吸収し、
   多少のタイプミス（1〜2文字程度のズレ）があっても候補にヒットするようにしました。
   最新情報ページ・お気に入りページの両方の検索に適用済みです。
   ※「Java」⇔「ジャバ」のような英単語⇔カタカナの変換には対応していません
   （対応表（辞書）が無いと機械的に判定できないため、今回は見送りました）。

2. **検索候補のドロップダウン（サジェスト）**（info.js / getSearchSuggestions）
   検索欄に入力すると、入力中でもすぐ一覧が絞り込まれる仕組みに加えて、
   入力欄の下にタイトル候補を最大5件ドロップダウン表示するようにしました。
   候補はクリック（またはキーボードの↑↓＋Enter）で選択でき、選択すると
   その情報にすぐジャンプできます。

3. **ステータス絞り込み（発売前／予約開始／開催中／終了済み）**（common.js / getItemEventStatus）
   情報オブジェクトの新しい任意フィールド `reservationStart`（予約開始日）と、
   既存の `eventStart` / `eventEnd` の3つの日付から、
   「発売前」「予約開始」「開催中」「終了済み」の4区分のステータスを自動判定し、
   一覧の絞り込みに使えるようにしました。該当するステータスの情報には、
   カード上にも小さなバッジで表示されます。
   いずれの日付フィールドも持たない通常のグッズ情報などは、ステータス絞り込みの対象外
   （「すべて」でのみ表示）になります。

4. **検索結果ゼロ件時のフォールバック表示**（info.js / renderNoResults）
   検索・絞り込みの結果が0件だった場合、単に「ありません」と表示するのではなく、
   「おすすめのキーワード」（件数の多いタグ、クリックでその条件に切り替え）と
   「注目のコンテンツ」（新着3件）を表示し、離脱を防ぐようにしました。

5. **Service Workerのキャッシュ戦略の見直し**（sw.js）
   静的アセット（CSS／JS本体／画像／manifest.json）と、動的コンテンツ
   （HTMLページ／js/data.js／feed.xml）でキャッシュの扱いを分けました。
   - 静的アセット：Cache First（まずキャッシュを返しつつ、裏で最新版を取得してキャッシュ更新）
   - 動的コンテンツ：Network First（まずネットワークを試し、失敗時のみキャッシュを利用）
   古いバージョンのキャッシュを自動削除する仕組み（activateイベント）はすでに実装されていたため、
   キャッシュ名のバージョンを更新した上でそのまま活かしています。

6. **オフラインフォールバックページ**（offline.html）
   ネットワークにもキャッシュにも無いページへ遷移しようとした際、
   ブラウザ標準のエラー画面の代わりに、サイトのデザインに合わせた
   「オフライン状態です」という専用ページを表示するようにしました。

7. **ヒーロー画像（LCP対象）のプリロード**（index.html）
   `<link rel="preload" as="image">` を使い、画面幅に応じて
   `hero-mobile.png`（900px以下）または `ogp.png`（901px以上）を優先読み込みするようにしました。
   実際に表示に使われない方の画像を先読みしないよう、`media` 属性で出し分けています。

8. **ヒーロー画像の二重ダウンロード解消＋モバイル版のWebP化**（index.html / pages/*.html / offline.html / css/style.css / sw.js）
   PC用・モバイル用の画像を2つの`<img>`タグとして両方DOMに置き、CSSの`display:none`/`block`で
   出し分けていた実装を`<picture><source media="...">...</picture>`に置き換えました。
   `<img>`タグは常にプリロードスキャナに読まれるため、旧実装ではCSSの評価を待たずに
   PC・モバイル両方の画像（合計約2.7MB）を毎回フェッチしてしまっていました。`<picture>`化により、
   実際に表示される1枚だけがフェッチされるようになります。
   あわせて`hero-mobile.png`（1672×941px・約1.4MB）をWebP化し、`hero-mobile.webp`
   （同解像度・約95KB、PNG比93%減）を追加。`<picture>`内で`type="image/webp"`の`<source>`を
   優先させ、非対応ブラウザ向けに従来のPNGを`<source>`のフォールバックとして残しています。
   解像度はそのまま維持しているため、900px幅ブレークポイント付近の高DPR端末でも
   画質の劣化はありません。
   なお、リポジトリ直下に残っていた未参照の重複ファイル`ogp.png`（`images/ogp.png`と同一・約1.3MB）は削除しました。
   Service Worker（`sw.js`）のキャッシュ対象に`hero-mobile.webp`を追加し、
   `CACHE_VERSION`を`v5`に上げて古いキャッシュ（PNGのみを含むv4以前）を確実に入れ替えるようにしています。

### 今回、あえて実装を見送った項目（判断理由）

- **英単語⇔カタカナの用語対応辞書**（例：「Java」⇔「ジャバ」）：
  ヒアリングの結果「表記ゆれ＋タイプミス許容だけで十分」とのことでしたので、
  辞書機構は実装していません。将来的に必要になった場合は、
  `common.js` の `normalizeForSearch` の前段に、用語対応表を引く処理を
  追加する形で拡張できます。

## 過去に実装した機能

1. **Googleカレンダー／iCal追加ボタン**（common.js / createCalendarActionsHtml）
   `eventStart`を持つ情報のカードに「📅 Googleカレンダーに追加」「🗓️ iCalに追加」ボタンが
   自動で表示されます。iCalボタンはブラウザ上で.icsファイルを生成してダウンロードする方式
   （サーバー不要）。イベントカレンダーの日別リストにも同じボタンが表示されます。

2. **新着情報のDiscord通知**（scripts/notify-new-items.cjs）
   `js/data.js`へのpush時に、GitHub Actionsが「まだ通知していない情報」を検出して
   Discordのincoming webhookに自動投稿します。通知済みIDは`.github/notified-ids.json`に
   記録され、同じ情報が二重に通知されることはありません。
   **利用にはDiscordのwebhook URLをリポジトリのSecretに設定する必要があります**
   （下記「公開前に手動で設定してほしい項目」参照）。未設定の場合は通知だけスキップされ、
   feed.xmlの更新やnotified-ids.jsonの更新は通常通り行われます。

3. **月別アーカイブ・統計ページ**（pages/archive.html / js/archive.js）
   `js/data.js`の内容から自動生成される新ページです。月ごとに折りたたみ表示される
   アーカイブ一覧と、タグ別・月別の件数を横棒グラフ（CSSのみ、外部ライブラリ不要）で
   表示します。ヘッダー下に共通の`<nav>`を追加し、「頭文字D情報／お気に入り／
   アーカイブ・統計」の3ページ間を行き来できるようにしました
   （`nav a.is-current`の現在地ハイライトは元々common.js側に実装済みでした）。
   Service Worker（sw.js）のキャッシュ対象にも追加済みです（キャッシュ名をv2に更新）。

## 過去に実装した機能

1. **関連情報の表示**（common.js / getRelatedItems）
   同じタグを持つ他の情報を、各カードの下部に最大3件自動表示します。
   タグが1つも共通しない場合は非表示になります。

2. **イベント終了間近バッジ**（common.js / getDaysUntilEventEnd）
   `eventStart` / `eventEnd` を持つ開催中の情報について、終了7日前を切ると
   「あと◯日で終了」「本日終了」バッジを表示します。

3. **イベントカレンダー**（js/calendar.js）
   `eventStart` を持つ情報が1件もない間は自動的に非表示になります。
   データを追加すると、月送りカレンダーとイベント一覧が自動的に表示されます。

4. **既読/未読管理**（common.js / isItemRead, markItemRead, setupReadTrackingByView）
   カードが画面に一瞬でも表示されると、その情報が端末のlocalStorageに既読として
   記録されます（IntersectionObserverによる検知、PC・スマホとも同じ挙動）。
   見た目の変化（薄表示など）はなく、「表示：未読のみ」フィルタでの絞り込みに
   のみ使われます。
   ※ 既読化した瞬間に一覧からカードが消えてチラつくのを防ぐため、
   　「未読のみ」表示中に既読化しても、その場では一覧から消えません。
   　次に検索・タグ・並び替え・表示切り替えなどのフィルタ操作をしたタイミングで
   　（例：「すべて」に切り替えてから改めて「未読のみ」に切り替える）反映されます。
   ※ 端末・ブラウザごとの記録です（お気に入りと同じ仕組み）。
   ※ localStorageが使えない環境（index.htmlをfile://で直接開いた場合など）では
   　お気に入り・既読状態が保存されません。その場合はブラウザのDevTools
   　コンソールに警告が出力されます。ローカルサーバー（`npx serve`や
   　VSCodeのLive Serverなど）経由、またはGitHub Pages等のhttp(s)環境で
   　開いて動作確認してください。

5. **PWA対応**（manifest.json / sw.js）
   スマートフォンで「ホーム画面に追加」できるようになり、主要ファイルを
   Service Workerでキャッシュしてオフラインでも閲覧できるようにしました。
   アイコンは images/info-badge.png から自動生成した仮アイコンです
   （images/icon-192.png / icon-512.png / icon-maskable-512.png）。
   本番用にちゃんとしたロゴ画像がある場合は差し替えてください。

6. **構造化データの拡充**（common.js / injectListStructuredData）
   ページ読み込み時にItemListと、イベント情報についてはEventの
   JSON-LDをJavaScriptで生成してheadに追加します。

7. **GitHub Actionsでのfeed.xml自動生成**（.github/workflows/generate-feed.yml）
   `js/data.js` を含むpushがあると、自動で `node scripts/generate-feed.cjs`
   を実行し、feed.xmlの変更をコミットします。

## 公開前に手動で設定してほしい項目

- **Discord webhook（新着通知）**：Discordのサーバーで通知を受け取りたい
  チャンネルの「連携サービス」→「ウェブフックを作成」からURLを発行し、
  GitHubリポジトリの Settings → Secrets and variables → Actions →
  New repository secret で、名前`DISCORD_WEBHOOK_URL`・値にそのURLを設定してください。
  Discordを使わない場合は、`.github/workflows/generate-feed.yml`内の
  「Notify new items to Discord」ステップを削除すれば通知処理自体を無効化できます。
  ※ LINE公式アカウントなど他の通知先に変更したい場合は、
  `scripts/notify-new-items.cjs`の`postToDiscord`関数を該当のWebhook/APIの
  呼び出しに差し替えることで対応できます。

- **Google Analytics**：`index.html` / `pages/favorites.html` / `pages/archive.html` 内の
  `G-19K4474718` を、実際のGA4測定IDに置き換えてください。
  使わない場合は、該当の `<script>` 2つを削除してください。

- **giscus（コメント欄）**：`index.html` の `commentsSection` 内、
  `data-repo` / `data-repo-id` / `data-category-id` を、
  [https://giscus.app](https://giscus.app) で発行される値に置き換えてください。
  （リポジトリでGitHub Discussionsを有効にする必要があります）
  コメント欄自体が不要であれば、`commentsSection` ごと削除してください。
  コメントの表示順（デフォルトで新しい順）は、リポジトリのルートに配置した
  `giscus.json`（`data-repo`で指定したリポジトリのデフォルトブランチ直下）
  で制御しています。giscusはこのファイルをリポジトリから読み込むため、
  リポジトリ名やブランチを変更した場合は`giscus.json`もその場所に
  配置し直してください。

- **GitHub Actionsのブランチ名**：`generate-feed.yml` は
  `main` ブランチへのpushを想定しています。実際の公開ブランチ名が違う場合は
  ワークフロー内の `branches: [main]` を修正してください。

- **PWAアイコン**：正式なロゴ・アイコン画像を用意できる場合は、
  `images/icon-192.png` / `icon-512.png` / `icon-maskable-512.png` を
  差し替えると見栄えが良くなります。

## data.js の新しい任意フィールドについて

既存の構造は変更していません。イベント関連の機能（カレンダー・終了間近バッジ・
ステータス絞り込み）は、情報オブジェクトに以下の**任意フィールド**を追加した場合にのみ
動作します（common.js内のisOngoingEvent・getItemEventStatus等がもともと参照していた
フィールドです）。

```js
{
    id: 3,
    title: "…",
    date: "2026-08-09",
    tags: ["イベント"],
    description: "…",
    articleUrl: "https://…",
    reservationStart: "2026-08-08",  // 予約開始日（任意・新規）
    eventStart: "2026-08-10",        // 発売日／開催開始日
    eventEnd: "2026-08-20"           // 終了日
}
```

`reservationStart` は今回追加した新しいフィールドです。3つとも省略可能で、
指定した組み合わせに応じて以下のようにステータスが自動判定されます。

- どちらも無し：ステータス絞り込みの対象外
- `eventStart`のみ／`eventEnd`まで経過：「発売前」→「開催中」→「終了済み」
- `reservationStart`があり、まだ`eventStart`前：「予約開始」
  （id:2のグッズのように、`eventStart`を指定しなければ「予約開始」のまま表示され続けます）
